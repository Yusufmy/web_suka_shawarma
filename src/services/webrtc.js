import axios from "axios";

const API_URL = "https://api-radio.sukashawarma.com/api";

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

    // ============================================================
    // START BROADCAST
    //
    // Ambil mic SEKALI, simpan daftar outlet target. Belum bikin
    // PeerConnection apa pun di sini - itu baru dibuat per outlet
    // begitu outlet itu mengirim sinyal "ready" (lihat
    // handleOutletReady).
    // ============================================================

    async startBroadcast(roomId, outlets = [], deviceId = null) {
        try {
            console.log("🎙️ START WEBRTC BROADCAST");

            await this.stop();

            this.roomId = roomId;
            this.targetOutlets = outlets;

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

            return true;
        } catch (error) {
            console.error("❌ FAILED STARTING WEBRTC:", error);
            await this.stop();
            throw error;
        }
    }

    // ============================================================
    // OUTLET READY → BUAT PEER CONNECTION + KIRIM OFFER
    //
    // Dipanggil tiap kali ada outlet yang mengirim sinyal
    // webrtc.receiver.ready dengan outlet_id tertentu.
    // ============================================================

    async handleOutletReady(outletId) {
        if (!this.localStream || !this.roomId) {
            console.warn(
                "⚠️ Mic/room belum siap, abaikan ready outlet:",
                outletId
            );

            return;
        }

        const isTargeted = this.targetOutlets.some(
            (outlet) => outlet.id === outletId
        );

        if (!isTargeted) {
            console.warn(
                "⚠️ Outlet ready tapi bukan target:",
                outletId
            );

            return;
        }

        if (this.peerConnections.has(outletId)) {
            console.warn(
                "⚠️ Outlet sudah punya PeerConnection, abaikan ready ulang:",
                outletId
            );

            return;
        }

        if (this.creatingOfferFor.get(outletId)) {
            console.warn(
                "⚠️ Offer sedang dibuat untuk outlet ini, skip:",
                outletId
            );

            return;
        }

        try {
            this.creatingOfferFor.set(outletId, true);

            console.log("====================================");
            console.log("🔗 CONNECTING OUTLET:", outletId);
            console.log("====================================");

            // ------------------------------------------------------
            // PEER CONNECTION
            // ------------------------------------------------------

            const peerConnection =
                new RTCPeerConnection({
                    iceServers: [
                        {
                            urls:
                                "stun:stun.l.google.com:19302",
                        },
                    ],
                });

            this.peerConnections.set(
                outletId,
                peerConnection
            );

            this.pendingRemoteIce.set(
                outletId,
                []
            );

            // ------------------------------------------------------
            // ADD MICROPHONE TRACK (stream yang sama dipakai
            // bersama, WebRTC mendukung 1 track dipakai di banyak
            // PeerConnection)
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
                `✅ Audio track added → outlet ${outletId}`
            );

            // ------------------------------------------------------
            // LOCAL ICE CANDIDATE
            // ------------------------------------------------------

            peerConnection.onicecandidate =
                async (event) => {
                    try {
                        if (!event.candidate) {
                            console.log(
                                `🧊 ICE gathering completed: outlet ${outletId}`
                            );

                            return;
                        }

                        await this.sendIceCandidate(
                            outletId,
                            event.candidate
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
                    console.error(
                        `❌ ICE CANDIDATE ERROR (outlet ${outletId}):`,
                        {
                            errorCode: event.errorCode,
                            errorText: event.errorText,
                        }
                    );
                };

            // ------------------------------------------------------
            // CONNECTION STATE
            // ------------------------------------------------------

            peerConnection.onconnectionstatechange =
                () => {
                    const state =
                        peerConnection.connectionState;

                    console.log(
                        `🔗 Outlet ${outletId} state:`,
                        state
                    );

                    if (this.onConnectionStateChange) {
                        this.onConnectionStateChange({
                            outletId,
                            state,
                        });
                    }
                };

            peerConnection.oniceconnectionstatechange =
                () => {
                    console.log(
                        `🧊 Outlet ${outletId} ICE:`,
                        peerConnection.iceConnectionState
                    );
                };

            // ------------------------------------------------------
            // CREATE OFFER
            // ------------------------------------------------------

            const offer =
                await peerConnection.createOffer();

            await peerConnection.setLocalDescription(offer);

            console.log(
                `📦 Offer created for outlet ${outletId}`
            );

            // ------------------------------------------------------
            // SEND OFFER
            // ------------------------------------------------------

            await axios.post(
                `${API_URL}/webrtc/offer`,
                {
                    room_id: this.roomId,
                    outlet_id: outletId,
                    offer: {
                        type: peerConnection.localDescription.type,
                        sdp: peerConnection.localDescription.sdp,
                    },
                }
            );

            console.log(
                `✅ OFFER sent → outlet ${outletId}`
            );
        } catch (error) {
            console.error(
                `❌ FAILED CONNECTING OUTLET ${outletId}:`,
                error
            );

            this.stopPeerConnection(outletId);
        } finally {
            this.creatingOfferFor.delete(outletId);
        }
    }

    // ============================================================
    // SEND ICE CANDIDATE (operator → outlet)
    // ============================================================

    async sendIceCandidate(outletId, candidate) {
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
                    outlet_id: outletId,
                    candidate: {
                        candidate: candidate.candidate,
                        sdpMid: candidate.sdpMid,
                        sdpMLineIndex: candidate.sdpMLineIndex,
                    },
                }
            );

            console.log(
                `🧊 Operator ICE sent → outlet ${outletId}`
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

    async handleAnswer(outletId, answer) {
        try {
            const peerConnection =
                this.peerConnections.get(outletId);

            if (!peerConnection) {
                console.warn(
                    "⚠️ PeerConnection tidak ditemukan untuk outlet:",
                    outletId
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

            console.log(
                `📥 ANSWER received ← outlet ${outletId}`
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
                `✅ Remote description set → outlet ${outletId}`
            );

            await this.flushPendingRemoteIce(outletId);
        } catch (error) {
            console.error(
                `❌ FAILED HANDLING ANSWER (outlet ${outletId}):`,
                error
            );
        }
    }

    // ============================================================
    // HANDLE REMOTE ICE FROM OUTLET
    // ============================================================

    async handleIceCandidate(outletId, candidate) {
        try {
            const peerConnection =
                this.peerConnections.get(outletId);

            if (!peerConnection) {
                console.warn(
                    "⚠️ PeerConnection tidak ditemukan untuk outlet:",
                    outletId
                );

                return;
            }

            if (!candidate || !candidate.candidate) {
                console.warn(
                    "⚠️ Remote ICE candidate kosong:",
                    outletId
                );

                return;
            }

            if (!peerConnection.remoteDescription) {
                console.log(
                    `⏳ Remote description belum ada, simpan ICE outlet ${outletId}`
                );

                const pending =
                    this.pendingRemoteIce.get(outletId) || [];

                pending.push(candidate);

                this.pendingRemoteIce.set(
                    outletId,
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
                `✅ Remote ICE added → outlet ${outletId}`
            );
        } catch (error) {
            console.error(
                `❌ Failed adding remote ICE (outlet ${outletId}):`,
                error
            );
        }
    }

    // ============================================================
    // FLUSH PENDING REMOTE ICE
    // ============================================================

    async flushPendingRemoteIce(outletId) {
        const peerConnection =
            this.peerConnections.get(outletId);

        if (!peerConnection) {
            return;
        }

        const pending =
            this.pendingRemoteIce.get(outletId) || [];

        if (pending.length === 0) {
            return;
        }

        console.log(
            `🧊 Flushing ${pending.length} remote ICE → outlet ${outletId}`
        );

        this.pendingRemoteIce.set(outletId, []);

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
                    `❌ Failed pending remote ICE (outlet ${outletId}):`,
                    error
                );
            }
        }
    }

    // ============================================================
    // GET LOCAL STREAM
    // ============================================================

    getLocalStream() {
        return this.localStream;
    }

    // ============================================================
    // GET PEER CONNECTION
    // ============================================================

    getPeerConnection(outletId) {
        return this.peerConnections.get(outletId) || null;
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
    // STOP SATU PEER CONNECTION (outlet tertentu)
    // ============================================================

    stopPeerConnection(outletId) {
        const peerConnection =
            this.peerConnections.get(outletId);

        if (!peerConnection) {
            return;
        }

        console.log(
            `🛑 Closing PeerConnection outlet ${outletId}...`
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

        this.peerConnections.delete(outletId);
        this.pendingRemoteIce.delete(outletId);
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
}

// ============================================================
// SINGLETON
// ============================================================

export default new WebRTCService();
