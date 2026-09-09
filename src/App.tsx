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

function isValidYouTubeUrl(url: string): boolean {
  return /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)[\w-]{11}/.test(url);
}

function extractVideoId(url: string): string {
  const match = url.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/);
  return match ? match[1] : "dQw4w9WgXcQ";
}

const MOCK_TITLES = [
  "Lo-fi Hip Hop Radio — Beats to Relax and Study",
  "How to Build Anything with AI in 2025",
  "The Most Relaxing Piano Music Ever Recorded",
  "Tokyo Street Food Tour — Hidden Gems 2025",
  "Learn Spanish in 30 Days — Full Course",
];

export default function App() {
  const [url, setUrl] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [quality, setQuality] = useState<Quality>(QUALITIES[0]);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function handleFetch() {
    if (!url.trim()) return;
    if (!isValidYouTubeUrl(url)) {
      setErrorMsg("Pega un enlace válido de YouTube.");
      setStage("error");
      return;
    }
    setStage("loading");
    setVideoInfo(null);
    setErrorMsg("");

    const id = extractVideoId(url);
    setTimeout(() => {
      const idx = Math.floor(Math.random() * MOCK_TITLES.length);
      setVideoInfo({
        title: MOCK_TITLES[idx],
        channel: "YouTube Creator",
        duration: `${Math.floor(Math.random() * 12) + 2}:${String(Math.floor(Math.random() * 60)).padStart(2, "0")}`,
        thumbnail: `https://img.youtube.com/vi/${id}/maxresdefault.jpg`,
        views: `${(Math.random() * 9 + 1).toFixed(1)}M visualizaciones`,
      });
      setStage("ready");
    }, 1800);
  }

  function handleDownload() {
    setStage("downloading");
    setProgress(0);
    let p = 0;
    progressRef.current = setInterval(() => {
      p += Math.random() * 8 + 2;
      if (p >= 100) {
        p = 100;
        clearInterval(progressRef.current!);
        setProgress(100);
        setTimeout(() => setStage("done"), 400);
      } else {
        setProgress(Math.round(p));
      }
    }, 180);
  }

  function handleReset() {
    setUrl("");
    setStage("idle");
    setVideoInfo(null);
    setProgress(0);
    setQuality(QUALITIES[0]);
  }

  return (
    <div className="min-h-full bg-white text-[#0f0f0f] flex flex-col">
      {/* Header */}
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

      {/* Main */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-xl">

          {/* Hero */}
          <div className="mb-10 text-center">
            <h1 className="text-3xl font-semibold tracking-tight mb-2 leading-tight">
              Descarga videos de YouTube
            </h1>
            <p className="text-[#888] text-sm font-normal">
              Pega el enlace, elige la calidad y descarga en MP4.
            </p>
          </div>

          {/* URL Input */}
          <div className="flex gap-2.5 mb-6">
            <input
              className="input-url flex-1"
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
              <button className="btn-primary" onClick={handleFetch} disabled={!url.trim()}>
                Buscar
              </button>
            ) : stage === "loading" ? (
              <button className="btn-primary" disabled>
                <span className="spinner" />
                Buscando
              </button>
            ) : (
              <button className="btn-ghost" onClick={handleReset}>
                Nuevo
              </button>
            )}
          </div>

          {/* Error */}
          {stage === "error" && (
            <div className="fade-in mb-6 text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3 border border-red-100">
              {errorMsg}
            </div>
          )}

          {/* Loading skeleton */}
          {stage === "loading" && (
            <div className="fade-in bg-[#fafafa] border border-[#f0f0f0] rounded-2xl p-5 flex gap-4">
              <div className="skeleton w-28 h-18 rounded-xl flex-shrink-0" style={{ height: "72px" }} />
              <div className="flex-1 flex flex-col gap-2 pt-1">
                <div className="skeleton h-4 rounded w-3/4" />
                <div className="skeleton h-3 rounded w-1/3" />
                <div className="skeleton h-3 rounded w-1/2" />
              </div>
            </div>
          )}

          {/* Video Card */}
          {(stage === "ready" || stage === "downloading" || stage === "done") && videoInfo && (
            <div className="fade-in space-y-5">

              {/* Thumbnail + Info */}
              <div className="bg-[#fafafa] border border-[#f0f0f0] rounded-2xl p-5 flex gap-4 items-start">
                <div className="flex-shrink-0 w-28 rounded-xl overflow-hidden bg-[#e8e8e8]" style={{ aspectRatio: "16/9" }}>
                  <img
                    src={videoInfo.thumbnail}
                    alt={videoInfo.title}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=224&h=126&fit=crop&auto=format";
                    }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm leading-snug line-clamp-2 mb-1.5">{videoInfo.title}</p>
                  <p className="text-xs text-[#888]">{videoInfo.channel}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs text-[#aaa]">{videoInfo.duration}</span>
                    <span className="text-xs text-[#aaa]">{videoInfo.views}</span>
                  </div>
                </div>
              </div>

              {/* Quality Selector */}
              {stage !== "done" && (
                <div>
                  <p className="text-xs font-medium text-[#888] mb-3 uppercase tracking-wider">Calidad</p>
                  <div className="quality-scroll-box">
                    {QUALITIES.map((q) => (
                      <button
                        key={q.label}
                        className={`quality-row ${quality.label === q.label ? "selected" : ""}`}
                        onClick={() => setQuality(q)}
                        disabled={stage === "downloading"}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={`quality-dot ${quality.label === q.label ? "selected" : ""}`} />
                          <span className="font-medium text-sm">{q.label}</span>
                          {q.tag && (
                            <span className={`quality-tag ${quality.label === q.label ? "selected" : ""}`}>{q.tag}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-[#aaa]">{q.res}</span>
                          <span className="text-xs text-[#bbb]">{q.size}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Download / Progress / Done */}
              {stage === "ready" && (
                <button className="btn-primary w-full justify-center py-3.5" onClick={handleDownload}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M5 20h14v-2H5v2zm7-4l-5-5 1.41-1.41L11 13.17V4h2v9.17l2.59-2.58L17 11l-5 5z" />
                  </svg>
                  Descargar {quality.label} MP4
                </button>
              )}

              {stage === "downloading" && (
                <div className="fade-in space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Preparando descarga...</span>
                    <span className="text-sm text-[#888] tabular-nums">{progress}%</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${progress}%` }} />
                  </div>
                  <p className="text-xs text-[#aaa] text-center">{quality.label} · MP4 · {quality.size}</p>
                </div>
              )}

              {stage === "done" && (
                <div className="fade-in text-center space-y-4 py-2">
                  <div className="w-12 h-12 bg-[#f0f0f0] rounded-full flex items-center justify-center mx-auto">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="#0f0f0f">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Listo para descargar</p>
                    <p className="text-xs text-[#888] mt-1">{quality.label} MP4 · {quality.size}</p>
                  </div>
                  <div className="flex gap-2 justify-center">
                    <button className="btn-primary">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M5 20h14v-2H5v2zm7-4l-5-5 1.41-1.41L11 13.17V4h2v9.17l2.59-2.58L17 11l-5 5z" />
                      </svg>
                      Guardar archivo
                    </button>
                    <button className="btn-ghost" onClick={handleReset}>
                      Otro video
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Empty state hint */}
          {stage === "idle" && (
            <div className="text-center mt-4">
              <p className="text-xs text-[#c0c0c0]">Compatible con youtube.com · youtu.be · shorts</p>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#f0f0f0] px-6 py-5 text-center">
        <p className="text-xs text-[#c0c0c0]">
          Solo para uso personal y contenido libre de derechos · {new Date().getFullYear()}
        </p>
      </footer>
    </div>
  );
}
