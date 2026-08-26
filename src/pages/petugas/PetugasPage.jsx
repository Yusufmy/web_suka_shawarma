import React, { useState, useEffect, useRef } from "react";
import PetugasLogin from "../../components/petugas/PetugasLogin";
import PetugasWaiting from "../../components/petugas/PetugasWaiting";
import PetugasLive from "../../components/petugas/PetugasLive";
import petugasService from "../../services/petugasService";
import petugasReceiver from "../../services/petugasReceiver";

export default function PetugasPage() {
  const [token, setToken] = useState(() => {
    return localStorage.getItem("petugas_token") || null;
  });

  const [outlet, setOutlet] = useState(() => {
    try {
      const saved = localStorage.getItem("petugas_outlet_data");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [currentView, setCurrentView] = useState(() => {
    const savedToken = localStorage.getItem("petugas_token");
    const savedOutlet = localStorage.getItem("petugas_outlet_data");
    return savedToken && savedOutlet ? "waiting" : "login";
  });

  const [broadcastData, setBroadcastData] = useState(null);

  const [volume, setVolume] = useState(() => {
    const savedVol = localStorage.getItem("petugas_volume");
    return savedVol !== null ? parseFloat(savedVol) : 0.8;
  });

  const audioRef = useRef(null);

  // Sync Volume
  useEffect(() => {
    localStorage.setItem("petugas_volume", volume.toString());
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // Init Receiver & Audio Element
  useEffect(() => {
    if (audioRef.current) {
      petugasReceiver.initAudio(audioRef.current);
    }

    petugasReceiver.onBroadcastStarted = (data) => {
      console.log("🎙️ Event Siaran Dimulai:", data);
      setBroadcastData(data);
      setCurrentView("live");
    };

    petugasReceiver.onBroadcastEnded = () => {
      console.log("🛑 Event Siaran Berakhir");
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
    localStorage.setItem("petugas_token", newToken);
    localStorage.setItem("petugas_outlet_data", JSON.stringify(newOutlet));
    localStorage.setItem("petugas_outlet_name", newOutlet.name || "");
    
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
    localStorage.removeItem("petugas_token");
    localStorage.removeItem("petugas_outlet_data");
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
          Audio Suka Shawarma &copy; {new Date().getFullYear()} &bull; Web Monitor Mode
        </footer>
      </div>

      {/* Hidden Audio Element for Streaming Playback */}
      <audio
        ref={audioRef}
        id="petugas-remote-audio"
        autoPlay
        playsInline
        className="hidden"
      />
    </div>
  );
}
