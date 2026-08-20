import { useCallback, useEffect, useState } from "react";
import { Plus, Loader2, Store } from "lucide-react";

import outlet from "../../../services/outlet";
import alert from "../../../helpers/alert";
import OutletCard from "./OutletCard";
import OutletFormModal from "./OutletFormModal";

export default function OutletManager() {
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(true);

  // null = modal tertutup, {} = mode tambah, {...outlet} = mode edit
  const [editingOutlet, setEditingOutlet] = useState(null);
  const [showModal, setShowModal] = useState(false);

  // ============================================================
  // FETCH
  // ============================================================

  const fetchOutlets = useCallback(async (isFirstLoad = false) => {
    try {
      if (isFirstLoad) {
        setLoading(true);
      }

      const response = await outlet.getAll();

      setOutlets(response.data || []);
    } catch (error) {
      console.error("❌ Gagal ambil outlet:", error);

      if (isFirstLoad) {
        alert.error("Gagal mengambil data outlet");
      }
    } finally {
      if (isFirstLoad) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchOutlets(true);

    // Refresh berkala - biar status online/presence/last_seen di
    // card ini ikut update tanpa perlu reload manual, sama seperti
    // sidebar outlet.
    const interval = setInterval(() => fetchOutlets(false), 15000);

    return () => clearInterval(interval);
  }, [fetchOutlets]);

  // ============================================================
  // CREATE / EDIT
  // ============================================================

  function openAddModal() {
    setEditingOutlet(null);
    setShowModal(true);
  }

  function openEditModal(outletItem) {
    setEditingOutlet(outletItem);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingOutlet(null);
  }

  async function handleSubmit(payload) {
    if (editingOutlet) {
      await outlet.update(editingOutlet.id, payload);

      alert.success("Outlet berhasil diperbarui");
    } else {
      await outlet.create(payload);

      alert.success("Outlet berhasil ditambahkan");
    }

    closeModal();

    await fetchOutlets(false);
  }

  // ============================================================
  // DELETE
  // ============================================================

  async function handleDelete(outletItem) {
    const confirmed = window.confirm(
      `Hapus outlet "${outletItem.name}"? Tindakan ini tidak bisa dibatalkan.`
    );

    if (!confirmed) {
      return;
    }

    try {
      await outlet.remove(outletItem.id);

      alert.success("Outlet berhasil dihapus");

      await fetchOutlets(false);
    } catch (error) {
      console.error("❌ Gagal hapus outlet:", error);

      alert.error(
        error?.response?.data?.message || "Gagal menghapus outlet"
      );
    }
  }

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 px-4 py-4 sm:px-6">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-white">
            Outlet
          </h2>
          <p className="mt-1 text-xs text-neutral-500">
            Kelola daftar outlet yang bisa menerima siaran.
          </p>
        </div>

        <button
          type="button"
          onClick={openAddModal}
          className="flex shrink-0 items-center gap-2 rounded-lg bg-gradient-to-b from-orange-500 to-orange-700 px-4 py-2 text-sm font-medium text-white transition hover:brightness-110"
        >
          <Plus size={16} />
          Tambah Outlet
        </button>
      </div>

      {/* List */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        {loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-neutral-500">
            <Loader2 size={24} className="animate-spin" />
            <p className="text-sm">Memuat outlet...</p>
          </div>
        ) : outlets.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-neutral-500">
            <Store size={28} className="text-neutral-600" />
            <p className="text-sm">Belum ada outlet terdaftar.</p>
            <p className="text-xs text-neutral-600">
              Klik "Tambah Outlet" untuk mendaftarkan outlet baru.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {outlets.map((item) => (
              <OutletCard
                key={item.id}
                outlet={item}
                onEdit={openEditModal}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <OutletFormModal
          outlet={editingOutlet}
          onClose={closeModal}
          onSubmit={handleSubmit}
        />
      )}

    </div>
  );
}
