import React, { useState } from "react";
import {
  Radio,
  Volume2,
  VolumeX,
  Wifi,
  Sparkles,
  LogOut,
  Building2,
  Activity,
  CheckCircle2,
  Headphones,
  Signal,
  Loader2
} from "lucide-react";
import petugasReceiver from "../../services/petugasReceiver";
import { SYSTEM_VERSION } from "../../config/version";

export default function PetugasWaiting({
  outlet,
  volume,
  onVolumeChange,
  onTriggerDemoLive,
  onLogout,
  wsConnected = true,
  isConnectingAudio = false,
  autoplayBlocked = false,
  onUnlockAudio,
}) {
  const [isPlayingTestTone, setIsPlayingTestTone] = useState(false);

  // Soft ping tone test using Web Audio API (juga membantu unlock autoplay browser)
  const playTestTone = () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5

      gain.gain.setValueAtTime(0.15 * volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.35);

      setIsPlayingTestTone(true);
      setTimeout(() => setIsPlayingTestTone(false), 400);
    } catch (e) {
      console.warn("AudioContext error:", e);
    }
  };

  return (
    <div className="w-full max-w-md">
      {/* Header Info Bar */}
      <div className="mb-4 flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-900/80 px-4 py-2.5 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10 text-orange-500 border border-orange-500/20">
            <Building2 className="h-4 w-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-white">{outlet?.name || "Outlet"}</div>
            <div className="text-[11px] text-neutral-400 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
              <span>{outlet?.code ? `Kode: ${outlet.code}` : "Online & Siap"}</span>
            </div>
          </div>
        </div>

        <button
          onClick={onLogout}
          title="Putuskan & Logout"
          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-neutral-400 hover:bg-neutral-800 hover:text-red-400 transition-all"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Keluar</span>
        </button>
      </div>

      {/* Main Standby Card */}
      <div className="relative overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/90 p-6 shadow-2xl backdrop-blur-xl">
        {/* Ambient Top Glow */}
        <div className="pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 h-36 w-36 rounded-full bg-orange-500/15 blur-3xl" />

        {/* Pulsing Radar Animation */}
        <div className="relative my-4 flex items-center justify-center">
          <div className="relative flex h-28 w-28 items-center justify-center">
            {/* Outer Waves */}
            <div className="absolute h-full w-full animate-ping rounded-full bg-orange-500/10 [animation-duration:3s]"></div>
            <div className="absolute h-20 w-20 animate-pulse rounded-full bg-orange-500/20 [animation-duration:2s]"></div>
            
            {/* Central Icon */}
            <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-tr from-neutral-800 to-neutral-700 shadow-xl border border-neutral-600/50">
              {isConnectingAudio ? (
                <Loader2 className="h-7 w-7 text-orange-400 animate-spin" />
              ) : (
                <Radio className="h-7 w-7 text-orange-400 animate-pulse" />
              )}
            </div>
          </div>
        </div>

        {/* Status Text */}
        <div className="text-center">
          {isConnectingAudio ? (
            <div className="inline-flex items-center gap-2 rounded-full bg-orange-500/20 border border-orange-500/40 px-3.5 py-1 text-xs font-extrabold text-orange-300 animate-pulse">
              <span className="h-2 w-2 rounded-full bg-orange-400 animate-ping"></span>
              MENYAMBUNGKAN SUARA OPERATOR...
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 text-xs font-bold text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              STANDBY / SIAP MENERIMA SIARAN
            </div>
          )}

          <h2 className="mt-3 text-lg font-bold text-white">
            {isConnectingAudio ? "Menerima Sinyal Siaran Pusat..." : "Menunggu Siaran Operator Pusat"}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-neutral-400">
            {isConnectingAudio
              ? "Sedang memproses sambungan WebRTC audio. Halaman akan otomatis beralih jika suara sudah berbunyi di speaker."
              : "Koneksi WebSocket aktif. Begitu Operator Pusat memulai siaran bicara atau memutar audio, suara akan otomatis diputar di sini."}
          </p>

          {(isConnectingAudio || autoplayBlocked) && (
            <button
              onClick={() => {
                if (petugasReceiver.audioContext && petugasReceiver.audioContext.state === "suspended") {
                  petugasReceiver.audioContext.resume().catch(() => {});
                }
                if (petugasReceiver.audioElement) {
                  petugasReceiver.audioElement.muted = false;
                  petugasReceiver.audioElement.volume = volume;
                  petugasReceiver.audioElement.play().catch((e) => console.warn(e));
                }
                onUnlockAudio?.();
              }}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold text-xs px-5 py-3 shadow-lg shadow-emerald-500/20 transition-all active:scale-95 animate-pulse cursor-pointer"
            >
              <Volume2 className="h-4 w-4" />
              <span>🔊 Siaran Masuk — Ketuk untuk Dengarkan Suara</span>
            </button>
          )}
        </div>

        {/* Status Cards Grid */}
        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <div className="rounded-xl border border-neutral-800/80 bg-neutral-950/60 p-3">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-neutral-400">
              <Wifi className="h-3.5 w-3.5 text-emerald-400" />
              <span>WebSocket Reverb</span>
            </div>
            <div className="mt-1 text-xs font-bold text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              {wsConnected ? "Online & Terhubung" : "Menghubungkan..."}
            </div>
          </div>

          <div className="rounded-xl border border-neutral-800/80 bg-neutral-950/60 p-3">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-neutral-400">
              <Signal className="h-3.5 w-3.5 text-orange-400" />
              <span>Heartbeat Status</span>
            </div>
            <div className="mt-1 text-xs font-bold text-neutral-200">
              Sinkronisasi (15s)
            </div>
          </div>
        </div>

        {/* Audio Volume Controls */}
        <div className="mt-5 rounded-xl border border-neutral-800/80 bg-neutral-950/60 p-3.5 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-neutral-300 flex items-center gap-1.5">
              {volume > 0 ? (
                <Volume2 className="h-4 w-4 text-orange-400" />
              ) : (
                <VolumeX className="h-4 w-4 text-neutral-500" />
              )}
              Volume Speaker Web
            </span>
            <span className="font-bold text-orange-400">
              {Math.round(volume * 100)}%
            </span>
          </div>

          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
            className="w-full accent-orange-500 cursor-pointer h-1.5 rounded-lg bg-neutral-800"
          />

          <button
            type="button"
            onClick={playTestTone}
            className={`w-full flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold border transition-all ${
              isPlayingTestTone
                ? "bg-orange-500/20 border-orange-500 text-orange-400"
                : "bg-neutral-800/80 border-neutral-700 text-neutral-300 hover:bg-neutral-800 hover:text-white"
            }`}
          >
            <Headphones className="h-3.5 w-3.5" />
            <span>{isPlayingTestTone ? "Memutar Nada Uji..." : "Tes Suara Speaker (Ping Tone)"}</span>
          </button>
        </div>

        {/* Action / Demo Simulation */}
        {/* <div className="mt-5 pt-4 border-t border-neutral-800/80">
          <button
            onClick={onTriggerDemoLive}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-orange-500/40 bg-gradient-to-r from-orange-600/20 to-amber-600/20 py-2.5 px-3 text-xs font-bold text-orange-300 hover:from-orange-600/30 hover:to-amber-600/30 hover:border-orange-500 transition-all"
          >
            <Sparkles className="h-4 w-4 text-orange-400" />
            <span>Simulasikan Siaran Masuk (Demo Preview)</span>
          </button>
        </div> */}

        {/* Version Footer */}
        <div className="mt-3 text-center">
          <p className="text-[10px] text-neutral-600 font-mono">
            Radio Suka Shawarma v{SYSTEM_VERSION}
          </p>
        </div>
      </div>
    </div>
  );
}
