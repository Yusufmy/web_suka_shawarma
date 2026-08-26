import React from "react";
import { AlertCircle, RefreshCw, Home } from "lucide-react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Uncaught error caught by ErrorBoundary:", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleClearCache = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {}
    window.location.href = "/petugas";
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 py-8 text-neutral-100">
          <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-neutral-900/90 p-6 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center gap-3 text-red-400 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10 border border-red-500/20">
                <AlertCircle className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Terjadi Kendala Tampilan</h2>
                <p className="text-xs text-neutral-400">Komponen aplikasi mengalami kendala saat memuat</p>
              </div>
            </div>

            <div className="mb-5 rounded-xl border border-neutral-800 bg-neutral-950/80 p-3 text-xs font-mono text-red-300/80 break-words max-h-36 overflow-y-auto">
              {this.state.error?.toString() || "Unknown Error"}
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={this.handleReload}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-600 py-3 text-xs font-bold text-white hover:bg-orange-500 transition-all"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Muat Ulang Halaman</span>
              </button>

              <button
                onClick={this.handleClearCache}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-700 bg-neutral-800 py-2.5 text-xs font-bold text-neutral-300 hover:bg-neutral-700 transition-all"
              >
                <Home className="h-4 w-4" />
                <span>Bersihkan Sesi & Kembali</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
