import axios from "axios";
import { APP_VERSION } from "../config/version";

export const getApiBaseUrl = () => {
  try {
    return (
      localStorage.getItem("custom_api_url") ||
      import.meta.env.VITE_API_BASE_URL ||
      "https://api-radio.sukashawarma.com/api"
    );
  } catch {
    return import.meta.env.VITE_API_BASE_URL || "https://api-radio.sukashawarma.com/api";
  }
};

export const setApiBaseUrl = (url) => {
  try {
    if (url) {
      localStorage.setItem("custom_api_url", url.trim());
    } else {
      localStorage.removeItem("custom_api_url");
    }
  } catch {}
};

const getClient = () => {
  return axios.create({
    baseURL: getApiBaseUrl(),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    timeout: 8000,
  });
};

export const getOrCreateDeviceId = () => {
  try {
    let deviceId = localStorage.getItem("petugas_device_id");
    if (!deviceId) {
      deviceId = `web_petugas_${Math.random().toString(36).substring(2, 10)}_${Date.now()}`;
      localStorage.setItem("petugas_device_id", deviceId);
    }
    return deviceId;
  } catch {
    return `web_petugas_fallback_${Date.now()}`;
  }
};

export const petugasService = {
  // 1. Ambil daftar semua outlet
  async getOutlets() {
    try {
      const client = getClient();
      const response = await client.get("/outlet");
      return response.data?.data || [];
    } catch (error) {
      console.warn("Info: Tidak dapat mengambil daftar outlet otomatis:", error.message);
      return [];
    }
  },

  // 2. Hubungkan / Login outlet
  async connectOutlet(name) {
    const client = getClient();
    const deviceId = getOrCreateDeviceId();
    const payload = {
      name,
      device_info: {
        device_id: deviceId,
        model: "Web Browser - Petugas",
        os: navigator.userAgent.substring(0, 100),
        app_version: APP_VERSION,
      },
    };

    const response = await client.post("/auth/outlet-connect", payload);
    return response.data;
  },

  // 2.1 Update Presence status dengan app_version
  async updatePresence(outletId, presence = "foreground") {
    try {
      const client = getClient();
      const response = await client.post("/outlet/presence", {
        outlet_id: outletId,
        presence,
        app_version: APP_VERSION,
      });
      return response.data;
    } catch (error) {
      console.warn("Presence update error:", error);
      return null;
    }
  },

  // 3. Logout outlet
  async logoutOutlet(token) {
    try {
      const client = getClient();
      const response = await client.post(
        "/auth/outlet-logout",
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      return response.data;
    } catch (error) {
      console.warn("Logout error:", error);
      return null;
    }
  },

  // 4. Heartbeat online
  async sendHeartbeat(token) {
    try {
      const client = getClient();
      const response = await client.post(
        "/outlet/heartbeat-online",
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      return response.data;
    } catch (error) {
      console.warn("Heartbeat error:", error);
      return null;
    }
  },

  // 5. Cek broadcast yang sedang aktif saat ini
  async getActiveBroadcast(outletId) {
    try {
      const client = getClient();
      const response = await client.get(`/broadcast/active?outlet_id=${outletId}`);
      return response.data;
    } catch (error) {
      console.warn("Gagal memeriksa active broadcast:", error.message);
      return null;
    }
  },

  // 6. Ambil ICE servers untuk WebRTC
  async getIceServers() {
    const defaultStun = [
      {
        urls: [
          "stun:stun.l.google.com:19302",
          "stun:stun1.l.google.com:19302",
          "stun:stun2.l.google.com:19302",
          "stun:stun.cloudflare.com:3478",
        ],
      },
    ];
    try {
      const client = getClient();
      const response = await client.get("/webrtc/ice-servers");
      const servers = response.data?.data?.iceServers || [];
      return [
        ...defaultStun,
        ...servers.filter((s) => !s.urls?.includes("stun:stun.l.google.com:19302")),
      ];
    } catch (error) {
      console.warn("Fallback ke STUN default:", error.message);
      return defaultStun;
    }
  },

  // 7. Sinyal Receiver Ready ke Operator
  async sendReceiverReady({ roomId, outletId, deviceId }) {
    const client = getClient();
    return client.post("/webrtc/ready", {
      room_id: roomId,
      outlet_id: outletId,
      device_id: deviceId || getOrCreateDeviceId(),
    });
  },

  // 8. Kirim WebRTC Answer ke Operator
  async sendAnswer({ roomId, outletId, deviceId, sdp }) {
    const client = getClient();
    return client.post("/webrtc/answer", {
      room_id: roomId,
      answer: {
        type: "answer",
        sdp: sdp,
      },
      outlet_id: outletId,
      device_id: deviceId || getOrCreateDeviceId(),
    });
  },

  // 9. Kirim ICE candidate ke Operator
  async sendIceCandidate({ roomId, outletId, deviceId, candidate }) {
    const client = getClient();
    return client.post("/webrtc/ice", {
      room_id: roomId,
      candidate: candidate,
      outlet_id: outletId,
      device_id: deviceId || getOrCreateDeviceId(),
    });
  },
};

export default petugasService;
