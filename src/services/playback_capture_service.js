import api from "./api";
import echo from "../websocket/echo";

const DEFAULT_ICE_SERVERS = [
    {
        urls: [
            "stun:stun.l.google.com:19302",
            "stun:stun1.l.google.com:19302",
            "stun:stun2.l.google.com:19302",
            "stun:stun.cloudflare.com:3478",
        ],
    },
];

class PlaybackCaptureService {
    constructor() {
        this.roomId = null;
        this.outlets = [];
        this.captureStream = null;
        this.audioContext = null;
        this.sourceNode = null;
        this.outletGainNodes = new Map();
        this.outletVolumes = new Map();
        this.masterVolume = 1.0;

        this.peerConnections = new Map();
        this.pendingRemoteIce = new Map();
        this.creatingOfferFor = new Map();
        this.lastReadyTimestamps = new Map();

        this.echoChannel = null;
        this.onStateChange = null;
        this.onProgress = null;
    }

    setStateListener(callback) {
        this.onStateChange = callback;
    }

    async getIceServers() {
        try {
            const { data } = await api.get("/webrtc/ice-servers", {
                timeout: 4000,
            });
            const servers = data?.data?.iceServers || [];
            return [
                ...DEFAULT_ICE_SERVERS,
                ...servers.filter((s) => !s.urls?.includes("stun:stun.l.google.com:19302")),
            ];
        } catch (error) {
            console.warn("⚠️ Gagal mengambil ICE servers backend, fallback STUN:", error);
            return DEFAULT_ICE_SERVERS;
        }
    }

    // ============================================================
    // START PLAYBACK CAPTURE (TAB AUDIO / YOUTUBE)
    // ============================================================
    async startCapture({ videoTitle = "YouTube / Web Video", outlets = [] }) {
        if (!outlets || !outlets.length) {
            throw new Error("Pilih minimal satu outlet untuk disiarkan");
        }

        console.log("====================================");
        console.log("🎬 MEMULAI PLAYBACK CAPTURE BROADCAST");
        console.log("====================================");

        // 1. Minta izin Capture Tab Audio dari Browser
        let displayStream;
        try {
            displayStream = await navigator.mediaDevices.getDisplayMedia({
                video: true, // Wajib di Chrome/Edge, akan segera dimatikan
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    sampleRate: 44100,
                },
            });
        } catch (err) {
            if (err.name === "NotAllowedError" || err.name === "AbortError") {
                throw new Error("Akses capture dibatalkan oleh pengguna.");
            }
            throw new Error(`Gagal capture audio tab: ${err.message || err.name}`);
        }

        // Matikan video track seketika (kita hanya butuh audio)
        displayStream.getVideoTracks().forEach((track) => track.stop());

        const audioTracks = displayStream.getAudioTracks();
        if (!audioTracks.length) {
            displayStream.getTracks().forEach((track) => track.stop());
            throw new Error(
                "Tidak ada audio yang ter-capture. Pastikan Anda memilih tab dan mengaktifkan opsi 'Share tab audio' di pop-up browser."
            );
        }

        this.captureStream = displayStream;
        const capturedAudioTrack = audioTracks[0];

        // Jika user menekan tombol "Stop sharing" bawaan browser di bilah atas
        capturedAudioTrack.onended = () => {
            console.log("🛑 Tab audio capture dihentikan oleh pengguna dari browser bar");
            this.stop({ silent: false });
        };

        // 2. Siapkan Web Audio Context & GainNode
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        this.audioContext = new AudioCtx();
        this.sourceNode = this.audioContext.createMediaStreamSource(displayStream);
        this.outletGainNodes = new Map();
        if (this.audioContext.state === "suspended") {
            await this.audioContext.resume();
        }

        // 3. Buat Room ID
        const roomId = `audio-cap-${Date.now()}`;
        this.roomId = roomId;
        this.outlets = outlets;
        this.iceServers = await this.getIceServers();

        // 4. Subscribe WebSocket Channel
        this.subscribeToRoom(roomId);

        // 5. Umumkan Broadcast ke Seluruh Outlet
        await this.announceBroadcast({
            roomId,
            videoTitle,
            outlets,
        });

        if (this.onStateChange) {
            this.onStateChange("playing");
        }

        console.log(`✅ Playback Capture aktif untuk ${outlets.length} outlet (Room: ${roomId})`);
        return roomId;
    }

    // ============================================================
    // ANNOUNCE BROADCAST
    // ============================================================
    async announceBroadcast({ roomId, videoTitle, outlets }) {
        try {
            await api.post("/audio/webrtc/audio/broadcast", {
                room_id: roomId,
                audio_id: null,
                audio: {
                    name: `[Live Web Video] ${videoTitle}`,
                    url: "http://stream.webrtc.local/live-capture",
                },
                outlet_ids: outlets.map((o) => o.id),
            });
            console.log("📣 Playback capture broadcast diumumkan ke backend");
        } catch (error) {
            console.error("❌ Gagal mengumumkan broadcast ke backend:", error);
            throw error;
        }
    }

    // ============================================================
    // WEBSOCKET SIGNALING
    // ============================================================
    subscribeToRoom(roomId) {
        this.unsubscribeFromRoom();

        const channelName = `audio.${roomId}`;
        this.echoChannel = echo.channel(channelName);

        // 1. Terima sinyal receiver-ready dari outlet
        this.echoChannel.listen(".audio.webrtc.receiver-ready", (data) => {
            const outletId = Number(data.outlet_id);
            console.log(`📢 Outlet ${outletId} mengirim sinyal receiver-ready`);
            this.handleReceiverReady(outletId);
        });

        // 2. Terima Answer dari outlet
        this.echoChannel.listen(".audio.webrtc.answer", async (data) => {
            const outletId = Number(data.outlet_id);
            console.log(`📩 Menerima Answer dari outlet ${outletId}`);
            await this.handleReceiverAnswer(outletId, data.answer);
        });

        // 3. Terima ICE Candidates dari outlet
        this.echoChannel.listen(".audio.webrtc.ice", async (data) => {
            const outletId = Number(data.outlet_id);
            await this.handleReceiverIce(outletId, data.candidate);
        });
    }

    unsubscribeFromRoom() {
        if (this.echoChannel && this.roomId) {
            echo.leave(`audio.${this.roomId}`);
            this.echoChannel = null;
        }
    }

    // ============================================================
    // KONEKSI WEBRTC PER OUTLET
    // ============================================================
    async handleReceiverReady(outletId) {
        const id = Number(outletId);
        const now = Date.now();
        const lastReady = this.lastReadyTimestamps.get(id) || 0;

        // Cegah spam dalam < 1000ms saja
        if (now - lastReady < 1000) {
            console.log(`ℹ️ Outlet ${id} receiver-ready debounce (1s)`);
            return;
        }
        this.lastReadyTimestamps.set(id, now);

        let outlet = this.outlets.find((o) => Number(o.id) === id);
        if (!outlet) {
            outlet = { id: id, name: `Outlet ${id}` };
            this.outlets.push(outlet);
            console.log(`➕ Outlet ${id} otomatis didaftarkan & dihubungkan ke siaran capture yang sedang berlangsung`);
        }

        console.log(`🔄 Menyiapkan Offer WebRTC baru untuk outlet ${id}...`);
        await this.createConnectionForOutlet(outlet);
    }

    async createConnectionForOutlet(outlet) {
        const outletId = Number(outlet.id);
        if (this.creatingOfferFor.get(outletId)) return;

        this.creatingOfferFor.set(outletId, true);
        try {
            // Tutup koneksi lama jika ada
            if (this.peerConnections.has(outletId)) {
                try {
                    this.peerConnections.get(outletId).close();
                } catch (e) {}
                this.peerConnections.delete(outletId);
                this.pendingRemoteIce.delete(outletId);
            }

            // Buat GainNode khusus untuk outlet ini
            let streamToSend = this.captureStream;
            if (this.audioContext && this.sourceNode) {
                try {
                    const outletGain = this.audioContext.createGain();
                    const currentVol = this.outletVolumes.has(outletId)
                        ? this.outletVolumes.get(outletId)
                        : this.masterVolume;
                    outletGain.gain.setValueAtTime(currentVol, this.audioContext.currentTime);

                    const outletDest = this.audioContext.createMediaStreamDestination();
                    this.sourceNode.connect(outletGain);
                    outletGain.connect(outletDest);

                    this.outletGainNodes.set(outletId, outletGain);
                    streamToSend = outletDest.stream;
                    console.log(`🎚️ GainNode capture dibuat untuk outlet ${outletId} (vol: ${currentVol * 100}%)`);
                } catch (e) {
                    console.warn(`⚠️ Gagal buat GainNode capture outlet ${outletId}:`, e);
                }
            }

            const peerConnection = new RTCPeerConnection({
                iceServers: this.iceServers || DEFAULT_ICE_SERVERS,
            });
            this.peerConnections.set(outletId, peerConnection);

            // Tambahkan audio track
            const tracks = streamToSend.getAudioTracks();
            tracks.forEach((track) => {
                peerConnection.addTrack(track, streamToSend);
            });

            // ICE Candidate
            peerConnection.onicecandidate = (event) => {
                if (!event.candidate) return;
                api.post("/audio/webrtc/operator-ice", {
                    outlet_id: outletId,
                    room_id: this.roomId,
                    candidate: {
                        candidate: event.candidate.candidate,
                        sdpMid: event.candidate.sdpMid,
                        sdpMLineIndex: event.candidate.sdpMLineIndex,
                    },
                }).catch(() => {});
            };

            // Connection state
            peerConnection.onconnectionstatechange = () => {
                const state = peerConnection.connectionState;
                console.log(`🔗 Playback capture outlet ${outletId} state: ${state}`);
                if (this.onStateChange) {
                    this.onStateChange({ outletId, state });
                }
            };

            // Buat Offer
            const offer = await peerConnection.createOffer({
                offerToReceiveAudio: false,
                offerToReceiveVideo: false,
            });
            await peerConnection.setLocalDescription(offer);

            // Kirim Offer ke Outlet
            await api.post("/audio/webrtc/offer", {
                outlet_id: outletId,
                room_id: this.roomId,
                offer: {
                    type: offer.type,
                    sdp: offer.sdp,
                },
            });
            console.log(`📤 Offer capture terkirim ke outlet ${outletId}`);
        } catch (error) {
            console.error(`❌ Gagal inisialisasi WebRTC capture outlet ${outletId}:`, error);
        } finally {
            this.creatingOfferFor.delete(outletId);
        }
    }

    async handleReceiverAnswer(outletId, answer) {
        const id = Number(outletId);
        const pc = this.peerConnections.get(id);
        if (!pc) return;

        try {
            if (!answer || !answer.sdp) {
                console.warn(`⚠️ Answer kosong untuk outlet ${id}`);
                return;
            }

            // Normalisasi SDP: bersihkan escape backslash dan samakan format baris
            let cleanSdp = String(answer.sdp)
                .replace(/\\:/g, ":")
                .replace(/\r\n/g, "\n")
                .replace(/\r/g, "\n")
                .split("\n")
                .map((line) => line.trimEnd())
                .filter((line) => line.length > 0)
                .join("\r\n") + "\r\n";

            await pc.setRemoteDescription(new RTCSessionDescription({
                type: answer.type,
                sdp: cleanSdp,
            }));
            console.log(`✅ Remote description set untuk outlet ${id}`);

            // Flush pending ICE
            const pending = this.pendingRemoteIce.get(id) || [];
            for (const candidate of pending) {
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (e) {}
            }
            this.pendingRemoteIce.delete(id);
        } catch (error) {
            console.error(`❌ Error set remote description outlet ${id}:`, error);
        }
    }

    async handleReceiverIce(outletId, candidate) {
        const id = Number(outletId);
        const pc = this.peerConnections.get(id);
        if (!pc || !pc.remoteDescription) {
            if (!this.pendingRemoteIce.has(id)) {
                this.pendingRemoteIce.set(id, []);
            }
            this.pendingRemoteIce.get(id).push(candidate);
            return;
        }

        try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
            console.error(`❌ Error add ICE candidate outlet ${id}:`, error);
        }
    }

    // ============================================================
    // KONTROL VOLUME (0 - 100%)
    // ============================================================
    setOutletVolume(outletId, volume) {
        const vol = Math.max(0, Math.min(100, Number(volume))) / 100;

        if (outletId === "all") {
            this.masterVolume = vol;
            if (this.outletGainNodes) {
                this.outletGainNodes.forEach((gainNode) => {
                    try {
                        gainNode.gain.setValueAtTime(vol, this.audioContext?.currentTime || 0);
                    } catch (e) {}
                });
            }
            console.log(`🔊 Master volume Playback Capture diubah ke ${vol * 100}%`);
            return;
        }

        const id = Number(outletId);
        this.outletVolumes.set(id, vol);
        const gainNode = this.outletGainNodes?.get(id);
        if (gainNode) {
            try {
                gainNode.gain.setValueAtTime(vol, this.audioContext?.currentTime || 0);
                console.log(`🔊 Playback Capture Gain outlet ${id} diubah ke ${vol * 100}%`);
            } catch (e) {}
        }
    }

    // ============================================================
    // STOP PLAYBACK CAPTURE
    // ============================================================
    async stop({ silent = false } = {}) {
        console.log("🛑 MENGHENTIKAN PLAYBACK CAPTURE BROADCAST");

        // 1. Hentikan media stream capture
        if (this.captureStream) {
            this.captureStream.getTracks().forEach((track) => {
                track.onended = null;
                track.stop();
            });
            this.captureStream = null;
        }

        // 2. Tutup Web Audio Context
        if (this.audioContext) {
            try {
                this.audioContext.close();
            } catch (e) {}
            this.audioContext = null;
            this.sourceNode = null;
        }
        this.outletGainNodes.clear();

        // 3. Tutup semua PeerConnection
        for (const [id, pc] of this.peerConnections.entries()) {
            try {
                pc.onconnectionstatechange = null;
                pc.onicecandidate = null;
                pc.close();
            } catch (e) {}
        }
        this.peerConnections.clear();
        this.pendingRemoteIce.clear();
        this.creatingOfferFor.clear();
        this.lastReadyTimestamps.clear();

        // 4. Beritahu Backend bahwa siaran telah berakhir
        if (this.roomId) {
            try {
                await api.post("/audio/webrtc/audio/broadcast/end", {
                    room_id: this.roomId,
                    outlet_ids: (this.outlets || []).map((o) => o.id),
                    natural: false,
                });
            } catch (error) {
                console.error("❌ Gagal mengumumkan broadcast ended ke backend:", error);
            }
        }

        this.unsubscribeFromRoom();
        this.roomId = null;
        this.outlets = [];

        if (!silent && this.onStateChange) {
            this.onStateChange("stopped");
        }

        console.log("✅ Playback Capture broadcast berhasil dihentikan total.");
    }
}

export default new PlaybackCaptureService();
