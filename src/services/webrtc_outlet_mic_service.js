import axios from "axios";

const API_URL = "https://radio.sukashawarma.com/api";

class WebRTCOutletMicService {
    constructor() {
        this.peerConnection = null;

        this.roomId = null;
        this.outletId = null;

        this.hasRemoteDescription = false;

        this.pendingRemoteIceCandidates = [];

        this.remoteStream = null;

        this.onRemoteStream = null;
        this.onConnectionStateChange = null;

        this.statsInterval = null;

        // HTML audio element
        this.audioElement = null;
    }

    // ============================================================
    // NORMALIZE SDP
    // ============================================================

    normalizeSdp(sdp) {
        if (!sdp || typeof sdp !== "string") {
            throw new Error("SDP tidak valid");
        }

        console.log("🧹 CHECKING SDP...");
        console.log("📏 Original SDP length:", sdp.length);

        let normalized = sdp;

        normalized = normalized.replace(/\\:/g, ":");

        normalized = normalized
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n")
            .split("\n")
            .map((line) => line.trimEnd())
            .join("\r\n");

        if (!normalized.endsWith("\r\n")) {
            normalized += "\r\n";
        }

        console.log(
            "🔎 Contains backslash AFTER:",
            normalized.includes("\\")
        );

        console.log(
            "📏 Normalized SDP length:",
            normalized.length
        );

        return normalized;
    }

    // ============================================================
    // VALIDATE SDP
    // ============================================================

    validateSdp(sdp) {
        if (!sdp || typeof sdp !== "string") {
            throw new Error("SDP kosong");
        }

        if (!sdp.startsWith("v=0")) {
            throw new Error("SDP tidak dimulai dengan v=0");
        }

        if (!sdp.includes("m=audio")) {
            throw new Error("SDP tidak memiliki m=audio");
        }

        if (!sdp.includes("a=ice-ufrag:")) {
            throw new Error("SDP tidak memiliki a=ice-ufrag:");
        }

        if (!sdp.includes("a=ice-pwd:")) {
            throw new Error("SDP tidak memiliki a=ice-pwd:");
        }

        if (!sdp.includes("a=fingerprint:")) {
            throw new Error("SDP tidak memiliki fingerprint");
        }

        if (!sdp.includes("a=setup:")) {
            throw new Error("SDP tidak memiliki a=setup:");
        }

        console.log("✅ SDP validation passed");
    }

    // ============================================================
    // CREATE AUDIO ELEMENT
    // ============================================================

    createAudioElement() {
        // Jangan buat berkali-kali
        if (this.audioElement) {
            return this.audioElement;
        }

        const audio = document.createElement("audio");

        audio.autoplay = true;
        audio.controls = false;
        audio.muted = false;
        audio.volume = 1.0;
        audio.playsInline = true;

        // Sangat membantu debugging
        audio.onplay = () => {
            console.log("🔊🔊🔊 AUDIO ELEMENT PLAYING");
        };

        audio.onpause = () => {
            console.warn("⏸️ AUDIO ELEMENT PAUSED");
        };

        audio.onerror = (error) => {
            console.error(
                "❌ AUDIO ELEMENT ERROR:",
                error
            );
        };

        // Masukkan ke DOM supaya browser benar-benar
        // memiliki element audio aktif.
        audio.style.display = "none";

        document.body.appendChild(audio);

        this.audioElement = audio;

        console.log(
            "✅ HTMLAudioElement created"
        );

        return audio;
    }

    // ============================================================
    // PLAY REMOTE AUDIO
    // ============================================================

    async playRemoteAudio() {
        if (!this.remoteStream) {
            console.warn(
                "⚠️ Tidak ada remote stream untuk dimainkan"
            );

            return false;
        }

        const audioTracks =
            this.remoteStream.getAudioTracks();

        console.log(
            "🎧 Remote audio tracks:",
            audioTracks
        );

        if (audioTracks.length === 0) {
            console.warn(
                "⚠️ Remote stream tidak memiliki audio track"
            );

            return false;
        }

        const audioTrack = audioTracks[0];

        console.log(
            "🎵 Audio track status:",
            {
                id: audioTrack.id,
                enabled: audioTrack.enabled,
                muted: audioTrack.muted,
                readyState: audioTrack.readyState,
            }
        );

        const audio =
            this.createAudioElement();

        audio.srcObject = this.remoteStream;

        try {
            await audio.play();

            console.log(
                "🔊🔊🔊 REMOTE AUDIO PLAYING"
            );

            console.log(
                "🔊 Audio paused:",
                audio.paused
            );

            console.log(
                "🔊 Audio volume:",
                audio.volume
            );

            return true;
        } catch (error) {
            console.error(
                "❌ AUDIO PLAY ERROR:",
                error
            );

            console.error(
                "💡 Browser kemungkinan memblokir autoplay."
            );

            return false;
        }
    }

    // ============================================================
    // START
    // ============================================================

    async start({
        roomId,
        outletId,
        offer,
    }) {
        try {
            console.log(
                "===================================="
            );

            console.log(
                "🎤 START OUTLET MIC RECEIVER"
            );

            console.log(
                "===================================="
            );

            console.log(
                "🏠 Room ID:",
                roomId
            );

            console.log(
                "🏪 Outlet ID:",
                outletId
            );

            console.log(
                "📥 Offer:",
                offer
            );

            // ----------------------------------------------------
            // VALIDATION
            // ----------------------------------------------------

            if (!roomId) {
                throw new Error(
                    "Room ID kosong"
                );
            }

            if (!outletId) {
                throw new Error(
                    "Outlet ID kosong"
                );
            }

            if (!offer) {
                throw new Error(
                    "Offer kosong"
                );
            }

            if (
                offer.type !== "offer" ||
                !offer.sdp
            ) {
                throw new Error(
                    "Offer dari outlet tidak valid"
                );
            }

            console.log(
                "✅ Offer dari outlet valid"
            );

            // ----------------------------------------------------
            // SAVE ROOM
            // ----------------------------------------------------

            this.roomId = roomId;
            this.outletId = outletId;

            // ----------------------------------------------------
            // CLEANUP OLD CONNECTION
            // ----------------------------------------------------

            if (this.peerConnection) {
                console.log(
                    "🧹 Existing PeerConnection ditemukan"
                );

                this.cleanupPeerConnection();
            }

            this.hasRemoteDescription = false;
            this.remoteStream = null;

            // ----------------------------------------------------
            // CREATE PEER CONNECTION
            // ----------------------------------------------------

            this.peerConnection =
                new RTCPeerConnection({
                    iceServers: [
                        {
                            urls: "stun:stun.l.google.com:19302",
                        },
                    ],
                });

            const audioTransceiver =
                this.peerConnection.addTransceiver("audio", {
                    direction: "recvonly",
                });

            console.log(
                "🎧 Audio transceiver created:",
                audioTransceiver
            );

            console.log(
                "✅ PeerConnection created"
            );

            // ----------------------------------------------------
            // LOCAL ICE CANDIDATE
            //
            // PENTING: tanpa handler ini, kandidat ICE lokal
            // operator tidak pernah dikirim ke outlet, sehingga
            // outlet tidak bisa menyelesaikan connectivity check
            // ke operator -> tidak ada suara di operator.
            // ----------------------------------------------------

            this.peerConnection.onicecandidate =
                async (event) => {
                    try {
                        if (!event.candidate) {
                            console.log(
                                "🧊 ICE gathering (outlet mic) completed"
                            );

                            return;
                        }

                        console.log(
                            "🧊 LOCAL ICE CANDIDATE (outlet mic):",
                            {
                                candidate: event.candidate.candidate,
                                sdpMid: event.candidate.sdpMid,
                                sdpMLineIndex: event.candidate.sdpMLineIndex,
                            }
                        );

                        await this.sendIceCandidate(
                            event.candidate
                        );
                    } catch (error) {
                        console.error(
                            "❌ Failed sending local outlet mic ICE:",
                            error
                        );
                    }
                };

            // ----------------------------------------------------
            // ICE CANDIDATE ERROR
            // ----------------------------------------------------

            this.peerConnection.onicecandidateerror =
                (event) => {
                    console.error(
                        "❌ ICE CANDIDATE ERROR (outlet mic):",
                        {
                            errorCode: event.errorCode,
                            errorText: event.errorText,
                            url: event.url,
                            address: event.address,
                            port: event.port,
                        }
                    );
                };

            // ----------------------------------------------------
            // CONNECTION STATE
            // ----------------------------------------------------

            this.peerConnection.onconnectionstatechange = () => {
                if (!this.peerConnection) {
                    return;
                }

                const state = this.peerConnection.connectionState;

                console.log(
                    "🔗 OUTLET MIC CONNECTION STATE:",
                    state
                );

                if (this.onConnectionStateChange) {
                    this.onConnectionStateChange(state);
                }

                if (state === "connected") {
                    this.startStatsMonitoring();
                } else if (
                    state === "disconnected" ||
                    state === "failed" ||
                    state === "closed"
                ) {
                    this.stopStatsMonitoring();
                }
            };

            // ----------------------------------------------------
            // ICE CONNECTION STATE
            // ----------------------------------------------------

            this.peerConnection.oniceconnectionstatechange = () => {
                if (!this.peerConnection) {
                    return;
                }

                console.log(
                    "🧊 OUTLET MIC ICE CONNECTION STATE:",
                    this.peerConnection.iceConnectionState
                );
            };

            // ====================================================
            // IMPORTANT
            //
            // JANGAN addTransceiver("audio") LAGI DI BAWAH SINI.
            //
            // Offer Flutter sudah mempunyai:
            //
            // m=audio
            //
            // dan:
            //
            // a=sendrecv
            //
            // Kita akan mengubah transceiver tersebut
            // menjadi recvonly setelah remote offer dipasang.
            // ====================================================

            // ----------------------------------------------------
            // ON TRACK
            // ----------------------------------------------------

            this.peerConnection.ontrack = async (event) => {
                console.log("====================================");
                console.log("🎤 AUDIO TRACK FROM OUTLET RECEIVED");
                console.log("🎵 Kind:", event.track.kind);
                console.log("🎵 ID:", event.track.id);
                console.log("🎵 Enabled:", event.track.enabled);
                console.log("🎵 Muted:", event.track.muted);
                console.log("🎵 ReadyState:", event.track.readyState);
                console.log("🎵 Streams:", event.streams);

                if (event.track.kind !== "audio") {
                    console.warn("⚠️ Track bukan audio");
                    return;
                }

                if (event.streams?.length > 0) {
                    this.remoteStream = event.streams[0];
                } else {
                    if (!this.remoteStream) {
                        this.remoteStream = new MediaStream();
                    }

                    this.remoteStream.addTrack(event.track);
                }

                console.log(
                    "🎧 Remote audio tracks:",
                    this.remoteStream.getAudioTracks()
                );

                const audioTrack =
                    this.remoteStream.getAudioTracks()[0];

                console.log("🎵 FINAL AUDIO TRACK:", {
                    id: audioTrack?.id,
                    enabled: audioTrack?.enabled,
                    muted: audioTrack?.muted,
                    readyState: audioTrack?.readyState,
                });

                // ------------------------------------------------
                // track.muted = true berarti belum ada RTP audio
                // yang benar-benar diterima (walau ICE/DTLS sudah
                // connected). onunmute akan fire begitu paket
                // audio pertama benar-benar sampai.
                // ------------------------------------------------

                if (audioTrack) {
                    audioTrack.onunmute = () => {
                        console.log(
                            "🔊🔊🔊 AUDIO TRACK UNMUTED — RTP audio mulai mengalir dari outlet"
                        );
                    };

                    audioTrack.onmute = () => {
                        console.warn(
                            "🔇 AUDIO TRACK MUTED — tidak ada paket RTP audio dari outlet"
                        );
                    };
                }

                if (this.onRemoteStream) {
                    this.onRemoteStream(this.remoteStream);
                }

                await this.playRemoteAudio();

                console.log("====================================");
            };

            // ====================================================
            // PREPARE SDP
            // ====================================================

            const normalizedSdp =
                this.normalizeSdp(
                    offer.sdp
                );

            console.log(
                "===================================="
            );

            console.log(
                "📥 FLUTTER OUTLET MIC OFFER SDP"
            );

            console.log(
                normalizedSdp
            );

            console.log(
                "===================================="
            );

            const audioSection =
                normalizedSdp
                    .split("m=audio")[1];

            console.log(
                "🎤 AUDIO SDP SECTION:",
                audioSection
                    ? "FOUND"
                    : "NOT FOUND"
            );

            if (audioSection) {
                console.log(
                    "🎤 AUDIO SDP:",
                    "m=audio" + audioSection
                );

                console.log(
                    "🎤 SENDRECV:",
                    audioSection.includes("a=sendrecv")
                );

                console.log(
                    "🎤 SENDONLY:",
                    audioSection.includes("a=sendonly")
                );

                console.log(
                    "🎤 RECVONLY:",
                    audioSection.includes("a=recvonly")
                );

                console.log(
                    "🎤 INACTIVE:",
                    audioSection.includes("a=inactive")
                );
            }

            this.validateSdp(
                normalizedSdp
            );

            // ====================================================
            // REMOTE OFFER
            // ====================================================

            const remoteOffer =
                new RTCSessionDescription({
                    type: "offer",
                    sdp: normalizedSdp,
                });

            console.log(
                "📥 Calling setRemoteDescription..."
            );

            await this.peerConnection
                .setRemoteDescription(
                    remoteOffer
                );

            console.log(
                "✅ OUTLET OFFER SET AS REMOTE DESCRIPTION"
            );

            this.hasRemoteDescription = true;

            console.log(
                "📡 Signaling state:",
                this.peerConnection
                    .signalingState
            );

            // ====================================================
            // GET TRANSCEIVERS AFTER REMOTE OFFER
            //
            // PENTING: harus dideklarasikan SEBELUM dipakai.
            // Sebelumnya bug di sini: variabel `transceivers`
            // dipakai di console.log duluan padahal `const
            // transceivers = ...` baru dideklarasikan belakangan
            // -> ReferenceError (temporal dead zone) -> start()
            // gagal di tengah jalan -> cleanupPeerConnection()
            // memutus koneksi -> tidak ada suara di operator.
            // ====================================================

            const transceivers =
                this.peerConnection
                    .getTransceivers();

            console.log(
                "🎧 ALL TRANSCEIVERS AFTER REMOTE OFFER:",
                transceivers.map((t, index) => ({
                    index,
                    direction: t.direction,
                    currentDirection: t.currentDirection,
                    mid: t.mid,
                    receiverKind: t.receiver?.track?.kind,
                    senderKind: t.sender?.track?.kind,
                }))
            );

            // ====================================================
            // SET EXISTING AUDIO TRANSCEIVER TO RECVONLY
            // ====================================================

            audioTransceiver.direction = "recvonly";

            console.log(
                "🎧 AUDIO DIRECTION SET TO:",
                audioTransceiver.direction
            );

            // ====================================================
            // RECEIVERS
            // ====================================================

            const receivers =
                this.peerConnection
                    .getReceivers();

            console.log(
                "🎧 RECEIVERS:",
                receivers
            );

            receivers.forEach(
                (receiver, index) => {
                    console.log(
                        `🎧 Receiver ${index}:`,
                        {
                            kind:
                                receiver
                                    .track
                                    ?.kind,

                            id:
                                receiver
                                    .track
                                    ?.id,

                            enabled:
                                receiver
                                    .track
                                    ?.enabled,

                            muted:
                                receiver
                                    .track
                                    ?.muted,

                            readyState:
                                receiver
                                    .track
                                    ?.readyState,
                        }
                    );
                }
            );

            // ====================================================
            // FLUSH ICE
            // ====================================================

            await this.flushPendingRemoteIce();

            // ====================================================
            // CREATE ANSWER
            // ====================================================

            console.log(
                "🎯 Creating OPERATOR ANSWER..."
            );

            const answer =
                await this.peerConnection
                    .createAnswer();

            console.log(
                "===================================="
            );

            console.log(
                "📤 WEB OPERATOR ANSWER SDP"
            );

            console.log(
                answer.sdp
            );

            console.log(
                "===================================="
            );

            const answerAudioSection =
                answer.sdp?.split("m=audio")[1];

            if (answerAudioSection) {
                console.log(
                    "🎧 WEB ANSWER AUDIO DIRECTION:",
                    {
                        recvonly:
                            answerAudioSection.includes(
                                "a=recvonly"
                            ),

                        sendrecv:
                            answerAudioSection.includes(
                                "a=sendrecv"
                            ),

                        sendonly:
                            answerAudioSection.includes(
                                "a=sendonly"
                            ),

                        inactive:
                            answerAudioSection.includes(
                                "a=inactive"
                            ),
                    }
                );
            }

            // ====================================================
            // SET LOCAL DESCRIPTION
            // ====================================================

            await this.peerConnection
                .setLocalDescription(
                    answer
                );

            console.log(
                "✅ OPERATOR LOCAL ANSWER SET"
            );

            console.log(
                "📡 Signaling state:",
                this.peerConnection
                    .signalingState
            );

            // ====================================================
            // CHECK ANSWER
            // ====================================================

            const localSdp =
                this.peerConnection
                    .localDescription
                    ?.sdp || "";

            if (
                localSdp.includes(
                    "a=recvonly"
                )
            ) {
                console.log(
                    "🎧✅ ANSWER AUDIO = recvonly"
                );
            } else {
                console.warn(
                    "⚠️ ANSWER AUDIO DIRECTION PERLU DICEK"
                );
            }

            // ====================================================
            // SEND ANSWER
            // ====================================================

            await this.sendAnswer(
                this.peerConnection
                    .localDescription
            );

            console.log(
                "===================================="
            );

            console.log(
                "🎤 OUTLET MIC RECEIVER READY"
            );

            console.log(
                "⏳ Waiting for WebRTC connection..."
            );

            console.log(
                "===================================="
            );

            return true;
        } catch (error) {
            console.error(
                "❌ START OUTLET MIC ERROR:",
                error
            );

            this.cleanupPeerConnection();

            throw error;
        }
    }

    // ============================================================
    // STATS
    // ============================================================

    startStatsMonitoring() {
        this.stopStatsMonitoring();

        console.log(
            "📊 Starting WebRTC audio stats..."
        );

        this.statsInterval = setInterval(async () => {
            if (!this.peerConnection) {
                return;
            }

            try {
                const stats =
                    await this.peerConnection.getStats();

                stats.forEach((report) => {

                    // ============================================
                    // INBOUND RTP AUDIO
                    // ============================================

                    if (
                        report.type === "inbound-rtp" &&
                        (
                            report.kind === "audio" ||
                            report.mediaType === "audio"
                        )
                    ) {
                        console.log(
                            "🎧🎧 INBOUND AUDIO RTP:",
                            {
                                packetsReceived:
                                    report.packetsReceived,

                                packetsLost:
                                    report.packetsLost,

                                bytesReceived:
                                    report.bytesReceived,

                                jitter:
                                    report.jitter,

                                packetsDiscarded:
                                    report.packetsDiscarded,

                                codecId:
                                    report.codecId,

                                ssrc:
                                    report.ssrc,

                                timestamp:
                                    report.timestamp,
                            }
                        );
                    }

                    // ============================================
                    // REMOTE INBOUND RTP
                    // ============================================

                    if (
                        report.type === "remote-inbound-rtp"
                    ) {
                        console.log(
                            "📡 REMOTE INBOUND RTP:",
                            report
                        );
                    }

                    // ============================================
                    // CODEC
                    // ============================================

                    if (
                        report.type === "codec"
                    ) {
                        console.log(
                            "🎵 CODEC:",
                            report
                        );
                    }

                    // ============================================
                    // MEDIA SOURCE
                    // ============================================

                    if (
                        report.type === "media-source"
                    ) {
                        console.log(
                            "🎤 MEDIA SOURCE:",
                            report
                        );
                    }
                });

            } catch (error) {
                console.error(
                    "❌ WebRTC stats error:",
                    error
                );
            }

        }, 1000);
    }

    // ============================================================
    // STOP STATS
    // ============================================================

    stopStatsMonitoring() {
        if (this.statsInterval) {
            clearInterval(
                this.statsInterval
            );

            this.statsInterval = null;
        }
    }

    // ============================================================
    // SEND ANSWER
    // ============================================================

    async sendAnswer(answer) {
        if (!this.roomId) {
            throw new Error(
                "Room ID belum tersedia"
            );
        }

        if (!answer) {
            throw new Error(
                "Local description / answer belum tersedia"
            );
        }

        const payload = {
            room_id: this.roomId,

            outlet_id: this.outletId,

            answer: {
                type: answer.type,
                sdp: answer.sdp,
            },
        };

        console.log(
            "📤 SENDING OPERATOR ANSWER:",
            payload
        );

        const response =
            await axios.post(
                `${API_URL}/webrtc/operator/answer`,
                payload
            );

        console.log(
            "✅ OPERATOR ANSWER SENT:",
            response.data
        );

        return response.data;
    }

    // ============================================================
    // SEND OPERATOR ICE
    // ============================================================

    async sendIceCandidate(candidate) {
        if (!this.roomId) {
            console.warn(
                "⚠️ Cannot send operator ICE: roomId null"
            );

            return;
        }

        if (!candidate?.candidate) {
            return;
        }

        const payload = {
            room_id: this.roomId,

            outlet_id: this.outletId,

            candidate: {
                candidate:
                    candidate.candidate,

                sdpMid:
                    candidate.sdpMid,

                sdpMLineIndex:
                    candidate.sdpMLineIndex,
            },
        };

        console.log(
            "📤 SENDING OPERATOR ICE:",
            payload
        );

        try {
            const response =
                await axios.post(
                    `${API_URL}/webrtc/operator/ice`,
                    payload
                );

            console.log(
                "✅ OPERATOR ICE SENT:",
                response.data
            );

            return response.data;
        } catch (error) {
            console.error(
                "❌ FAILED SENDING OPERATOR ICE:",
                error
            );
        }
    }

    // ============================================================
    // HANDLE ICE FROM OUTLET
    // ============================================================

    async handleIceCandidate(candidate) {
        try {
            if (!candidate?.candidate) {
                return;
            }

            console.log(
                "📥 OUTLET MIC ICE RECEIVED:",
                candidate
            );

            if (!this.peerConnection) {
                console.log(
                    "⏳ PeerConnection belum tersedia"
                );

                this.pendingRemoteIceCandidates
                    .push(candidate);

                return;
            }

            if (
                !this.peerConnection
                    .remoteDescription
            ) {
                console.log(
                    "⏳ Remote offer belum tersedia"
                );

                this.pendingRemoteIceCandidates
                    .push(candidate);

                return;
            }

            const iceCandidate =
                new RTCIceCandidate({
                    candidate:
                        candidate.candidate,

                    sdpMid:
                        candidate.sdpMid,

                    sdpMLineIndex:
                        candidate.sdpMLineIndex,
                });

            await this.peerConnection
                .addIceCandidate(
                    iceCandidate
                );

            console.log(
                "✅ OUTLET MIC ICE ADDED"
            );
        } catch (error) {
            console.error(
                "❌ FAILED ADDING OUTLET MIC ICE:",
                error
            );
        }
    }

    // ============================================================
    // FLUSH PENDING ICE
    // ============================================================

    async flushPendingRemoteIce() {
        if (!this.peerConnection) {
            return;
        }

        if (
            this.pendingRemoteIceCandidates
                .length === 0
        ) {
            console.log(
                "🧊 No pending outlet ICE"
            );

            return;
        }

        console.log(
            `🧊 Flushing ${this.pendingRemoteIceCandidates.length} outlet ICE...`
        );

        const pending = [
            ...this.pendingRemoteIceCandidates,
        ];

        this.pendingRemoteIceCandidates = [];

        for (
            const candidate of pending
        ) {
            try {
                const iceCandidate =
                    new RTCIceCandidate({
                        candidate:
                            candidate.candidate,

                        sdpMid:
                            candidate.sdpMid,

                        sdpMLineIndex:
                            candidate.sdpMLineIndex,
                    });

                await this.peerConnection
                    .addIceCandidate(
                        iceCandidate
                    );

                console.log(
                    "✅ Pending outlet ICE added"
                );
            } catch (error) {
                console.error(
                    "❌ Failed adding pending outlet ICE:",
                    error
                );
            }
        }
    }

    // ============================================================
    // LISTENER
    // ============================================================

    setRemoteStreamListener(callback) {
        this.onRemoteStream = callback;
    }

    setConnectionStateListener(callback) {
        this.onConnectionStateChange =
            callback;
    }

    // ============================================================
    // GETTERS
    // ============================================================

    getRemoteStream() {
        return this.remoteStream;
    }

    getPeerConnection() {
        return this.peerConnection;
    }

    getRoomId() {
        return this.roomId;
    }

    // ============================================================
    // CLEANUP
    // ============================================================

    cleanupPeerConnection() {
        try {
            this.stopStatsMonitoring();

            if (this.peerConnection) {
                this.peerConnection
                    .onicecandidate = null;

                this.peerConnection.ontrack =
                    null;

                this.peerConnection
                    .onconnectionstatechange =
                    null;

                this.peerConnection
                    .oniceconnectionstatechange =
                    null;

                this.peerConnection
                    .onicegatheringstatechange =
                    null;

                this.peerConnection
                    .onsignalingstatechange =
                    null;

                this.peerConnection.close();
            }

            if (this.audioElement) {
                this.audioElement.pause();

                this.audioElement.srcObject =
                    null;

                this.audioElement.remove();

                this.audioElement = null;
            }
        } catch (error) {
            console.error(
                "❌ PeerConnection cleanup error:",
                error
            );
        }

        this.peerConnection = null;

        this.remoteStream = null;

        this.hasRemoteDescription = false;
    }

    // ============================================================
    // STOP
    // ============================================================

    async stop() {
        console.log(
            "🛑 STOPPING OUTLET MIC RECEIVER"
        );

        this.cleanupPeerConnection();

        this.pendingRemoteIceCandidates = [];

        this.roomId = null;

        this.outletId = null;

        console.log(
            "✅ Outlet mic receiver stopped"
        );
    }
}

export default new WebRTCOutletMicService();