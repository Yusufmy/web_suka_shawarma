import React, { useState, useEffect, useRef } from "react";
import PetugasLogin from "../../components/petugas/PetugasLogin";
import PetugasWaiting from "../../components/petugas/PetugasWaiting";
import PetugasLive from "../../components/petugas/PetugasLive";
import petugasService from "../../services/petugasService";
import petugasReceiver from "../../services/petugasReceiver";

const safeStorage = {
  get: (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key, val) => {
    try {
      localStorage.setItem(key, typeof val === "string" ? val : JSON.stringify(val));
    } catch {}
  },
  remove: (key) => {
    try {
      localStorage.removeItem(key);
    } catch {}
  },
};

export default function PetugasPage() {
  const [token, setToken] = useState(() => {
    return safeStorage.get("petugas_token") || null;
  });

  const [outlet, setOutlet] = useState(() => {
    try {
      const saved = safeStorage.get("petugas_outlet_data");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [currentView, setCurrentView] = useState(() => {
    const savedToken = safeStorage.get("petugas_token");
    const savedOutlet = safeStorage.get("petugas_outlet_data");
    return savedToken && savedOutlet ? "waiting" : "login";
  });

  const [broadcastData, setBroadcastData] = useState(null);
  const [isConnectingAudio, setIsConnectingAudio] = useState(false);

  const [volume, setVolume] = useState(() => {
    const savedVol = safeStorage.get("petugas_volume");
    return savedVol !== null && !isNaN(parseFloat(savedVol)) ? parseFloat(savedVol) : 0.8;
  });

  const audioRef = useRef(null);

  // Sync Volume
  useEffect(() => {
    safeStorage.set("petugas_volume", volume.toString());
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // Init Receiver & Audio Element
  useEffect(() => {
    if (audioRef.current) {
      petugasReceiver.initAudio(audioRef.current);
    }

    // 1. Sinyal siaran masuk -> Tampilkan status menyambungkan di waiting screen
    petugasReceiver.onBroadcastConnecting = (data) => {
      console.log("🎙️ Event Siaran Dimulai (Menyambungkan audio WebRTC...):", data);
      setBroadcastData(data);
      setIsConnectingAudio(true);
    };

    // 2. Audio track & WebRTC benar-benar terhubung -> Pindah ke LIVE (SAMA SEPERTI APK)
    petugasReceiver.onAudioConnected = (data) => {
      console.log("🔊 Audio WebRTC benar-benar terhubung! Beralih ke halaman LIVE");
      setBroadcastData(data);
      setIsConnectingAudio(false);
      setCurrentView("live");
    };

    // 3. Sinyal siaran berakhir -> Kembali ke STANDBY
    petugasReceiver.onBroadcastEnded = () => {
      console.log("🛑 Event Siaran Berakhir, kembali ke STANDBY");
      setIsConnectingAudio(false);
      setBroadcastData(null);
      setCurrentView("waiting");
    };

    // If already logged in, start receiver session
    if (token && outlet) {
      petugasReceiver.startSession({ outlet, token });
    }

    return () => {
      petugasReceiver.stopSession();
    };
  }, [token, outlet]);

  // Handle Login Success
  const handleLoginSuccess = ({ token: newToken, outlet: newOutlet }) => {
    setToken(newToken);
    setOutlet(newOutlet);
    safeStorage.set("petugas_token", newToken);
    safeStorage.set("petugas_outlet_data", JSON.stringify(newOutlet));
    safeStorage.set("petugas_outlet_name", newOutlet.name || "");
    
    // Unlock browser audio context
    if (audioRef.current) {
      petugasReceiver.initAudio(audioRef.current);
    }

    setCurrentView("waiting");
  };

  // Handle Logout
  const handleLogout = async () => {
    if (token) {
      await petugasService.logoutOutlet(token);
    }
    petugasReceiver.stopSession();
    setToken(null);
    setOutlet(null);
    setBroadcastData(null);
    setIsConnectingAudio(false);
    safeStorage.remove("petugas_token");
    safeStorage.remove("petugas_outlet_data");
    setCurrentView("login");
  };

  // Demo Trigger
  const handleTriggerDemoLive = () => {
    setBroadcastData({
      type: "live",
      rtc_room_id: "demo_room_123",
      started_at: new Date().toISOString(),
    });
    setCurrentView("live");
  };

  const handleStopLive = () => {
    setBroadcastData(null);
    setIsConnectingAudio(false);
    setCurrentView("waiting");
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-neutral-950 px-4 py-8">
      {/* Background ambient glow */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-80 w-80 rounded-full bg-orange-600/10 blur-[130px] sm:h-[500px] sm:w-[500px]" />
      </div>

      {/* Main Container */}
      <div className="relative z-10 w-full max-w-md flex flex-col items-center">
        {currentView === "login" && (
          <PetugasLogin
            initialOutlet={outlet?.name || ""}
            onLoginSuccess={handleLoginSuccess}
          />
        )}

        {currentView === "waiting" && (
          <PetugasWaiting
            outlet={outlet}
            volume={volume}
            onVolumeChange={setVolume}
            onTriggerDemoLive={handleTriggerDemoLive}
            onLogout={handleLogout}
            wsConnected={petugasReceiver.isListening}
            isConnectingAudio={isConnectingAudio}
          />
        )}

        {currentView === "live" && (
          <PetugasLive
            outlet={outlet}
            broadcastData={broadcastData}
            volume={volume}
            onVolumeChange={setVolume}
            onStopLive={handleStopLive}
            onLogout={handleLogout}
          />
        )}

        {/* Footer */}
        <footer className="mt-8 text-center text-xs text-neutral-600">
          Audio Suka Shawarma &copy; {new Date().getFullYear()} &bull; Web Radio & Outlet Mode
        </footer>
      </div>

      {/* Audio Element for Streaming Playback */}
      <audio
        ref={audioRef}
        id="petugas-remote-audio"
        autoPlay
        playsInline
        className="fixed -top-full -left-full opacity-0 pointer-events-none"
      />
    </div>
  );
}
