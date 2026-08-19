export default function TargetSelector({
  targetMode,
  onChange,
}) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-neutral-900 p-1">

      <button
        onClick={() => onChange("all")}
        className={`
          rounded-full px-4 py-1.5
          text-xs font-semibold transition
          ${
            targetMode === "all"
              ? "bg-orange-500 text-white"
              : "text-neutral-400 hover:text-neutral-200"
          }
        `}
      >
        Semua Outlet
      </button>

      <button
        onClick={() => onChange("specific")}
        className={`
          rounded-full px-4 py-1.5
          text-xs font-semibold transition
          ${
            targetMode === "specific"
              ? "bg-orange-500 text-white"
              : "text-neutral-400 hover:text-neutral-200"
          }
        `}
      >
        Pilih Outlet
      </button>

    </div>
  );
}