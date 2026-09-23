import { useEffect, useRef, useState } from "react";

type Stage = "idle" | "loading" | "ready" | "downloading" | "done" | "error";

interface VideoInfo {
  title: string;
  channel: string;
  duration: string;
  thumbnail: string;
  views: string;
}

interface Quality {
  label: string;
  res: string;
  size: string;
  tag: string;
}

const QUALITIES: Quality[] = [
  { label: "2K (1440p)", res: "Quad HD", size: "~400 MB", tag: "2K" },
  { label: "1080p", res: "Full HD", size: "~180 MB", tag: "HD" },
  { label: "720p", res: "HD Ready", size: "~90 MB", tag: "" },
  { label: "480p", res: "SD", size: "~45 MB", tag: "" },
];

const API_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

function isValidYouTubeUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const videoId = host === "youtu.be"
      ? parsed.pathname.split("/")[1]
      : host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com"
        ? parsed.pathname === "/watch"
          ? parsed.searchParams.get("v")
          : parsed.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{11})/)?.[1]
        : null;
    return (parsed.protocol === "https:" || parsed.protocol === "http:") && Boolean(videoId && /^[\w-]{11}$/.test(videoId));
  } catch {
    return false;
  }
}

export default function App() {
  const [url, setUrl] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [quality, setQuality] = useState<Quality>(QUALITIES[0]);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (progressRef.current) clearInterval(progressRef.current);
    };
  }, []);

  async function handleFetch() {
    if (!url.trim()) return;
    if (!isValidYouTubeUrl(url)) {
      setErrorMsg("Pega un enlace válido de YouTube.");
      setStage("error");
      return;
    }

    setStage("loading");
    setVideoInfo(null);
    setErrorMsg("");
    setDownloadUrl("");

    try {
      const response = await fetch(`${API_URL}/api/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || data.error || "Error al validar el video");

      if (!data.valid) throw new Error("Video no válido o privado");

      setVideoInfo({
        title: data.title || "Video de YouTube",
        channel: data.channel || "YouTube",
        duration: formatDuration(data.duration),
        thumbnail: data.thumbnail || "",
        views: formatViews(data.views),
      });
      setStage("ready");
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Error al validar el video");
      setStage("error");
    }
  }

  async function handleDownload() {
    setStage("downloading");
    setProgress(5);
    setErrorMsg("");

    if (progressRef.current) clearInterval(progressRef.current);
    progressRef.current = setInterval(() => {
      setProgress((current) => Math.min(current + Math.ceil(Math.random() * 4), 90));
    }, 700);

    try {
      const response = await fetch(`${API_URL}/api/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          quality: quality.tag === "2K" ? "2K" : quality.label.match(/\d+/)?.[0] || "1080",
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Error en la descarga");
      if (!data.success || !data.download_url) throw new Error(data.error || "No se generó el archivo");

      if (progressRef.current) clearInterval(progressRef.current);
      setProgress(100);
      setDownloadUrl(data.download_url);
      setStage("done");
    } catch (error) {
      if (progressRef.current) clearInterval(progressRef.current);
      setErrorMsg(error instanceof Error ? error.message : "Error en la descarga");
      setStage("error");
    }
  }

  function handleReset() {
    if (progressRef.current) clearInterval(progressRef.current);
    setUrl("");
    setStage("idle");
    setVideoInfo(null);
    setProgress(0);
    setQuality(QUALITIES[0]);
    setDownloadUrl("");
    setErrorMsg("");
  }

  return (
    <div className="min-h-full bg-white text-[#0f0f0f] flex flex-col">
      <header className="border-b border-[#f0f0f0] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-[#0f0f0f] rounded-lg flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white" aria-hidden="true">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
            </svg>
          </div>
          <span className="font-semibold text-sm tracking-tight">Convertube</span>
        </div>
        <span className="text-xs text-[#aaa] font-medium">MP4 Downloader</span>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-xl">
          <div className="mb-10 text-center">
            <h1 className="text-3xl font-semibold tracking-tight mb-2 leading-tight">Descarga videos de YouTube</h1>
            <p className="text-[#888] text-sm font-normal">Pega el enlace, elige la calidad y descarga en MP4.</p>
          </div>

          <div className="flex gap-2.5 mb-6">
            <input
              className="flex-1 border border-[#e8e8e8] rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              type="text"
              placeholder="https://www.youtube.com/watch?v=..."
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (stage === "error") setStage("idle");
              }}
              onKeyDown={(e) => e.key === "Enter" && (stage === "idle" || stage === "error") && handleFetch()}
              disabled={stage === "loading" || stage === "downloading"}
            />
            {stage === "idle" || stage === "error" ? (
              <button className="bg-blue-500 text-white px-6 py-3 rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50" onClick={handleFetch} disabled={!url.trim()}>
                Buscar
              </button>
            ) : stage === "loading" ? (
              <button className="bg-gray-300 text-white px-6 py-3 rounded-lg text-sm font-medium" disabled>Buscando...</button>
            ) : (
              <button className="bg-gray-200 text-gray-700 px-6 py-3 rounded-lg text-sm font-medium hover:bg-gray-300" onClick={handleReset}>Nuevo</button>
            )}
          </div>

          {stage === "error" && (
            <div className="mb-6 text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3 border border-red-200 break-words">{errorMsg}</div>
          )}

          {stage === "loading" && (
            <div className="bg-[#fafafa] border border-[#f0f0f0] rounded-2xl p-5 flex gap-4">
              <div className="w-28 rounded-lg bg-[#e8e8e8] flex-shrink-0" style={{ aspectRatio: "16/9" }} />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-[#e8e8e8] rounded w-3/4" />
                <div className="h-3 bg-[#e8e8e8] rounded w-1/2" />
              </div>
            </div>
          )}

          {(stage === "ready" || stage === "downloading" || stage === "done") && videoInfo && (
            <div className="space-y-5">
              <div className="bg-[#fafafa] border border-[#f0f0f0] rounded-2xl p-5 flex gap-4">
                <div className="w-28 rounded-lg overflow-hidden bg-[#e8e8e8] flex-shrink-0" style={{ aspectRatio: "16/9" }}>
                  {videoInfo.thumbnail && <img src={videoInfo.thumbnail} alt={videoInfo.title} className="w-full h-full object-cover" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm line-clamp-2 mb-2">{videoInfo.title}</p>
                  <p className="text-xs text-[#888]">{videoInfo.channel}</p>
                  <div className="flex gap-3 mt-2 text-xs text-[#aaa]"><span>{videoInfo.duration}</span><span>{videoInfo.views}</span></div>
                </div>
              </div>

              {stage !== "done" && (
                <div>
                  <p className="text-xs font-medium text-[#888] mb-3 uppercase">Calidad</p>
                  <div className="space-y-2">
                    {QUALITIES.map((q) => (
                      <button
                        key={q.label}
                        className={`w-full text-left px-4 py-3 rounded-lg border transition ${quality.label === q.label ? "bg-blue-50 border-blue-300" : "bg-white border-[#e8e8e8] hover:border-[#d0d0d0]"}`}
                        onClick={() => setQuality(q)}
                        disabled={stage === "downloading"}
                      >
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-4 h-4 rounded-full border-2 ${quality.label === q.label ? "bg-blue-500 border-blue-500" : "border-[#ccc]"}`} />
                            <span className="font-medium text-sm">{q.label}</span>
                          </div>
                          <div className="flex items-center gap-3"><span className="text-xs text-[#aaa]">{q.res}</span><span className="text-xs text-[#bbb]">{q.size}</span></div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {stage === "ready" && (
                <button className="w-full bg-blue-500 text-white py-3 rounded-lg font-medium hover:bg-blue-600" onClick={handleDownload}>
                  Descargar {quality.label} MP4
                </button>
              )}

              {stage === "downloading" && (
                <div className="space-y-3">
                  <div className="flex justify-between"><span className="text-sm font-medium">Preparando descarga...</span><span className="text-sm text-[#888]">{progress}%</span></div>
                  <div className="w-full bg-[#e8e8e8] rounded-full h-2"><div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} /></div>
                  <p className="text-xs text-[#aaa] text-center">{quality.label} · MP4 · El servidor puede tardar en iniciar.</p>
                </div>
              )}

              {stage === "done" && (
                <div className="text-center space-y-4 py-2">
                  <div className="w-12 h-12 bg-[#f0f0f0] rounded-full flex items-center justify-center mx-auto">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="#0f0f0f" aria-hidden="true"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" /></svg>
                  </div>
                  <div><p className="font-semibold text-sm">Listo para descargar</p><p className="text-xs text-[#888] mt-1">{quality.label} MP4 · {quality.size}</p></div>
                  <div className="flex gap-2 justify-center">
                    <a className="bg-blue-500 text-white px-5 py-3 rounded-lg font-medium inline-flex items-center gap-2 hover:bg-blue-600" href={downloadUrl} target="_blank" rel="noopener noreferrer" download>
                      Guardar archivo
                    </a>
                    <button className="bg-gray-200 text-gray-700 px-5 py-3 rounded-lg font-medium hover:bg-gray-300" onClick={handleReset}>Otro video</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {stage === "idle" && <div className="text-center mt-4"><p className="text-xs text-[#c0c0c0]">Compatible con youtube.com · youtu.be · shorts</p></div>}
        </div>
      </main>

      <footer className="border-t border-[#f0f0f0] px-6 py-5 text-center">
        <p className="text-xs text-[#c0c0c0]">Solo para uso personal y contenido libre de derechos · {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}

function formatDuration(seconds: number | undefined): string {
  const total = Number(seconds) || 0;
  const minutes = Math.floor(total / 60);
  const secs = Math.floor(total % 60);
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function formatViews(views: number | undefined): string {
  const total = Number(views) || 0;
  if (total >= 1_000_000) return `${(total / 1_000_000).toFixed(1)}M visualizaciones`;
  if (total >= 1_000) return `${(total / 1_000).toFixed(1)}K visualizaciones`;
  return `${total} visualizaciones`;
}
