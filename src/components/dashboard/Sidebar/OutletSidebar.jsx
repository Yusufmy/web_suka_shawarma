import { Users, Loader2, X } from "lucide-react";
import { SYSTEM_VERSION } from "../../../config/version";

import OutletSearch from "./OutletSearch";
import OutletList from "./OutletList";
import OutletVolumeControl from "./OutletVolumeControl";

export default function OutletSidebar({
    outlets,
    filteredOutlets,
    onlineOutlets,
    search,
    onSearchChange,
    targetMode,
    selected,
    onToggleOutlet,
    loading,
    confirmedOutletIds,
    playingOutletIds,
    listeningOutletIds,
    isOpen = false,
    onClose,
}) {
    return (
        <>
            {/* Backdrop - cuma dipakai di layar sempit (<lg) saat
                drawer terbuka, supaya tap di luar sidebar menutupnya. */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/60 lg:hidden"
                    onClick={onClose}
                />
            )}

            <aside
                className={`
                    fixed inset-y-0 left-0 z-50
                    flex w-72 max-w-[85vw] flex-col
                    border-r border-neutral-800 bg-neutral-950
                    transition-transform duration-200 ease-out

                    lg:static lg:z-auto lg:max-w-none lg:translate-x-0

                    ${isOpen ? "translate-x-0" : "-translate-x-full"}
                `}
            >

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 text-xs">
                <span className="flex items-center gap-1.5 text-neutral-400">
                    <Users size={13} />

                    {loading ? (
                        "Memuat outlet..."
                    ) : (
                        `${onlineOutlets.length}/${outlets.length} online`
                    )}
                </span>

                {/* Tutup drawer - cuma tampil di layar sempit, di
                    layar lebar sidebar statis jadi tidak perlu
                    ditutup. */}
                <button
                    type="button"
                    onClick={onClose}
                    className="
                        rounded-lg p-1
                        text-neutral-500
                        transition hover:bg-neutral-800 hover:text-white
                        lg:hidden
                    "
                >
                    <X size={16} />
                </button>
            </div>

            {/* Search */}
            <OutletSearch
                value={search}
                onChange={onSearchChange}
            />

            {/* Outlet List */}
            <div className="outlet-list-scroll min-h-0 flex-1 overflow-y-auto px-3 py-2">

                {loading ? (
                    <div className="flex h-40 flex-col items-center justify-center gap-3 text-neutral-500">

                        <Loader2
                            size={22}
                            className="animate-spin text-orange-500"
                        />

                        <span className="text-xs">
                            Memuat data outlet...
                        </span>

                    </div>
                ) : filteredOutlets.length === 0 ? (
                    <div className="flex h-40 items-center justify-center text-xs text-neutral-500">
                        Outlet tidak ditemukan
                    </div>
                ) : (
                    <OutletList
                        outlets={filteredOutlets}
                        targetMode={targetMode}
                        selected={selected}
                        onToggle={onToggleOutlet}
                        confirmedOutletIds={confirmedOutletIds}
                        playingOutletIds={playingOutletIds}
                        listeningOutletIds={listeningOutletIds}
                    />
                )}

            </div>

            {/* Volume Control Per Outlet (Dinonaktifkan demi kestabilan murni WebRTC) */}
            {/* <OutletVolumeControl
                outlets={outlets}
                onlineOutlets={onlineOutlets}
            /> */}

            {/* Version Footer */}
            <div className="border-t border-neutral-800/80 px-4 py-2.5 text-center">
                <p className="text-[10px] text-neutral-600 font-mono">
                    Radio Suka Shawarma v{SYSTEM_VERSION}
                </p>
            </div>

            </aside>
        </>
    );
}