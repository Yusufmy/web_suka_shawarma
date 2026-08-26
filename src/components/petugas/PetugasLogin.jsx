import React, { useState, useEffect } from "react";
import {
  Building2,
  Radio,
  Headphones,
  ShieldCheck,
  ArrowRight,
  AlertCircle,
  Settings,
  Server,
  Sparkles
} from "lucide-react";
import petugasService, { getApiBaseUrl, setApiBaseUrl } from "../../services/petugasService";

export default function PetugasLogin({ onLoginSuccess, initialOutlet = "" }) {
  const [outletName, setOutletName] = useState(initialOutlet || "");
  const [outletsList, setOutletsList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [apiUrl, setApiUrl] = useState(getApiBaseUrl());

  useEffect(() => {
    fetchAvailableOutlets();
  }, []);

  const fetchAvailableOutlets = async () => {
    try {
      const list = await petugasService.getOutlets();
      if (Array.isArray(list) && list.length > 0) {
        setOutletsList(list);
      }
    } catch {
      // Abaikan jika server offline saat initial load
    }
  };

  const handleSaveSettings = (e) => {
    e.preventDefault();
    setApiBaseUrl(apiUrl);
    setShowSettings(false);
    fetchAvailableOutlets();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const nameToConnect = outletName.trim();
    if (!nameToConnect) return;

    setIsLoading(true);
    setErrorMsg("");

    try {
      const response = await petugasService.connectOutlet(nameToConnect);

      if (response?.data?.token && response?.data?.outlet) {
        onLoginSuccess({
          token: response.data.token,
          outlet: response.data.outlet,
        });
      } else {
        setErrorMsg("Format respons tidak dikenali dari server.");
      }
    } catch (error) {
      console.warn("Connect error:", error);
      const status = error.response?.status;
      const apiMessage = error.response?.data?.message;

      if (status === 409) {
        setErrorMsg(
          apiMessage || "Outlet ini sedang terhubung di perangkat lain. Silakan logout dari perangkat sebelumnya terlebih dahulu."
        );
      } else if (status === 404 || status === 422) {
        setErrorMsg(
          apiMessage || `Nama outlet "${nameToConnect}" belum terdaftar di database kantor pusat.`
        );
      } else {
        // Network Error
        setErrorMsg(
          `Gagal menghubungi server API (${getApiBaseUrl()}). Pastikan backend Laravel sudah berjalan atau sesuaikan URL API di pengaturan.`
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Masuk mode preview / offline tanpa API
  const handleBypassOffline = () => {
    const name = outletName.trim() || "Outlet Pengawas (Mode Standby)";
    onLoginSuccess({
      token: "offline_preview_token",
      outlet: {
        id: 999,
        name: name,
        code: "OTL-WEB",
      },
    });
  };

  const presetOutlets = [
    "Outlet Pusat1",
    "Outlet Pusat2",
  ];

  return (
    <div className="w-full max-w-md">
      {/* Brand Header */}
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 shadow-xl shadow-orange-500/20 ring-1 ring-orange-400/30">
          <Headphones className="h-8 w-8 text-white" />
          <span className="absolute -top-1 -right-1 flex h-4 w-4">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75"></span>
            <span className="relative inline-flex h-4 w-4 rounded-full bg-orange-500"></span>
          </span>
        </div>

        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs font-semibold text-orange-400 mb-2">
            <Radio className="h-3.5 w-3.5 animate-pulse" />
            Web Audio Listener
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">
            Audio <span className="text-orange-500">Suka Shawarma</span>
          </h1>
          <p className="mt-1 text-sm text-neutral-400">
            Akses Web Khusus Monitoring & Petugas / Atasan
          </p>
        </div>
      </div>

      {/* Login Card */}
      <div className="rounded-2xl border border-neutral-800/80 bg-neutral-900/90 p-7 shadow-2xl backdrop-blur-xl">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Error Banner */}
          {errorMsg && (
            <div className="space-y-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
              <div className="pt-2 border-t border-red-500/20 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowSettings(!showSettings)}
                  className="underline hover:text-red-300 font-medium"
                >
                  Ubah URL API Server
                </button>
                <span>&bull;</span>
                <button
                  type="button"
                  onClick={handleBypassOffline}
                  className="underline hover:text-amber-300 text-amber-400 font-bold"
                >
                  Masuk Mode Standby (Bypass API)
                </button>
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold tracking-wider uppercase text-neutral-400">
                Nama Outlet
              </label>
              <button
                type="button"
                onClick={() => setShowSettings(!showSettings)}
                className="text-[11px] text-neutral-500 hover:text-orange-400 flex items-center gap-1 transition-colors"
                title="Pengaturan URL Server"
              >
                <Settings className="h-3 w-3" />
                <span>Server API</span>
              </button>
            </div>

            {/* Server Settings Drawer */}
            {showSettings && (
              <div className="mb-3 rounded-xl border border-orange-500/30 bg-neutral-950 p-3 space-y-2">
                <label className="block text-[11px] font-semibold text-orange-400 flex items-center gap-1">
                  <Server className="h-3.5 w-3.5" />
                  URL Backend Laravel:
                </label>
                <input
                  type="text"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  placeholder="https://api-radio.sukashawarma.com/api"
                  className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs text-white"
                />
                <div className="flex justify-between items-center pt-1">
                  <div className="flex gap-1.5 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setApiUrl("http://localhost:8000/api")}
                      className="text-neutral-400 hover:text-white underline"
                    >
                      Local :8000
                    </button>
                    <span>|</span>
                    <button
                      type="button"
                      onClick={() => setApiUrl("https://api-radio.sukashawarma.com/api")}
                      className="text-neutral-400 hover:text-white underline"
                    >
                      Production
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveSettings}
                    className="rounded bg-orange-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-orange-500"
                  >
                    Simpan
                  </button>
                </div>
              </div>
            )}

            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-neutral-500">
                <Building2 className="h-5 w-5" />
              </div>
              <input
                type="text"
                value={outletName}
                onChange={(e) => setOutletName(e.target.value)}
                placeholder="Contoh: Outlet Pusat1"
                required
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950/70 py-3 pl-11 pr-4 text-sm font-medium text-white placeholder-neutral-500 transition-all focus:border-orange-500 focus:bg-neutral-950 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
              />
            </div>
            <p className="mt-1.5 text-xs text-neutral-500">
              Masukkan nama outlet yang terdaftar di sistem.
            </p>
          </div>

          {/* Quick Select Buttons */}
          <div>
            <span className="block text-xs font-medium text-neutral-400 mb-2">
              Pilihan Cepat:
            </span>
            <div className="grid grid-cols-2 gap-2">
              {presetOutlets.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    setOutletName(item);
                    setErrorMsg("");
                  }}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all text-center ${
                    outletName === item
                      ? "bg-orange-500/20 text-orange-400 border border-orange-500/50 shadow-sm shadow-orange-500/20"
                      : "bg-neutral-800/70 text-neutral-300 hover:bg-neutral-800 hover:text-white border border-neutral-700/60"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading || !outletName.trim()}
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-orange-600 py-3.5 px-4 font-bold text-white shadow-lg shadow-orange-600/25 transition-all hover:bg-orange-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Menghubungkan ke API...</span>
                </div>
              ) : (
                <>
                  <span>Hubungkan & Buka Siaran</span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </button>
          </div>
        </form>

        <div className="mt-6 border-t border-neutral-800/80 pt-4 flex items-center justify-between text-xs text-neutral-500">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            <span>Koneksi Aman</span>
          </div>
          <button
            type="button"
            onClick={handleBypassOffline}
            className="text-neutral-500 hover:text-orange-400 transition-colors flex items-center gap-1"
          >
            <Sparkles className="h-3 w-3 text-orange-400" />
            <span>Mode Standby Demo</span>
          </button>
        </div>
      </div>
    </div>
  );
}
