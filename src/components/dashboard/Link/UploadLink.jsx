import {
  Link2,
  Play,
  Pause,
  Video,
  Film,
  Trash2,
  Copy,
  ExternalLink,
  Info,
  Radio,
  Square,
  Volume2,
  Loader2,
  RadioTower,
  Headphones,
  Sparkles,
} from "lucide-react";
import { useState, useMemo, useEffect, useRef } from "react";
import alert from "../../../helpers/alert";
import audio from "../../../services/audio";
import WebRTCAudioService from "../../../services/webrct_audio_service";

export default function UploadLink({
  targetMode = "all",
  selected = new Set(),
  outlets = [],
}) {
  const [inputUrl, setInputUrl] = useState("");
  const [activeUrl, setActiveUrl] = useState("");

  // Playback & Broadcast state
  const [isLive, setIsLive] = useState(false);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [activeAudioItem, setActiveAudioItem] = useState(null);

  // Real-time progress bar
  const [playbackProgress, setPlaybackProgress] = useState({
    currentTime: 0,
    duration: 0,
    percentage: 0,
  });

  // Helper format durasi MM:SS
  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds) || seconds <= 0) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // ============================================================
  // LISTENER WEBRTC AUDIO SERVICE & PROGRESS
  // ============================================================
  useEffect(() => {
    WebRTCAudioService.setProgressCallback(({ currentTime, duration }) => {
      const percentage =
        duration > 0
          ? Math.min(100, Math.max(0, (currentTime / duration) * 100))
          : 0;

      setPlaybackProgress({
        currentTime,
        duration,
        percentage,
      });
    });

    WebRTCAudioService.setStateListener((state) => {
      if (state === "stopped" || state === "ended") {
        setIsLive(false);
        setActiveAudioItem(null);
        setPlaybackProgress({ currentTime: 0, duration: 0, percentage: 0 });
      }
    });

    return () => {
      WebRTCAudioService.setProgressCallback(null);
      WebRTCAudioService.setStateListener(null);
    };
  }, []);

  // Helper untuk mengekstrak ID YouTube dari berbagai variasi URL
  const youtubeData = useMemo(() => {
    if (!activeUrl) return null;

    try {
      const url = activeUrl.trim();

      // 1. Standar: youtube.com/watch?v=ID, embed, shorts, youtu.be
      const match = url.match(
        /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
      );
      if (match && match[1]) {
        return {
          type: "youtube",
          videoId: match[1],
          embedUrl: `https://www.youtube.com/embed/${match[1]}?autoplay=1&rel=0&modestbranding=1&enablejsapi=1`,
        };
      }

      // 2. TikTok
      if (url.includes("tiktok.com")) {
        return {
          type: "tiktok",
          url: url,
        };
      }

      // 3. Generic video/web link
      return {
        type: "generic",
        url: url,
      };
    } catch (e) {
      return null;
    }
  }, [activeUrl]);

  const handleApplyUrl = (e) => {
    e?.preventDefault();
    const clean = inputUrl.trim();
    if (!clean) {
      alert.error("Masukkan link URL video terlebih dahulu");
      return;
    }
    setActiveUrl(clean);
  };

  const handleClear = () => {
    setInputUrl("");
    setActiveUrl("");
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setInputUrl(text);
        setActiveUrl(text.trim());
        alert.success("Link berhasil ditempel dari clipboard!");
      }
    } catch (e) {
      alert.error("Tidak dapat mengakses clipboard. Silakan paste manual (Ctrl+V)");
    }
  };

  // ============================================================
  // PUTAR & SIARKAN SUARA LINK LANGSUNG KE SELURUH OUTLET
  // (Tanpa popup share screen, otomatis berbunyi di HP outlet!)
  // ============================================================
  const handlePlayAndBroadcast = async () => {
    const targetUrl = activeUrl || inputUrl.trim();
    if (!targetUrl) {
      alert.error("Masukkan link video YouTube / TikTok terlebih dahulu");
      return;
    }

    const selectedOutlets =
      targetMode === "all"
        ? outlets
        : outlets.filter((o) => selected.has(o.id));

    if (!selectedOutlets.length) {
      alert.error(
        targetMode === "all"
          ? "Tidak ada outlet terdaftar"
          : "Pilih minimal satu outlet di sidebar"
      );
      return;
    }

    try {
      setLoadingAudio(true);
      setLoadingMessage("Mengekstrak audio dari link...");

      // Bersihkan parameter playlist / radio tracker YouTube
      let cleanUrl = targetUrl;
      const ytMatch = targetUrl.match(
        /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
      );
      if (ytMatch && ytMatch[1]) {
        cleanUrl = `https://www.youtube.com/watch?v=${ytMatch[1]}`;
      }

      // 1. Ekstrak audio di server via yt-dlp
      console.log("⚡ Mengekstrak audio dari URL:", cleanUrl);
      const res = await audio.importUrl(cleanUrl);
      const audioData = res?.data;

      if (!audioData || !audioData.url) {
        throw new Error("Gagal memuat URL streaming audio dari server.");
      }

      setActiveAudioItem(audioData);
      setLoadingMessage("Menghubungkan siaran ke speaker outlet...");

      // 2. Siarkan audio langsung lewat jalur WebRTC Audio Service
      console.log("🎙️ Memulai WebRTC Broadcast untuk audio link:", audioData);
      await WebRTCAudioService.startBroadcast({
        audioId: audioData.id,
        audioUrl: audioData.url,
        targetMode,
        selectedOutlets,
      });

      setIsLive(true);
      alert.success("Audio video berhasil diputar & mengudara ke semua outlet!");
    } catch (error) {
      console.error("❌ Gagal menyiarkan audio dari link:", error);
      const msg =
        error.response?.data?.message ||
        error.message ||
        "Gagal menyiarkan audio dari link tersebut.";
      alert.error(msg);
      setIsLive(false);
      setActiveAudioItem(null);
    } finally {
      setLoadingAudio(false);
      setLoadingMessage("");
    }
  };

  // ============================================================
  // HENTIKAN SIARAN AUDIO
  // ============================================================
  const handleStopBroadcast = async () => {
    try {
      await WebRTCAudioService.stop();
      setIsLive(false);
      setActiveAudioItem(null);
      setPlaybackProgress({ currentTime: 0, duration: 0, percentage: 0 });
      alert.info("Siaran audio video telah dihentikan");
    } catch (error) {
      console.error("Gagal menghentikan siaran:", error);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* ======================================================
          HEADER
      ====================================================== */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 px-4 py-4 sm:px-6">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold text-white">
            <Link2 size={18} className="text-orange-500" />
            Unggah Link
          </h2>
          <p className="mt-1 text-xs text-neutral-500">
            Putar video/musik dari link dan siarkan suaranya langsung ke seluruh outlet tanpa popup share screen.
          </p>
        </div>

        {/* STATUS BADGE JIKA SEDANG LIVE */}
        {isLive && (
          <div className="flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-3.5 py-1 text-xs font-semibold text-orange-400 animate-pulse">
            <span className="h-2 w-2 rounded-full bg-orange-500" />
            <span>SEDANG MENYIARKAN AUDIO ({formatTime(playbackProgress.currentTime)} / {formatTime(playbackProgress.duration)})</span>
          </div>
        )}
      </div>

      {/* ======================================================
          CONTENT AREA
      ====================================================== */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto w-full max-w-4xl space-y-6">
          
          {/* ==================================================
              CARD: INPUT LINK
          ================================================== */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/90 p-5 shadow-xl">
            <form onSubmit={handleApplyUrl} className="space-y-3">
              <label className="block text-xs font-medium text-neutral-300">
                Tempel Link Video / Musik (YouTube, TikTok, dll):
              </label>

              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <input
                    type="url"
                    value={inputUrl}
                    onChange={(e) => setInputUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=... atau https://vt.tiktok.com/..."
                    className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-white placeholder-neutral-500 transition focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                  {inputUrl && (
                    <button
                      type="button"
                      onClick={handleClear}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePasteFromClipboard}
                    className="flex shrink-0 items-center gap-1.5 rounded-xl border border-neutral-700 bg-neutral-800 px-3.5 py-2.5 text-xs font-semibold text-neutral-300 transition hover:border-neutral-600 hover:bg-neutral-700 hover:text-white active:scale-95"
                    title="Paste dari Clipboard"
                  >
                    <Copy size={14} />
                    <span>Paste</span>
                  </button>

                  <button
                    type="submit"
                    className="flex shrink-0 items-center gap-1.5 rounded-xl bg-neutral-800 border border-neutral-700 px-4 py-2.5 text-xs font-semibold text-neutral-200 shadow transition hover:bg-neutral-700 active:scale-95"
                  >
                    <Play size={14} />
                    <span>Tampilkan Video</span>
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* ==================================================
              CARD: VIDEO PLAYER & SIARKAN LANGSUNG KE OUTLET
          ================================================== */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between border-b border-neutral-800/80 pb-3">
              <div className="flex items-center gap-2">
                <Video size={16} className="text-orange-500" />
                <h3 className="text-sm font-semibold text-neutral-200">
                  Player Video & Kontrol Siaran
                </h3>
              </div>

              {activeUrl && (
                <a
                  href={activeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-xs text-neutral-500 transition hover:text-orange-400"
                >
                  <span>Buka di tab baru</span>
                  <ExternalLink size={12} />
                </a>
              )}
            </div>

            {/* VIDEO DISPLAY */}
            {youtubeData ? (
              <div className="space-y-5">
                {youtubeData.type === "youtube" ? (
                  <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-neutral-800 bg-black shadow-2xl">
                    <iframe
                      src={youtubeData.embedUrl}
                      title="YouTube video player"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      className="absolute inset-0 h-full w-full border-0"
                    />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 p-8 text-center">
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-orange-500/10 text-orange-500">
                      <ExternalLink size={20} />
                    </div>
                    <h4 className="text-sm font-medium text-white">
                      Link Terdeteksi
                    </h4>
                    <p className="mt-1 max-w-md break-all font-mono text-xs text-neutral-400">
                      {activeUrl}
                    </p>
                    <a
                      href={activeUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-orange-500"
                    >
                      <span>Buka Video di Tab Baru</span>
                      <ExternalLink size={14} />
                    </a>
                  </div>
                )}

                {/* ==============================================
                    PANEL SIARKAN SUARA KE SEMUA OUTLET
                ============================================== */}
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/90 p-4 space-y-3">
                  <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
                        isLive ? "bg-orange-500/20 text-orange-400 ring-1 ring-orange-500/40 animate-pulse" : "bg-orange-500/10 text-orange-500"
                      }`}>
                        <RadioTower size={22} />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-white">
                          {isLive ? (activeAudioItem?.original_name || "Audio Sedang Mengudara") : "Siarkan Suara Video Ini ke Seluruh Outlet"}
                        </h4>
                        <p className="text-xs text-neutral-400">
                          {isLive
                            ? "Suara menggelegar di seluruh speaker outlet secara otomatis"
                            : "Klik tombol di samping untuk langsung menyiarkan audio video ini ke outlet"}
                        </p>
                      </div>
                    </div>

                    <div>
                      {isLive ? (
                        <button
                          type="button"
                          onClick={handleStopBroadcast}
                          className="flex items-center gap-2 rounded-xl bg-gradient-to-b from-red-500 to-red-700 px-6 py-3 text-xs font-bold text-white shadow-lg shadow-red-950/30 transition hover:brightness-110 active:scale-95"
                        >
                          <Square size={16} className="fill-white" />
                          <span>HENTIKAN SIARAN</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={loadingAudio}
                          onClick={handlePlayAndBroadcast}
                          className="flex items-center gap-2 rounded-xl bg-gradient-to-b from-orange-500 to-orange-700 px-6 py-3 text-xs font-bold text-white shadow-lg shadow-orange-950/30 transition hover:brightness-110 active:scale-95 disabled:opacity-50"
                        >
                          {loadingAudio ? (
                            <>
                              <Loader2 size={16} className="animate-spin" />
                              <span>{loadingMessage || "Menyiapkan Audio..."}</span>
                            </>
                          ) : (
                            <>
                              <Volume2 size={16} />
                              <span>PUTAR & SIARKAN KE OUTLET</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* PROGRESS BAR JIKA SEDANG LIVE */}
                  {isLive && (
                    <div className="pt-2 border-t border-neutral-800/80 space-y-1.5 pointer-events-none select-none">
                      <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400">
                        <span className="text-orange-400 font-medium">
                          {formatTime(playbackProgress.currentTime)}
                        </span>
                        <span>
                          {formatTime(playbackProgress.duration)}
                        </span>
                      </div>
                      <div className="relative h-2 w-full overflow-hidden rounded-full bg-neutral-800">
                        <div
                          className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-orange-600 via-orange-500 to-amber-400 transition-all duration-300"
                          style={{ width: `${playbackProgress.percentage}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

              </div>
            ) : (
              /* EMPTY STATE */
              <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-neutral-800 bg-neutral-950/60 p-8 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-500">
                  <Film size={32} />
                </div>
                <h4 className="text-sm font-semibold text-neutral-200">
                  Belum Ada Link Video yang Dimuat
                </h4>
                <p className="mt-1 max-w-sm text-xs leading-relaxed text-neutral-500">
                  Tempelkan link YouTube (Video biasa atau Shorts) atau TikTok pada kolom di atas, lalu klik <strong>PUTAR & SIARKAN KE OUTLET</strong>.
                </p>
              </div>
            )}
          </div>

          {/* ==================================================
              INFO BOX
          ================================================== */}
          <div className="flex items-start gap-3 rounded-xl border border-neutral-800/80 bg-neutral-900/60 p-4 text-xs text-neutral-400">
            <Info size={16} className="mt-0.5 shrink-0 text-orange-400" />
            <div className="space-y-1">
              <p className="font-semibold text-neutral-200">
                Keunggulan Fitur Unggah Link:
              </p>
              <p className="leading-relaxed">
                • <strong>Tanpa Popup Share Screen</strong>: Audio video langsung diproses dan disiarkan oleh sistem.<br />
                • <strong>Otomatis di Sisi Outlet</strong>: Speaker di seluruh outlet akan langsung bersuara secara serentak tanpa perlu disentuh oleh petugas.
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
