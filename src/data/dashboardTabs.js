import {
  Mic,
  Upload,
  CalendarClock,
  Store,
} from "lucide-react";

export const DASHBOARD_TABS = [
  {
    id: "live",
    label: "Siaran Langsung",
    icon: Mic,
  },
  {
    id: "upload",
    label: "Unggah Audio",
    icon: Upload,
  },
  {
    id: "outlets",
    label: "Outlet",
    icon: Store,
  },
  // {
  //   id: "schedule",
  //   label: "Jadwalkan",
  //   icon: CalendarClock,
  // },
];