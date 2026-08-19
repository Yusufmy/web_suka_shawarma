import Echo from "laravel-echo";
import Pusher from "pusher-js";

window.Pusher = Pusher;

console.log("🔌 Echo init:", {
    key: import.meta.env.VITE_REVERB_APP_KEY,
    wsHost: import.meta.env.VITE_REVERB_HOST,
    wsPort: import.meta.env.VITE_REVERB_PORT,
});

const echo = new Echo({
    broadcaster: "reverb",
    key: import.meta.env.VITE_REVERB_APP_KEY,
    wsHost: import.meta.env.VITE_REVERB_HOST,
    wsPort: Number(import.meta.env.VITE_REVERB_PORT),
    wssPort: Number(import.meta.env.VITE_REVERB_PORT),
    forceTLS: true,                    // ganti false → true
    enabledTransports: ["wss"],        // cukup wss aja, hapus "ws"
});

echo.connector.pusher.connection.bind("state_change", (states) => {
    console.log("🔌 Pusher connection state:", states.previous, "→", states.current);
});

echo.connector.pusher.connection.bind("error", (err) => {
    console.error("🔌 Pusher connection error:", err);
});

// ============================================================
// TEST LANGSUNG - independen dari kode dashboard manapun.
// Kalau baris ini TIDAK PERNAH muncul di console pas ada
// broadcast, berarti masalahnya di Echo/Pusher itu sendiri
// (bukan di kode React OperatorDashboard).
// ============================================================

const __testChannel = echo.channel("outlets");

__testChannel.listen(".webrtc.receiver.ready", (data) => {
    console.log("🔥 [echo.js DIRECT TEST] webrtc.receiver.ready:", data);
});

__testChannel.subscribed(() => {
    console.log("✅ [echo.js DIRECT TEST] channel 'outlets' subscribed");
});

__testChannel.error((err) => {
    console.error("❌ [echo.js DIRECT TEST] channel 'outlets' error:", err);
});

window.__echo = echo;

export default echo;