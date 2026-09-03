import axios from "axios";
import echo from "../websocket/echo";
import api, { API_BASE_URL } from "./api";

const API_URL = API_BASE_URL;

const DEFAULT_ICE_SERVERS = [
    { urls: "stun:stun.l.google.com:19302" },
];

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
        this.onProgress = null;
    }

    // ============================================================
    // STATE & PROGRESS LISTENERS
    // ============================================================

    setStateListener(callback) {
        this.onStateChange = callback;
    }

    setProgressCallback(callback) {
        this.onProgress = callback;
    }

    getPlaybackProgress() {
        if (!this.monitorAudioElement) {
            return { currentTime: 0, duration: 0, percentage: 0 };
        }
        const currentTime = this.monitorAudioElement.currentTime || 0;
        const duration = this.monitorAudioElement.duration || 0;
        const percentage = duration > 0 ? (currentTime / duration) * 100 : 0;
        return { currentTime, duration, percentage };
    }

    // ============================================================
    // START TAB AUDIO BROADCAST (LIVE CAPTURE — tanpa yt-dlp)
    //
    // Capture audio dari tab browser menggunakan getDisplayMedia,
    // lalu stream langsung ke semua outlet via WebRTC.
    // Tidak perlu download/backend — apapun yang berbunyi di tab
    // (YouTube, Spotify, dll) langsung dikirim ke outlet.
    // ============================================================

    async startTabAudioBroadcast(mediaStream, outlets = [], targetMode = "all") {
        try {
            console.log("====================================");
            console.log("🎙️ START TAB AUDIO BROADCAST (LIVE CAPTURE)");
            console.log("====================================");
            console.log("🏪 Outlets:", outlets);

            // Stop broadcast sebelumnya
            await this.stop({ silent: true });

            this.iceServers = await this.getIceServers();

            const roomId = "audio_live_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
            this.roomId  = roomId;
            this.outlets = outlets;
            this.audioUrl = null;

            // Simpan MediaStream live capture
            this._tabMediaStream = mediaStream;

            if (!outlets.length) throw new Error("Tidak ada outlet yang dipilih");

            // Subscribe WebSocket dulu sebelum announce
            this.subscribeToRoom(roomId);

            // Announce ke backend (notifikasi semua outlet via Reverb + FCM)
            await this.announceBroadcast({
                roomId,
                audioId: null,
                audioName: "Live Capture",
                audioUrl: "",
                outlets,
            });

            // Hubungkan semua outlet paralel menggunakan stream yang sama
            const connectionPromises = outlets.map((outlet) =>
                this._createConnectionForOutletFromStream(outlet, mediaStream)
            );

            Promise.allSettled(connectionPromises).then((results) => {
                const failed = results.filter(r => r.status === "rejected").length;
                console.log(`✅ TAB AUDIO: ${outlets.length - failed}/${outlets.length} outlet berhasil`);
                if (failed > 0) console.warn("⚠️ Outlet gagal:", failed);
            });

            // Deteksi jika tab audio stream berhenti (user stop share)
            mediaStream.getAudioTracks().forEach((track) => {
                track.onended = () => {
                    console.log("🔇 Tab audio stream dihentikan user");
                    this.stop().then(() => {
                        if (this.onStateChange) this.onStateChange("stopped");
                    });
                };
            });

            if (this.onStateChange) this.onStateChange("playing");

            console.log("✅ TAB AUDIO BROADCAST STARTED");
            console.log("====================================");

        } catch (error) {
            console.error("❌ FAILED START TAB AUDIO BROADCAST:", error);
            await this.stop();
            throw error;
        }
    }

    // ============================================================
    // CREATE CONNECTION FOR OUTLET — dari MediaStream langsung
    // (mode live capture, tidak perlu AudioContext dari URL)
    // ============================================================

    async _createConnectionForOutletFromStream(outlet, mediaStream) {
        const outletId = outlet.id;

        try {
            console.log(`🔗 TAB AUDIO connecting outlet ${outletId} (${outlet.name})`);

            // Cleanup koneksi lama
            if (this.peerConnections.has(outletId)) {
                try { this.peerConnections.get(outletId).close(); } catch (e) {}
                this.peerConnections.delete(outletId);
                this.pendingRemoteIce?.delete(outletId);
            }

            const peerConnection = new RTCPeerConnection({
                iceServers: this.iceServers || DEFAULT_ICE_SERVERS,
            });

            this.peerConnections.set(outletId, peerConnection);

            // Tambahkan audio track dari tab langsung
            const tracks = mediaStream.getAudioTracks();
            console.log(`🎵 Adding ${tracks.length} live audio track(s) to outlet ${outletId}`);
            tracks.forEach((track) => peerConnection.addTrack(track, mediaStream));

            // ICE candidate — FIRE AND FORGET (tidak di-await agar tidak blocking)
            peerConnection.onicecandidate = (event) => {
                if (!event.candidate) return;
                // Jangan await — kirim di background, tidak perlu tunggu respons
                api.post("/audio/webrtc/operator-ice", {
                    outlet_id: outletId,
                    room_id:   this.roomId,
                    candidate: {
                        candidate:     event.candidate.candidate,
                        sdpMid:        event.candidate.sdpMid,
                        sdpMLineIndex: event.candidate.sdpMLineIndex,
                    },
                }).catch(() => {}); // silent fail
            };

            // Connection state — logging saja
            peerConnection.onconnectionstatechange = () => {
                const state = peerConnection.connectionState;
                console.log(`🔗 TAB AUDIO outlet ${outletId}: ${state}`);
                if (state === "connected") {
                    console.log(`✅ TAB AUDIO outlet ${outletId} CONNECTED — audio mengalir!`);
                }
            };

            // Buat offer & set local description
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);

            // Kirim offer via api
            await api.post("/audio/webrtc/offer", {
                outlet_id: outletId,
                room_id:   this.roomId,
                offer: {
                    type: peerConnection.localDescription.type,
                    sdp:  peerConnection.localDescription.sdp,
                },
            });

            console.log(`📦 TAB AUDIO Offer sent → outlet ${outletId}`);

            // TIDAK menunggu connected di sini — koneksi selesai di background.
            // waitForConnection di tab mode tidak perlu karena:
            // 1. 20 outlet paralel → menunggu semua akan timeout
            // 2. Outlet yang lambat connect tetap akan terhubung sendiri
            // 3. Tidak ada audio lokal yang perlu sinkronisasi timing

        } catch (error) {
            console.error(`❌ TAB AUDIO gagal outlet ${outletId}:`, error.message);
            throw error;
        }
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

        this.channel.listen(
            ".audio.webrtc.receiver-ready",
            async (data) => {
                const outletId = Number(data.outlet_id);
                console.log(
                    `📡 Outlet ${outletId} melaporkan siap menerima audio stream (receiver-ready / reconnect)...`
                );

                // ── DEBOUNCE: cegah double trigger per outlet ──────────
                if (!this._receiverReadyTimestamps) {
                    this._receiverReadyTimestamps = new Map();
                }
                const lastHandled = this._receiverReadyTimestamps.get(outletId) || 0;
                const now = Date.now();
                if (now - lastHandled < 1000) {
                    console.log(`⏭️ receiver-ready outlet ${outletId} diabaikan (debounce 1s)`);
                    return;
                }
                this._receiverReadyTimestamps.set(outletId, now);
                // ────────────────────────────────────────────────────────

                const isTargeted =
                    !this.outlets ||
                    this.outlets.length === 0 ||
                    this.outlets.some((o) => Number(o.id) === outletId);

                if (!isTargeted) {
                    console.log(`ℹ️ Outlet ${outletId} bukan target audio broadcast saat ini, abaikan.`);
                    return;
                }

                const outlet =
                    this.outlets.find((o) => Number(o.id) === outletId) || {
                        id: outletId,
                        name: `Outlet ${outletId}`,
                    };

                try {
                    // Deteksi mode aktif: tab capture atau URL stream
                    if (this._tabMediaStream && this._tabMediaStream.active) {
                        await this._createConnectionForOutletFromStream(outlet, this._tabMediaStream);
                    } else {
                        await this.createConnectionForOutlet(outlet);
                    }
                } catch (e) {
                    console.error(`❌ Gagal merespon receiver-ready outlet ${outletId}:`, e);
                }
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
        // Pakai instance `api` (bukan axios polos) - endpoint ini
        // sekarang butuh token operator, supaya broadcast audio-file
        // tersimpan ke database (lihat BroadcastService::startAudio),
        // bukan cuma sinyal WebSocket sekali kirim seperti sebelumnya.
        await api.post(
            "/audio/webrtc/audio/broadcast",
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

    // ============================================================
    // GET ICE SERVERS (STUN + TURN)
    //
    // Kredensial TURN time-limited, di-fetch dari backend supaya
    // TURN_SECRET tidak pernah tertanam di bundle JS. Fallback ke
    // STUN saja kalau endpoint gagal, supaya broadcast tetap bisa
    // jalan (walau tanpa TURN) daripada gagal total.
    // ============================================================

    async getIceServers() {
        try {
            const { data } = await api.get(
                "/webrtc/ice-servers",
                { timeout: 4000 }
            );

            return data?.data?.iceServers || DEFAULT_ICE_SERVERS;
        } catch (error) {
            console.warn(
                "⚠️ Gagal ambil ICE servers, fallback ke STUN saja:",
                error
            );

            return DEFAULT_ICE_SERVERS;
        }
    }

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
            // ICE SERVERS (STUN + TURN)
            //
            // Diambil sekali di awal broadcast, dipakai bareng
            // buat semua outlet - kredensial TURN time-limited,
            // jadi tidak di-fetch ulang per outlet.
            // ====================================================

            this.iceServers = await this.getIceServers();

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
            // 1. BUAT SINGLE MASTER AUDIO PIPELINE
            //
            // Hanya 1 AudioContext & 1 AudioElement untuk semua outlet!
            // Menghilangkan duplikasi download 20x dan kehabisan memori.
            // ====================================================

            const audioElement = new Audio(audioUrl);
            audioElement.crossOrigin = "anonymous";
            audioElement.preload = "auto";

            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            const audioContext = new AudioCtx();
            const source = audioContext.createMediaElementSource(audioElement);
            const destination = audioContext.createMediaStreamDestination();
            source.connect(destination);
            source.connect(audioContext.destination); // Operator dengar langsung tanpa monitor ganda

            if (audioContext.state === "suspended") {
                await audioContext.resume();
            }

            this.masterAudioElement = audioElement;
            this.masterAudioContext = audioContext;
            this.masterSourceNode = source;
            this.masterMediaStream = destination.stream;

            this.monitorAudioElement = audioElement;

            audioElement.ontimeupdate = () => {
                if (this.onProgress && this.masterAudioElement) {
                    const currentTime = this.masterAudioElement.currentTime || 0;
                    const duration = this.masterAudioElement.duration || 0;
                    this.onProgress({ currentTime, duration });
                }
            };

            audioElement.onloadedmetadata = () => {
                if (this.onProgress && this.masterAudioElement) {
                    const currentTime = this.masterAudioElement.currentTime || 0;
                    const duration = this.masterAudioElement.duration || 0;
                    this.onProgress({ currentTime, duration });
                }
            };

            audioElement.onended = async () => {
                console.log(
                    "🏁 Audio file selesai diputar penuh. Mengakhiri broadcast..."
                );
                await this.stop({ silent: true, isNaturalEnd: true });
                if (this.onStateChange) {
                    this.onStateChange("ended");
                }
            };

            audioElement.onstalled = () => {
                console.warn("⚠️ Audio stalled, mencoba resume...");
                this.masterAudioElement?.play().catch(() => {});
            };

            // ====================================================
            // 2. MULAI PUTAR AUDIO MASTER SEKETIKA
            //
            // Pembuatan PeerConnection & pengiriman Offer akan dilakukan
            // secara on-demand begitu outlet merespons dengan 'receiver-ready'.
            // Pola ini mencegah banjir 20 request HTTP serentak ke server.
            // ====================================================

            await audioElement.play();

            console.log(
                "▶️ AUDIO BROADCAST PLAYING — siap melayani outlet yang aktif!"
            );

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
                "===================================="
            );

            return;
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
            console.log(`🔗 CONNECTING OUTLET: ${outletId} (${outlet.name})`);

            // Jika outlet ini sudah memiliki koneksi lama di operator, reset untuk membuat koneksi baru
            if (this.peerConnections.has(outletId)) {
                const existingPc = this.peerConnections.get(outletId);
                try {
                    existingPc.close();
                } catch (e) {}
                this.peerConnections.delete(outletId);
                this.pendingRemoteIce?.delete(outletId);
            }

            // Gunakan master audio stream langsung untuk stabilitas maksimal WebRTC
            let streamToSend = this.masterMediaStream;

            const peerConnection = new RTCPeerConnection({
                iceServers: this.iceServers || DEFAULT_ICE_SERVERS,
            });

            this.peerConnections.set(outletId, peerConnection);

            // Tambahkan audio track dari stream yang dikontrol volumenya
            const tracks = streamToSend.getAudioTracks();
            console.log(`🎵 Adding ${tracks.length} audio track(s) to outlet ${outletId}`);
            tracks.forEach((track) => {
                peerConnection.addTrack(track, streamToSend);
            });

            // ICE Candidate — Fire and forget (tidak blocking)
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
                console.log(`🔗 Outlet ${outletId} state: ${state}`);
                if (this.onStateChange) {
                    this.onStateChange({ outletId, state });
                }
            };

            // Buat offer & set local description dengan Opus FEC
            const offer = await peerConnection.createOffer({
                offerToReceiveAudio: false,
                offerToReceiveVideo: false,
            });

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

            // Kirim offer ke server menggunakan instance api (dengan header & token)
            await api.post("/audio/webrtc/offer", {
                outlet_id: outletId,
                room_id: this.roomId,
                offer: {
                    type: peerConnection.localDescription.type,
                    sdp: peerConnection.localDescription.sdp,
                },
            });

            console.log(`✅ Audio OFFER sent → outlet ${outletId}`);

        } catch (error) {
            console.error(`❌ Gagal connect outlet ${outletId}:`, error.message || error);
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

        const isMonitorPlaying =
            this.monitorAudioElement &&
            !this.monitorAudioElement.paused &&
            !this.monitorAudioElement.ended;

        if (
            this.roomId &&
            this.peerConnections.size === 0 &&
            !isMonitorPlaying
        ) {
            console.log(
                "🏁 Semua outlet dan monitor audio telah selesai memutar audio."
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
            await api.post(
                "/audio/webrtc/operator-ice",
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

        // MASTER AUDIO & MONITOR
        if (this.masterAudioElement) {
            try {
                this.masterAudioElement.pause();
                this.masterAudioElement.currentTime = 0;
                this.masterAudioElement.src = "";
            } catch (e) {}
            this.masterAudioElement = null;
        }

        if (this.masterMediaStream) {
            try {
                this.masterMediaStream.getTracks().forEach((t) => t.stop());
            } catch (e) {}
            this.masterMediaStream = null;
        }

        if (this.masterAudioContext) {
            try {
                this.masterAudioContext.close();
            } catch (e) {}
            this.masterAudioContext = null;
        }

        if (this.monitorAudioElement) {
            try {
                this.monitorAudioElement.pause();
                this.monitorAudioElement.currentTime = 0;
            } catch (error) {
                console.error(error);
            }
            this.monitorAudioElement.onended = null;
            this.monitorAudioElement = null;
        }

        // TAB MEDIA STREAM (mode live capture)

        if (this._tabMediaStream) {
            try {
                this._tabMediaStream.getTracks().forEach((t) => t.stop());
            } catch (e) {}
            this._tabMediaStream = null;
        }

        // Reset debounce timestamps
        if (this._receiverReadyTimestamps) {
            this._receiverReadyTimestamps.clear();
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
                await api.post(
                    "/audio/webrtc/audio/broadcast/end",
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
                        gainNode.gain.setValueAtTime(vol, this.masterAudioContext?.currentTime || 0);
                    } catch (e) {}
                });
            }
            console.log(`🔊 Master volume WebRTC diubah ke ${vol * 100}%`);
            return;
        }

        const id = Number(outletId);
        this.outletVolumes.set(id, vol);
        const gainNode = this.outletGainNodes?.get(id);
        if (gainNode) {
            try {
                gainNode.gain.setValueAtTime(vol, this.masterAudioContext?.currentTime || 0);
                console.log(`🔊 WebRTC Gain outlet ${id} diubah ke ${vol * 100}%`);
            } catch (e) {}
        }
    }
}

export default new WebRTCAudioService();
