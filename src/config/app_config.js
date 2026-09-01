/**
 * Konfigurasi Otomatis Endpoint API & Reverb WebSocket Web Operator
 */

const DEFAULT_LOCAL_IP = "100.120.244.13";
const DEFAULT_LOCAL_API_PORT = 8000;
const DEFAULT_LOCAL_WS_PORT = 8080;

const PROD_API_URL = "https://api-radio.sukashawarma.com/api";
const PROD_WS_HOST = "api-radio.sukashawarma.com";
const PROD_WS_PORT = 443;
const REVERB_KEY = import.meta.env.VITE_REVERB_APP_KEY || "0nffv9ardjj41sjnlivb";

/**
 * Cek apakah web sedang dibuka di environment lokal / IP LAN / Tailscale
 */
export const isLocalEnvironment = () => {
  if (typeof window === "undefined") return true;

  const hostname = window.location.hostname;

  // Localhost atau IP Address (IPv4 / Tailscale / LAN)
  const isLocalHost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);

  return import.meta.env.DEV || isLocalHost;
};

/**
 * Mendapatkan API Base URL:
 * - Local / IP : http://100.120.244.13:8000/api
 * - Production : https://api-radio.sukashawarma.com/api
 */
export const getApiBaseUrl = () => {
  // 1. Jika berjalan di local / IP host
  if (isLocalEnvironment()) {
    const custom = typeof window !== "undefined" ? localStorage.getItem("custom_api_url") : null;
    if (custom && custom.trim().length > 0 && !custom.includes("sukashawarma.com")) {
      return custom.trim();
    }

    const host =
      typeof window !== "undefined" &&
      window.location.hostname &&
      /^(\d{1,3}\.){3}\d{1,3}$/.test(window.location.hostname)
        ? window.location.hostname
        : DEFAULT_LOCAL_IP;

    return `http://${host}:${DEFAULT_LOCAL_API_PORT}/api`;
  }

  // 2. Custom override di production jika ada
  const custom = typeof window !== "undefined" ? localStorage.getItem("custom_api_url") : null;
  if (custom && custom.trim().length > 0) return custom.trim();

  // 3. Env eksplisit
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }

  // 4. Production domain
  return PROD_API_URL;
};

/**
 * Mendapatkan konfigurasi Reverb WebSocket:
 * - Local / IP : ws://100.120.244.13:8080 (forceTLS: false)
 * - Production : wss://api-radio.sukashawarma.com:8080 (forceTLS: true)
 */
export const getReverbConfig = () => {
  const isLocal = isLocalEnvironment();

  if (isLocal) {
    const host =
      typeof window !== "undefined" &&
      window.location.hostname &&
      /^(\d{1,3}\.){3}\d{1,3}$/.test(window.location.hostname)
        ? window.location.hostname
        : (import.meta.env.VITE_REVERB_HOST || DEFAULT_LOCAL_IP);

    const port = Number(import.meta.env.VITE_REVERB_PORT || DEFAULT_LOCAL_WS_PORT);

    return {
      key: REVERB_KEY,
      wsHost: host,
      wsPort: port,
      wssPort: port,
      forceTLS: false,
      scheme: "http",
    };
  }

  return {
    key: REVERB_KEY,
    wsHost: import.meta.env.VITE_REVERB_HOST || PROD_WS_HOST,
    wsPort: Number(import.meta.env.VITE_REVERB_PORT || PROD_WS_PORT),
    wssPort: Number(import.meta.env.VITE_REVERB_PORT || PROD_WS_PORT),
    forceTLS: (import.meta.env.VITE_REVERB_SCHEME ?? "https") === "https",
    scheme: import.meta.env.VITE_REVERB_SCHEME || "https",
  };
};

export default {
  isLocalEnvironment,
  getApiBaseUrl,
  getReverbConfig,
};
