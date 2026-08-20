import { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";

export default function OutletFormModal({ outlet, onClose, onSubmit }) {
  const isEdit = Boolean(outlet);

  const [code, setCode] = useState(outlet?.code || "");
  const [name, setName] = useState(outlet?.name || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setCode(outlet?.code || "");
    setName(outlet?.name || "");
    setError(null);
  }, [outlet]);

  async function handleSubmit(e) {
    e.preventDefault();

    if (!code.trim() || !name.trim()) {
      setError("Kode dan nama outlet wajib diisi");

      return;
    }

    try {
      setSaving(true);
      setError(null);

      await onSubmit({ code: code.trim(), name: name.trim() });
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          "Gagal menyimpan outlet, coba lagi"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-900 p-5">

        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">
            {isEdit ? "Edit Outlet" : "Tambah Outlet"}
          </h3>

          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-neutral-500 transition hover:bg-neutral-800 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">
              Kode Outlet
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Contoh: OTL-006"
              disabled={saving}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-orange-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">
              Nama Outlet
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Outlet Cibinong"
              disabled={saving}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-orange-500"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg px-3 py-2 text-sm text-neutral-400 transition hover:text-white"
            >
              Batal
            </button>

            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-gradient-to-b from-orange-500 to-orange-700 px-4 py-2 text-sm font-medium text-white transition disabled:opacity-60"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {isEdit ? "Simpan" : "Tambah"}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
