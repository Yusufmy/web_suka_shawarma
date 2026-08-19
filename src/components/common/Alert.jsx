import { useEffect, useState } from "react";
import {
    CheckCircle,
    XCircle,
    AlertTriangle,
    Info,
    X,
} from "lucide-react";

export default function Alert() {
    const [alert, setAlert] = useState(null);

    useEffect(() => {
        const handleAlert = (event) => {
            setAlert(event.detail);

            setTimeout(() => {
                setAlert(null);
            }, 3000);
        };

        window.addEventListener("app-alert", handleAlert);

        return () => {
            window.removeEventListener(
                "app-alert",
                handleAlert
            );
        };
    }, []);

    if (!alert) {
        return null;
    }

    const config = {
        success: {
            title: "Berhasil",
            icon: CheckCircle,
            className:
                "border-green-500/30 bg-green-950/90 text-green-100",
            iconClassName:
                "bg-green-500/20 text-green-400",
        },

        error: {
            title: "Gagal",
            icon: XCircle,
            className:
                "border-red-500/30 bg-red-950/90 text-red-100",
            iconClassName:
                "bg-red-500/20 text-red-400",
        },

        warning: {
            title: "Peringatan",
            icon: AlertTriangle,
            className:
                "border-yellow-500/30 bg-yellow-950/90 text-yellow-100",
            iconClassName:
                "bg-yellow-500/20 text-yellow-400",
        },

        info: {
            title: "Informasi",
            icon: Info,
            className:
                "border-blue-500/30 bg-blue-950/90 text-blue-100",
            iconClassName:
                "bg-blue-500/20 text-blue-400",
        },
    };

    const current = config[alert.type] || config.info;

    const Icon = current.icon;

    return (
        <div
            className={`
                fixed left-4 right-4 top-4 z-[9999]
                flex items-start gap-3
                rounded-xl border p-4
                shadow-2xl backdrop-blur-md

                sm:left-auto sm:right-5 sm:top-5 sm:w-[360px]
                ${current.className}
            `}
        >
            {/* Icon */}
            <div
                className={`
                    flex h-9 w-9 shrink-0
                    items-center justify-center
                    rounded-full
                    ${current.iconClassName}
                `}
            >
                <Icon size={18} />
            </div>

            {/* Content */}
            <div className="flex-1">
                <p className="text-sm font-semibold">
                    {current.title}
                </p>

                <p className="mt-1 text-xs opacity-80">
                    {alert.message}
                </p>
            </div>

            {/* Close */}
            <button
                type="button"
                onClick={() => setAlert(null)}
                className="opacity-50 transition hover:opacity-100"
            >
                <X size={16} />
            </button>
        </div>
    );
}