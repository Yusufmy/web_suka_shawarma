import { useCallback, useEffect, useState, useMemo } from "react";
import {
  Plus,
  Loader2,
  Store,
  Tag,
  ShieldCheck,
  AlertTriangle,
  Search,
  CheckCircle2,
  Users,
} from "lucide-react";

import outlet from "../../../services/outlet";
import alert from "../../../helpers/alert";
import OutletCard from "./OutletCard";
import OutletFormModal from "./OutletFormModal";
import { SYSTEM_VERSION, RELEASE_DATE } from "../../../config/version";

export default function OutletManager() {
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

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

    const interval = setInterval(() => fetchOutlets(false), 15000);

    return () => clearInterval(interval);
  }, [fetchOutlets]);

  // ============================================================
  // FILTER & METRICS
  // ============================================================

  const filteredOutlets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return outlets;
    return outlets.filter((item) => {
      const name = (item.name || "").toLowerCase();
      const code = (item.code || "").toLowerCase();
      const version = (item.app_version || item.device_info?.app_version || "").toLowerCase();
      return name.includes(q) || code.includes(q) || version.includes(q);
    });
  }, [outlets, searchQuery]);

  const metrics = useMemo(() => {
    const total = outlets.length;
    const online = outlets.filter((o) => o.status === "online").length;
    const upToDate = outlets.filter((o) => {
      const ver = o.app_version || o.device_info?.app_version;
      return ver === SYSTEM_VERSION;
    }).length;
    const outdated = outlets.filter((o) => {
      const ver = o.app_version || o.device_info?.app_version;
      return ver && ver !== SYSTEM_VERSION;
    }).length;
    const notInstalled = outlets.filter((o) => !o.paired_at).length;

    return { total, online, upToDate, outdated, notInstalled };
  }, [outlets]);

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
  // RESET DEVICE & RESTART BACKGROUND
  //
  // Lepas paksa pairing device outlet dan kirim sinyal WebSocket/FCM
  // agar background service di aplikasi outlet dihentikan lalu
  // dinyalakan ulang (restart).
  // ============================================================

  async function handleResetDevice(outletItem) {
    const confirmed = window.confirm(
      `Reset perangkat & nyalakan ulang background "${outletItem.name}"?\n\n` +
        `• Sinyal restart background akan dikirim ke aplikasi outlet.\n` +
        `• Slot koneksi akan disegarkan agar device dapat terhubung kembali secara lancar.`
    );

    if (!confirmed) {
      return;
    }

    try {
      await outlet.resetDevice(outletItem.id);

      alert.success("Perangkat direset & sinyal restart background telah dikirim!");

      await fetchOutlets(false);
    } catch (error) {
      console.error("❌ Gagal reset device outlet:", error);

      alert.error(
        error?.response?.data?.message || "Gagal reset device outlet"
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
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-semibold text-white">
              Kelola Outlet
            </h2>
            <span className="inline-flex items-center gap-1 rounded-full border border-orange-500/30 bg-orange-500/10 px-2.5 py-0.5 text-xs font-bold text-orange-400">
              <Tag size={11} />
              Sistem v{SYSTEM_VERSION}
            </span>
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            Kelola daftar outlet & pantau versi aplikasi serta status koneksi di setiap cabang.
          </p>
        </div>

        <button
          type="button"
          onClick={openAddModal}
          className="flex shrink-0 items-center gap-2 rounded-xl bg-gradient-to-b from-orange-500 to-orange-700 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-orange-950/30 transition hover:brightness-110 active:scale-95"
        >
          <Plus size={16} />
          Tambah Outlet
        </button>
      </div>

      {/* Version & Status Summary Bar */}
      <div className="border-b border-neutral-800/80 bg-neutral-900/60 px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          
          {/* Quick Metrics */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
            <div className="flex items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-950/80 px-3 py-1.5 text-neutral-300">
              <Users size={13} className="text-neutral-400" />
              <span>Total: <strong className="text-white">{metrics.total}</strong></span>
            </div>

            <div className="flex items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-950/80 px-3 py-1.5 text-neutral-300">
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span>Online: <strong className="text-green-400">{metrics.online}</strong></span>
            </div>

            <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-emerald-300">
              <ShieldCheck size={13} className="text-emerald-400" />
              <span>v{SYSTEM_VERSION} (Terbaru): <strong className="text-emerald-300">{metrics.upToDate}</strong></span>
            </div>

            {metrics.outdated > 0 && (
              <div className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-amber-300 animate-pulse">
                <AlertTriangle size={13} className="text-amber-400" />
                <span>Perlu Update: <strong className="text-amber-300">{metrics.outdated}</strong></span>
              </div>
            )}
          </div>

          {/* Search Box */}
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama, kode, atau versi..."
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950/90 py-1.5 pl-8 pr-3 text-xs text-white placeholder-neutral-500 transition focus:border-orange-500 focus:outline-none"
            />
          </div>

        </div>
      </div>

      {/* List */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        {loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-neutral-500">
            <Loader2 size={24} className="animate-spin text-orange-500" />
            <p className="text-xs">Memuat data outlet...</p>
          </div>
        ) : filteredOutlets.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-neutral-500">
            <Store size={28} className="text-neutral-600" />
            <p className="text-sm">
              {searchQuery ? "Tidak ada outlet yang cocok dengan pencarian." : "Belum ada outlet terdaftar."}
            </p>
            <p className="text-xs text-neutral-600">
              {searchQuery ? "Coba kata kunci pencarian yang lain." : 'Klik "Tambah Outlet" untuk mendaftarkan outlet baru.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredOutlets.map((item) => (
              <OutletCard
                key={item.id}
                outlet={item}
                onEdit={openEditModal}
                onDelete={handleDelete}
                onResetDevice={handleResetDevice}
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
