import {
  Pencil,
  Trash2,
  Smartphone,
  WifiOff,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";

// Bahasa manusia untuk presence, sama seperti OutletItem.jsx di
// sidebar - biar konsisten di seluruh dashboard.
function presenceInfo(presence) {
  if (presence === "foreground") {
    return {
      label: "Sedang dibuka",
      dotClass: "bg-green-500",
      textClass: "text-green-400",
    };
  }

  if (presence === "background") {
    return {
      label: "Latar belakang",
      dotClass: "bg-amber-500",
      textClass: "text-amber-400",
    };
  }

  return {
    label: "Tertutup",
    dotClass: "bg-neutral-600",
    textClass: "text-neutral-500",
  };
}

function timeAgo(dateString) {
  if (!dateString) {
    return null;
  }

  const seconds = Math.floor(
    (Date.now() - new Date(dateString).getTime()) / 1000
  );

  if (seconds < 60) {
    return "baru saja";
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes} menit lalu`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} jam lalu`;
  }

  const days = Math.floor(hours / 24);

  return `${days} hari lalu`;
}

export default function OutletCard({ outlet, onEdit, onDelete, onResetDevice }) {
  const presence = presenceInfo(outlet.presence);
  const installed = Boolean(outlet.paired_at);
  const device = outlet.device_info;
  const lastSeen = timeAgo(outlet.last_seen_at);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-neutral-800 bg-neutral-900 p-4">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">
            {outlet.name}
          </p>
          <p className="truncate text-xs text-neutral-500">
            {outlet.code}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onEdit(outlet)}
            title="Edit outlet"
            className="rounded-md p-1.5 text-neutral-400 transition hover:bg-neutral-800 hover:text-white"
          >
            <Pencil size={14} />
          </button>

          <button
            type="button"
            onClick={() => onDelete(outlet)}
            title="Hapus outlet"
            className="rounded-md p-1.5 text-neutral-400 transition hover:bg-red-500/10 hover:text-red-400"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Status aplikasi */}
      <div className="flex items-center justify-between rounded-lg bg-neutral-950 px-3 py-2">
        <div className="flex items-center gap-2">
          {outlet.status === "online" ? (
            <span className={`h-2 w-2 rounded-full ${presence.dotClass}`} />
          ) : (
            <WifiOff size={13} className="text-neutral-600" />
          )}

          <span
            className={`text-xs font-medium ${
              outlet.status === "online"
                ? presence.textClass
                : "text-neutral-500"
            }`}
          >
            {outlet.status === "online" ? presence.label : "Offline"}
          </span>
        </div>

        {lastSeen && (
          <span className="text-[11px] text-neutral-600">
            {lastSeen}
          </span>
        )}
      </div>

      {/* Instalasi app */}
      <div className="flex items-center gap-2 text-xs">
        {installed ? (
          <>
            <CheckCircle2 size={14} className="shrink-0 text-green-500" />
            <span className="text-neutral-400">
              Sudah terpasang & pernah connect
            </span>
          </>
        ) : (
          <>
            <AlertTriangle size={14} className="shrink-0 text-amber-500" />
            <span className="text-neutral-400">
              Belum pernah connect - app belum di-pairing
            </span>
          </>
        )}
      </div>

      {/* Device info */}
      <div className="flex items-start gap-2 border-t border-neutral-800 pt-3 text-xs text-neutral-500">
        <Smartphone size={14} className="mt-0.5 shrink-0" />

        {device ? (
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="truncate text-neutral-400">
              {device.model || "Model tidak diketahui"}
            </p>
            <p className="truncate">
              {device.os || "-"}
              {device.app_version && ` · v${device.app_version}`}
            </p>
            {device.device_id && (
              <p className="truncate text-neutral-600">
                ID: {device.device_id}
              </p>
            )}
          </div>
        ) : (
          <span>Belum ada info device</span>
        )}
      </div>

      {/* Reset device - cuma relevan kalau outlet ini PERNAH
          pairing (ada device_info). Dipakai kalau tablet-nya
          hilang/rusak/diganti dan tidak sempat logout sendiri -
          satu akun outlet cuma boleh 1 device yang lagi login,
          tanpa ini device baru tidak akan pernah bisa login lagi. */}
      {installed && (
        <button
          type="button"
          onClick={() => onResetDevice(outlet)}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-neutral-800 py-1.5 text-[11px] font-medium text-neutral-400 transition hover:border-amber-500/40 hover:text-amber-400"
        >
          <RefreshCw size={12} />
          Reset Device
        </button>
      )}

    </div>
  );
}
