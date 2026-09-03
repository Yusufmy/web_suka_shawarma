import {
  CheckCircle2,
  Circle,
  Headphones,
  ThumbsUp,
  Volume2,
  WifiOff,
} from "lucide-react";

// Bahasa manusia untuk status "kehidupan" app outlet - supaya
// siapa pun yang lihat dashboard langsung paham tanpa perlu tahu
// istilah teknis (foreground/background/dsb).
function presenceInfo(presence) {
  if (presence === "foreground") {
    return {
      label: "Sedang dibuka",
      dotClass: "bg-green-500",
      textClass: "text-green-500",
    };
  }

  if (presence === "background") {
    return {
      label: "Berjalan di latar belakang",
      dotClass: "bg-amber-500",
      textClass: "text-amber-500",
    };
  }

  return {
    label: "Aplikasi tertutup",
    dotClass: "bg-neutral-600",
    textClass: "text-neutral-500",
  };
}

export default function OutletItem({
  outlet,
  targetMode,
  selected,
  onToggle,
  audioConfirmed,
  audioPlaying,
  listeningLive,
}) {
  // Outlet offline TAPI sudah pernah login (device_info & paired_at
  // tersimpan) tetap boleh dipilih sebagai target - siaran tetap
  // bisa menjangkau mereka lewat FCM + foreground service standby
  // begitu mereka online lagi. Yang TIDAK boleh dipilih cuma outlet
  // yang memang belum pernah terhubung device apa pun sama sekali.
  const hasLoggedInDevice =
    Boolean(outlet.paired_at) && Boolean(outlet.device_info);

  const disabled =
    outlet.status !== "online" && !hasLoggedInDevice;

  const presence = presenceInfo(outlet.presence);

  return (
    <button
      disabled={
        disabled ||
        targetMode === "all"
      }
      onClick={() =>
        onToggle(outlet.id)
      }
      className={`
        mb-1.5 flex w-full items-center
        gap-3 rounded-lg px-3 py-2.5
        text-left transition

        ${
          selected &&
          targetMode === "specific"
            ? "bg-orange-500/15 ring-1 ring-orange-500/40"
            : "hover:bg-neutral-800"
        }

        ${
          disabled
            ? "cursor-not-allowed opacity-40"
            : "cursor-pointer"
        }
      `}
    >

      {/* Selection */}
      {targetMode === "specific" ? (
        selected ? (
          <CheckCircle2
            size={16}
            className="flex-shrink-0 text-orange-500"
          />
        ) : (
          <Circle
            size={16}
            className="flex-shrink-0 text-neutral-600"
          />
        )
      ) : (
        <span
          className={`h-2 w-2 flex-shrink-0 rounded-full ${
            listeningLive
              ? "bg-emerald-500 ring-2 ring-emerald-500/40 animate-pulse"
              : presence.dotClass
          }`}
          title={listeningLive ? "Sedang mendengarkan siaran langsung" : presence.label}
        />
      )}

      {/* Info */}
      <div className="min-w-0 flex-1">

        <p className={`flex items-center gap-1.5 truncate text-[13px] font-medium ${listeningLive ? "text-emerald-300 font-semibold" : "text-neutral-100"}`}>
          {outlet.name}

          {audioConfirmed && (
            <ThumbsUp
              size={12}
              className="flex-shrink-0 text-green-500"
              title="Outlet konfirmasi suara sudah keluar"
            />
          )}
        </p>

        <p className="flex items-center gap-1.5 truncate text-[11px] text-neutral-500">
          <span>{outlet.code}</span>
          {outlet.app_version && (
            <span className="rounded bg-neutral-800/80 px-1 py-0.5 text-[9px] font-mono text-neutral-400">
              v{outlet.app_version}
            </span>
          )}
          <span>·</span>
          <span className={listeningLive ? "text-emerald-400 font-medium" : presence.textClass}>
            {listeningLive ? "Mendengarkan live" : presence.label}
          </span>
        </p>

      </div>

      {/* Status */}
      <div className="flex flex-shrink-0 flex-col items-end gap-1">

        {/* {outlet.status === "online" ? (
          outlet.is_busy ? (
            <span className="flex-shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
              Ramai
            </span>
          ) : (
            <span className="flex-shrink-0 rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-semibold text-green-400">
              Sepi
            </span>
          )
        ) : (
          <WifiOff
            size={13}
            className="flex-shrink-0 text-neutral-600"
          />
        )} */}

        {/* Audio-file WebRTC connected & sedang mengalir ke outlet
            ini SEKARANG (otomatis, real-time) - penting untuk
            outlet yang jaringannya lambat/menyusul, supaya operator
            tahu outlet itu masih memutar walau outlet lain sudah
            selesai. */}
        {audioPlaying && (
          <span className="flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold text-sky-400">
            <Volume2
              size={10}
              className="flex-shrink-0 animate-pulse"
            />
            Memutar
          </span>
        )}

        {/* Siaran LANGSUNG (mic operator) beneran sudah nyambung ke
            outlet ini SEKARANG lewat WebRTC - ditampilkan terlepas
            dari status online/offline di atas, karena koneksi WebRTC
            ini independen dari heartbeat presence outlet. */}
        {listeningLive && (
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400 shadow-sm shadow-emerald-500/10">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
            </span>
            <Headphones
              size={11}
              className="flex-shrink-0 text-emerald-400 animate-pulse"
            />
            Mendengarkan
          </span>
        )}

      </div>

    </button>
  );
}