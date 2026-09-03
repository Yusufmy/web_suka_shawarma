import {
  Mic,
  Upload,
  Link2,
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
  // {
  //   id: "link",
  //   label: "Unggah Link",
  //   icon: Link2,
  // },
  {
    id: "outlets",
    label: "Outlet",
    icon: Store,
  },
];