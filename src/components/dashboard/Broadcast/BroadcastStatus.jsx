import { Radio } from "lucide-react";

import { formatDuration } from "../../../utils/formatDuration";

export default function BroadcastStatus({
  isLive,
  duration,
  targetMode,
  targetCount,
  connectedOutlets = 0,
}) {
  // ============================================================
  // "LIVE" TIDAK OTOMATIS BERARTI ADA OUTLET YANG MENDENGARKAN.
  //
  // Broadcast bisa berstatus live walau 0 outlet terhubung real-
  // time lewat WebRTC (mis. semua target sedang background/
  // terminated - mereka cuma dapat notifikasi, bukan audio live).
  // Badge ini HARUS menunjukkan jumlah yang benar-benar terhubung,
  // supaya operator tidak salah kira semua outlet sudah dengar.
  // ============================================================

  const hasRealConnection = connectedOutlets > 0;

  return (
    <div className="flex flex-col items-center gap-1.5 text-center">

      {isLive ? (
        <span
          className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold tracking-wide ${
            hasRealConnection
              ? "bg-red-500/15 text-red-400"
              : "bg-amber-500/15 text-amber-400"
          }`}
        >

          <Radio
            size={12}
            className="animate-pulse"
          />

          LIVE · {formatDuration(duration)} ·{" "}
          {connectedOutlets}/{targetCount} outlet terhubung

        </span>
      ) : (
        <span className="text-xs font-medium text-neutral-500">
          Siap menyiarkan
        </span>
      )}

      {isLive && !hasRealConnection && (
        <p className="text-xs font-medium text-amber-400">
          Belum ada outlet yang mendengarkan real-time - outlet
          offline akan diberi notifikasi saat membuka aplikasi.
        </p>
      )}

      <p className="text-sm text-neutral-300">
        {targetMode === "all"
          ? `Menyiarkan ke seluruh outlet online (${targetCount})`
          : targetCount > 0
          ? `Menyiarkan ke ${targetCount} outlet terpilih`
          : "Pilih minimal satu outlet untuk memulai"}
      </p>

    </div>
  );
}