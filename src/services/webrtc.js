import axios from "axios";
import { API_BASE_URL } from "./api";

const API_URL = API_BASE_URL;

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

// ============================================================
// WEBRTC SERVICE (SIARAN BICARA LANGSUNG)
//
// Satu mic (localStream) dipakai bersama, tapi tiap outlet
// punya PeerConnection SENDIRI (Map, bukan satu peerConnection
// tunggal) - supaya operator bisa negosiasi WebRTC ke banyak
// outlet sekaligus. Sebelumnya cuma ada satu peerConnection,
// jadi begitu >1 outlet online, jawaban outlet kedua ditolak
// browser (setRemoteDescription cuma boleh dipanggil sekali per
// PeerConnection).
// ============================================================

class WebRTCService {
    constructor() {
        // ====================================================
        // MIC (dipakai bersama semua outlet)
        // ====================================================

        this.localStream = null;
        this.roomId = null;

        // ====================================================
        // TARGET OUTLET
        // ====================================================

        this.targetOutlets = [];

        // ====================================================
        // PEER CONNECTION PER OUTLET
        //
        // { outletId: RTCPeerConnection }
        // ====================================================

        this.peerConnections = new Map();

        // ====================================================
        // ICE YANG BELUM BISA DITAMBAHKAN (remote description
        // outlet itu belum di-set) - per outlet.
        //
        // { outletId: RTCIceCandidateInit[] }
        // ====================================================

        this.pendingRemoteIce = new Map();

        // ====================================================
        // OFFER STATE PER OUTLET (cegah double-offer)
        //
        // { outletId: boolean }
        // ====================================================

        this.creatingOfferFor = new Map();

        // ====================================================
        // CALLBACK
        //
        // Dipanggil dengan { outletId, state }.
        // ====================================================

        this.onConnectionStateChange = null;
    }

    setConnectionStateListener(callback) {
        this.onConnectionStateChange = callback;
    }

    async getIceServers() {
        try {
            const { data } = await axios.get(
                `${API_URL}/webrtc/ice-servers`,
                { timeout: 4000 }
            );

            const servers = data?.data?.iceServers || [];
            return [
                {
                    urls: [
                        "stun:stun.l.google.com:19302",
                        "stun:stun1.l.google.com:19302",
                        "stun:stun2.l.google.com:19302",
                        "stun:stun.cloudflare.com:3478",
                    ],
                },
                ...servers.filter((s) => !s.urls?.includes("stun:stun.l.google.com:19302")),
            ];
        } catch (error) {
            console.warn(
                "⚠️ Gagal ambil ICE servers, fallback ke STUN saja:",
                error
            );

            return DEFAULT_ICE_SERVERS;
        }
    }

    async startBroadcast(roomId, outlets = [], deviceId = null, customStream = null) {
        try {
            console.log("🎙️ START WEBRTC BROADCAST");

            await this.stop();

            this.roomId = roomId;
            this.targetOutlets = outlets;
            this.iceServers = await this.getIceServers();

            if (customStream) {
                console.log("🔊 Menggunakan audio stream khusus (Tab / Video YouTube)");
                this.localStream = customStream;
                const track = this.localStream.getAudioTracks()[0];
                console.log("✅ Audio stream obtained:", track?.label || "Custom Audio Stream");
                return true;
            }

            console.log("🎤 Requesting microphone...", { deviceId });

            const baseConstraints = {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
            };

            try {
                // deviceId tersimpan (localStorage) BISA jadi sudah
                // tidak valid lagi (mic dicabut, browser profile
                // reset, dll) - "exact" bikin getUserMedia GAGAL
                // TOTAL (OverconstrainedError) kalau device itu
                // sudah tidak ada, padahal mic default lain
                // sebenarnya masih tersedia dan baik-baik saja.
                this.localStream =
                    await navigator.mediaDevices.getUserMedia({
                        audio: deviceId
                            ? {
                                deviceId: { exact: deviceId },
                                ...baseConstraints,
                            }
                            : baseConstraints,
                        video: false,
                    });
            } catch (error) {
                if (
                    deviceId &&
                    (error.name === "OverconstrainedError" ||
                        error.name === "NotFoundError")
                ) {
                    console.warn(
                        "⚠️ Mic pilihan sudah tidak tersedia, " +
                        "fallback ke mic default:",
                        error.name
                    );

                    this.localStream =
                        await navigator.mediaDevices.getUserMedia({
                            audio: baseConstraints,
                            video: false,
                        });
                } else {
                    throw error;
                }
            }

            // Log device yang BENERAN kepake, buat verifikasi
            const track = this.localStream.getAudioTracks()[0];
            console.log("✅ Microphone obtained:", track.label);

            // Inisialisasi Web Audio Context untuk kontrol volume & visualizer audio riil
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                this.audioContext = new AudioCtx();
                this.sourceNode = this.audioContext.createMediaStreamSource(this.localStream);
                this.outletGainNodes = new Map();
                if (!this.outletVolumes) {
                    this.outletVolumes = new Map();
                }

                this.analyser = this.audioContext.createAnalyser();
                this.analyser.fftSize = 128;
                this.analyser.smoothingTimeConstant = 0.6;
                this.sourceNode.connect(this.analyser);
                this.freqDataArray = new Uint8Array(this.analyser.frequencyBinCount);

                console.log("🎚️ Web Audio Context & Real-time Analyser live mic diinisialisasi");
            } catch (e) {
                console.warn("⚠️ Gagal inisialisasi AudioContext live mic:", e);
            }

            return true;
        } catch (error) {
            console.error("❌ FAILED STARTING WEBRTC:", error);
            await this.stop();
            throw error;
        }
    }

    // Mendapatkan level audio riil dari mikrofon (tinggi bar 6px sampai 48px)
    getAudioLevels(numBars = 24) {
        if (!this.analyser || !this.localStream || !this.freqDataArray) {
            return Array(numBars).fill(6);
        }

        this.analyser.getByteFrequencyData(this.freqDataArray);

        const levels = [];
        const binSize = Math.max(1, Math.floor(this.freqDataArray.length / numBars));

        for (let i = 0; i < numBars; i++) {
            let sum = 0;
            const start = i * binSize;
            const end = Math.min(start + binSize, this.freqDataArray.length);

            for (let j = start; j < end; j++) {
                sum += this.freqDataArray[j];
            }

            const avg = sum / (end - start || 1); // 0 .. 255
            // Minimal 6px saat hening, naik hingga 48px saat bersuara kencang
            const height = Math.round(6 + (avg / 255) * 42);
            levels.push(height);
        }

        return levels;
    }

    // ============================================================
    // ============================================================
    // HELPER: PEER KEY & PEER CONNECTION
    // ============================================================

    getPeerKey(outletId, deviceId = null) {
        const id = Number(outletId);
        return deviceId ? `${id}_${deviceId}` : `${id}`;
    }

    getPeerConnection(outletId, deviceId = null) {
        const id = Number(outletId);
        if (deviceId) {
            const key = `${id}_${deviceId}`;
            if (this.peerConnections.has(key)) {
                return this.peerConnections.get(key);
            }
        }
        return (
            this.peerConnections.get(id) ||
            this.peerConnections.get(String(outletId)) ||
            null
        );
    }

    // ============================================================
    // OUTLET READY → BUAT PEER CONNECTION + KIRIM OFFER
    //
    // Dipanggil tiap kali ada outlet yang mengirim sinyal
    // webrtc.receiver.ready dengan outlet_id dan device_id tertentu.
    // ============================================================

    async handleOutletReady(outletId, deviceId = null) {
        const id = Number(outletId);
        const peerKey = this.getPeerKey(outletId, deviceId);

        if (!this.localStream || !this.roomId) {
            console.warn(
                "⚠️ Mic/room belum siap, abaikan ready peer:",
                peerKey
            );

            return;
        }

        const isTargeted =
            !this.targetOutlets ||
            this.targetOutlets.length === 0 ||
            this.targetOutlets.some((outlet) => Number(outlet.id) === id);

        if (!isTargeted) {
            console.warn(
                "⚠️ Outlet ready tapi bukan target:",
                outletId
            );

            return;
        }

        if (this.creatingOfferFor.get(peerKey) || (!deviceId && this.creatingOfferFor.get(id))) {
            console.log(
                `ℹ️ Peer ${peerKey} sedang dalam proses pembuatan Offer, abaikan ready berulang.`
            );
            return;
        }

        // Tutup koneksi lama jika ada (outlet baru saja restart/reconnect dan meminta Offer baru)
        if (this.peerConnections.has(peerKey) || (!deviceId && (this.peerConnections.has(id) || this.peerConnections.has(String(outletId))))) {
            const oldPc = this.peerConnections.get(peerKey) || this.peerConnections.get(id) || this.peerConnections.get(String(outletId));
            
            console.log(
                `🔄 Peer ${peerKey} mengirim sinyal ready baru (koneksi lama state: ${oldPc?.connectionState}). Mereset koneksi lama & membuat Offer baru...`
            );
            if (oldPc) {
                try {
                    oldPc.onicecandidate = null;
                    oldPc.onconnectionstatechange = null;
                    oldPc.oniceconnectionstatechange = null;
                    oldPc.close();
                } catch (e) {
                    console.warn("Error closing old pc:", e);
                }
            }
            this.peerConnections.delete(peerKey);
            this.pendingRemoteIce.delete(peerKey);
            this.creatingOfferFor.delete(peerKey);

            if (!deviceId) {
                this.peerConnections.delete(id);
                this.peerConnections.delete(String(outletId));
                this.pendingRemoteIce.delete(id);
                this.pendingRemoteIce.delete(String(outletId));
                this.creatingOfferFor.delete(id);
                this.creatingOfferFor.delete(String(outletId));
            }
        }

        this.creatingOfferFor.set(peerKey, true);
        if (!deviceId) {
            this.creatingOfferFor.set(id, true);
        }

        try {
            console.log("====================================");
            console.log("🔗 CONNECTING PEER:", peerKey);
            console.log("====================================");

            // ------------------------------------------------------
            // PEER CONNECTION
            // ------------------------------------------------------

            const peerConnection =
                new RTCPeerConnection({
                    iceServers:
                        this.iceServers ||
                        DEFAULT_ICE_SERVERS,
                });

            this.peerConnections.set(peerKey, peerConnection);
            if (!deviceId) {
                this.peerConnections.set(id, peerConnection);
                this.peerConnections.set(String(outletId), peerConnection);
            }

            this.pendingRemoteIce.set(peerKey, []);
            if (!deviceId) {
                this.pendingRemoteIce.set(id, []);
                this.pendingRemoteIce.set(String(outletId), []);
            }

            // ------------------------------------------------------
            // ADD MICROPHONE TRACK LANGSUNG DARI MIC OPERATOR
            // ------------------------------------------------------

            this.localStream
                .getTracks()
                .forEach((track) => {
                    peerConnection.addTrack(
                        track,
                        this.localStream
                    );
                });

            console.log(
                `✅ Audio track added → peer ${peerKey}`
            );

            // ------------------------------------------------------
            // LOCAL ICE CANDIDATE
            // ------------------------------------------------------

            peerConnection.onicecandidate =
                async (event) => {
                    try {
                        if (!event.candidate) {
                            console.log(
                                `🧊 ICE gathering completed: peer ${peerKey}`
                            );

                            return;
                        }

                        await this.sendIceCandidate(
                            outletId,
                            event.candidate,
                            deviceId
                        );
                    } catch (error) {
                        console.error(
                            "❌ Failed sending local ICE:",
                            error
                        );
                    }
                };

            peerConnection.onicecandidateerror =
                (event) => {
                    // 701 adalah STUN binding request timeout pada server sekunder (normal jika salah satu STUN lain berhasil)
                    if (event.errorCode === 701) {
                        console.warn(
                            `ℹ️ STUN candidate notice (peer ${peerKey}): ${event.errorText}`
                        );
                    } else {
                        console.warn(
                            `⚠️ ICE Candidate warning (peer ${peerKey}):`,
                            {
                                errorCode: event.errorCode,
                                errorText: event.errorText,
                            }
                        );
                    }
                };

            // ------------------------------------------------------
            // CONNECTION STATE
            // ------------------------------------------------------

            peerConnection.onconnectionstatechange =
                () => {
                    const state =
                        peerConnection.connectionState;

                    console.log(
                        `🔗 Peer ${peerKey} state:`,
                        state
                    );

                    if (this.onConnectionStateChange) {
                        this.onConnectionStateChange({
                            outletId,
                            deviceId,
                            state,
                        });
                    }
                };

            peerConnection.oniceconnectionstatechange =
                () => {
                    console.log(
                        `🧊 Peer ${peerKey} ICE:`,
                        peerConnection.iceConnectionState
                    );
                };

            // ------------------------------------------------------
            // CREATE OFFER & OPTIMIZE OPUS SDP
            // ------------------------------------------------------

            const offer =
                await peerConnection.createOffer();

            let tunedSdp = offer.sdp || "";
            if (tunedSdp.includes("a=fmtp:111")) {
                tunedSdp = tunedSdp.replace(/a=fmtp:111 (.*)/g, (match, params) => {
                    let newParams = params;
                    if (!newParams.includes("useinbandfec=1")) newParams += ";useinbandfec=1";
                    if (!newParams.includes("stereo=1")) newParams += ";stereo=1";
                    if (!newParams.includes("cbr=1")) newParams += ";cbr=1";
                    if (!newParams.includes("maxaveragebitrate=")) newParams += ";maxaveragebitrate=64000";
                    if (!newParams.includes("minptime=")) newParams += ";minptime=10";
                    return `a=fmtp:111 ${newParams}`;
                });
            }

            const tunedOffer = {
                type: offer.type,
                sdp: tunedSdp,
            };

            await peerConnection.setLocalDescription(tunedOffer);

            console.log(
                `📦 Offer created with Opus FEC for peer ${peerKey}`
            );

            // ------------------------------------------------------
            // SEND OFFER
            // ------------------------------------------------------

            await axios.post(
                `${API_URL}/webrtc/offer`,
                {
                    room_id: this.roomId,
                    outlet_id: id,
                    device_id: deviceId,
                    offer: {
                        type: peerConnection.localDescription.type,
                        sdp: peerConnection.localDescription.sdp,
                    },
                }
            );

            console.log(
                `✅ OFFER sent → peer ${peerKey}`
            );
        } catch (error) {
            console.error(
                `❌ FAILED CONNECTING PEER ${peerKey}:`,
                error
            );

            this.stopPeerConnection(outletId, deviceId);
        } finally {
            this.creatingOfferFor.delete(peerKey);
            if (!deviceId) {
                this.creatingOfferFor.delete(id);
                this.creatingOfferFor.delete(String(outletId));
                this.creatingOfferFor.delete(outletId);
            }
        }
    }

    // ============================================================
    // SEND ICE CANDIDATE (operator → outlet)
    // ============================================================

    async sendIceCandidate(outletId, candidate, deviceId = null) {
        try {
            if (!this.roomId) {
                console.warn(
                    "⚠️ Cannot send ICE: roomId null"
                );

                return;
            }

            if (!candidate || !candidate.candidate) {
                return;
            }

            await axios.post(
                `${API_URL}/webrtc/operator-ice`,
                {
                    room_id: this.roomId,
                    outlet_id: Number(outletId),
                    device_id: deviceId,
                    candidate: {
                        candidate: candidate.candidate,
                        sdpMid: candidate.sdpMid,
                        sdpMLineIndex: candidate.sdpMLineIndex,
                    },
                }
            );

            console.log(
                `🧊 Operator ICE sent → outlet ${outletId} (device: ${deviceId || "all"})`
            );
        } catch (error) {
            console.error(
                `❌ FAILED SENDING ICE → outlet ${outletId}:`,
                error.response?.data || error
            );

            // Jangan throw. ICE berikutnya tetap harus dikirim.
        }
    }

    // ============================================================
    // HANDLE ANSWER FROM OUTLET
    // ============================================================

    async handleAnswer(outletId, answer, deviceId = null) {
        try {
            const peerKey = this.getPeerKey(outletId, deviceId);
            const peerConnection = this.getPeerConnection(outletId, deviceId);

            if (!peerConnection) {
                console.warn(
                    "⚠️ PeerConnection tidak ditemukan untuk peer:",
                    peerKey
                );

                return;
            }

            if (!answer || !answer.type || !answer.sdp) {
                console.error(
                    "❌ ANSWER tidak valid:",
                    answer
                );

                return;
            }

            // Jika peer connection sudah dalam state 'stable' (mis. answer sudah diproses sebelumnya),
            // abaikan answer duplikat ini agar tidak memicu InvalidStateError.
            if (peerConnection.signalingState === "stable") {
                console.log(
                    `ℹ️ Peer ${peerKey} sudah dalam state 'stable' (answer sudah terpasang), abaikan answer duplikat.`
                );

                return;
            }

            if (peerConnection.signalingState !== "have-local-offer") {
                console.warn(
                    `⚠️ Peer ${peerKey} signalingState bukan 'have-local-offer' (${peerConnection.signalingState}), abaikan answer.`
                );

                return;
            }

            console.log(
                `📥 ANSWER received ← peer ${peerKey}`
            );

            // ----------------------------------------------------
            // SDP NORMALIZATION
            // ----------------------------------------------------

            let cleanSdp = String(answer.sdp);

            cleanSdp = cleanSdp.replace(/\\:/g, ":");

            cleanSdp =
                cleanSdp
                    .replace(/\r\n/g, "\n")
                    .replace(/\r/g, "\n")
                    .split("\n")
                    .map((line) => line.trimEnd())
                    .filter((line) => line.length > 0)
                    .join("\r\n") +
                "\r\n";

            await peerConnection.setRemoteDescription(
                new RTCSessionDescription({
                    type: answer.type,
                    sdp: cleanSdp,
                })
            );

            console.log(
                `✅ Remote description set → peer ${peerKey}`
            );

            await this.flushPendingRemoteIce(outletId, deviceId);
        } catch (error) {
            console.error(
                `❌ FAILED HANDLING ANSWER (peer ${this.getPeerKey(outletId, deviceId)}):`,
                error
            );
        }
    }

    // ============================================================
    // HANDLE REMOTE ICE FROM OUTLET
    // ============================================================

    async handleIceCandidate(outletId, candidate, deviceId = null) {
        try {
            const peerKey = this.getPeerKey(outletId, deviceId);
            const peerConnection = this.getPeerConnection(outletId, deviceId);

            if (!peerConnection) {
                console.warn(
                    "⚠️ PeerConnection tidak ditemukan untuk peer:",
                    peerKey
                );

                return;
            }

            if (!candidate || !candidate.candidate) {
                console.warn(
                    "⚠️ Remote ICE candidate kosong:",
                    peerKey
                );

                return;
            }

            if (!peerConnection.remoteDescription) {
                console.log(
                    `⏳ Remote description belum ada, simpan ICE peer ${peerKey}`
                );

                const pending =
                    this.pendingRemoteIce.get(peerKey) || [];

                pending.push(candidate);

                this.pendingRemoteIce.set(
                    peerKey,
                    pending
                );

                return;
            }

            await peerConnection.addIceCandidate(
                new RTCIceCandidate({
                    candidate: candidate.candidate,
                    sdpMid: candidate.sdpMid,
                    sdpMLineIndex: candidate.sdpMLineIndex,
                })
            );

            console.log(
                `✅ Remote ICE added → peer ${peerKey}`
            );
        } catch (error) {
            console.error(
                `❌ Failed adding remote ICE (peer ${this.getPeerKey(outletId, deviceId)}):`,
                error
            );
        }
    }

    // ============================================================
    // FLUSH PENDING REMOTE ICE
    // ============================================================

    async flushPendingRemoteIce(outletId, deviceId = null) {
        const peerKey = this.getPeerKey(outletId, deviceId);
        const peerConnection = this.getPeerConnection(outletId, deviceId);

        if (!peerConnection) {
            return;
        }

        const pending =
            this.pendingRemoteIce.get(peerKey) ||
            (!deviceId ? (this.pendingRemoteIce.get(Number(outletId)) || this.pendingRemoteIce.get(String(outletId))) : null) ||
            [];

        if (pending.length === 0) {
            return;
        }

        console.log(
            `🧊 Flushing ${pending.length} remote ICE → peer ${peerKey}`
        );

        this.pendingRemoteIce.set(peerKey, []);

        for (const candidate of pending) {
            try {
                await peerConnection.addIceCandidate(
                    new RTCIceCandidate({
                        candidate: candidate.candidate,
                        sdpMid: candidate.sdpMid,
                        sdpMLineIndex: candidate.sdpMLineIndex,
                    })
                );
            } catch (error) {
                console.error(
                    `❌ Failed pending remote ICE (peer ${peerKey}):`,
                    error
                );
            }
        }
    }

    getLocalStream() {
        return this.localStream;
    }

    // ============================================================
    // GET ROOM ID
    // ============================================================

    getRoomId() {
        return this.roomId;
    }

    // ============================================================
    // CHECK WEBRTC READY
    // ============================================================

    isReady() {
        return (
            this.localStream !== null &&
            this.roomId !== null
        );
    }

    // ============================================================
    // STOP SATU PEER CONNECTION (outlet/device tertentu)
    // ============================================================

    stopPeerConnection(outletId, deviceId = null) {
        const peerKey = this.getPeerKey(outletId, deviceId);
        const id = Number(outletId);
        const peerConnection =
            this.peerConnections.get(peerKey) ||
            (!deviceId ? (this.peerConnections.get(id) || this.peerConnections.get(String(outletId))) : null);

        if (!peerConnection) {
            return;
        }

        console.log(
            `🛑 Closing PeerConnection peer ${peerKey}...`
        );

        try {
            peerConnection.onicecandidate = null;
            peerConnection.onicecandidateerror = null;
            peerConnection.onconnectionstatechange = null;
            peerConnection.oniceconnectionstatechange = null;
            peerConnection.close();
        } catch (error) {
            console.error(
                "❌ Error closing PeerConnection:",
                error
            );
        }

        this.peerConnections.delete(peerKey);
        this.pendingRemoteIce.delete(peerKey);
        this.creatingOfferFor.delete(peerKey);

        if (!deviceId) {
            this.peerConnections.delete(id);
            this.peerConnections.delete(String(outletId));
            this.pendingRemoteIce.delete(id);
            this.pendingRemoteIce.delete(String(outletId));
            this.creatingOfferFor.delete(id);
            this.creatingOfferFor.delete(String(outletId));
        }
    }

    // ============================================================
    // STOP WEBRTC (semua outlet + mic)
    // ============================================================

    async stop() {
        console.log(
            "===================================="
        );

        console.log(
            "🛑 STOPPING WEBRTC"
        );

        console.log(
            "===================================="
        );

        // ----------------------------------------------------
        // STOP MICROPHONE
        // ----------------------------------------------------

        if (this.localStream) {
            this.localStream
                .getTracks()
                .forEach((track) => {
                    track.stop();
                });

            this.localStream = null;

            console.log(
                "🎤 Microphone stopped"
            );
        }

        // ----------------------------------------------------
        // STOP AUDIO CONTEXT & GAIN NODES
        // ----------------------------------------------------

        if (this.audioContext) {
            try {
                this.audioContext.close();
            } catch (e) {}
            this.audioContext = null;
            this.sourceNode = null;
        }

        if (this.outletGainNodes) {
            this.outletGainNodes.clear();
        }

        // ----------------------------------------------------
        // CLOSE SEMUA PEER CONNECTION
        // ----------------------------------------------------

        for (const outletId of this.peerConnections.keys()) {
            this.stopPeerConnection(outletId);
        }

        this.peerConnections.clear();
        this.pendingRemoteIce.clear();
        this.creatingOfferFor.clear();

        // ----------------------------------------------------
        // RESET STATE
        // ----------------------------------------------------

        this.roomId = null;
        this.targetOutlets = [];

        console.log(
            "✅ WebRTC stopped"
        );
    }

    setOutletVolume(outletId, volume) {
        const vol = Math.max(0, Math.min(100, Number(volume))) / 100;
        if (!this.outletVolumes) {
            this.outletVolumes = new Map();
        }

        if (outletId === "all") {
            this.masterVolume = vol;
            if (this.outletGainNodes) {
                this.outletGainNodes.forEach((gainNode) => {
                    try {
                        gainNode.gain.setValueAtTime(vol, this.audioContext?.currentTime || 0);
                    } catch (e) {}
                });
            }
            console.log(`🔊 Live Mic Master volume WebRTC diubah ke ${vol * 100}%`);
            return;
        }

        const id = Number(outletId);
        this.outletVolumes.set(id, vol);
        const gainNode = this.outletGainNodes?.get(id) || this.outletGainNodes?.get(String(outletId));
        if (gainNode) {
            try {
                gainNode.gain.setValueAtTime(vol, this.audioContext?.currentTime || 0);
                console.log(`🔊 Live Mic WebRTC Gain outlet ${id} diubah ke ${vol * 100}%`);
            } catch (e) {}
        }
    }
}

// ============================================================
// SINGLETON
// ============================================================

export default new WebRTCService();
