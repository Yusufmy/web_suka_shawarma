import {
    BrowserRouter,
    Routes,
    Route,
    Navigate,
} from "react-router-dom";

import OperatorLogin from "../pages/auth/OperatorLogin";
import OperatorDashboard from "../pages/dashboard/OperatorDashboard";
import PetugasPage from "../pages/petugas/PetugasPage";
import ProtectedRoute from "../components/auth/ProtectedRoute";
import GuestRoute from "../components/auth/GuestRoute";

export default function AppRoutes() {
    return (
        <BrowserRouter>
            <Routes>

                {/* Web Listener / Petugas / Atasan */}
                <Route
                    path="/petugas"
                    element={<PetugasPage />}
                />
                <Route
                    path="/listener"
                    element={<PetugasPage />}
                />

                {/* Login Operator (hanya kalau belum login) */}
                <Route element={<GuestRoute />}>

                    <Route
                        path="/login"
                        element={<OperatorLogin />}
                    />

                </Route>

                {/* Protected Routes Operator */}
                <Route element={<ProtectedRoute />}>

                    <Route
                        path="/dashboard"
                        element={<OperatorDashboard />}
                    />

                </Route>

                {/* Default */}
                <Route
                    path="*"
                    element={<RootRedirect />}
                />

            </Routes>
        </BrowserRouter>
    );
}

/**
 * Path yang tidak dikenal (termasuk "/") diarahkan
 * sesuai status login, bukan selalu ke /login.
 */
function RootRedirect() {
    const token = localStorage.getItem("operator_token");

    return (
        <Navigate
            to={token ? "/dashboard" : "/login"}
            replace
        />
    );
}