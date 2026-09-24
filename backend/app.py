"""Convertube API. YouTube extraction is best-effort and may be rate limited upstream."""
from __future__ import annotations

import logging
import os
import platform
import re
import shutil
import subprocess
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import boto3
import yt_dlp
from botocore.config import Config
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_file
from flask_cors import CORS

load_dotenv()
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("convertube")

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024
allowed_origins = ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000"]
allowed_origins.extend(x.strip() for x in os.getenv("FRONTEND_URL", "").split(",") if x.strip())
CORS(app, resources={r"/api/*": {"origins": allowed_origins}})

TEMP_DIR = Path(os.getenv("TEMP_DIR", tempfile.gettempdir())) / "convertube-videos"
TEMP_DIR.mkdir(parents=True, exist_ok=True)
BUCKET_NAME = os.getenv("CLOUDFLARE_R2_BUCKET", "")
VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
QUALITY_HEIGHTS = {"2K": 1440, "1080": 1080, "720": 720, "480": 480}


def extract_video_id(value: str) -> str | None:
    """Accept standard watch, short, embed, and youtu.be URLs only."""
    try:
        parsed = urlparse(value.strip())
    except (AttributeError, ValueError):
        return None
    host = (parsed.hostname or "").lower().removeprefix("www.")
    if parsed.scheme not in {"http", "https"}:
        return None
    video_id = None
    if host == "youtu.be":
        video_id = parsed.path.strip("/").split("/")[0]
    elif host in {"youtube.com", "m.youtube.com", "music.youtube.com"}:
        if parsed.path == "/watch":
            from urllib.parse import parse_qs
            video_id = parse_qs(parsed.query).get("v", [None])[0]
        else:
            match = re.match(r"/(?:shorts|embed|live)/([^/?]+)", parsed.path)
            video_id = match.group(1) if match else None
    return video_id if video_id and VIDEO_ID_RE.fullmatch(video_id) else None


def youtube_options(**overrides):
    """Share supported JS challenge setup across metadata and download calls."""
    options = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "js_runtimes": {"deno": {}},
        "socket_timeout": int(os.getenv("YTDLP_SOCKET_TIMEOUT", "20")),
        "retries": int(os.getenv("YTDLP_RETRIES", "2")),
    }
    options.update(overrides)
    return options


def get_video_info(url: str):
    with yt_dlp.YoutubeDL(youtube_options()) as ydl:
        return ydl.extract_info(url, download=False)


def get_r2_client():
    required = {
        "CLOUDFLARE_R2_ENDPOINT": os.getenv("CLOUDFLARE_R2_ENDPOINT"),
        "CLOUDFLARE_R2_ACCESS_KEY": os.getenv("CLOUDFLARE_R2_ACCESS_KEY"),
        "CLOUDFLARE_R2_SECRET_KEY": os.getenv("CLOUDFLARE_R2_SECRET_KEY"),
        "CLOUDFLARE_R2_BUCKET": BUCKET_NAME,
    }
    missing = [name for name, value in required.items() if not value]
    if missing:
        raise RuntimeError("Falta configurar Cloudflare R2: " + ", ".join(missing))
    endpoint = required["CLOUDFLARE_R2_ENDPOINT"]
    if not endpoint.startswith("https://"):
        raise RuntimeError("CLOUDFLARE_R2_ENDPOINT debe usar HTTPS")
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=required["CLOUDFLARE_R2_ACCESS_KEY"],
        aws_secret_access_key=required["CLOUDFLARE_R2_SECRET_KEY"],
        region_name="auto",
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )


@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()})


@app.get("/api/debug/runtime")
def debug_runtime():
    try:
        from importlib.metadata import PackageNotFoundError, version

        try:
            yt_dlp_ejs_version = version("yt-dlp-ejs")
        except PackageNotFoundError:
            yt_dlp_ejs_version = None
    except Exception:
        yt_dlp_ejs_version = None

    deno_path = shutil.which("deno")
    deno_version = None
    if deno_path:
        try:
            result = subprocess.run(
                [deno_path, "--version"],
                capture_output=True,
                text=True,
                check=True,
                timeout=5,
            )
            deno_version = result.stdout.strip()
        except (OSError, subprocess.SubprocessError):
            pass

    return jsonify({
        "yt_dlp_version": yt_dlp.version.__version__,
        "yt_dlp_ejs_version": yt_dlp_ejs_version,
        "deno_version": deno_version,
        "deno_path": deno_path,
        "python_version": platform.python_version(),
    })


@app.post("/api/validate")
def validate():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        data = {}
    url = data.get("url", "")
    if not isinstance(url, str) or not url.strip():
        return jsonify({"error": "URL requerida"}), 400
    video_id = extract_video_id(url)
    if not video_id:
        return jsonify({"error": "URL de YouTube inválida"}), 400
    try:
        info = get_video_info(url.strip())
        return jsonify({
            "valid": True,
            "title": info.get("title") or "Video",
            "duration": info.get("duration") or 0,
            "channel": info.get("channel") or info.get("uploader") or "YouTube",
            "thumbnail": info.get("thumbnail") or f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg",
            "views": info.get("view_count") or 0,
            "video_id": video_id,
        })
    except Exception as exc:
        logger.exception("YouTube validation failed for %s", video_id)
        # This exact upstream response is caused by YouTube's rotating JS challenges;
        # yt-dlp[default] + a supported Deno runtime provides the EJS solver.
        detail = str(exc)
        if "page needs to be reloaded" in detail.lower():
            detail = "YouTube rechazó temporalmente la solicitud. Actualiza yt-dlp y el soporte EJS, y vuelve a intentar."
        return jsonify({"error": "Error al validar el video", "detail": detail}), 502


@app.post("/api/download")
def download():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        data = {}
    url = data.get("url", "")
    quality = str(data.get("quality", "1080"))
    if not isinstance(url, str) or not extract_video_id(url):
        return jsonify({"error": "URL de YouTube inválida"}), 400
    if quality not in QUALITY_HEIGHTS:
        return jsonify({"error": "Calidad no válida"}), 400
    ffmpeg_path = shutil.which(os.getenv("FFMPEG_BINARY", "ffmpeg"))
    if not ffmpeg_path:
        return jsonify({"error": "FFmpeg no está instalado en el servidor"}), 503

    file_id = uuid.uuid4().hex[:12]
    output_template = str(TEMP_DIR / f"{file_id}.%(ext)s")
    height = QUALITY_HEIGHTS[quality]
    keep_local_file = False
    format_selector = (
        f"bestvideo[height<={height}][ext=mp4]+bestaudio[ext=m4a]/"
        f"best[height<={height}][ext=mp4]"
    )
    try:
        r2_configured = all(os.getenv(name) for name in (
            "CLOUDFLARE_R2_ENDPOINT", "CLOUDFLARE_R2_ACCESS_KEY",
            "CLOUDFLARE_R2_SECRET_KEY", "CLOUDFLARE_R2_BUCKET",
        ))
        local_mode = os.getenv("ENVIRONMENT", "development").lower() != "production" and not r2_configured
        r2 = None if local_mode else get_r2_client()
        with yt_dlp.YoutubeDL(youtube_options(
            format=format_selector,
            outtmpl=output_template,
            merge_output_format="mp4",
            ffmpeg_location=ffmpeg_path,
            # Prefer remuxing compatible streams and avoid expensive, lossy full re-encoding.
            postprocessors=[{"key": "FFmpegVideoRemuxer", "preferedformat": "mp4"}],
        )) as ydl:
            info = ydl.extract_info(url.strip(), download=True)
            filepath = Path(ydl.prepare_filename(info))
        candidates = [p for p in TEMP_DIR.glob(f"{file_id}.*") if p.is_file() and not p.name.endswith((".part", ".ytdl"))]
        if filepath.exists():
            final_path = filepath
        elif candidates:
            final_path = next((p for p in candidates if p.suffix.lower() == ".mp4"), candidates[0])
        else:
            raise RuntimeError("yt-dlp terminó sin generar un archivo descargable")

        if r2:
            object_key = f"downloads/{file_id}/{final_path.name}"
            r2.upload_file(str(final_path), BUCKET_NAME, object_key, ExtraArgs={"ContentType": "video/mp4"})
            download_url = r2.generate_presigned_url(
                "get_object", Params={"Bucket": BUCKET_NAME, "Key": object_key}, ExpiresIn=86400,
            )
            expires_in = 86400
        else:
            keep_local_file = True
            download_url = f"{request.host_url.rstrip('/')}/api/files/{file_id}"
            expires_in = None
        return jsonify({"success": True, "download_url": download_url, "filename": final_path.name,
                        "file_id": file_id, "expires_in": expires_in})
    except Exception as exc:
        logger.exception("Download failed for %s", file_id)
        return jsonify({"error": "Error en la descarga", "detail": str(exc)}), 502
    finally:
        if not keep_local_file:
            for path in TEMP_DIR.glob(f"{file_id}.*"):
                try:
                    path.unlink(missing_ok=True)
                except OSError:
                    logger.warning("Could not remove temporary file %s", path)


@app.get("/api/files/<file_id>")
def download_local_file(file_id):
    """Serve development downloads kept on local disk when R2 is not configured."""
    if not re.fullmatch(r"[a-f0-9]{12}", file_id):
        return jsonify({"error": "Archivo no encontrado"}), 404
    matches = [p for p in TEMP_DIR.glob(f"{file_id}.*") if p.is_file() and not p.name.endswith((".part", ".ytdl"))]
    if not matches:
        return jsonify({"error": "Archivo no encontrado"}), 404
    return send_file(matches[0], as_attachment=True, download_name=matches[0].name)


@app.get("/api/formats")
def get_formats():
    url = request.args.get("url", "")
    if not extract_video_id(url):
        return jsonify({"error": "URL de YouTube inválida"}), 400
    try:
        info = get_video_info(url.strip())
        heights = sorted({int(fmt["height"]) for fmt in info.get("formats", []) if fmt.get("height")}, reverse=True)
        return jsonify({"available_formats": heights})
    except Exception as exc:
        logger.exception("Format lookup failed")
        return jsonify({"error": "Error al obtener formatos", "detail": str(exc)}), 502


@app.get("/api/monetag-config")
def monetag_config():
    publisher_id = os.getenv("MONETAG_PUBLISHER_ID", "")
    return jsonify({"publisher_id": publisher_id, "enabled": bool(publisher_id)})


@app.errorhandler(404)
def not_found(_error):
    return jsonify({"error": "Endpoint no encontrado"}), 404


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")),
            debug=os.getenv("ENVIRONMENT", "development").lower() == "development")
