import { Volume2 } from "lucide-react";

export default function BroadcastInfo() {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2.5 text-xs text-neutral-400">

      <Volume2 size={14} />

      Audio akan diputar otomatis melalui speaker outlet yang dipilih.

    </div>
  );
}