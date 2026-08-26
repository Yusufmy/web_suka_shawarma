import React, { useEffect, useRef, useState } from "react";
import {
  Mic,
  Volume2,
  VolumeX,
  Radio,
  Clock,
  LogOut,
  Building2,
  Activity,
  ArrowLeft,
  Headphones,
  Music,
  Play
} from "lucide-react";
import petugasReceiver from "../../services/petugasReceiver";

export default function PetugasLive({
  outlet,
  broadcastData,
  volume,
  onVolumeChange,
  onStopLive,
  onLogout,
}) {
  const canvasRef = useRef(null);
  const [seconds, setSeconds] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [needsUserClick, setNeedsUserClick] = useState(false);
  const previousVolume = useRef(volume);

  // Timer counter
  useEffect(() => {
    let initialSecs = 0;
    if (broadcastData?.started_at) {
      const start = new Date(broadcastData.started_at).getTime();
      const now = Date.now();
      if (!isNaN(start) && now > start) {
        initialSecs = Math.floor((now - start) / 1000);
      }
    }
    setSeconds(initialSecs);

    const interval = setInterval(() => {
      setSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [broadcastData]);

  const formatTime = (totalSeconds) => {
    const mins = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const secs = String(totalSeconds % 60).padStart(2, "0");
    return `${mins}:${secs}`;
  };

  // Coba resume audio jika sempat dicegah browser
  const resumeAudioPlay = () => {
    if (petugasReceiver.audioContext && petugasReceiver.audioContext.state === "suspended") {
      petugasReceiver.audioContext.resume();
    }
    if (petugasReceiver.audioElement) {
      petugasReceiver.audioElement.muted = false;
      petugasReceiver.audioElement.play().then(() => {
        setNeedsUserClick(false);
      }).catch((e) => {
        console.warn("User play error:", e);
      });
    }
    setNeedsUserClick(false);
  };

  // Real-time Canvas Waveform Animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animationFrameId;

    const render = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Ambil byte frekuensi asli dari Analyser jika ada
      const freqData = petugasReceiver.getAudioFrequencyData();
      const hasRealAudio = freqData && freqData.some((val) => val > 5);

      const numBars = 36;
      const spacing = canvas.width / numBars;
      const barWidth = spacing * 0.6;
      const centerY = canvas.height / 2;

      for (let i = 0; i < numBars; i++) {
        let rawHeight = 0;

        if (hasRealAudio) {
          // Petakan data frekuensi audio riil
          const dataIdx = Math.floor((i / numBars) * freqData.length);
          const val = freqData[dataIdx] || 0;
          rawHeight = (val / 255) * (canvas.height * 0.85);
        } else {
          // Animasi sinusoidal halus jika suara sedang hening
          const t = Date.now() * 0.006;
          const wave1 = Math.sin(t + i * 0.35);
          const wave2 = Math.cos(t * 1.5 + i * 0.2);
          rawHeight = (Math.abs(wave1 * wave2) + 0.15) * (canvas.height * 0.7);
        }

        const barHeight = Math.max(
          4,
          rawHeight * (isMuted ? 0.05 : volume > 0 ? 1 : 0.05)
        );

        const x = i * spacing + (spacing - barWidth) / 2;
        const y = centerY - barHeight / 2;

        const grad = ctx.createLinearGradient(0, y, 0, y + barHeight);
        grad.addColorStop(0, "#ff7849");
        grad.addColorStop(0.5, "#ef4444");
        grad.addColorStop(1, "#f97316");

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 3);
        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [volume, isMuted]);

  const toggleMute = () => {
    if (isMuted) {
      setIsMuted(false);
      onVolumeChange(previousVolume.current || 0.8);
      resumeAudioPlay();
    } else {
      previousVolume.current = volume;
      setIsMuted(true);
      onVolumeChange(0);
    }
  };

  const isAudioFile = broadcastData?.type === "upload" || broadcastData?.audio?.url;
  const broadcastTitle = isAudioFile
    ? broadcastData?.audio?.name || "Pemutaran File Audio Pusat"
    : "Operator Pusat Berbicara (Live Mic)";

  return (
    <div className="w-full max-w-md">
      {/* Top Outlet & Status Bar */}
      <div className="mb-4 flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-900/80 px-4 py-2.5 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10 text-orange-500 border border-orange-500/20">
            <Building2 className="h-4 w-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-white">{outlet?.name || "Outlet"}</div>
            <div className="text-[11px] text-red-400 flex items-center gap-1 font-bold">
              <span className="h-2 w-2 rounded-full bg-red-500 animate-ping"></span>
              LIVE STREAMING AUDIO
            </div>
          </div>
        </div>

        <button
          onClick={onLogout}
          title="Keluar"
          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-neutral-400 hover:bg-neutral-800 hover:text-red-400 transition-all"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Keluar</span>
        </button>
      </div>

      {/* Main Live Card */}
      <div className="relative overflow-hidden rounded-2xl border border-red-500/40 bg-neutral-900/95 p-6 shadow-2xl shadow-red-950/30 backdrop-blur-xl ring-1 ring-red-500/20">
        {/* Ambient Top Glow */}
        <div className="pointer-events-none absolute -top-16 left-1/2 -translate-x-1/2 h-44 w-44 rounded-full bg-red-500/20 blur-3xl" />

        {/* Live Banner */}
        <div className="flex items-center justify-center gap-2 rounded-xl bg-red-500/15 border border-red-500/30 py-2 px-3 text-red-400">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500"></span>
          </span>
          <span className="text-xs font-extrabold tracking-wider uppercase">
            SEDANG LIVE SIARAN DARI PUSAT
          </span>
        </div>

        {/* Banner Klik untuk Putar jika dicegah browser */}
        {needsUserClick && (
          <button
            onClick={resumeAudioPlay}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500/20 border border-amber-500/50 p-2.5 text-xs font-bold text-amber-300 animate-pulse hover:bg-amber-500/30 transition-all"
          >
            <Play className="h-4 w-4" />
            <span>Klik di sini untuk Memutar Suara Speaker</span>
          </button>
        )}

        {/* Waveform Visualizer Canvas */}
        <div className="mt-4 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950/80 p-4">
          <canvas
            ref={canvasRef}
            className="h-24 w-full block cursor-pointer"
            onClick={resumeAudioPlay}
          />

          <div className="mt-3 flex items-center justify-between border-t border-neutral-800/80 pt-3 text-xs text-neutral-400">
            <div className="flex items-center gap-1.5 text-orange-400 font-semibold truncate max-w-[200px]">
              {isAudioFile ? (
                <Music className="h-3.5 w-3.5 animate-pulse text-amber-400" />
              ) : (
                <Mic className="h-3.5 w-3.5 animate-bounce text-red-400" />
              )}
              <span className="truncate">{broadcastTitle}</span>
            </div>
            <div className="flex items-center gap-1 font-mono text-neutral-300 font-bold shrink-0">
              <Clock className="h-3.5 w-3.5 text-neutral-500" />
              <span>{formatTime(seconds)}</span>
            </div>
          </div>
        </div>

        {/* Live Channel Info */}
        <div className="mt-4 grid grid-cols-2 gap-2.5 text-xs">
          <div className="rounded-xl border border-neutral-800/80 bg-neutral-950/50 p-2.5">
            <span className="text-[11px] text-neutral-500 block">Kanal Siaran</span>
            <span className="font-semibold text-neutral-200">
              {broadcastData?.rtc_room_id ? `Room ${broadcastData.rtc_room_id.substring(0, 8)}` : "Channel Pusat #1"}
            </span>
          </div>
          <div className="rounded-xl border border-neutral-800/80 bg-neutral-950/50 p-2.5">
            <span className="text-[11px] text-neutral-500 block">Kualitas Audio</span>
            <span className="font-semibold text-emerald-400">48 kHz HD Opus</span>
          </div>
        </div>

        {/* Volume & Mute Controls */}
        <div className="mt-4 rounded-xl border border-neutral-800/80 bg-neutral-950/60 p-3.5 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <button
              onClick={toggleMute}
              className="flex items-center gap-1.5 font-semibold text-neutral-300 hover:text-white transition-colors"
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="h-4 w-4 text-red-400" />
              ) : (
                <Volume2 className="h-4 w-4 text-orange-400" />
              )}
              <span>{isMuted ? "Audio Senyap (Muted)" : "Volume Suara"}</span>
            </button>
            <span className="font-bold text-orange-400">
              {isMuted ? "0%" : `${Math.round(volume * 100)}%`}
            </span>
          </div>

          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={isMuted ? 0 : volume}
            onChange={(e) => {
              if (isMuted) setIsMuted(false);
              onVolumeChange(parseFloat(e.target.value));
              resumeAudioPlay();
            }}
            className="w-full accent-orange-500 cursor-pointer h-1.5 rounded-lg bg-neutral-800"
          />
        </div>

        {/* Action Button: Kembali ke Standby */}
        <div className="mt-5 flex gap-2">
          <button
            onClick={onStopLive}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-700 bg-neutral-800/90 py-2.5 px-4 text-xs font-bold text-neutral-200 hover:bg-neutral-800 hover:text-white transition-all"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Kembali ke Standby</span>
          </button>
        </div>
      </div>
    </div>
  );
}
