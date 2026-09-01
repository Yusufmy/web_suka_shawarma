import { useState, useRef, useCallback } from "react";
import { Volume2, VolumeX, Volume1, Sliders, ChevronDown, ChevronUp } from "lucide-react";
import api from "../../../services/api";
import WebRTCAudioService from "../../../services/webrct_audio_service";
import webrtcService from "../../../services/webrtc";
import PlaybackCaptureService from "../../../services/playback_capture_service";

export default function OutletVolumeControl({ outlets = [] }) {
    const [isExpanded, setIsExpanded] = useState(true);
    const [masterVolume, setMasterVolume] = useState(100);
    const [outletVolumes, setOutletVolumes] = useState({});
    const debounceTimers = useRef(new Map());

    const sendVolumeToBackend = useCallback((outletId, volume) => {
        // Debounce per outlet untuk request HTTP/WebSocket backend
        const timerId = debounceTimers.current.get(outletId);
        if (timerId) {
            clearTimeout(timerId);
        }

        const newTimer = setTimeout(async () => {
            try {
                await api.post("/outlet/volume", {
                    outlet_id: outletId,
                    volume: Number(volume),
                });
            } catch (err) {
                console.error(`❌ Gagal ubah volume outlet ${outletId}:`, err);
            }
        }, 120);

        debounceTimers.current.set(outletId, newTimer);
    }, []);

    const handleMasterVolumeChange = (newVol) => {
        const val = Number(newVol);
        setMasterVolume(val);

        // 1. Terapkan seketika di WebRTC Stream Lokal Operator (0ms delay)
        try {
            WebRTCAudioService.setOutletVolume("all", val);
        } catch (e) {}
        try {
            if (webrtcService.setOutletVolume) {
                webrtcService.setOutletVolume("all", val);
            }
        } catch (e) {}
        try {
            if (PlaybackCaptureService.setOutletVolume) {
                PlaybackCaptureService.setOutletVolume("all", val);
            }
        } catch (e) {}

        // 2. Update state UI semua outlet
        setOutletVolumes((prev) => {
            const next = { ...prev };
            Object.keys(next).forEach((id) => {
                next[id] = val;
            });
            return next;
        });

        // 3. Kirim ke backend untuk 'all'
        sendVolumeToBackend("all", val);
    };

    const handleSingleOutletVolumeChange = (outletId, newVol) => {
        const val = Number(newVol);

        // 1. Terapkan seketika di WebRTC Stream Lokal Operator (0ms delay)
        try {
            WebRTCAudioService.setOutletVolume(outletId, val);
        } catch (e) {}
        try {
            if (webrtcService.setOutletVolume) {
                webrtcService.setOutletVolume(outletId, val);
            }
        } catch (e) {}
        try {
            if (PlaybackCaptureService.setOutletVolume) {
                PlaybackCaptureService.setOutletVolume(outletId, val);
            }
        } catch (e) {}

        // 2. Update state UI outlet ini
        setOutletVolumes((prev) => ({
            ...prev,
            [outletId]: val,
        }));

        // 3. Kirim ke backend
        sendVolumeToBackend(outletId, val);
    };

    const getVolumeIcon = (vol) => {
        if (vol === 0) return <VolumeX size={14} className="text-red-400 flex-shrink-0" />;
        if (vol < 50) return <Volume1 size={14} className="text-neutral-400 flex-shrink-0" />;
        return <Volume2 size={14} className="text-orange-500 flex-shrink-0" />;
    };

    return (
        <div className="border-t border-neutral-800 bg-neutral-900/60 text-xs">
            {/* Header Accordion */}
            <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex w-full items-center justify-between px-4 py-2.5 text-neutral-300 transition hover:bg-neutral-800/60"
            >
                <span className="flex items-center gap-2 font-semibold">
                    <Sliders size={13} className="text-orange-500" />
                    <span>Kontrol Volume Outlet</span>
                </span>
                <span className="text-neutral-500">
                    {isExpanded ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                </span>
            </button>

            {/* Expandable Content */}
            {isExpanded && (
                <div className="outlet-list-scroll max-h-56 overflow-y-auto px-4 pb-3 pt-1 text-neutral-400">
                    {/* Master Volume */}
                    <div className="mb-3 rounded-lg border border-neutral-800 bg-neutral-950/80 p-2.5">
                        <div className="mb-1.5 flex items-center justify-between">
                            <span className="flex items-center gap-1.5 font-medium text-neutral-200 text-[11px]">
                                {getVolumeIcon(masterVolume)}
                                Master (Semua Outlet)
                            </span>
                            <span className="font-mono text-[11px] font-bold text-orange-400">
                                {masterVolume}%
                            </span>
                        </div>

                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={masterVolume}
                            onChange={(e) => handleMasterVolumeChange(e.target.value)}
                            className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-neutral-800 accent-orange-500"
                        />

                        <div className="mt-2 flex items-center justify-between gap-1 text-[10px]">
                            <button
                                type="button"
                                onClick={() => handleMasterVolumeChange(0)}
                                className={`rounded px-1.5 py-0.5 font-medium transition ${
                                    masterVolume === 0
                                        ? "bg-red-500/20 text-red-400 border border-red-500/30"
                                        : "bg-neutral-800 hover:bg-neutral-700 text-neutral-400"
                                }`}
                            >
                                Mute
                            </button>
                            <button
                                type="button"
                                onClick={() => handleMasterVolumeChange(50)}
                                className="rounded bg-neutral-800 px-1.5 py-0.5 hover:bg-neutral-700 text-neutral-400"
                            >
                                50%
                            </button>
                            <button
                                type="button"
                                onClick={() => handleMasterVolumeChange(80)}
                                className="rounded bg-neutral-800 px-1.5 py-0.5 hover:bg-neutral-700 text-neutral-400"
                            >
                                80%
                            </button>
                            <button
                                type="button"
                                onClick={() => handleMasterVolumeChange(100)}
                                className="rounded bg-neutral-800 px-1.5 py-0.5 hover:bg-neutral-700 text-neutral-400"
                            >
                                100%
                            </button>
                        </div>
                    </div>

                    {/* Individual Outlets */}
                    <div className="space-y-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                            Volume Per Outlet
                        </p>

                        {outlets.length === 0 ? (
                            <p className="text-[11px] italic text-neutral-600">Tidak ada outlet.</p>
                        ) : (
                            outlets.map((outlet) => {
                                const vol = outletVolumes[outlet.id] ?? 100;
                                const isOnline = outlet.status === "online";

                                return (
                                    <div
                                        key={outlet.id}
                                        className={`rounded-md border border-neutral-800/60 bg-neutral-950/40 p-2 transition ${
                                            !isOnline ? "opacity-40" : ""
                                        }`}
                                    >
                                        <div className="mb-1 flex items-center justify-between text-[11px]">
                                            <span className="truncate font-medium text-neutral-300 max-w-[130px]">
                                                {outlet.name}
                                            </span>
                                            <span className="font-mono text-[10px] text-neutral-400">
                                                {vol}%
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    handleSingleOutletVolumeChange(
                                                        outlet.id,
                                                        vol === 0 ? 100 : 0
                                                    )
                                                }
                                                className="text-neutral-500 hover:text-neutral-300"
                                            >
                                                {getVolumeIcon(vol)}
                                            </button>
                                            <input
                                                type="range"
                                                min="0"
                                                max="100"
                                                value={vol}
                                                onChange={(e) =>
                                                    handleSingleOutletVolumeChange(
                                                        outlet.id,
                                                        e.target.value
                                                    )
                                                }
                                                className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-neutral-800 accent-orange-500"
                                            />
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
