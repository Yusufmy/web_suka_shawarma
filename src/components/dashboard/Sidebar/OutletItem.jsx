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
  const isHearing = Boolean(audioPlaying || listeningLive);

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
        text-left transition relative overflow-hidden

        ${
          isHearing
            ? "bg-emerald-500/10 border border-emerald-500/30 shadow-sm shadow-emerald-950/20"
            : selected && targetMode === "specific"
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

      {/* Selection / Status Dot */}
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
      ) : isHearing ? (
        <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
        </span>
      ) : (
        <span
          className={`h-2 w-2 flex-shrink-0 rounded-full ${presence.dotClass}`}
          title={presence.label}
        />
      )}

      {/* Info */}
      <div className="min-w-0 flex-1">

        <p className="flex items-center gap-1.5 truncate text-[13px] font-medium text-neutral-100">
          <span className={isHearing ? "text-emerald-300 font-semibold" : ""}>
            {outlet.name}
          </span>

          {audioConfirmed && (
            <ThumbsUp
              size={12}
              className="flex-shrink-0 text-emerald-400"
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
          <span className={isHearing ? "text-emerald-400 font-medium" : presence.textClass}>
            {isHearing ? "Sedang Mendengar Siaran" : presence.label}
          </span>
        </p>

      </div>

      {/* Status Badges */}
      <div className="flex flex-shrink-0 flex-col items-end gap-1">

        {/* Audio / YouTube Playback Capture Live */}
        {audioPlaying && (
          <span className="flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400 shadow-sm animate-pulse">
            <Volume2
              size={11}
              className="flex-shrink-0"
            />
            <span>Mendengar</span>
          </span>
        )}

        {/* Siaran Bicara Langsung (Mic Operator) */}
        {listeningLive && (
          <span className="flex items-center gap-1 rounded-full bg-violet-500/20 border border-violet-500/30 px-2.5 py-0.5 text-[10px] font-bold text-violet-300 shadow-sm animate-pulse">
            <Headphones
              size={11}
              className="flex-shrink-0"
            />
            <span>Mendengar</span>
          </span>
        )}

      </div>

    </button>
  );
}