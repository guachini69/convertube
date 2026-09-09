from flask import Flask, request, jsonify
from flask_cors import CORS
import yt_dlp
import os
import boto3
from dotenv import load_dotenv
from urllib.parse import urljoin
import logging
from datetime import datetime, timedelta
import uuid

load_dotenv()

app = Flask(__name__)
CORS(app, origins=["http://localhost:5173", "http://localhost:3000", os.getenv("FRONTEND_URL", "*")])

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Cloudflare R2 Configuration
r2_client = boto3.client(
    "s3",
    endpoint_url=os.getenv("CLOUDFLARE_R2_ENDPOINT"),
    aws_access_key_id=os.getenv("CLOUDFLARE_R2_ACCESS_KEY"),
    aws_secret_access_key=os.getenv("CLOUDFLARE_R2_SECRET_KEY"),
    region_name="auto",
)

BUCKET_NAME = os.getenv("CLOUDFLARE_R2_BUCKET", "convertube-videos")
TEMP_DIR = "/tmp/videos"

if not os.path.exists(TEMP_DIR):
    os.makedirs(TEMP_DIR)


def is_valid_youtube_url(url: str) -> bool:
    """Validate YouTube URL"""
    patterns = [
        r"(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)",
    ]
    return any(__import__("re").search(pattern, url) for pattern in patterns)


def extract_video_id(url: str) -> str:
    """Extract video ID from YouTube URL"""
    import re
    match = re.search(r"(?:v=|youtu\.be\/|shorts\/)([\w-]{11})", url)
    return match.group(1) if match else None


@app.route("/api/health", methods=["GET"])
def health():
    """Health check endpoint"""
    return jsonify({"status": "ok", "timestamp": datetime.now().isoformat()})


@app.route("/api/validate", methods=["POST"])
def validate():
    """Validate YouTube URL and get video info"""
    try:
        data = request.json
        url = data.get("url", "").strip()

        if not url:
            return jsonify({"error": "URL requerida"}), 400

        if not is_valid_youtube_url(url):
            return jsonify({"error": "URL de YouTube inválida"}), 400

        video_id = extract_video_id(url)
        if not video_id:
            return jsonify({"error": "No se pudo extraer el ID del video"}), 400

        # Get video info with yt-dlp
        ydl_opts = {
            "quiet": True,
            "no_warnings": True,
            "extract_flat": True,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

        return jsonify(
            {
                "valid": True,
                "title": info.get("title", "Video"),
                "duration": info.get("duration", 0),
                "channel": info.get("channel", "YouTube"),
                "thumbnail": f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg",
                "views": info.get("view_count", 0),
                "video_id": video_id,
            }
        )

    except Exception as e:
        logger.error(f"Validation error: {str(e)}")
        return jsonify({"error": "Error al validar el video"}), 500


@app.route("/api/download", methods=["POST"])
def download():
    """Download video and upload to R2"""
    try:
        data = request.json
        url = data.get("url", "").strip()
        quality = data.get("quality", "1080")

        if not url or not is_valid_youtube_url(url):
            return jsonify({"error": "URL inválida"}), 400

        video_id = extract_video_id(url)
        file_id = str(uuid.uuid4())[:8]
        output_path = os.path.join(TEMP_DIR, f"{file_id}_%(title)s.%(ext)s")

        # Quality mapping
        quality_format = {
            "2K": "bestvideo[height<=1440]+bestaudio/best",
            "1080": "bestvideo[height<=1080]+bestaudio/best",
            "720": "bestvideo[height<=720]+bestaudio/best",
            "480": "bestvideo[height<=480]+bestaudio/best",
        }

        ydl_opts = {
            "format": quality_format.get(quality, quality_format["1080"]),
            "outtmpl": output_path,
            "quiet": False,
            "no_warnings": True,
            "postprocessors": [
                {
                    "key": "FFmpegVideoConvertor",
                    "prefixes": [],
                    "prettyname": "Convert video to mp4",
                    "args": ["-c:v", "libx264", "-c:a", "aac", "-strict", "-2"],
                }
            ],
        }

        logger.info(f"Descargando video {video_id} en calidad {quality}")

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            filename = ydl.prepare_filename(info)

        if not os.path.exists(filename):
            # Find mp4 file
            mp4_files = [
                f for f in os.listdir(TEMP_DIR) if f.startswith(file_id) and f.endswith(".mp4")
            ]
            if mp4_files:
                filename = os.path.join(TEMP_DIR, mp4_files[0])
            else:
                return jsonify({"error": "No se pudo encontrar el archivo descargado"}), 500

        # Upload to R2
        r2_key = f"downloads/{file_id}/{os.path.basename(filename)}"

        with open(filename, "rb") as f:
            r2_client.upload_fileobj(f, BUCKET_NAME, r2_key)

        logger.info(f"Archivo subido a R2: {r2_key}")

        # Clean up temp file
        os.remove(filename)

        # Generate download URL (expires in 24 hours)
        download_url = r2_client.generate_presigned_url(
            "get_object",
            Params={"Bucket": BUCKET_NAME, "Key": r2_key},
            ExpiresIn=86400,
        )

        return jsonify(
            {
                "success": True,
                "download_url": download_url,
                "filename": os.path.basename(filename),
                "file_id": file_id,
                "expires_in": 86400,
            }
        )

    except Exception as e:
        logger.error(f"Download error: {str(e)}")
        return jsonify({"error": f"Error en la descarga: {str(e)}"}), 500


@app.route("/api/formats", methods=["GET"])
def get_formats():
    """Get available formats for a video"""
    try:
        url = request.args.get("url", "").strip()

        if not is_valid_youtube_url(url):
            return jsonify({"error": "URL inválida"}), 400

        ydl_opts = {
            "quiet": True,
            "no_warnings": True,
            "extract_flat": False,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            formats = info.get("formats", [])

        # Extract unique resolutions
        resolutions = set()
        for fmt in formats:
            if fmt.get("height"):
                resolutions.add(fmt.get("height"))

        return jsonify(
            {
                "available_formats": sorted(list(resolutions), reverse=True),
            }
        )

    except Exception as e:
        logger.error(f"Formats error: {str(e)}")
        return jsonify({"error": "Error al obtener formatos"}), 500


@app.route("/api/monetag-config", methods=["GET"])
def monetag_config():
    """Get Monetag configuration for frontend"""
    return jsonify(
        {
            "publisher_id": os.getenv("MONETAG_PUBLISHER_ID", ""),
            "enabled": bool(os.getenv("MONETAG_PUBLISHER_ID")),
        }
    )


@app.errorhandler(404)
def not_found(error):
    return jsonify({"error": "Endpoint no encontrado"}), 404


@app.errorhandler(500)
def internal_error(error):
    logger.error(f"Internal error: {str(error)}")
    return jsonify({"error": "Error interno del servidor"}), 500


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    debug = os.getenv("ENVIRONMENT", "development") == "development"
    app.run(host="0.0.0.0", port=port, debug=debug)
