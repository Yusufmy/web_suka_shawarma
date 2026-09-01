import Echo from "laravel-echo";
import Pusher from "pusher-js";
import { getReverbConfig } from "../config/app_config";

window.Pusher = Pusher;

const reverbConfig = getReverbConfig();

console.log("🔌 Inisialisasi Reverb WebSocket dengan config:", reverbConfig);

const echo = new Echo({
    broadcaster: "reverb",
    key: reverbConfig.key,
    wsHost: reverbConfig.wsHost,
    wsPort: reverbConfig.wsPort,
    wssPort: reverbConfig.wssPort,
    forceTLS: reverbConfig.forceTLS,
    enabledTransports: ["ws", "wss"],
});

echo.connector.pusher.connection.bind("state_change", (states) => {
    console.log("🔌 Pusher connection state:", states.previous, "→", states.current);
});

echo.connector.pusher.connection.bind("error", (err) => {
    console.error("🔌 Pusher connection error:", err);
});

export default echo;
