import { useState, useRef } from "react";

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

const API_URL = "https://convertube-api.onrender.com";

function isValidYouTubeUrl(url: string): boolean {
  return /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)[\w-]{11}/.test(url);
}

function extractVideoId(url: string): string {
  const match = url.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/);
  return match ? match[1] : "dQw4w9WgXcQ";
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

    try {
      const response = await fetch(`${API_URL}/api/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) throw new Error("Error validating video");

      const data = await response.json();

      if (data.valid) {
        setVideoInfo({
          title: data.title,
          channel: data.channel,
          duration: `${Math.floor(data.duration / 60)}:${String(data.duration % 60).padStart(2, "0")}`,
          thumbnail: data.thumbnail,
          views: `${(data.views / 1000000).toFixed(1)}M visualizaciones`,
        });
        setStage("ready");
      } else {
        setErrorMsg("Video no válido o privado");
        setStage("error");
      }
    } catch (error) {
      setErrorMsg("Error al validar el video");
      setStage("error");
    }
  }

  async function handleDownload() {
    setStage("downloading");
    setProgress(0);

    let p = 0;
    progressRef.current = setInterval(() => {
      p += Math.random() * 8 + 2;
      if (p >= 100) {
        p = 100;
        clearInterval(progressRef.current!);
        setProgress(100);
        performDownload();
      } else {
        setProgress(Math.round(p));
      }
    }, 180);
  }

  async function performDownload() {
    try {
      const response = await fetch(`${API_URL}/api/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url,
          quality: quality.label.match(/\d+/)?.[0] || "1080",
        }),
      });

      if (!response.ok) throw new Error("Download failed");

      const data = await response.json();

      if (data.success) {
        setDownloadUrl(data.download_url);
        setStage("done");
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      setErrorMsg("Error en la descarga");
      setStage("error");
    }
  }

  function handleReset() {
    setUrl("");
    setStage("idle");
    setVideoInfo(null);
    setProgress(0);
    setQuality(QUALITIES[0]);
    setDownloadUrl("");
  }

  return (
    <div className="min-h-full bg-white text-[#0f0f0f] flex flex-col">
      <header className="border-b border-[#f0f0f0] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-[#0f0f0f] rounded-lg flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
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
            <h1 className="text-3xl font-semibold tracking-tight mb-2 leading-tight">
              Descarga videos de YouTube
            </h1>
            <p className="text-[#888] text-sm font-normal">
              Pega el enlace, elige la calidad y descarga en MP4.
            </p>
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
              onKeyDown={(e) => e.key === "Enter" && stage === "idle" && handleFetch()}
              disabled={stage === "loading" || stage === "downloading"}
            />
            {stage === "idle" || stage === "error" ? (
              <button
                className="bg-blue-500 text-white px-6 py-3 rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50"
                onClick={handleFetch}
                disabled={!url.trim()}
              >
                Buscar
              </button>
            ) : stage === "loading" ? (
              <button className="bg-gray-300 text-white px-6 py-3 rounded-lg text-sm font-medium" disabled>
                Buscando...
              </button>
            ) : (
              <button
                className="bg-gray-200 text-gray-700 px-6 py-3 rounded-lg text-sm font-medium hover:bg-gray-300"
                onClick={handleReset}
              >
                Nuevo
              </button>
            )}
          </div>

          {stage === "error" && (
            <div className="mb-6 text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3 border border-red-200">
              {errorMsg}
            </div>
          )}

          {stage === "loading" && (
            <div className="bg-[#fafafa] border border-[#f0f0f0] rounded-2xl p-5 flex gap-4">
              <div className="w-28 h-18 rounded-lg bg-[#e8e8e8] flex-shrink-0" style={{ aspectRatio: "16/9" }} />
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
                  <img src={videoInfo.thumbnail} alt={videoInfo.title} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm line-clamp-2 mb-2">{videoInfo.title}</p>
                  <p className="text-xs text-[#888]">{videoInfo.channel}</p>
                  <div className="flex gap-3 mt-2 text-xs text-[#aaa]">
                    <span>{videoInfo.duration}</span>
                    <span>{videoInfo.views}</span>
                  </div>
                </div>
              </div>

              {stage !== "done" && (
                <div>
                  <p className="text-xs font-medium text-[#888] mb-3 uppercase">Calidad</p>
                  <div className="space-y-2">
                    {QUALITIES.map((q) => (
                      <button
                        key={q.label}
                        className={`w-full text-left px-4 py-3 rounded-lg border transition ${
                          quality.label === q.label
                            ? "bg-blue-50 border-blue-300"
                            : "bg-white border-[#e8e8e8] hover:border-[#d0d0d0]"
                        }`}
                        onClick={() => setQuality(q)}
                        disabled={stage === "downloading"}
                      >
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-4 h-4 rounded-full border-2 ${quality.label === q.label ? "bg-blue-500 border-blue-500" : "border-[#ccc]"}`} />
                            <span className="font-medium text-sm">{q.label}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-[#aaa]">{q.res}</span>
                            <span className="text-xs text-[#bbb]">{q.size}</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {stage === "ready" && (
                <button
                  className="w-full bg-blue-500 text-white py-3 rounded-lg font-medium hover:bg-blue-600"
                  onClick={handleDownload}
                >
                  Descargar {quality.label} MP4
                </button>
              )}

              {stage === "downloading" && (
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Preparando descarga...</span>
                    <span className="text-sm text-[#888]">{progress}%</span>
                  </div>
                  <div className="w-full bg-[#e8e8e8] rounded-full h-2">
                    <div className="bg-blue-500 h-2 rounded-full"