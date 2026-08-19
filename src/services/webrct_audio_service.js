import axios from "axios";
import echo from "../websocket/echo";

const API_URL = "https://api-radio.sukashawarma.com/api";

class WebRTCAudioService {
    constructor() {
        // ========================================================
        // ROOM
        // ========================================================

        this.roomId = null;
        this.audioUrl = null;

        // ========================================================
        // MONITOR AUDIO
        //
        // Audio yang didengar operator sendiri di browser. Terpisah
        // dari audio yang dikirim ke tiap outlet (lihat outletAudio
        // di bawah), supaya operator cuma dengar 1 salinan, bukan
        // ikut numpuk kalau ada banyak outlet.
        // ========================================================

        this.monitorAudioElement = null;

        // ========================================================
        // PEER CONNECTION & AUDIO PER OUTLET
        //
        // Satu outlet = satu PeerConnection + satu audio pipeline
        // (Audio element + AudioContext) miliknya sendiri. Ini
        // sengaja dipisah per-outlet (bukan satu MediaStream yang
        // dibagi ke semua) supaya outlet yang connect belakangan
        // (jaringan lambat) tetap bisa mulai dengar dari 0:00,
        // bukan ikut nempel ke posisi outlet yang sudah duluan.
        //
        // peerConnections: { outletId: RTCPeerConnection }
        // outletAudio:     { outletId: { audioElement, audioContext } }
        // ========================================================

        this.peerConnections = new Map();
        this.outletAudio = new Map();

        // ========================================================
        // ICE YANG BELUM BISA DITAMBAHKAN (remote description
        // outlet itu belum di-set) - per outlet. Tanpa ini, ICE
        // candidate dari outlet yang datang sebelum ANSWER-nya
        // (race yang normal terjadi) langsung GAGAL/HILANG
        // (addIceCandidate menolak kalau remote description masih
        // null), bukan cuma telat.
        //
        // { outletId: RTCIceCandidateInit[] }
        // ========================================================

        this.pendingRemoteIce = new Map();

        // ========================================================
        // WEBSOCKET CHANNEL
        // ========================================================

        this.channel = null;

        // ========================================================
        // OUTLETS
        // ========================================================

        this.outlets = [];

        // ========================================================
        // CALLBACK
        // ========================================================

        this.onStateChange = null;
    }

    // ============================================================
    // STATE LISTENER
    // ============================================================

    setStateListener(callback) {
        this.onStateChange = callback;
    }

    // ============================================================
    // SUBSCRIBE WEBSOCKET CHANNEL
    //
    // Channel ini dipakai backend untuk mem-broadcast
    // balasan (answer + ICE) dari outlet (Flutter):
    //
    // - audio.webrtc.answer
    // - audio.webrtc.ice
    //
    // Lihat: App\Events\audio\AudioWebRTCAnswer
    //        App\Events\audio\AudioWebRTCIceCandidate
    // ============================================================

    subscribeToRoom(roomId) {
        const channelName = `audio.${roomId}`;

        this.channel = echo.channel(channelName);

        this.channel.listen(
            ".audio.webrtc.answer",
            (data) => {
                console.log(
                    "📥 AUDIO WEBRTC ANSWER:",
                    data
                );

                this.handleAnswer(
                    data.outlet_id,
                    data.answer
                );
            }
        );

        this.channel.listen(
            ".audio.webrtc.ice",
            (data) => {
                console.log(
                    "🧊 AUDIO WEBRTC ICE ← outlet:",
                    data
                );

                this.handleIceCandidate(
                    data.outlet_id,
                    data.candidate
                );
            }
        );

        console.log(
            "📡 Subscribed to channel:",
            channelName
        );
    }

    // ============================================================
    // ANNOUNCE BROADCAST KE SEMUA OUTLET
    //
    // WAJIB sebelum kirim offer, supaya outlet (Flutter)
    // tahu room_id mana yang harus di-subscribe.
    //
    // Backend: App\Events\AudioBroadcastStarted
    // Event: audio.broadcast.started
    // Channel: outlets
    // ============================================================

    async announceBroadcast({
        roomId,
        audioId,
        audioName,
        audioUrl,
        outlets = [],
    }) {
        await axios.post(
            `${API_URL}/audio/webrtc/audio/broadcast`,
            {
                room_id: roomId,

                audio_id: audioId,

                audio: {
                    name: audioName,
                    url: audioUrl,
                },

                // Outlet yang benar-benar jadi target broadcast
                // ini, supaya outlet lain yang bukan target
                // tidak ikut pindah ke halaman broadcast.
                outlet_ids: outlets.map(
                    (outlet) => outlet.id
                ),
            }
        );

        console.log(
            "📣 Audio broadcast diumumkan ke outlets:",
            roomId
        );
    }

    // ============================================================
    // UNSUBSCRIBE WEBSOCKET CHANNEL
    // ============================================================

    unsubscribeFromRoom() {
        if (!this.roomId) {
            return;
        }

        const channelName =
            `audio.${this.roomId}`;

        echo.leave(channelName);

        this.channel = null;

        console.log(
            "📡 Unsubscribed from channel:",
            channelName
        );
    }

    // ============================================================
    // START AUDIO BROADCAST
    //
    // Semua outlet di-connect PARALEL, dan masing-masing langsung
    // play() begitu dia sendiri connected - tidak menunggu outlet
    // lain. start() sendiri selesai (resolve) begitu outlet
    // PERTAMA berhasil, supaya UI operator tidak tertahan menunggu
    // outlet yang jaringannya lambat/bermasalah. Outlet yang
    // menyusul tetap diproses di background dan mulai dari 0:00
    // begitu mereka connect.
    // ============================================================

    async start({
        audioUrl,
        roomId,
        outlets = [],
        audioId,
        audioName,
    }) {
        try {
            console.log("====================================");
            console.log("🔊 START AUDIO BROADCAST");
            console.log("====================================");

            console.log("🎵 Audio URL:", audioUrl);
            console.log("🏠 Room ID:", roomId);
            console.log("🏪 Outlets:", outlets);

            // ====================================================
            // STOP BROADCAST SEBELUMNYA
            //
            // silent: true supaya tidak memicu onStateChange
            // ("stopped"), karena itu akan langsung menimpa
            // balik state "loading/connecting" yang baru saja
            // di-set oleh pemanggil (race condition).
            // ====================================================

            await this.stop({ silent: true });

            // ====================================================
            // SET DATA
            // ====================================================

            this.roomId = roomId;
            this.outlets = outlets;
            this.audioUrl = audioUrl;

            // ====================================================
            // VALIDATION
            // ====================================================

            if (!audioUrl) {
                throw new Error("Audio URL tidak tersedia");
            }

            if (!roomId) {
                throw new Error("Room ID tidak tersedia");
            }

            if (!outlets.length) {
                throw new Error("Tidak ada outlet yang dipilih");
            }

            // ====================================================
            // SUBSCRIBE WEBSOCKET CHANNEL
            //
            // WAJIB sebelum kirim offer, supaya answer/ICE
            // dari outlet (Flutter) tidak terlewat.
            // ====================================================

            this.subscribeToRoom(roomId);

            // ====================================================
            // ANNOUNCE BROADCAST KE OUTLETS
            //
            // WAJIB sebelum kirim offer, supaya outlet
            // (Flutter) tahu room_id mana yang harus
            // di-subscribe sebelum offer dikirim.
            // ====================================================

            await this.announceBroadcast({
                roomId,
                audioId,
                audioName,
                audioUrl,
                outlets,
            });

            // ====================================================
            // MONITOR AUDIO (operator dengar lokal)
            //
            // Dimainkan begitu outlet PERTAMA connect, supaya
            // kira-kira sinkron dengan "jam master" broadcast.
            // ====================================================

            this.monitorAudioElement = new Audio(audioUrl);

            this.monitorAudioElement.crossOrigin = "anonymous";
            this.monitorAudioElement.preload = "auto";

            console.log(
                "⏳ Menghubungkan semua outlet secara paralel..."
            );

            // ====================================================
            // CONNECT SEMUA OUTLET SEKALIGUS (PARALEL)
            //
            // Tiap outlet independen: begitu dia sendiri connect,
            // dia langsung play() dari 0:00, tanpa menunggu outlet
            // lain selesai/gagal.
            // ====================================================

            const connectionPromises = outlets.map(
                (outlet) =>
                    this.createConnectionForOutlet(outlet)
            );

            // ====================================================
            // LACAK PENYELESAIAN DI BACKGROUND
            //
            // Tidak menahan start() - cuma untuk logging berapa
            // outlet yang akhirnya berhasil/gagal.
            // ====================================================

            Promise.allSettled(connectionPromises).then(
                (results) => {

                    const failedCount = results.filter(
                        (result) =>
                            result.status === "rejected"
                    ).length;

                    console.log(
                        "===================================="
                    );

                    console.log(
                        "✅ SEMUA OUTLET SELESAI DIPROSES:",
                        outlets.length - failedCount,
                        "/",
                        outlets.length,
                        "berhasil"
                    );

                    console.log(
                        "===================================="
                    );

                    if (failedCount > 0) {

                        const failedIds = outlets
                            .filter(
                                (_, index) =>
                                    results[index].status ===
                                    "rejected"
                            )
                            .map(
                                (outlet) => outlet.id
                            );

                        console.warn(
                            "⚠️ Outlet gagal terhubung:",
                            failedIds
                        );
                    }
                }
            );

            // ====================================================
            // JANGAN GAGALKAN SELURUH BROADCAST HANYA KARENA
            // WEBRTC GAGAL/TIMEOUT.
            //
            // announceBroadcast() di atas sudah mengirim event +
            // push notification (FCM) ke SEMUA outlet, termasuk
            // yang sedang background/terminated - outlet itu akan
            // menerima & memutar audio lewat jalur push, BUKAN
            // lewat WebRTC live ini. Jadi outlet gagal connect
            // WebRTC (mis. karena app-nya sedang di-kill) itu
            // NORMAL, bukan kegagalan total broadcast. WebRTC
            // cuma dipakai untuk outlet yang app-nya sedang
            // terbuka (real-time low-latency).
            // ====================================================

            // ====================================================
            // MULAI MONITOR AUDIO OPERATOR
            // ====================================================

            await this.monitorAudioElement.play();

            console.log(
                "▶️ AUDIO BROADCAST PLAYING (operator monitor)"
            );

            // ====================================================
            // STATE
            // ====================================================

            if (this.onStateChange) {
                this.onStateChange("playing");
            }

            console.log(
                "===================================="
            );

            console.log(
                "✅ AUDIO BROADCAST STARTED"
            );

            console.log(
                "====================================");

        } catch (error) {

            console.error(
                "❌ FAILED START AUDIO BROADCAST:",
                error
            );

            await this.stop();

            throw error;
        }
    }

    waitForConnection(
        outletId,
        // 15 detik kadang kepotong duluan untuk outlet yang
        // ICE negotiation-nya lebih lambat (mis. lewat Tailscale/
        // NAT), padahal koneksinya sebenarnya tetap berhasil kalau
        // dikasih waktu lebih. Dinaikkan ke 30 detik. Karena tiap
        // outlet sekarang independen, ini tidak lagi menahan
        // outlet lain / audio yang sudah playing.
        timeout = 30000
    ) {
        return new Promise((resolve, reject) => {

            const peerConnection =
                this.peerConnections.get(
                    outletId
                );

            if (!peerConnection) {
                reject(
                    new Error(
                        `PeerConnection outlet ${outletId} tidak ditemukan`
                    )
                );

                return;
            }

            // ====================================================
            // SUDAH CONNECTED
            // ====================================================

            if (
                peerConnection.connectionState ===
                "connected"
            ) {

                resolve();

                return;
            }

            // ====================================================
            // TIMEOUT
            // ====================================================

            const timer =
                setTimeout(() => {

                    cleanup();

                    reject(
                        new Error(
                            `Timeout koneksi WebRTC outlet ${outletId}`
                        )
                    );

                }, timeout);

            // ====================================================
            // CHECK CONNECTION
            // ====================================================

            const checkConnection = () => {

                const state =
                    peerConnection.connectionState;

                console.log(
                    `🔗 Waiting outlet ${outletId}:`,
                    state
                );

                if (state === "connected") {

                    cleanup();

                    resolve();

                    return;
                }

                if (
                    state === "failed" ||
                    state === "closed"
                ) {

                    cleanup();

                    reject(
                        new Error(
                            `WebRTC outlet ${outletId} ${state}`
                        )
                    );
                }
            };

            // ====================================================
            // CLEANUP
            // ====================================================

            const cleanup = () => {

                clearTimeout(timer);

                peerConnection
                    .removeEventListener(
                        "connectionstatechange",
                        checkConnection
                    );
            };

            peerConnection.addEventListener(
                "connectionstatechange",
                checkConnection
            );

        });
    }

    // ============================================================
    // CREATE CONNECTION FOR OUTLET
    //
    // Bikin audio pipeline (decode audioUrl) MILIK outlet ini
    // sendiri + PeerConnection sendiri. Begitu connect, langsung
    // play() dari 0:00 - tidak peduli outlet lain sudah sampai
    // mana.
    // ============================================================

    async createConnectionForOutlet(outlet) {
        const outletId = outlet.id;

        try {
            console.log("====================================");
            console.log(
                "🔗 CONNECTING OUTLET:",
                outletId
            );
            console.log(
                "🏪 Outlet:",
                outlet.name
            );
            console.log("====================================");

            // ====================================================
            // AUDIO PIPELINE MILIK OUTLET INI
            // ====================================================

            const audioElement = new Audio(this.audioUrl);

            audioElement.crossOrigin = "anonymous";
            audioElement.preload = "auto";

            const audioContext = new AudioContext();

            const source =
                audioContext.createMediaElementSource(
                    audioElement
                );

            const destination =
                audioContext.createMediaStreamDestination();

            source.connect(destination);

            if (audioContext.state === "suspended") {
                await audioContext.resume();
            }

            const mediaStream = destination.stream;

            this.outletAudio.set(
                outletId,
                { audioElement, audioContext }
            );

            // ====================================================
            // CREATE PEER CONNECTION
            // ====================================================

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

            // ====================================================
            // ADD AUDIO TRACK
            // ====================================================

            const tracks =
                mediaStream.getTracks();

            console.log(
                `🎵 Adding ${tracks.length} audio track(s) to outlet ${outletId}`
            );

            tracks.forEach((track) => {
                peerConnection.addTrack(
                    track,
                    mediaStream
                );
            });

            // ====================================================
            // ICE CANDIDATE
            // ====================================================

            peerConnection.onicecandidate =
                async (event) => {
                    try {
                        if (!event.candidate) {
                            console.log(
                                `🧊 ICE gathering completed: outlet ${outletId}`
                            );

                            return;
                        }

                        console.log(
                            `🧊 Local ICE: outlet ${outletId}`
                        );

                        await this.sendIceCandidate(
                            outletId,
                            event.candidate
                        );

                    } catch (error) {
                        console.error(
                            "❌ Failed sending ICE:",
                            error
                        );
                    }
                };

            // ====================================================
            // CONNECTION STATE
            //
            // hasConnectedOnce dipakai supaya kita bisa bedakan
            // "gagal connect di awal" (sudah ditangani lewat
            // catch block di bawah) dengan "putus di tengah
            // jalan" (baru bisa dideteksi setelah pernah
            // connected). Untuk kasus kedua, langsung anggap
            // outlet ini selesai - jangan tunggu audio lokalnya
            // (yang sudah tidak nyampe ke outlet) habis sendiri.
            // ====================================================

            let hasConnectedOnce = false;

            peerConnection
                .onconnectionstatechange =
                () => {
                    const state =
                        peerConnection
                            .connectionState;

                    console.log(
                        `🔗 Outlet ${outletId} state:`,
                        state
                    );

                    if (this.onStateChange) {
                        this.onStateChange({
                            outletId,
                            state,
                        });
                    }

                    if (
                        hasConnectedOnce &&
                        (
                            state === "failed" ||
                            state === "closed"
                        )
                    ) {
                        console.warn(
                            `⚠️ Outlet ${outletId} terputus di tengah broadcast`
                        );

                        this.finishOutlet(
                            outletId
                        );
                    }
                };

            // ====================================================
            // ICE CONNECTION STATE
            // ====================================================

            peerConnection
                .oniceconnectionstatechange =
                () => {
                    console.log(
                        `🧊 Outlet ${outletId} ICE:`,
                        peerConnection
                            .iceConnectionState
                    );
                };

            // ====================================================
            // CREATE OFFER
            // ====================================================

            const offer =
                await peerConnection.createOffer({
                    offerToReceiveAudio: false,
                    offerToReceiveVideo: false,
                });

            console.log(
                `📦 Offer created for outlet ${outletId}`
            );

            // ====================================================
            // SET LOCAL DESCRIPTION
            // ====================================================

            await peerConnection
                .setLocalDescription(
                    offer
                );

            // ====================================================
            // SEND OFFER
            // ====================================================

            await axios.post(
                `${API_URL}/audio/webrtc/offer`,
                {
                    outlet_id: outletId,

                    room_id: this.roomId,

                    offer: {
                        type:
                            peerConnection
                                .localDescription
                                .type,

                        sdp:
                            peerConnection
                                .localDescription
                                .sdp,
                    },
                }
            );

            console.log(
                `✅ Audio OFFER sent → outlet ${outletId}`
            );

            // ====================================================
            // WAIT WEBRTC CONNECTION
            // ====================================================

            console.log(
                `⏳ Waiting WebRTC connection → outlet ${outletId}`
            );

            await this.waitForConnection(
                outletId
            );

            hasConnectedOnce = true;

            // ====================================================
            // CONNECTED → PLAY DARI 0:00
            //
            // Terlepas dari sudah berapa lama outlet lain playing,
            // outlet ini SELALU mulai dari awal track.
            // ====================================================

            await audioElement.play();

            console.log(
                `▶️ Outlet ${outletId} mulai dengar audio dari 0:00`
            );

            audioElement.onended = () => {

                console.log(
                    `⏹️ Outlet ${outletId} selesai memutar audio`
                );

                this.finishOutlet(outletId);
            };

        } catch (error) {
            console.error(
                `❌ Failed connection outlet ${outletId}:`,
                error.response?.data ||
                error
            );

            await this.finishOutlet(outletId);

            throw error;
        }
    }

    // ============================================================
    // FINISH OUTLET
    //
    // Dipanggil saat audio outlet ini selesai diputar (natural)
    // ATAU saat koneksinya gagal. Cuma bersihkan resource outlet
    // ini - outlet lain yang masih berjalan tidak terganggu.
    //
    // Kalau ini outlet TERAKHIR yang tersisa, seluruh broadcast
    // dianggap tuntas: beritahu backend (audio.broadcast.ended)
    // dan UI operator.
    // ============================================================

    async finishOutlet(outletId) {
        this.pendingRemoteIce.delete(outletId);

        const peerConnection =
            this.peerConnections.get(outletId);

        if (peerConnection) {
            try {
                peerConnection.onicecandidate =
                    null;

                peerConnection.onconnectionstatechange =
                    null;

                peerConnection.oniceconnectionstatechange =
                    null;

                peerConnection.close();

            } catch (error) {
                console.error(error);
            }

            this.peerConnections.delete(outletId);
        }

        const audio =
            this.outletAudio.get(outletId);

        if (audio) {
            try {
                audio.audioElement.pause();

                audio.audioElement.onended =
                    null;
            } catch (error) {
                console.error(error);
            }

            try {
                await audio.audioContext.close();
            } catch (error) {
                console.error(error);
            }

            this.outletAudio.delete(outletId);
        }

        // ========================================================
        // SEMUA OUTLET SUDAH SELESAI/BERHENTI
        // ========================================================

        if (this.roomId && this.peerConnections.size === 0) {

            console.log(
                "🏁 Semua outlet sudah selesai memutar audio."
            );

            await this.stop({ silent: true, isNaturalEnd: true });

            if (this.onStateChange) {
                this.onStateChange("ended");
            }
        }
    }

    // ============================================================
    // SEND ICE
    // ============================================================

    async sendIceCandidate(
        outletId,
        candidate
    ) {
        try {
            await axios.post(
                `${API_URL}/audio/webrtc/operator-ice`,
                {
                    outlet_id: outletId,

                    room_id: this.roomId,

                    candidate: {
                        candidate:
                            candidate.candidate,

                        sdpMid:
                            candidate.sdpMid,

                        sdpMLineIndex:
                            candidate.sdpMLineIndex,
                    },
                }
            );

            console.log(
                `🧊 Audio ICE sent → outlet ${outletId}`
            );

        } catch (error) {
            console.error(
                `❌ Failed sending audio ICE → outlet ${outletId}:`,
                error.response?.data ||
                error
            );
        }
    }

    // ============================================================
    // HANDLE ANSWER FROM OUTLET
    // ============================================================

    async handleAnswer(
        outletId,
        answer
    ) {
        try {
            const peerConnection =
                this.peerConnections.get(
                    outletId
                );

            if (!peerConnection) {
                console.warn(
                    "⚠️ PeerConnection tidak ditemukan:",
                    outletId
                );

                return;
            }

            if (!answer) {
                console.warn(
                    "⚠️ Answer kosong:",
                    outletId
                );

                return;
            }

            console.log(
                `📥 Audio ANSWER received ← outlet ${outletId}`
            );

            // ====================================================
            // SDP NORMALIZATION
            //
            // SDP yang lewat Reverb kadang bawa literal "\:" dan
            // line-ending yang tidak konsisten (lihat webrtc.js
            // handleAnswer). Tanpa ini, setRemoteDescription bisa
            // ditolak browser.
            // ====================================================

            let cleanSdp =
                String(answer.sdp);

            cleanSdp =
                cleanSdp.replace(
                    /\\:/g,
                    ":"
                );

            cleanSdp =
                cleanSdp
                    .replace(
                        /\r\n/g,
                        "\n"
                    )
                    .replace(
                        /\r/g,
                        "\n"
                    )
                    .split("\n")
                    .map(
                        (line) =>
                            line.trimEnd()
                    )
                    .filter(
                        (line) =>
                            line.length > 0
                    )
                    .join("\r\n") +
                "\r\n";

            await peerConnection
                .setRemoteDescription(
                    new RTCSessionDescription({
                        type:
                            answer.type,

                        sdp:
                            cleanSdp,
                    })
                );

            console.log(
                `✅ Remote description set → outlet ${outletId}`
            );

            // ====================================================
            // FLUSH ICE YANG SEMPAT TERTAHAN
            // ====================================================

            const pending =
                this.pendingRemoteIce.get(outletId);

            if (pending && pending.length) {
                console.log(
                    `🧊 FLUSHING ${pending.length} PENDING ICE → outlet ${outletId}`
                );

                for (const candidate of pending) {
                    try {
                        await peerConnection.addIceCandidate(
                            new RTCIceCandidate(candidate)
                        );
                    } catch (error) {
                        console.error(
                            `❌ Failed flush pending ICE → outlet ${outletId}:`,
                            error
                        );
                    }
                }

                this.pendingRemoteIce.delete(outletId);
            }

        } catch (error) {
            console.error(
                `❌ Failed handle audio answer → outlet ${outletId}:`,
                error
            );
        }
    }

    // ============================================================
    // HANDLE REMOTE ICE
    // ============================================================

    async handleIceCandidate(
        outletId,
        candidate
    ) {
        try {
            const peerConnection =
                this.peerConnections.get(
                    outletId
                );

            if (!peerConnection) {
                console.warn(
                    "⚠️ PeerConnection tidak ditemukan:",
                    outletId
                );

                return;
            }

            if (!candidate) {
                console.warn(
                    "⚠️ Remote ICE kosong:",
                    outletId
                );

                return;
            }

            console.log(
                `📥 Remote ICE received ← outlet ${outletId}`
            );

            // ====================================================
            // ANSWER BELUM DIPROSES - TAHAN DULU
            //
            // Ini race yang NORMAL (bukan error) - outlet kadang
            // mengirim ICE lebih cepat dari ANSWER-nya sendiri
            // nyampe & diproses di sini. addIceCandidate akan
            // ditolak browser kalau dipaksa sekarang, jadi antre
            // dulu - nanti di-flush begitu handleAnswer() selesai
            // set remote description.
            // ====================================================

            if (!peerConnection.remoteDescription) {
                console.log(
                    `⏳ Remote description belum ada → outlet ${outletId}, ICE diantre`
                );

                const queue =
                    this.pendingRemoteIce.get(outletId) || [];

                queue.push(candidate);

                this.pendingRemoteIce.set(outletId, queue);

                return;
            }

            await peerConnection
                .addIceCandidate(
                    new RTCIceCandidate({
                        candidate:
                            candidate.candidate,

                        sdpMid:
                            candidate.sdpMid,

                        sdpMLineIndex:
                            candidate.sdpMLineIndex,
                    })
                );

            console.log(
                `✅ Remote ICE added → outlet ${outletId}`
            );

        } catch (error) {
            console.error(
                `❌ Failed add remote ICE → outlet ${outletId}:`,
                error
            );
        }
    }

    // ============================================================
    // PAUSE / RESUME
    //
    // Catatan: tiap outlet punya audio element sendiri-sendiri,
    // jadi pause/resume di sini cuma mempengaruhi monitor lokal
    // operator, bukan audio yang sedang diputar di outlet.
    // ============================================================

    pause() {
        if (!this.monitorAudioElement) {
            return;
        }

        this.monitorAudioElement.pause();

        console.log(
            "⏸️ Monitor audio paused"
        );

        if (this.onStateChange) {
            this.onStateChange(
                "paused"
            );
        }
    }

    async resume() {
        if (!this.monitorAudioElement) {
            return;
        }

        await this.monitorAudioElement.play();

        console.log(
            "▶️ Monitor audio resumed"
        );

        if (this.onStateChange) {
            this.onStateChange(
                "playing"
            );
        }
    }

    // ============================================================
    // STOP
    //
    // Hentikan SEMUANYA: monitor lokal + semua outlet, terlepas
    // dari posisi playback masing-masing.
    // ============================================================

    async stop({ silent = false, isNaturalEnd = false } = {}) {
        console.log(
            "🛑 STOP AUDIO BROADCAST"
        );

        // ========================================================
        // HENTIKAN DULU SEMUANYA SECARA LOKAL (INSTAN)
        //
        // PENTING: ini HARUS jadi hal pertama yang dilakukan.
        // Sebelumnya, POST "broadcast ended" ke backend dijalankan
        // duluan dan di-await - kalau network sedang lambat, audio
        // tetap mengalir ke semua outlet selama request itu belum
        // selesai. Menutup PeerConnection di sini langsung memutus
        // aliran RTP ke outlet SAAT INI JUGA, tidak perlu menunggu
        // jaringan sama sekali.
        // ========================================================

        // MONITOR AUDIO

        if (this.monitorAudioElement) {
            try {
                this.monitorAudioElement.pause();

                this.monitorAudioElement.currentTime =
                    0;
            } catch (error) {
                console.error(error);
            }

            this.monitorAudioElement.onended =
                null;

            this.monitorAudioElement = null;
        }

        // SEMUA PEER CONNECTION

        for (
            const [
                outletId,
                peerConnection,
            ] of this.peerConnections
        ) {
            console.log(
                "🛑 Closing outlet connection:",
                outletId
            );

            try {
                peerConnection.onicecandidate =
                    null;

                peerConnection.onconnectionstatechange =
                    null;

                peerConnection.oniceconnectionstatechange =
                    null;

                peerConnection.close();

            } catch (error) {
                console.error(
                    error
                );
            }
        }

        this.peerConnections.clear();
        this.pendingRemoteIce.clear();

        // SEMUA AUDIO ELEMENT OUTLET (pause dulu, AudioContext.close()
        // yang lebih lambat menyusul di bawah)

        for (
            const [
                ,
                audio,
            ] of this.outletAudio
        ) {
            try {
                audio.audioElement.pause();

                audio.audioElement.onended =
                    null;
            } catch (error) {
                console.error(
                    error
                );
            }
        }

        // ========================================================
        // BERITAHU BACKEND BAHWA BROADCAST SUDAH BERAKHIR
        //
        // Boleh belakangan/lambat - audio di outlet sudah berhenti
        // sejak PeerConnection ditutup di atas. Ini cuma trigger
        // event audio.broadcast.ended (untuk navigasi UI Flutter),
        // tidak untuk menentukan kapan audio-nya berhenti.
        //
        // isNaturalEnd: true kalau ini "selesai" karena SEMUA
        // outlet WebRTC sudah tuntas memutar sendiri-sendiri
        // (finishOutlet), BUKAN karena operator klik stop manual.
        // Outlet yang sedang background/terminated (jalur FCM,
        // tidak tercatat di peerConnections sama sekali) mungkin
        // baru mulai/masih di tengah lagu saat ini terjadi - jadi
        // push FCM "ended" TIDAK dikirim untuk kasus natural,
        // supaya outlet itu tetap bisa memutar sampai tuntas versi
        // dia sendiri (job_audio player-nya sendiri yang berhenti
        // begitu file-nya selesai). Push FCM "ended" cuma dikirim
        // kalau operator benar-benar menekan stop.
        // ========================================================

        if (this.roomId) {
            try {
                await axios.post(
                    `${API_URL}/audio/webrtc/audio/broadcast/end`,
                    {
                        room_id: this.roomId,
                        outlet_ids: (this.outlets || []).map(
                            (outlet) => outlet.id
                        ),
                        natural: isNaturalEnd,
                    }
                );

                console.log(
                    "📣 Audio broadcast ended diumumkan:",
                    this.roomId
                );
            } catch (error) {
                console.error(
                    "❌ Failed announcing audio broadcast ended:",
                    error
                );
            }
        }

        // ========================================================
        // CLOSE SEMUA AUDIO CONTEXT OUTLET (cleanup, tidak time-
        // critical - audio-nya sendiri sudah di-pause di atas)
        // ========================================================

        for (
            const [
                ,
                audio,
            ] of this.outletAudio
        ) {
            try {
                await audio.audioContext.close();
            } catch (error) {
                console.error(
                    error
                );
            }
        }

        this.outletAudio.clear();

        // ========================================================
        // UNSUBSCRIBE WEBSOCKET CHANNEL
        // ========================================================

        this.unsubscribeFromRoom();

        // ========================================================
        // RESET
        // ========================================================

        this.roomId = null;
        this.outlets = [];
        this.audioUrl = null;

        if (!silent && this.onStateChange) {
            this.onStateChange(
                "stopped"
            );
        }
    }
}

export default new WebRTCAudioService();
