import { useState } from "react";
import { useNavigate } from "react-router-dom";

import AuthBrand from "../../components/auth/AuthBrand";
import EmailField from "../../components/auth/EmailFailed";
import PasswordField from "../../components/auth/PasswordFailed";
import RememberMe from "../../components/auth/RememberMe";
import auth from "../../services/auth";
import alert from "../../helpers/alert";

export default function OperatorLogin() {
    const navigate = useNavigate();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleLogin = async () => {
        try {
            setLoading(true);
            setError("");

           const response = await auth.login(email, password);

            console.log("LOGIN RESPONSE:", response);

            localStorage.setItem(
                "operator_token",
                response.data.token
            );

            localStorage.setItem(
                "operator_user",
                JSON.stringify(response.data.user)
            );

            console.log(
                "TOKEN:",
                localStorage.getItem("operator_token")
            );

            console.log(
                "USER:",
                localStorage.getItem("operator_user")
            );

            alert.success(
                response.message || "Login berhasil"
            );

            navigate("/dashboard", { replace: true });

        } catch (error) {
            console.error(error);

            const message =
              error.response?.data?.message ||
              "Email atau password salah";

              alert.error(message);

            setError(
                error.response?.data?.message ||
                "Email atau password salah"
            );

        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-neutral-950 px-4">

            {/* Ambient Glow */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-64 w-64 rounded-full bg-orange-600/10 blur-[100px] sm:h-[420px] sm:w-[420px] sm:blur-[120px]" />
            </div>

            {/* Login Container */}
            <div className="relative z-10 w-full max-w-sm">

                {/* Brand */}
                <AuthBrand />

                {/* Login Card */}
                <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl shadow-black/40">

                    <div className="space-y-5">

                        {/* Email */}
                        <EmailField
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />

                        {/* Password */}
                        <PasswordField
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />

                        {/* Remember */}
                        <RememberMe />

                        {/* Error */}
                        {error && (
                            <p className="text-sm text-red-500">
                                {error}
                            </p>
                        )}

                        {/* Login Button */}
                        <button
                            type="button"
                            onClick={handleLogin}
                            disabled={loading}
                            className="
                                mt-2 flex w-full items-center
                                justify-center rounded-lg
                                bg-gradient-to-b
                                from-orange-500
                                to-orange-700
                                py-2.5
                                text-sm font-semibold
                                text-white
                                shadow-lg shadow-orange-900/20
                                transition
                                hover:brightness-110
                                active:scale-[0.99]
                                disabled:cursor-not-allowed
                                disabled:opacity-50
                            "
                        >
                            {loading ? "MEMPROSES..." : "MASUK"}
                        </button>

                    </div>

                </div>

                {/* Footer */}
                <p className="mt-6 px-4 text-center text-[11px] leading-relaxed text-neutral-600">
                    Akses terbatas untuk operator kantor pusat.
                    Hubungi administrator jika belum memiliki akun.
                </p>

            </div>

        </div>
    );
}