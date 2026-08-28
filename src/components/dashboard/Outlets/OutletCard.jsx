import {
  Pencil,
  Trash2,
  Smartphone,
  Globe,
  WifiOff,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Tag,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import { SYSTEM_VERSION } from "../../../config/version";

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

  const appVersion = outlet.app_version || device?.app_version;
  const isWebClient = device?.model?.toLowerCase().includes("web") || device?.model?.toLowerCase().includes("browser");
  const isAndroidClient = device?.os?.toLowerCase().includes("android");

  // Status kecocokan versi aplikasi outlet dengan versi sistem saat ini
  const isUpToDate = appVersion && appVersion === SYSTEM_VERSION;
  const isOutdated = appVersion && appVersion !== SYSTEM_VERSION;

  return (
    <div className="flex flex-col justify-between gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/90 p-4.5 shadow-lg transition-all hover:border-neutral-700">

      <div className="space-y-3">
        {/* Header Outlet */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white">
              {outlet.name}
            </p>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-semibold text-orange-400">
                {outlet.code}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => onEdit(outlet)}
              title="Edit outlet"
              className="rounded-lg p-1.5 text-neutral-400 transition hover:bg-neutral-800 hover:text-white"
            >
              <Pencil size={14} />
            </button>

            <button
              type="button"
              onClick={() => onDelete(outlet)}
              title="Hapus outlet"
              className="rounded-lg p-1.5 text-neutral-400 transition hover:bg-red-500/10 hover:text-red-400"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* Status Aplikasi & Presence */}
        <div className="flex items-center justify-between rounded-xl border border-neutral-800/80 bg-neutral-950 px-3 py-2">
          <div className="flex items-center gap-2">
            {outlet.status === "online" ? (
              <span className={`h-2.5 w-2.5 rounded-full ${presence.dotClass} animate-pulse`} />
            ) : (
              <WifiOff size={13} className="text-neutral-600" />
            )}

            <span
              className={`text-xs font-semibold ${
                outlet.status === "online"
                  ? presence.textClass
                  : "text-neutral-500"
              }`}
            >
              {outlet.status === "online" ? presence.label : "Offline"}
            </span>
          </div>

          {lastSeen && (
            <span className="text-[11px] text-neutral-500">
              {lastSeen}
            </span>
          )}
        </div>

        {/* ========================================================
            INFORMASI VERSI APLIKASI OUTLET
        ======================================================== */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-950/70 p-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[11px] font-medium text-neutral-400 flex items-center gap-1.5">
              <Tag size={12} className="text-orange-400" />
              Versi Aplikasi:
            </span>

            {appVersion ? (
              <span
                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold ${
                  isUpToDate
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                    : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                }`}
              >
                {isUpToDate ? (
                  <ShieldCheck size={11} className="shrink-0" />
                ) : (
                  <AlertCircle size={11} className="shrink-0" />
                )}
                <span>v{appVersion}</span>
                {isOutdated && <span className="text-[9px] font-normal">(Update)</span>}
              </span>
            ) : (
              <span className="text-[11px] text-neutral-600 italic">
                Belum Terdeteksi
              </span>
            )}
          </div>

          {/* Info Device & Platform */}
          <div className="border-t border-neutral-800/80 pt-2 text-xs text-neutral-400">
            {device ? (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-neutral-300 font-medium truncate">
                  {isWebClient ? (
                    <Globe size={13} className="shrink-0 text-sky-400" />
                  ) : (
                    <Smartphone size={13} className="shrink-0 text-emerald-400" />
                  )}
                  <span className="truncate">{device.model || "Perangkat Outlet"}</span>
                </div>
                <p className="truncate text-[11px] text-neutral-500">
                  {device.os || "-"}
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-neutral-600 text-[11px]">
                <AlertTriangle size={12} className="shrink-0 text-neutral-600" />
                <span>Belum ada perangkat yang terhubung</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer Reset Device */}
      {installed && (
        <button
          type="button"
          onClick={() => onResetDevice(outlet)}
          className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-xl border border-neutral-800/80 bg-neutral-950/40 py-2 text-[11px] font-medium text-neutral-400 transition hover:border-amber-500/40 hover:bg-neutral-800 hover:text-amber-400 active:scale-98"
        >
          <RefreshCw size={12} />
          <span>Reset Device</span>
        </button>
      )}

    </div>
  );
}
