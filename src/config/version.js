/**
 * Single Source of Truth untuk Versi Aplikasi & Sistem Audio Suka Shawarma
 */
export const SYSTEM_VERSION = "1.0.2";
export const APP_VERSION = "1.0.2";
export const RELEASE_DATE = "2026-08-29";
export const APP_NAME = "Audio Suka Shawarma";

/**
 * Memeriksa apakah versi klien sudah versi terbaru atau lebih baru (>= targetVersion)
 */
export function isVersionUpToDate(clientVersion, targetVersion = SYSTEM_VERSION) {
  if (!clientVersion) return false;
  if (clientVersion === targetVersion) return true;

  const cParts = clientVersion.split(".").map((n) => parseInt(n, 10) || 0);
  const tParts = targetVersion.split(".").map((n) => parseInt(n, 10) || 0);

  for (let i = 0; i < Math.max(cParts.length, tParts.length); i++) {
    const c = cParts[i] || 0;
    const t = tParts[i] || 0;
    if (c > t) return true;
    if (c < t) return false;
  }

  return true;
}

/**
 * Memeriksa apakah versi klien di bawah targetVersion (< targetVersion)
 */
export function isVersionOutdated(clientVersion, targetVersion = SYSTEM_VERSION) {
  if (!clientVersion) return false;
  return !isVersionUpToDate(clientVersion, targetVersion);
}

export default {
  SYSTEM_VERSION,
  APP_VERSION,
  RELEASE_DATE,
  APP_NAME,
  isVersionUpToDate,
  isVersionOutdated,
};
