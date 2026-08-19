import Echo from "laravel-echo";
import Pusher from "pusher-js";

window.Pusher = Pusher;

const echo = new Echo({
    broadcaster: "reverb",
    key: import.meta.env.VITE_REVERB_APP_KEY,
    wsHost: import.meta.env.VITE_REVERB_HOST,
    wsPort: Number(import.meta.env.VITE_REVERB_PORT),
    wssPort: Number(import.meta.env.VITE_REVERB_PORT),
    forceTLS: true,
    enabledTransports: ["ws"],
});

echo.connector.pusher.connection.bind("state_change", (states) => {
    console.log("🔌 Pusher connection state:", states.previous, "→", states.current);
});

echo.connector.pusher.connection.bind("error", (err) => {
    console.error("🔌 Pusher connection error:", err);
});

export default echo;
