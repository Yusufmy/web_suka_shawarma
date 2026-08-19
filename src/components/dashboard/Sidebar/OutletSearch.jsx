import { Search } from "lucide-react";

export default function OutletSearch({
  value,
  onChange,
}) {
  return (
    <div className="px-4 pb-2">
      <div className="flex items-center gap-2 rounded-lg bg-neutral-800 px-3 py-2">

        <Search
          size={14}
          className="text-neutral-500"
        />

        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Cari outlet…"
          className="w-full bg-transparent text-sm text-neutral-200 placeholder-neutral-500 outline-none"
        />

      </div>
    </div>
  );
}