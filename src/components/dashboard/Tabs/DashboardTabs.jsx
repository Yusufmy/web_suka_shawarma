import { LogOut, Menu } from "lucide-react";

export default function DashboardTabs({
    tabs,
    activeTab,
    onChange,
    onLogout,
    onMenuClick,
}) {
    return (
        <div className="flex items-center border-b border-neutral-800">

            {/* Menu (buka sidebar outlet) - cuma tampil di layar
                sempit (<lg), di layar lebar sidebar sudah selalu
                terlihat jadi tombol ini tidak diperlukan. */}
            <button
                type="button"
                onClick={onMenuClick}
                className="
                    flex shrink-0 items-center justify-center
                    px-3 py-2.5 text-neutral-400
                    transition hover:text-white
                    lg:hidden
                "
            >
                <Menu size={18} />
            </button>

            {/* Tabs - scroll horizontal sendiri kalau tidak muat,
                supaya bar ini TIDAK PERNAH memaksa seluruh halaman
                melebar/scroll horizontal di layar sempit. */}
            <div className="flex min-w-0 items-center overflow-x-auto">
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const active = activeTab === tab.id;

                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => onChange(tab.id)}
                            className={`
                                flex shrink-0 items-center gap-2
                                rounded-t-lg border-b-2
                                px-3 py-2.5 text-sm
                                font-medium transition
                                sm:px-4

                                ${
                                    active
                                        ? "border-orange-500 text-white"
                                        : "border-transparent text-neutral-500 hover:text-neutral-300"
                                }
                            `}
                        >
                            <Icon size={15} />

                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Logout */}
            <button
                type="button"
                onClick={onLogout}
                className="
                    ml-auto
                    flex shrink-0 items-center gap-2
                    rounded-lg
                    px-3 py-2
                    text-sm font-medium
                    text-neutral-500
                    transition
                    hover:bg-red-500/10
                    hover:text-red-400
                    sm:px-4
                "
            >
                <LogOut size={15} />
                <span className="hidden sm:inline">Logout</span>
            </button>

        </div>
    );
}