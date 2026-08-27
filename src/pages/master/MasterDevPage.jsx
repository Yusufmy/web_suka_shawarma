import React, { useState, useEffect, useRef } from "react";
import {
  Radio,
  Activity,
  Wifi,
  WifiOff,
  Volume2,
  VolumeX,
  Server,
  RefreshCw,
  Clock,
  Building2,
  Smartphone,
  Laptop,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Play,
  Square,
  Search,
  Filter,
  Layers,
  Terminal,
  Zap,
  ShieldCheck,
  Music,
  Mic,
  Eye,
  RadioTower,
  FileText,
  Trash2,
  Cpu,
  Database,
  HardDrive
} from "lucide-react";
import echo from "../../websocket/echo";
import api from "../../services/api";

export default function MasterDevPage() {
  const [broadcast, setBroadcast] = useState(null);
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [eventLogs, setEventLogs] = useState([]);
  const [backendLogs, setBackendLogs] = useState([]);
  const [serverInfo, setServerInfo] = useState(null);
  const [logFileSize, setLogFileSize] = useState("0 KB");
  const [activeLogTab, setActiveLogTab] = useState("ws"); // 'ws' | 'backend'
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all"); // all, online, live_connected, offline
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  const [duration, setDuration] = useState(0);
  const [isAutoScroll, setIsAutoScroll] = useState(true);

  // Connected peers tracked from real-time events
  const [connectedPeers, setConnectedPeers] = useState(new Map()); // key: outletId_deviceId -> { readyAt, answerAt, isConnected }

  const timerRef = useRef(null);
  const activeRoomChannelRef = useRef(null);
  const logContainerRef = useRef(null);

  const addLog = (type, title, details) => {
    setEventLogs((prev) => [
      {
        id: Date.now() + Math.random(),
        time: new Date().toLocaleTimeString(),
        type,
        title,
        details,
      },
      ...prev.slice(0, 99), // Keep latest 100 logs
    ]);
  };

  // 1. Fetch Master Data & Backend Logs
  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch active broadcast
      const bcRes = await api.get("/broadcast/active");
      if (bcRes.data?.active && bcRes.data?.data) {
        setBroadcast(bcRes.data.data);
      } else {
        setBroadcast(null);
      }

      // Fetch all outlets
      const outletsRes = await api.get("/outlet");
      if (outletsRes.data?.data) {
        setOutlets(outletsRes.data.data);
      }

      // Fetch Backend Server Logs & Diagnostics
      const logRes = await api.get("/master-dev/logs?lines=150");
      if (logRes.data) {
        setBackendLogs(logRes.data.logs || []);
        setServerInfo(logRes.data.server_info || null);
        setLogFileSize(logRes.data.log_file_size || "0 KB");
      }

      setLastRefreshed(new Date());
    } catch (err) {
      console.error("Master Dev fetch error:", err);
      addLog("error", "Gagal Fetch Data", err.message);
    } finally {
      setLoading(false);
    }
  };

  // Clear Backend Logs
  const handleClearBackendLogs = async () => {
    if (!window.confirm("Apakah Anda yakin ingin mengosongkan file storage/logs/laravel.log di server?")) return;
    try {
      await api.post("/master-dev/logs/clear");
      setBackendLogs([]);
      setLogFileSize("0 KB");
      addLog("info", "Backend Logs Cleared", "storage/logs/laravel.log berhasil dikosongkan");
    } catch (e) {
      console.error("Clear logs error:", e);
      addLog("error", "Gagal Bersihkan Log", e.message);
    }
  };

  // Duration Timer for active broadcast
  useEffect(() => {
    if (broadcast?.started_at) {
      const startTime = new Date(broadcast.started_at).getTime();
      const updateDuration = () => {
        const now = Date.now();
        const diff = Math.max(0, Math.floor((now - startTime) / 1000));
        setDuration(diff);
      };
      updateDuration();
      timerRef.current = setInterval(updateDuration, 1000);
    } else {
      setDuration(0);
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [broadcast?.started_at]);

  // 2. Real-time WebSocket Listeners
  useEffect(() => {
    fetchData();

    if (!echo) return;

    // Check connection state
    if (echo.connector?.pusher?.connection) {
      const pusher = echo.connector.pusher;
      setWsConnected(pusher.connection.state === "connected");

      pusher.connection.bind("state_change", (states) => {
        setWsConnected(states.current === "connected");
        addLog("ws", "WebSocket State Change", `${states.previous} → ${states.current}`);
      });
    }

    // Subscribe to global channel 'outlets'
    const outletsChannel = echo.channel("outlets");

    outletsChannel.subscribed(() => {
      addLog("ws", "Channel Subscribed", "outlets");
    });

    // 1. Live Mic Started
    outletsChannel.listen(".broadcast.started", (data) => {
      addLog("broadcast", "🎙️ Siaran Mic Dimulai", data);
      setBroadcast(data);
      setConnectedPeers(new Map());
    });

    // 2. Live Mic Ended
    outletsChannel.listen(".broadcast.ended", (data) => {
      addLog("broadcast", "🛑 Siaran Mic Berakhir", data);
      setBroadcast(null);
      setConnectedPeers(new Map());
    });

    // 3. Audio File Started
    outletsChannel.listen(".audio.broadcast.started", (data) => {
      addLog("broadcast", "🎵 Siaran Audio Dimulai", data);
      setBroadcast(data);
      setConnectedPeers(new Map());
    });

    // 4. Audio File Ended
    outletsChannel.listen(".audio.broadcast.ended", (data) => {
      addLog("broadcast", "🛑 Siaran Audio Berakhir", data);
      setBroadcast(null);
      setConnectedPeers(new Map());
    });

    // 5. Receiver Ready (from outlets)
    outletsChannel.listen(".webrtc.receiver.ready", (data) => {
      addLog("webrtc", "🎉 Outlet Ready Sinyal", data);
      if (data?.outlet_id) {
        const key = `${data.outlet_id}_${data.device_id || "default"}`;
        setConnectedPeers((prev) => {
          const next = new Map(prev);
          next.set(key, {
            outletId: data.outlet_id,
            deviceId: data.device_id,
            readyAt: new Date().toLocaleTimeString(),
            status: "ready",
          });
          return next;
        });
      }
    });

    // 6. Presence / Heartbeat update
    outletsChannel.listen(".outlet.presence.updated", (data) => {
      if (data?.outlet_id) {
        setOutlets((prev) =>
          prev.map((item) =>
            item.id === data.outlet_id
              ? {
                  ...item,
                  presence: data.presence || item.presence,
                  status: data.status || item.status,
                  last_seen_at: data.last_seen_at || new Date().toISOString(),
                }
              : item
          )
        );
      }
    });

    return () => {
      if (echo) {
        echo.leaveChannel("outlets");
      }
    };
  }, []);

  // 3. Listen to Active Broadcast Room Channel
  useEffect(() => {
    if (!broadcast?.rtc_room_id || !echo) return;

    const roomChannelName = `broadcast.${broadcast.rtc_room_id}`;
    const roomChannel = echo.channel(roomChannelName);
    activeRoomChannelRef.current = roomChannel;

    addLog("ws", "Subscribing Broadcast Room", roomChannelName);

    // Answer from outlet
    const handleAnswer = (data) => {
      addLog("webrtc", "📥 WebRTC Answer Masuk", data);
      if (data?.outlet_id) {
        const key = `${data.outlet_id}_${data.device_id || "default"}`;
        setConnectedPeers((prev) => {
          const next = new Map(prev);
          const existing = next.get(key) || { outletId: data.outlet_id, deviceId: data.device_id };
          next.set(key, {
            ...existing,
            answerAt: new Date().toLocaleTimeString(),
            status: "connected",
          });
          return next;
        });
      }
    };
    roomChannel.listen(".webrtc.answer", handleAnswer);
    roomChannel.listen("webrtc.answer", handleAnswer);

    // ICE Candidate
    const handleIce = (data) => {
      addLog("webrtc", "🧊 ICE Candidate Diterima", `Outlet ID: ${data?.outlet_id}`);
    };
    roomChannel.listen(".webrtc.ice", handleIce);
    roomChannel.listen("webrtc.ice", handleIce);

    return () => {
      if (echo && roomChannelName) {
        echo.leaveChannel(roomChannelName);
      }
    };
  }, [broadcast?.rtc_room_id]);

  // Format Duration seconds -> MM:SS
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Helper check if outlet is targeted
  const isOutletTargeted = (outletId) => {
    if (!broadcast) return false;
    if (broadcast.target_mode === "all" || !broadcast.outlet_ids || broadcast.outlet_ids.length === 0) {
      return true;
    }
    return broadcast.outlet_ids.map(String).includes(String(outletId));
  };

  // Filtered outlets
  const filteredOutlets = outlets.filter((outlet) => {
    const matchSearch =
      outlet.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      outlet.code?.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchSearch) return false;

    const isLiveConnected = Array.from(connectedPeers.values()).some(
      (p) => Number(p.outletId) === Number(outlet.id)
    );

    if (filterStatus === "online") return outlet.status === "online" || outlet.presence === "foreground";
    if (filterStatus === "live_connected") return isLiveConnected;
    if (filterStatus === "offline") return outlet.status === "offline" && outlet.presence !== "foreground";
    return true;
  });

  const totalOnline = outlets.filter((o) => o.status === "online" || o.presence === "foreground").length;
  const totalTargeted = broadcast
    ? broadcast.target_mode === "all"
      ? outlets.length
      : broadcast.outlet_ids?.length || 0
    : 0;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-4 md:p-6 font-sans">
      {/* Top Navbar */}
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-neutral-800 bg-neutral-900/90 px-6 py-4 backdrop-blur-xl shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-orange-600 to-amber-500 text-white shadow-lg shadow-orange-500/20">
            <RadioTower className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-black text-white tracking-wide flex items-center gap-2">
              MASTER DEV &bull; SYSTEM & BROADCAST MONITOR
              <span className="rounded-md bg-orange-500/20 border border-orange-500/30 px-2 py-0.5 text-[10px] font-bold text-orange-400">
                PRO-DEV
              </span>
            </h1>
            <p className="text-xs text-neutral-400">
              Pantau status siaran operator, koneksi WebRTC, dan log server backend secara real-time
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* WebSocket status */}
          <div
            className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-bold border ${
              wsConnected
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : "border-red-500/30 bg-red-500/10 text-red-400 animate-pulse"
            }`}
          >
            {wsConnected ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
            <span>{wsConnected ? "Reverb WS Connected" : "WS Disconnected"}</span>
          </div>

          {/* Refresh Button */}
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border border-neutral-700 bg-neutral-800 px-3.5 py-1.5 text-xs font-bold text-neutral-200 hover:bg-neutral-700 hover:text-white transition-all active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Sync All</span>
          </button>
        </div>
      </header>

      {/* Server Health & Diagnostics Banner */}
      {serverInfo && (
        <div className="mb-6 grid grid-cols-2 md:grid-cols-5 gap-3 p-4 rounded-2xl border border-neutral-800 bg-neutral-900/60 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/20">
              <Cpu className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[10px] text-neutral-400 font-bold uppercase">PHP & Laravel</div>
              <div className="text-xs font-mono font-bold text-white">
                PHP {serverInfo.php_version} &bull; v{serverInfo.laravel_version}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <HardDrive className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[10px] text-neutral-400 font-bold uppercase">Memory RAM (PHP)</div>
              <div className="text-xs font-mono font-bold text-emerald-400">
                {serverInfo.memory_usage} (Peak: {serverInfo.memory_peak})
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Database className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[10px] text-neutral-400 font-bold uppercase">Database Status</div>
              <div className="text-xs font-bold text-blue-400 capitalize">
                {serverInfo.db_status || "Connected"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <FileText className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[10px] text-neutral-400 font-bold uppercase">Log File Size</div>
              <div className="text-xs font-mono font-bold text-purple-300">
                {logFileSize} (laravel.log)
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Clock className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[10px] text-neutral-400 font-bold uppercase">Server Clock</div>
              <div className="text-xs font-mono font-bold text-neutral-300">
                {new Date(serverInfo.server_time).toLocaleTimeString()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid: Broadcast Hero & Real-time Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Left 2 Cols: Active Broadcast Status */}
        <div className="lg:col-span-2 rounded-2xl border border-neutral-800 bg-neutral-900/80 p-6 backdrop-blur-xl relative overflow-hidden shadow-2xl">
          {broadcast ? (
            <div>
              {/* Active Broadcast Badge */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-3 w-3 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                  </div>
                  <span className="text-xs font-black uppercase tracking-wider text-red-400 bg-red-500/10 border border-red-500/30 px-3 py-1 rounded-full">
                    {broadcast.type === "upload" ? "🎵 Siaran Pemutaran Audio File" : "🎙️ Siaran Bicara Langsung (Live Mic)"}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs font-mono font-bold text-neutral-300 bg-neutral-950 px-3 py-1 rounded-lg border border-neutral-800">
                  <Clock className="h-3.5 w-3.5 text-orange-400" />
                  <span>Durasi: {formatDuration(duration)}</span>
                </div>
              </div>

              {/* Title & Info */}
              <h2 className="text-xl font-black text-white mb-2">
                {broadcast.type === "upload"
                  ? `File: ${broadcast.audio?.name || "Audio File"}`
                  : "Operator Sedang Berbicara Langsung"}
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 my-4">
                <div className="bg-neutral-950/70 border border-neutral-800/80 rounded-xl p-3">
                  <div className="text-[11px] text-neutral-400 font-medium">RTC Room ID</div>
                  <div className="text-xs font-mono font-bold text-orange-300 mt-1 truncate" title={broadcast.rtc_room_id}>
                    {broadcast.rtc_room_id || "-"}
                  </div>
                </div>

                <div className="bg-neutral-950/70 border border-neutral-800/80 rounded-xl p-3">
                  <div className="text-[11px] text-neutral-400 font-medium">Target Mode</div>
                  <div className="text-xs font-bold text-white mt-1 capitalize">
                    {broadcast.target_mode === "all" ? "Seluruh Outlet (ALL)" : `Khusus (${broadcast.outlet_ids?.length || 0} Outlet)`}
                  </div>
                </div>

                <div className="bg-neutral-950/70 border border-neutral-800/80 rounded-xl p-3">
                  <div className="text-[11px] text-neutral-400 font-medium">Started At</div>
                  <div className="text-xs font-bold text-neutral-200 mt-1">
                    {broadcast.started_at ? new Date(broadcast.started_at).toLocaleTimeString() : "-"}
                  </div>
                </div>
              </div>

              {/* Audio URL if Upload */}
              {broadcast.audio?.url && (
                <div className="mt-2 p-2.5 rounded-xl bg-neutral-950 border border-neutral-800 flex items-center justify-between text-xs text-neutral-400">
                  <span className="truncate">URL: {broadcast.audio.url}</span>
                  <a
                    href={broadcast.audio.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-orange-400 hover:underline shrink-0 ml-2 font-bold"
                  >
                    Open Stream
                  </a>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-800/80 border border-neutral-700 text-neutral-500 mb-3">
                <Radio className="h-8 w-8" />
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-neutral-800 px-3 py-1 text-xs font-bold text-neutral-400 mb-2">
                <span className="h-2 w-2 rounded-full bg-neutral-500"></span>
                STANDBY &bull; TIDAK ADA SIARAN
              </div>
              <h2 className="text-lg font-bold text-white">Operator Belum Memulai Siaran</h2>
              <p className="text-xs text-neutral-400 max-w-sm mt-1">
                Semua outlet dalam posisi standby menunggu sinyal siaran suara dari dashboard operator pusat.
              </p>
            </div>
          )}
        </div>

        {/* Right 1 Col: Quick Metrics Card */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-6 backdrop-blur-xl flex flex-col justify-between shadow-2xl">
          <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-4 flex items-center gap-2">
            <Layers className="h-4 w-4 text-orange-400" />
            Statistik Real-Time
          </h3>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800">
              <div className="text-2xl font-black text-white">{outlets.length}</div>
              <div className="text-[11px] font-medium text-neutral-400 mt-1">Total Outlet Terdaftar</div>
            </div>

            <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800">
              <div className="text-2xl font-black text-emerald-400">{totalOnline}</div>
              <div className="text-[11px] font-medium text-neutral-400 mt-1">Outlet Online / Aktif</div>
            </div>

            <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800">
              <div className="text-2xl font-black text-orange-400">{connectedPeers.size}</div>
              <div className="text-[11px] font-medium text-neutral-400 mt-1">WebRTC Ready Peers</div>
            </div>

            <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800">
              <div className="text-2xl font-black text-blue-400">{totalTargeted}</div>
              <div className="text-[11px] font-medium text-neutral-400 mt-1">Outlet Ditargetkan</div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-neutral-800 flex items-center justify-between text-xs text-neutral-500">
            <span>Last Sync: {lastRefreshed.toLocaleTimeString()}</span>
            <span className="font-mono text-emerald-400 font-bold">READY STREAMING</span>
          </div>
        </div>
      </div>

      {/* Main Monitoring Section: Outlets Status Grid */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-6 backdrop-blur-xl shadow-2xl mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              <Building2 className="h-5 w-5 text-orange-400" />
              Monitoring Semua Outlet ({filteredOutlets.length} / {outlets.length})
            </h2>
            <p className="text-xs text-neutral-400">
              Status kehadiran, jenis perangkat login, dan sambungan WebRTC tiap cabang
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-500" />
              <input
                type="text"
                placeholder="Cari outlet / kode..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="rounded-xl border border-neutral-700 bg-neutral-950 pl-9 pr-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:border-orange-500 focus:outline-none w-48"
              />
            </div>

            {/* Filter */}
            <div className="flex rounded-xl border border-neutral-800 bg-neutral-950 p-1">
              <button
                onClick={() => setFilterStatus("all")}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                  filterStatus === "all" ? "bg-neutral-800 text-white shadow" : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                Semua
              </button>
              <button
                onClick={() => setFilterStatus("online")}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                  filterStatus === "online" ? "bg-emerald-500/20 text-emerald-400" : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                Online
              </button>
              <button
                onClick={() => setFilterStatus("live_connected")}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                  filterStatus === "live_connected" ? "bg-orange-500/20 text-orange-400" : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                Tersambung Live
              </button>
              <button
                onClick={() => setFilterStatus("offline")}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                  filterStatus === "offline" ? "bg-red-500/20 text-red-400" : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                Offline
              </button>
            </div>
          </div>
        </div>

        {/* Outlet Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {filteredOutlets.map((outlet) => {
            const isOnline = outlet.status === "online" || outlet.presence === "foreground";
            const isTargeted = isOutletTargeted(outlet.id);
            const peerData = Array.from(connectedPeers.values()).find(
              (p) => Number(p.outletId) === Number(outlet.id)
            );
            const isWebRTCConnected = !!peerData;

            return (
              <div
                key={outlet.id}
                className={`rounded-xl border p-4 transition-all ${
                  isWebRTCConnected
                    ? "border-orange-500/40 bg-orange-500/5 shadow-lg shadow-orange-500/5"
                    : isOnline
                    ? "border-neutral-800 bg-neutral-950/60 hover:border-neutral-700"
                    : "border-neutral-800/40 bg-neutral-950/30 opacity-75"
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <h4 className="text-sm font-bold text-white truncate" title={outlet.name}>
                      {outlet.name}
                    </h4>
                    <div className="text-[11px] font-mono text-neutral-400">{outlet.code || `ID: ${outlet.id}`}</div>
                  </div>

                  {/* Presence Pill */}
                  <span
                    className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      outlet.presence === "foreground"
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        : isOnline
                        ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                        : "bg-neutral-800 text-neutral-400 border border-neutral-700"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        outlet.presence === "foreground"
                          ? "bg-emerald-400 animate-pulse"
                          : isOnline
                          ? "bg-blue-400"
                          : "bg-neutral-500"
                      }`}
                    />
                    {outlet.presence === "foreground" ? "Foreground" : isOnline ? "Online" : "Offline"}
                  </span>
                </div>

                {/* Live Broadcast Connection Status */}
                <div className="my-2.5 p-2 rounded-lg bg-neutral-900/90 border border-neutral-800/80 text-xs">
                  <div className="text-[10px] font-semibold text-neutral-400 flex items-center justify-between">
                    <span>Status Siaran Audio:</span>
                    {isTargeted ? (
                      <span className="text-orange-400 font-bold">Targeted</span>
                    ) : (
                      <span className="text-neutral-500">Bukan Target</span>
                    )}
                  </div>

                  <div className="mt-1 flex items-center gap-1.5 font-bold">
                    {isWebRTCConnected ? (
                      <div className="flex items-center gap-1.5 text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>Tersambung (Menerima Suara)</span>
                      </div>
                    ) : broadcast && isTargeted ? (
                      <div className="flex items-center gap-1.5 text-amber-400 animate-pulse">
                        <Activity className="h-3.5 w-3.5" />
                        <span>Menunggu Sinyal / Menghubungkan</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-neutral-500">
                        <VolumeX className="h-3.5 w-3.5" />
                        <span>Standby (Tidak Live)</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Device Info */}
                <div className="text-[11px] text-neutral-400 flex items-center gap-1.5 truncate">
                  {outlet.device_info?.model?.toLowerCase().includes("web") ? (
                    <Laptop className="h-3.5 w-3.5 text-orange-400 shrink-0" />
                  ) : (
                    <Smartphone className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  )}
                  <span className="truncate">
                    {outlet.device_info?.model || "Belum ada device terdaftar"}
                  </span>
                </div>

                {outlet.last_seen_at && (
                  <div className="text-[10px] text-neutral-500 mt-1 font-mono">
                    Last Seen: {new Date(outlet.last_seen_at).toLocaleTimeString()}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {filteredOutlets.length === 0 && (
          <div className="text-center py-12 text-neutral-500 text-xs">
            Tidak ada outlet yang cocok dengan filter / pencarian.
          </div>
        )}
      </div>

      {/* Multi-Tab Real-time Logs Console */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-6 backdrop-blur-xl shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Terminal className="h-4 w-4 text-emerald-400" />
              Live Server & Real-Time Logs Console
            </h3>

            {/* Log Tabs */}
            <div className="flex rounded-xl border border-neutral-800 bg-neutral-950 p-1">
              <button
                onClick={() => setActiveLogTab("ws")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                  activeLogTab === "ws"
                    ? "bg-neutral-800 text-white shadow"
                    : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                <Zap className="h-3.5 w-3.5 text-orange-400" />
                <span>WebSocket & WebRTC ({eventLogs.length})</span>
              </button>

              <button
                onClick={() => setActiveLogTab("backend")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                  activeLogTab === "backend"
                    ? "bg-neutral-800 text-white shadow"
                    : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                <FileText className="h-3.5 w-3.5 text-purple-400" />
                <span>Backend laravel.log ({backendLogs.length})</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeLogTab === "backend" && (
              <button
                onClick={handleClearBackendLogs}
                title="Kosongkan storage/logs/laravel.log"
                className="flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[11px] font-bold text-red-400 hover:bg-red-500/20 transition-all"
              >
                <Trash2 className="h-3 w-3" />
                <span>Clear Laravel Log</span>
              </button>
            )}

            {activeLogTab === "ws" && (
              <button
                onClick={() => setEventLogs([])}
                className="text-[11px] font-bold text-neutral-400 hover:text-neutral-200 transition-colors"
              >
                Clear Console
              </button>
            )}
          </div>
        </div>

        {/* Tab 1: WebSocket & WebRTC Logs */}
        {activeLogTab === "ws" && (
          <div className="h-72 overflow-y-auto rounded-xl bg-neutral-950 border border-neutral-800/80 p-3 font-mono text-xs space-y-1.5">
            {eventLogs.length > 0 ? (
              eventLogs.map((log) => (
                <div key={log.id} className="flex items-start gap-2 text-neutral-300">
                  <span className="text-neutral-500 shrink-0">[{log.time}]</span>
                  <span
                    className={`font-bold shrink-0 ${
                      log.type === "broadcast"
                        ? "text-red-400"
                        : log.type === "webrtc"
                        ? "text-orange-400"
                        : log.type === "ws"
                        ? "text-blue-400"
                        : "text-neutral-400"
                    }`}
                  >
                    [{log.type.toUpperCase()}]
                  </span>
                  <span className="font-bold text-neutral-200 shrink-0">{log.title}:</span>
                  <span className="text-neutral-400 break-all">
                    {typeof log.details === "object" ? JSON.stringify(log.details) : log.details}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-neutral-600 text-center py-24 italic">
                Menunggu event real-time dari WebSocket Reverb...
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Backend Laravel.log */}
        {activeLogTab === "backend" && (
          <div className="h-72 overflow-y-auto rounded-xl bg-neutral-950 border border-neutral-800/80 p-3 font-mono text-xs space-y-1">
            {backendLogs.length > 0 ? (
              backendLogs.map((line, idx) => {
                const isError = line.includes("ERROR") || line.includes("Exception") || line.includes("Stack trace");
                const isWarning = line.includes("WARNING");
                const isInfo = line.includes("INFO");

                return (
                  <div
                    key={idx}
                    className={`leading-relaxed break-all ${
                      isError
                        ? "text-red-400 font-bold bg-red-500/5 px-1 py-0.5 rounded"
                        : isWarning
                        ? "text-amber-300"
                        : isInfo
                        ? "text-blue-300"
                        : "text-neutral-400"
                    }`}
                  >
                    {line}
                  </div>
                );
              })
            ) : (
              <div className="text-neutral-600 text-center py-24 italic">
                File log Laravel kosong (tidak ada error di storage/logs/laravel.log).
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
