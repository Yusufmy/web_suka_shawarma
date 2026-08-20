import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useNavigate } from "react-router-dom";

// import { INITIAL_OUTLETS } from "../../data/outlets";
import { DASHBOARD_TABS } from "../../data/dashboardTabs";

import OutletSidebar from "../../components/dashboard/Sidebar/OutletSidebar";
import DashboardTabs from "../../components/dashboard/Tabs/DashboardTabs";
import EmptyTab from "../../components/dashboard/Tabs/EmptyTab";

import BroadcastPanel from "../../components/dashboard/Broadcast/BroadcastPanel";
import UploadAudio from "../../components/dashboard/Upload/UploadAudio";
import ScheduleAudio from "../../components/dashboard/Schedule/ScheduleAudio";

import auth from "../../services/auth";
import outlet from "../../services/outlet";

import alert from "../../helpers/alert";

import echo from "../../websocket/echo";
import webrtc from "../../services/webrtc";
import webrtcOutletMic from "../../services/webrtc_outlet_mic_service";
import WebRTCOutletMicService from "../../services/webrtc_outlet_mic_service";

import {
    startBroadcast,
    endBroadcast,
} from "../../services/broadcast";

export function useMicDevices() {
    const [devices, setDevices] = useState([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState(
        () => localStorage.getItem("preferred_mic_id") || null
    );

    useEffect(() => {
        async function loadDevices() {
            // Perlu izin mic dulu supaya label device kebaca
            // (tanpa ini, enumerateDevices cuma kasih ID kosong)
            await navigator.mediaDevices.getUserMedia({ audio: true })
                .then((s) => s.getTracks().forEach((t) => t.stop()))
                .catch(() => {});

            const all = await navigator.mediaDevices.enumerateDevices();
            const mics = all.filter((d) => d.kind === "audioinput");

            setDevices(mics);

            // Auto-pilih device tersimpan kalau masih ada, atau
            // device pertama yang BUKAN "default"/built-in kalau
            // ada eksternal terdeteksi
            if (!selectedDeviceId && mics.length > 0) {
                setSelectedDeviceId(mics[0].deviceId);
            }
        }

        loadDevices();

        // Update daftar device kalau ada mic dicolok/dicabut
        navigator.mediaDevices.addEventListener(
            "devicechange",
            loadDevices
        );

        return () => {
            navigator.mediaDevices.removeEventListener(
                "devicechange",
                loadDevices
            );
        };
    }, []);

    function selectDevice(id) {
        setSelectedDeviceId(id);
        localStorage.setItem("preferred_mic_id", id);
    }

    return { devices, selectedDeviceId, selectDevice };
}

// Kirim OFFER ke satu outlet yang sudah kirim "receiver ready".
// Modul-level (bukan di dalam komponen) karena cuma menyentuh
// singleton service "webrtc", tidak butuh state/props React apa pun -
// dipakai baik dari listener event maupun dari drain antrian di
// handleStart.
async function sendOfferToReadyOutlet(outletId) {
    console.log("✅ Flutter receiver valid, outlet:", outletId);

    try {
        await webrtc.handleOutletReady(outletId);

        console.log(
            "✅ OFFER berhasil dikirim ke outlet:",
            outletId
        );
    } catch (error) {
        console.error(
            "❌ Gagal membuat/mengirim OFFER:",
            error
        );
    }
}

export default function OperatorDashboard() {
  const navigate = useNavigate();

  const [outlets, setOutlets] = useState([]);
  const [loadingOutlets, setLoadingOutlets] = useState(true);

  // outlet_id yang sudah kirim "thumbs up" (konfirmasi manual
  // "sudah dapat siaran, suaranya sudah keluar") - beda dari status
  // WebRTC connected, ini konfirmasi dari manusia di outlet.
  const [confirmedOutletIds, setConfirmedOutletIds] =
    useState(new Set());

  // outlet_id yang WebRTC audio-nya SEDANG "connected" (otomatis,
  // dari state PeerConnection operator sendiri - tidak perlu
  // round-trip ke outlet). Ini yang membedakan outlet yang sudah
  // menyusul/connect belakangan (jaringan lambat) dari yang belum
  // sama sekali, jadi operator tahu siapa yang masih diproses.
  const [playingOutletIds, setPlayingOutletIds] =
    useState(new Set());

  const handleOutletAudioStateChange = ({ outletId, state }) => {
      if (!outletId) {
          return;
      }

      setPlayingOutletIds((prev) => {
          const next = new Set(prev);

          if (state === "connected") {
              next.add(outletId);
          } else if (
              state === "disconnected" ||
              state === "failed" ||
              state === "closed"
          ) {
              next.delete(outletId);
          }

          return next;
      });
  };

  const [search, setSearch] = useState("");

  const [targetMode, setTargetMode] =
    useState("all");

  const [selected, setSelected] =
    useState(new Set());

  const [activeTab, setActiveTab] =
    useState("live");

  // Sidebar outlet cuma jadi drawer (butuh state buka/tutup) di
  // layar sempit (<lg) - di layar lebar dia selalu statis terlihat,
  // lihat OutletSidebar.jsx.
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [isLive, setIsLive] =
    useState(false);

  const [duration, setDuration] =
    useState(0);

  const [levels, setLevels] =
    useState(Array(24).fill(6));

  const timerRef = useRef(null);
  const levelRef = useRef(null);

  ///BROADCAST
  const [broadcastId, setBroadcastId] = useState(null);
  const [rtcRoomId, setRtcRoomId] = useState(null);

  // Selalu berisi rtcRoomId TERBARU, dipakai di dalam effect
  // "outlets" (deps []) yang cuma jalan sekali - closure state biasa
  // di situ akan selalu stale.
  const rtcRoomIdRef = useRef(null);

  // Antrian "webrtc.receiver.ready" yang datang SEBELUM operator
  // sendiri selesai ambil mic + set this.roomId di service webrtc
  // (this.roomId & this.localStream, lihat webrtc.js). Ini kejadian
  // NYATA: outlet cukup terima broadcast.started lewat WS lalu
  // langsung balas ready, sedangkan operator masih nunggu response
  // HTTP start-broadcast + getUserMedia() - jalur outlet ternyata
  // bisa lebih cepat selesai duluan. room_id -> Set<outlet_id>.
  const pendingReceiverReadyRef = useRef(new Map());

  ///STATUS BROADCAST
  const [broadcastStatus, setBroadcastStatus] = useState("idle");
  const [connectedOutlets, setConnectedOutlets] = useState(0);

  // Outlet id yang sudah connected - dipakai supaya status
  // broadcast tidak mundur ke "connecting"/"failed" cuma karena
  // SATU outlet drop, padahal outlet lain masih live.
  const connectedOutletIdsRef = useRef(new Set());

  // Timeout supaya operator TIDAK terjebak selamanya di overlay
  // "Menghubungkan Broadcast" kalau semua outlet target sedang
  // offline/background/terminated - mereka tidak akan pernah
  // mengirim sinyal WebRTC "ready" (butuh app terbuka), jadi tanpa
  // timeout ini overlay penuh-layar itu tidak akan pernah hilang.
  const waitingReceiverTimeoutRef = useRef(null);

  //Open Mic
  const outletMicAudioRef = useRef(null);
  const { devices, selectedDeviceId, selectDevice } = useMicDevices();

  const isConnecting =
      broadcastStatus === "starting" ||
      broadcastStatus === "waiting_receiver" ||
      broadcastStatus === "connecting";


  // ============================================================
  // OUTLET
  // ============================================================

  const onlineOutlets = useMemo(
    () =>
      outlets.filter(
        (outlet) =>
          outlet.status === "online"
      ),
    [outlets]
  );


  const filteredOutlets = useMemo(() => {
    const keyword = search.trim().toLowerCase();

        if (!keyword) {
            return outlets;
        }

        return outlets.filter((outlet) => {
            const id = String(outlet.id ?? "").toLowerCase();
            const name = String(outlet.name ?? "").toLowerCase();
            const code = String(outlet.code ?? "").toLowerCase();

            return (
                id.includes(keyword) ||
                name.includes(keyword) ||
                code.includes(keyword)
            );
        });
    }, [outlets, search]);


  // ============================================================
  // TARGET
  // ============================================================

  const targetCount =
    targetMode === "all"
      ? onlineOutlets.length
      : selected.size;


  const canStart =
    !isLive &&
    (
        targetMode === "all" ||
        (targetMode === "specific" && targetCount > 0)
    );


  // ============================================================
  // LIVE TIMER
  // ============================================================

  useEffect(() => {

    if (isLive) {

      timerRef.current =
        setInterval(() => {

          setDuration(
            (value) => value + 1
          );

        }, 1000);


      levelRef.current =
        setInterval(() => {

          setLevels((previous) =>
            previous.map(
              () =>
                6 +
                Math.floor(
                  Math.random() * 34
                )
            )
          );

        }, 160);

    } else {

      clearInterval(timerRef.current);
      clearInterval(levelRef.current);

      setLevels(
        Array(24).fill(6)
      );
    }


    return () => {

      clearInterval(timerRef.current);
      clearInterval(levelRef.current);

    };

  }, [isLive]);


    // ============================================================
    // WEBSOCKET
    // ============================================================

    useEffect(() => {
        rtcRoomIdRef.current = rtcRoomId;
    }, [rtcRoomId]);

    useEffect(() => {
        if (!rtcRoomId) {
            return;
        }

        console.log(
            "🔌 Joining WebRTC room:",
            rtcRoomId
        );

        const channelName =
            `broadcast.${rtcRoomId}`;

        const channel =
            echo.channel(channelName);

        channel.subscribed(() => {
            console.log(
                "✅ WebRTC channel subscribed:",
                channelName
            );
        });

        // NOTE: listener ".webrtc.receiver.ready" SENGAJA TIDAK di
        // sini lagi - sudah dipindah ke channel "outlets" (selalu
        // ke-subscribe dari awal load dashboard) supaya tidak race
        // dengan outlet yang mengirim sinyal ready ini SEBELUM
        // subscribe ke channel broadcast.{roomId} ini selesai. Lihat
        // effect "outlets" di bawah, dan App\Events\WebRTCReceiverReady
        // di backend.

        // ========================================================
        // FLUTTER -> WEB
        // OUTLET MIC OFFER
        //
        // OUTLET -> OPERATOR
        // ========================================================

        channel.listen(
            ".webrtc.outlet.offer",
            async (data) => {
                console.log(
                    "===================================="
                );

                console.log(
                    "🎤📥 OUTLET MIC OFFER RECEIVED"
                );

                console.log(
                    "🎤📥 DATA:",
                    data
                );

                console.log(
                    "🎤📥 CURRENT ROOM:",
                    rtcRoomId
                );

                console.log(
                    "===================================="
                );

                try {
                    // ------------------------------------------------
                    // VALIDASI ROOM
                    // ------------------------------------------------

                    if (!data?.room_id) {
                        console.warn(
                            "⚠️ Outlet offer tidak memiliki room_id"
                        );

                        return;
                    }

                    if (data.room_id !== rtcRoomId) {
                        console.warn(
                            "⚠️ Outlet offer room berbeda:",
                            {
                                expected: rtcRoomId,
                                received: data.room_id,
                            }
                        );

                        return;
                    }

                    // ------------------------------------------------
                    // VALIDASI OFFER
                    // ------------------------------------------------

                    if (
                        !data?.offer ||
                        !data.offer.type ||
                        !data.offer.sdp
                    ) {
                        console.warn(
                            "⚠️ Outlet offer tidak valid:",
                            data
                        );

                        return;
                    }

                    // ------------------------------------------------
                    // START OUTLET MIC RECEIVER
                    // ------------------------------------------------

                    await webrtcOutletMic.start({
                        roomId: data.room_id,
                        outletId: data.outlet_id,
                        offer: data.offer,
                    });

                    console.log(
                        "🎉 Outlet mic WebRTC berhasil dimulai"
                    );

                } catch (error) {
                    console.error(
                        "❌ Gagal handle outlet mic offer:",
                        error
                    );
                }
            }
        );

        // ========================================================
        // FLUTTER -> WEB
        // ANSWER
        //
        // INI UNTUK:
        // OPERATOR -> OUTLET
        // ========================================================

        channel.listen(
            ".webrtc.answer",
            async (data) => {
                console.log(
                    "📥 WEBRTC ANSWER:",
                    data
                );

                console.log(
                    "📦 ANSWER DATA:",
                    data.answer
                );

                if (!data?.outlet_id) {
                    console.warn(
                        "⚠️ Answer tidak memiliki outlet_id"
                    );

                    return;
                }

                await webrtc.handleAnswer(
                    data.outlet_id,
                    data.answer
                );
            }
        );

        // ========================================================
        // FLUTTER -> WEB
        // ICE
        //
        // INI ICE UNTUK ARAH:
        // OUTLET -> OPERATOR
        //
        // ICE arah operator -> outlet lewat event
        // webrtc.operator.ice (cuma didengar Flutter), jadi di
        // sini tidak perlu lagi filter "punya sendiri".
        // ========================================================

        channel.listen(
            ".webrtc.ice",
            async (data) => {
                console.log(
                    "🧊 WEBRTC ICE RECEIVED:",
                    data
                );

                if (!data?.outlet_id) {
                    console.warn(
                        "⚠️ ICE tidak memiliki outlet_id"
                    );

                    return;
                }

                await webrtc.handleIceCandidate(
                    data.outlet_id,
                    data.candidate
                );
            }
        );

        // ========================================================
        // FLUTTER -> WEB
        // OUTLET MIC ICE
        //
        // OUTLET -> OPERATOR
        // ========================================================

        channel.listen(
            ".webrtc.outlet.ice",
            async (data) => {
                console.log(
                    "🎤🧊 OUTLET MIC ICE RECEIVED:",
                    data
                );

                try {
                    // ------------------------------------------------
                    // VALIDASI ROOM
                    // ------------------------------------------------

                    if (
                        data?.room_id &&
                        data.room_id !== rtcRoomId
                    ) {
                        console.warn(
                            "⚠️ Outlet ICE room berbeda:",
                            {
                                expected: rtcRoomId,
                                received: data.room_id,
                            }
                        );

                        return;
                    }

                    // ------------------------------------------------
                    // VALIDASI CANDIDATE
                    // ------------------------------------------------

                    if (
                        !data?.candidate ||
                        !data.candidate.candidate
                    ) {
                        console.warn(
                            "⚠️ Outlet ICE candidate tidak valid:",
                            data
                        );

                        return;
                    }

                    // ------------------------------------------------
                    // HANDLE OUTLET ICE
                    // ------------------------------------------------

                    await webrtcOutletMic
                        .handleIceCandidate(
                            data.candidate
                        );

                } catch (error) {
                    console.error(
                        "❌ Failed handling outlet ICE:",
                        error
                    );
                }
            }
        );

        // ========================================================
        // CLEANUP
        // ========================================================

        return () => {
            console.log(
                "🔌 Leaving WebRTC channel:",
                channelName
            );

            echo.leave(channelName);
        };

    }, [rtcRoomId]);

    useEffect(() => {
        WebRTCOutletMicService.setRemoteStreamListener(
            async (stream) => {
                console.log("====================================");
                console.log("🔊 AUDIO STREAM DITERIMA DARI OUTLET");
                console.log("🎵 Stream:", stream);
                console.log(
                    "🎵 Audio tracks:",
                    stream.getAudioTracks()
                );

                const audio = outletMicAudioRef.current;

                if (!audio) {
                    console.error(
                        "❌ HTML audio element belum tersedia"
                    );
                    return;
                }

                const tracks = stream.getAudioTracks();

                if (tracks.length === 0) {
                    console.error(
                        "❌ Tidak ada audio track"
                    );
                    return;
                }

                console.log(
                    "🎵 Audio track:",
                    tracks[0]
                );

                // Pasang stream ke HTML audio
                audio.srcObject = stream;

                audio.volume = 1.0;
                audio.muted = false;

                console.log(
                    "🔊 MediaStream dipasang ke HTMLAudioElement"
                );

                try {
                    await audio.play();

                    console.log(
                        "🔊🔊🔊 AUDIO PLAYING!"
                    );
                } catch (error) {
                    console.error(
                        "❌ AUDIO PLAY GAGAL:",
                        error
                    );
                }

                console.log("====================================");
            }
        );

        WebRTCOutletMicService.setConnectionStateListener(
            (state) => {
                console.log(
                    "🎤 OUTLET MIC CONNECTION:",
                    state
                );
            }
        );

        return () => {
            WebRTCOutletMicService.setRemoteStreamListener(
                null
            );

            WebRTCOutletMicService.setConnectionStateListener(
                null
            );

            const audio = outletMicAudioRef.current;

            if (audio) {
                audio.pause();
                audio.srcObject = null;
            }
        };
    }, []);



  // ============================================================
  // ACTION
  // ============================================================
  
  function toggleOutlet(id) {
    setSelected((previous) => {
        const next = new Set(previous);

        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }

        console.log(
            "🎯 SELECTED OUTLET:",
            Array.from(next)
        );

        return next;
    });
  }
  
  // ============================================================
  // START BRODCAST & END BRODCAST
  // ============================================================
    const handleStart = async () => {
      try {

          console.log(
              "===================================="
          );

          console.log(
              "🎙️ START BROADCAST"
          );

          console.log(
              "===================================="
          );

          // ============================================
          // VALIDASI
          // ============================================

          if (
              targetMode === "specific" &&
              selected.size === 0
          ) {
              alert.error(
                  "Pilih minimal satu outlet"
              );

              return;
          }

          // ============================================
          // RESET STATE
          // ============================================

          setBroadcastStatus("starting");
          setIsLive(false);
          setDuration(0);

          connectedOutletIdsRef.current.clear();
          setConnectedOutlets(0);
          setConfirmedOutletIds(new Set());
          pendingReceiverReadyRef.current.clear();

          // ============================================
          // SELECTED OUTLET
          // ============================================

          const selectedOutletIds =
              Array.from(selected);

          // Dipakai webrtc.js buat validasi "isTargeted" waktu ada
          // outlet kirim ready. Sengaja BUKAN onlineOutlets (snapshot
          // status online SAAT INI) - outlet yang lagi
          // background/terminated waktu broadcast dimulai bisa saja
          // baru connect BELAKANGAN (device dibuka manual/lewat FCM)
          // dan tetap harus dianggap "target" yang sah, terutama
          // untuk mode "specific" yang sudah dipilih operator.
          const targetOutlets =
              targetMode === "all"
                  ? outlets
                  : outlets.filter((outlet) =>
                        selected.has(outlet.id)
                    );

          console.log(
              "🎯 TARGET MODE:",
              targetMode
          );

          console.log(
              "🎯 SELECTED OUTLETS:",
              selectedOutletIds
          );

          // ============================================
          // CREATE BROADCAST
          // ============================================

          const response =
              await startBroadcast(
                  targetMode,
                  selectedOutletIds
              );

          console.log(
              "📦 START BROADCAST RESPONSE:",
              response
          );

          // ============================================
          // AMBIL DATA BROADCAST
          // ============================================

          const broadcast =
              response.data;

          if (!broadcast) {
              throw new Error(
                  "Data broadcast tidak ditemukan"
              );
          }

          if (!broadcast.id) {
              throw new Error(
                  "Broadcast ID tidak ditemukan"
              );
          }

          if (!broadcast.rtc_room_id) {
              throw new Error(
                  "RTC Room ID tidak ditemukan"
              );
          }

          console.log(
              "🆔 Broadcast ID:",
              broadcast.id
          );

          console.log(
              "🏠 RTC Room ID:",
              broadcast.rtc_room_id
          );

          // ============================================
          // SET STATE
          // ============================================

          setBroadcastId(
              broadcast.id
          );

          setRtcRoomId(
              broadcast.rtc_room_id
          );

        // ============================================
        // START WEBRTC DULU
        // ============================================

        await webrtc.startBroadcast(
            broadcast.rtc_room_id,
            targetOutlets,
            selectedDeviceId   // 👈 tambahin ini
        );

        console.log(
            "🎙️ WebRTC ready on operator"
        );

        // ============================================
        // "REPLAY" READY YANG SEMPAT ANTRI
        //
        // Outlet bisa saja sudah kirim "receiver ready" SEBELUM
        // baris webrtc.startBroadcast() di atas ini selesai (lihat
        // catatan di listener ".webrtc.receiver.ready" pada effect
        // channel "outlets") - kalau ada, proses sekarang juga
        // supaya OFFER tetap terkirim, bukan hilang begitu saja.
        // ============================================

        const pendingOutletIds =
            pendingReceiverReadyRef.current.get(
                broadcast.rtc_room_id
            );

        if (pendingOutletIds && pendingOutletIds.size > 0) {
            console.log(
                "📨 Replay receiver.ready yang tertunda:",
                Array.from(pendingOutletIds)
            );

            pendingReceiverReadyRef.current.delete(
                broadcast.rtc_room_id
            );

            for (const outletId of pendingOutletIds) {
                await sendOfferToReadyOutlet(outletId);
            }
        }

        // ============================================
        // BARU SET ROOM ID
        // ============================================

        setBroadcastId(
            broadcast.id
        );

        setRtcRoomId(
            broadcast.rtc_room_id
        );

        // ============================================
        // WAITING RECEIVER
        // ============================================

        setBroadcastStatus(
            "waiting_receiver"
        );

        console.log(
            "⏳ Waiting for Flutter receiver..."
        );

        // ============================================
        // TIMEOUT NUNGGU RECEIVER
        //
        // Outlet yang lagi background/terminated TIDAK PERNAH
        // akan mengirim sinyal "ready" (butuh app terbuka untuk
        // negosiasi WebRTC) - jadi kalau ditunggu tanpa batas,
        // overlay ini tidak akan pernah hilang. Broadcast-nya
        // sendiri SUDAH berjalan (push notif sudah terkirim),
        // jadi setelah timeout kita anggap "live" juga supaya
        // operator bisa lanjut pakai dashboard/stop kapan saja -
        // outlet yang masih online tetap bisa connect belakangan
        // kapan pun mereka kirim sinyal ready.
        // ============================================

        clearTimeout(waitingReceiverTimeoutRef.current);

        waitingReceiverTimeoutRef.current = setTimeout(() => {
            if (connectedOutletIdsRef.current.size === 0) {
                console.warn(
                    "⚠️ Tidak ada outlet yang terhubung real-time " +
                    "dalam waktu tunggu - lanjut sebagai live " +
                    "(outlet offline akan mendapat notifikasi)."
                );

                setBroadcastStatus("live");
                setIsLive(true);

                alert.warning(
                    "Belum ada outlet yang terhubung real-time " +
                    "(kemungkinan sedang offline/background). " +
                    "Siaran tetap berjalan - mereka akan mendapat " +
                    "notifikasi saat membuka aplikasi."
                );
            }
        }, 20000);

      } catch (error) {

          console.error(
              "❌ GAGAL MEMULAI BROADCAST:",
              error.response?.data ||
              error
          );

          clearTimeout(waitingReceiverTimeoutRef.current);

          setBroadcastStatus(
              "idle"
          );

          setIsLive(false);

          setBroadcastId(null);
          setRtcRoomId(null);

          try {
              await webrtc.stop();
          } catch (stopError) {
              console.error(
                  "❌ WebRTC cleanup error:",
                  stopError
              );
          }

          alert.error(
              error.response?.data?.message ||
              "Gagal memulai broadcast"
          );
      }
  };

    useEffect(() => {
      // ==========================================================
      // Sekarang callback ini menerima { outletId, state } - satu
      // outlet drop/gagal TIDAK BOLEH langsung menganggap seluruh
      // broadcast gagal kalau outlet lain masih live.
      // ==========================================================

      webrtc.setConnectionStateListener(
          ({ outletId, state }) => {

              console.log(
                  "📡 WEBRTC STATUS FROM SERVICE:",
                  { outletId, state }
              );

              if (state === "connected") {

                  console.log(
                      `🎉 Outlet ${outletId} connected!`
                  );

                  clearTimeout(
                      waitingReceiverTimeoutRef.current
                  );

                  connectedOutletIdsRef.current.add(
                      outletId
                  );

                  setConnectedOutlets(
                      connectedOutletIdsRef.current.size
                  );

                  setBroadcastStatus("live");

                  setIsLive(true);

                  return;
              }

              if (
                  state === "failed" ||
                  state === "closed" ||
                  state === "disconnected"
              ) {

                  connectedOutletIdsRef.current.delete(
                      outletId
                  );

                  setConnectedOutlets(
                      connectedOutletIdsRef.current.size
                  );

                  // Kalau semua outlet sudah drop, baru
                  // broadcast dianggap gagal/berhenti.
                  if (
                      connectedOutletIdsRef.current.size === 0
                  ) {
                      setBroadcastStatus(
                          state === "failed" ? "failed" : "idle"
                      );

                      setIsLive(false);
                  }

                  return;
              }

              if (
                  state === "connecting" &&
                  connectedOutletIdsRef.current.size === 0
              ) {
                  setBroadcastStatus("connecting");
              }
          }
      );

      return () => {
          webrtc.setConnectionStateListener(
              null
          );
      };
  }, []);

  const handleStop = async () => {
    if (!broadcastId) {
      return;
    }

    try {

       clearTimeout(waitingReceiverTimeoutRef.current);

       await endBroadcast(broadcastId);

        await webrtc.stop();

        connectedOutletIdsRef.current.clear();
        setConnectedOutlets(0);
        setConfirmedOutletIds(new Set());

        setIsLive(false);
        setBroadcastStatus("idle");
        setBroadcastId(null);
        setRtcRoomId(null);

      } catch (error) {
          console.error(
                "Gagal menghentikan broadcast:",
                error.response?.data || error
            );
        }
    };
  
  
  // ============================================================
  // LOGOUT
  // ============================================================
    const handleLogout = async () => {
      try {
          await auth.logout();

          // Hapus session operator
          localStorage.removeItem("operator_token");
          localStorage.removeItem("operator_user");

          alert.success("Logout berhasil");
          // Kembali ke login
          navigate("/login", { replace: true });

      } catch (error) {
          console.error("LOGOUT ERROR:", error);
          alert.error("Logout gagal");

          // Tetap hapus local session
          // agar user tidak tetap dianggap login di frontend
          localStorage.removeItem("operator_token");
          localStorage.removeItem("operator_user");

          navigate("/login", { replace: true });
      }
  };

  // ============================================================
  // GET ALL OUTLET
  //
  // Di-refresh berkala (bukan cuma sekali di awal) - ini backstop
  // untuk kasus app outlet di-kill PAKSA (swipe dari recents),
  // yang tidak sempat lapor apa pun ke backend. Backend sendiri
  // yang menghitung basi/tidaknya tiap outlet berdasarkan
  // last_seen_at setiap kali endpoint ini dipanggil (lihat
  // OutletAuthService::correctIfStale), jadi refresh berkala di
  // sini otomatis "menemukan" outlet yang diam-diam sudah mati.
  // ============================================================
  useEffect(() => {
      const fetchOutlets = async (isFirstLoad) => {
          try {
              if (isFirstLoad) {
                  setLoadingOutlets(true);
              }

              const response = await outlet.getAll();

              console.log("OUTLET RESPONSE:", response);

              setOutlets(response.data || []);

          } catch (error) {
              console.error(
                  "GET OUTLETS ERROR:",
                  error
              );

              if (isFirstLoad) {
                  alert.error(
                      error.response?.data?.message ||
                      "Gagal mengambil data outlet"
                  );
              }
          } finally {
              if (isFirstLoad) {
                  setLoadingOutlets(false);
              }
          }
      };

      fetchOutlets(true);

      const interval = setInterval(
          () => fetchOutlets(false),
          15000
      );

      return () => clearInterval(interval);
  }, []);

  // ============================================================
  // THUMBS UP (outlet konfirmasi "sudah dapat siaran, suaranya
  // sudah keluar")
  //
  // Backend: App\Events\OutletThumbsUp
  // Event: outlet.thumbs.up
  // Channel: outlets
  // ============================================================
  useEffect(() => {
      const channel = echo.channel("outlets");

      // ========================================================
      // FLUTTER -> WEB
      // RECEIVER READY
      // OPERATOR BROADCAST -> OUTLET
      //
      // Sengaja didengarkan di channel "outlets" (bukan
      // broadcast.{roomId}) - lihat App\Events\WebRTCReceiverReady.
      // Effect ini deps [] jadi cuma subscribe sekali sejak
      // dashboard dibuka, tidak mungkin telat dibanding outlet
      // mengirim sinyal ready-nya.
      // ========================================================

      channel.listen(".webrtc.receiver.ready", async (data) => {
          console.log(
              "🎉 Flutter receiver READY:",
              data
          );

          if (!data?.room_id || !data?.outlet_id) {
              console.warn(
                  "⚠️ receiver.ready tidak lengkap:",
                  data
              );

              return;
          }

          // Cek kesiapan LANGSUNG ke service webrtc (this.roomId +
          // this.localStream), BUKAN ke rtcRoomId React state -
          // state React (dan ref penyalinnya) baru ke-update setelah
          // render berikutnya, sementara this.roomId di service
          // di-set sinkron persis saat webrtc.startBroadcast()
          // dipanggil. Event ready ini terbukti bisa datang SEBELUM
          // render itu sempat jalan.
          const operatorReadyForThisRoom =
              webrtc.roomId === data.room_id &&
              !!webrtc.localStream;

          if (!operatorReadyForThisRoom) {
              console.warn(
                  "⏳ Operator belum siap (mic/room) untuk room ini, " +
                  "antrikan ready:",
                  data
              );

              const pending =
                  pendingReceiverReadyRef.current.get(
                      data.room_id
                  ) ?? new Set();

              pending.add(data.outlet_id);

              pendingReceiverReadyRef.current.set(
                  data.room_id,
                  pending
              );

              return;
          }

          await sendOfferToReadyOutlet(data.outlet_id);
      });

      channel.listen(".outlet.thumbs.up", (data) => {
          console.log(
              "👍 OUTLET THUMBS UP:",
              data
          );

          if (!data?.outlet_id) {
              return;
          }

          setConfirmedOutletIds((prev) => {
              const next = new Set(prev);

              next.add(data.outlet_id);

              return next;
          });
      });

      // ========================================================
      // PRESENCE (foreground/background/offline) - update instan,
      // tidak perlu menunggu refresh berkala 15 detik.
      //
      // Backend: App\Events\OutletPresenceUpdated
      // Event: outlet.presence.updated
      // ========================================================

      channel.listen(".outlet.presence.updated", (data) => {
          console.log(
              "📶 OUTLET PRESENCE UPDATED:",
              data
          );

          if (!data?.outlet_id) {
              return;
          }

          setOutlets((prev) =>
              prev.map((item) =>
                  item.id === data.outlet_id
                      ? {
                          ...item,
                          status: data.status,
                          presence: data.presence,
                          last_seen_at: data.last_seen_at,
                      }
                      : item
              )
          );
      });

      // ========================================================
      // Broadcast (siaran langsung ATAU audio-file) berakhir -
      // badge jempol hijau tidak relevan lagi begitu siaran-nya
      // sudah selesai, jangan tunggu sampai siaran BERIKUTNYA
      // dimulai baru hilang.
      // ========================================================

      const clearConfirmed = () => {
          setConfirmedOutletIds(new Set());
          setPlayingOutletIds(new Set());
      };

      channel.listen(".broadcast.ended", clearConfirmed);
      channel.listen(".audio.broadcast.ended", clearConfirmed);

      return () => {
          echo.leave("outlets");
      };
  }, []);

  // ============================================================
  // UI
  // ============================================================

  return (
  <div className="flex h-screen w-full overflow-hidden bg-neutral-950 text-neutral-100">

  <audio
    ref={outletMicAudioRef}
    autoPlay
    playsInline
    controls={false}
    style={{ display: "none" }}
/>

    {/* ======================================================
        SIDEBAR
    ====================================================== */}

    <OutletSidebar
        outlets={outlets}
        filteredOutlets={filteredOutlets}
        onlineOutlets={onlineOutlets}
        search={search}
        onSearchChange={setSearch}
        targetMode={targetMode}
        selected={selected}
        onToggleOutlet={toggleOutlet}
        loading={loadingOutlets}
        confirmedOutletIds={confirmedOutletIds}
        playingOutletIds={playingOutletIds}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
    />


    {/* ======================================================
        MAIN
    ====================================================== */}

    <main className="flex min-w-0 flex-1 flex-col overflow-hidden">

      {/* Tabs */}
      <DashboardTabs
        tabs={DASHBOARD_TABS}
        activeTab={activeTab}
        onChange={(tab) => {
            setActiveTab(tab);
            setSidebarOpen(false);
        }}
        onLogout={handleLogout}
        onMenuClick={() => setSidebarOpen(true)}
      />

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-hidden">

       {activeTab === "upload" ? (

        <UploadAudio
            targetMode={targetMode}
            selected={selected}
            outlets={outlets}
            onOutletAudioStateChange={handleOutletAudioStateChange}
        />

      ) : activeTab === "schedule" ? (

        <ScheduleAudio />

      ) : (

        
        // <BroadcastPanel
        //     targetMode={targetMode}
        //     onTargetModeChange={setTargetMode}
        //     isLive={isLive}
        //     canStart={canStart}
        //     onStart={handleStart}
        //     onStop={handleStop}
        //     duration={duration}
        //     targetCount={targetCount}
        //     levels={levels}
        // />
        <BroadcastPanel
            targetMode={targetMode}
            onTargetModeChange={(mode) => {
                setTargetMode(mode);

                if (mode === "all") {
                    setSelected(new Set());
                }
            }}
            isLive={isLive}
            canStart={canStart}
            onStart={handleStart}
            onStop={handleStop}
            duration={duration}
            targetCount={targetCount}
            connectedOutlets={connectedOutlets}
            levels={levels}
            devices={devices}                    // 👈 tambahin
            selectedDeviceId={selectedDeviceId}  // 👈 tambahin
            onSelectDevice={selectDevice}        // 👈 tambahin
        />
      )}

      </div>

    </main>

     {/* ======================================================
        BROADCAST CONNECTING OVERLAY
    ====================================================== */}

    {isConnecting && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">

            <div className="w-full max-w-[420px] rounded-2xl bg-neutral-900 p-6 text-center shadow-2xl sm:p-8">

                <div className="mx-auto mb-5 h-12 w-12 animate-spin rounded-full border-4 border-neutral-700 border-t-white" />

                <h2 className="text-xl font-semibold text-white">
                    Menghubungkan Broadcast
                </h2>

                <p className="mt-2 text-sm text-neutral-400">
                    {broadcastStatus === "starting" &&
                        "Menyiapkan broadcast..."}

                    {broadcastStatus === "waiting_receiver" &&
                        "Menunggu outlet terhubung..."}

                    {broadcastStatus === "connecting" &&
                        "Menghubungkan ke outlet..."}
                </p>

            </div>

        </div>
    )}

  </div>
);
}