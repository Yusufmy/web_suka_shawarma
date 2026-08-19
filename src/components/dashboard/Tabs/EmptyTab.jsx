import {
  Upload,
  CalendarClock,
} from "lucide-react";

export default function EmptyTab({ type }) {
  const isUpload = type === "upload";

  const Icon = isUpload
    ? Upload
    : CalendarClock;

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center text-neutral-500">

      <Icon
        size={28}
        className="text-neutral-600"
      />

      <p className="text-sm">
        {isUpload
          ? "Unggah file audio untuk disiarkan ke outlet."
          : "Jadwalkan audio untuk diputar pada waktu tertentu."}
      </p>

      <p className="text-xs text-neutral-600">
        Belum diimplementasikan di preview ini.
      </p>

    </div>
  );
}