import { Navigate, Outlet } from "react-router-dom";

/**
 * Kebalikan dari ProtectedRoute.
 *
 * Dipakai untuk halaman yang HANYA boleh diakses
 * kalau belum login (mis. /login). Kalau token sudah
 * ada di browser, langsung diarahkan ke /dashboard.
 */
export default function GuestRoute() {
    const token = localStorage.getItem("operator_token");

    if (token) {
        return <Navigate to="/dashboard" replace />;
    }

    return <Outlet />;
}
