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

console.log("🔌 Echo instance created, connector:", echo.connector);

window.__echo = echo;

try {
    console.log("🔌 STEP 1: mengakses echo.connector.pusher...");

    const pusher = echo.connector.pusher;

    console.log("🔌 STEP 1 OK, pusher:", pusher);

    console.log("🔌 STEP 2: bind connection state_change...");

    pusher.connection.bind("state_change", (states) => {
        console.log("🔌 Pusher connection state:", states.previous, "→", states.current);
    });

    pusher.connection.bind("error", (err) => {
        console.error("🔌 Pusher connection error:", err);
    });

    console.log("🔌 STEP 2 OK, current state right now:", pusher.connection.state);

    console.log("🔌 STEP 3: subscribe channel outlets...");

    const testChannel = echo.channel("outlets");

    console.log("🔌 STEP 3 OK, channel object:", testChannel);

    testChannel.listen(".webrtc.receiver.ready", (data) => {
        console.log("🔥 [echo.js DIRECT TEST] webrtc.receiver.ready:", data);
    });

    console.log("🔌 STEP 4: semua listener terpasang, tidak ada error.");
} catch (error) {
    console.error("❌❌❌ ECHO SETUP GAGAL DI TENGAH JALAN:", error);
    console.error("Pesan error:", error?.message);
    console.error("Stack:", error?.stack);
}

export default echo;
