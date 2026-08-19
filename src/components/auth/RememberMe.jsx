export default function RememberMe({ checked, onChange }) {
  return (
    <label className="flex select-none items-center gap-2 pt-1 text-xs text-neutral-400">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-3.5 w-3.5 rounded border-neutral-600 bg-neutral-800 accent-orange-500"
      />

      Ingat saya di perangkat ini
    </label>
  );
}