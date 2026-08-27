import echo from "../websocket/echo";
import petugasService, { getOrCreateDeviceId } from "./petugasService";

// 1-second silent WAV base64 untuk keep-alive background audio di Chrome Android / iOS
const SILENT_AUDIO_URI =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

class PetugasReceiver {
  constructor() {
    this.outlet = null;
    this.token = null;
    this.audioElement = null;
    this.keepAliveAudio = null;
    this.wakeLock = null;
    this.peerConnection = null;
    this.currentBroadcast = null;
    this.currentRoomId = null;
    this.heartbeatTimer = null;
    this.roomChannel = null;
    this.audioContext = null;
    this.analyser = null;
    this.dataArray = null;
    this.currentAudioSource = null;
    this.currentVolume = 0.8;
    this.pendingRemoteIce = [];
    this.readyRetryTimer = null;
    this.remoteStream = null;

    // Callbacks for UI
    this.onBroadcastConnecting = null;
    this.onAudioConnected = null;
    this.onBroadcastEnded = null;
    this.onConnectionState = null;
    this.isListening = false;
  }

  // Menjaga agar browser mobile (Chrome di Android/iOS) tidak mematikan WebRTC audio saat di background / layar mati
  startBackgroundAudioKeepAlive(title = "Siaran Langsung Suka Shawarma") {
    try {
      if (!this.keepAliveAudio) {
        this.keepAliveAudio = new Audio(SILENT_AUDIO_URI);
        this.keepAliveAudio.loop = true;
        this.keepAliveAudio.volume = 0.01;
      }
      this.keepAliveAudio.play().catch(() => {});

      if ("mediaSession" in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: title,
          artist: "Operator Pusat",
          album: "Suka Shawarma Live Radio",
        });
        navigator.mediaSession.playbackState = "playing";
        navigator.mediaSession.setActionHandler("play", () => {
          if (this.audioElement) this.audioElement.play().catch(() => {});
          if (this.keepAliveAudio) this.keepAliveAudio.play().catch(() => {});
        });
      }

      if ("wakeLock" in navigator && !this.wakeLock) {
        navigator.wakeLock
          .request("screen")
          .then((wl) => {
            this.wakeLock = wl;
            console.log("🔒 Screen WakeLock aktif untuk siaran audio");
          })
          .catch(() => {});
      }
    } catch (e) {
      console.warn("Keep-alive background audio error:", e);
    }
  }

  stopBackgroundAudioKeepAlive() {
    if (this.keepAliveAudio) {
      try {
        this.keepAliveAudio.pause();
        this.keepAliveAudio.currentTime = 0;
      } catch (e) {}
    }
    if (this.wakeLock) {
      try {
        this.wakeLock.release();
      } catch (e) {}
      this.wakeLock = null;
    }
    if ("mediaSession" in navigator) {
      try {
        navigator.mediaSession.playbackState = "none";
      } catch (e) {}
    }
  }

  // Update volume
  setVolume(vol) {
    this.currentVolume = vol;
    if (this.audioElement) {
      this.audioElement.volume = vol;
    }
  }

  // Bersihkan pemutaran audio sebelumnya secara total agar tidak terjadi tumpang tindih suara
  cleanupAudioPlayback() {
    if (this.audioElement) {
      try {
        this.audioElement.pause();
        this.audioElement.currentTime = 0;
        this.audioElement.removeAttribute("src");
        this.audioElement.src = "";
        this.audioElement.srcObject = null;
        this.audioElement.onended = null;
      } catch (e) {
        console.warn("Audio element cleanup error:", e);
      }
    }

    if (this.currentAudioSource) {
      try {
        this.currentAudioSource.disconnect();
      } catch (e) {}
      this.currentAudioSource = null;
    }
  }

  // Inisialisasi audio element & audio context
  initAudio(audioEl) {
    this.audioElement = audioEl;
    if (this.audioElement) {
      this.audioElement.muted = false;
      this.audioElement.volume = this.currentVolume;

      // Event listener: HANYA beralih ke live ketika audio benar-benar bersuara/berputar
      this.audioElement.onplaying = () => {
        console.log("🔊 <audio> ONPLAYING: Audio benar-benar bersuara di speaker! -> Beralih ke layar LIVE");
        
        // Daftarkan ke MediaSession browser agar audio tetap berjalan di background / lock screen
        if ("mediaSession" in navigator) {
          try {
            navigator.mediaSession.metadata = new MediaMetadata({
              title: "Siaran Radio Suka Shawarma",
              artist: "Operator Pusat",
              album: "Live Audio Streaming",
            });
            navigator.mediaSession.playbackState = "playing";
            navigator.mediaSession.setActionHandler("play", () => {
              if (this.audioElement) this.audioElement.play().catch(() => {});
            });
          } catch (e) {
            console.warn("MediaSession error:", e);
          }
        }

        if (this.onAudioConnected && this.currentBroadcast) {
          this.onAudioConnected(this.currentBroadcast);
        }
      };

      this.audioElement.onpause = () => {
        if ("mediaSession" in navigator) {
          try {
            navigator.mediaSession.playbackState = "paused";
          } catch (e) {}
        }
      };

      this.audioElement.onerror = (e) => {
        console.warn("⚠️ Audio playback error:", this.audioElement?.error);
      };
    }
    if (!this.audioContext) {
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          this.audioContext = new AudioContextClass();
          this.analyser = this.audioContext.createAnalyser();
          this.analyser.fftSize = 64;
          this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        }
      } catch (err) {
        console.warn("Web Audio API error:", err);
      }
    }
  }

  // Mulai sesi outlet (subscribe WebSocket + Heartbeat)
  async startSession({ outlet, token }) {
    this.outlet = outlet;
    this.token = token;

    // 1. Mulai Heartbeat tiap 15 detik
    this.startHeartbeat();

    // 2. Subscribe ke channel utama 'outlets'
    this.subscribeOutletsChannel();

    // 3. Cek apakah saat ini sedang ada siaran live yang sedang berlangsung
    this.checkActiveBroadcast();
  }

  // Hentikan sesi
  stopSession() {
    this.stopHeartbeat();
    this.clearReadyRetry();
    this.leaveRoomChannel();
    this.closePeerConnection();
    this.cleanupAudioPlayback();
    this.stopBackgroundAudioKeepAlive();

    if (echo && this.isListening) {
      echo.leaveChannel("outlets");
      this.isListening = false;
    }

    this.outlet = null;
    this.token = null;
    this.currentBroadcast = null;
    this.currentRoomId = null;
    this.remoteStream = null;
  }

  // Heartbeat loop
  startHeartbeat() {
    this.stopHeartbeat();
    if (this.token && this.token !== "offline_preview_token") {
      petugasService.sendHeartbeat(this.token);
      this.heartbeatTimer = setInterval(() => {
        if (this.token && this.token !== "offline_preview_token") {
          petugasService.sendHeartbeat(this.token);
        }
      }, 15000);
    }
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // Cek siaran aktif saat app pertama kali dibuka / setelah login
  async checkActiveBroadcast() {
    if (!this.outlet?.id || this.token === "offline_preview_token") return;
    try {
      console.log(`🔍 Memeriksa apakah ada siaran live yang sedang berlangsung untuk outlet ${this.outlet.id}...`);
      const activeRes = await petugasService.getActiveBroadcast(this.outlet.id);
      if (activeRes?.active && activeRes?.data) {
        console.log("📡 Ditemukan siaran aktif dari server! Langsung menghubungkan:", activeRes.data);
        const data = activeRes.data;
        if (data.type === "upload" || data.audio?.url) {
          this.handleAudioBroadcastStarted(data);
        } else {
          this.handleBroadcastStarted(data);
        }
      }
    } catch (e) {
      console.warn("Check active broadcast error:", e);
    }
  }

  // Subscribe ke channel Reverb 'outlets'
  subscribeOutletsChannel() {
    if (!echo) return;
    this.isListening = true;

    const channel = echo.channel("outlets");

    // 1. Live mic broadcast started
    channel.listen(".broadcast.started", (data) => {
      console.log("🎙️ Event broadcast.started diterima:", data);
      this.handleBroadcastStarted(data);
    });
    channel.listen("broadcast.started", (data) => {
      this.handleBroadcastStarted(data);
    });

    // 2. Live mic broadcast ended
    channel.listen(".broadcast.ended", (data) => {
      console.log("🛑 Event broadcast.ended diterima:", data);
      this.handleBroadcastEnded(data);
    });
    channel.listen("broadcast.ended", (data) => {
      this.handleBroadcastEnded(data);
    });

    // 3. Audio file broadcast started
    channel.listen(".audio.broadcast.started", (data) => {
      console.log("🎵 Event audio.broadcast.started diterima:", data);
      this.handleAudioBroadcastStarted(data);
    });
    channel.listen("audio.broadcast.started", (data) => {
      this.handleAudioBroadcastStarted(data);
    });

    // 4. Audio file broadcast ended
    channel.listen(".audio.broadcast.ended", (data) => {
      console.log("🛑 Event audio.broadcast.ended diterima:", data);
      this.handleBroadcastEnded(data);
    });
    channel.listen("audio.broadcast.ended", (data) => {
      this.handleBroadcastEnded(data);
    });
  }

  // Cek apakah outlet ini ditargetkan siaran
  isTargeted(data) {
    if (!this.outlet?.id) return true;
    if (data.target_mode === "all" || !data.outlet_ids || data.outlet_ids.length === 0) {
      return true;
    }
    const myIdStr = String(this.outlet.id);
    return data.outlet_ids.map(String).includes(myIdStr);
  }

  // Handler saat siaran bicara live dimulai
  async handleBroadcastStarted(data) {
    if (!this.isTargeted(data)) {
      console.log("Siaran ini bukan untuk outlet ini");
      return;
    }

    // Bersihkan audio sebelumnya (termasuk file MP3 lama) agar tidak bentrok atau bertumpuk
    this.cleanupAudioPlayback();
    this.closePeerConnection();
    this.clearReadyRetry();

    this.currentBroadcast = data;
    
    // Aktifkan silent keep-alive loop agar Chrome di background / layar mati tidak men-suspend WebRTC
    this.startBackgroundAudioKeepAlive("Siaran Bicara Langsung (Live Mic)");

    // Beritahu UI bahwa sedang menghubungkan audio (tetap di standby dulu sampai audio masuk)
    if (this.onBroadcastConnecting) {
      this.onBroadcastConnecting(data);
    }

    const roomId = data.rtc_room_id;
    if (roomId) {
      await this.joinWebRTCRoom(roomId, data.broadcast_id);
    }
  }

  // Handler saat siaran file audio dimulai
  handleAudioBroadcastStarted(data) {
    if (!this.isTargeted(data)) return;

    // Bersihkan audio & WebRTC sebelumnya agar tidak terjadi dobel audio
    this.cleanupAudioPlayback();
    this.closePeerConnection();
    this.clearReadyRetry();

    this.currentBroadcast = data;

    // Aktifkan keep-alive untuk background playback
    this.startBackgroundAudioKeepAlive(data.audio?.name || "Pemutaran File Audio");

    // Beritahu UI bahwa sedang menghubungkan audio
    if (this.onBroadcastConnecting) {
      this.onBroadcastConnecting(data);
    }

    if (data.audio?.url && this.audioElement) {
      this.audioElement.srcObject = null;
      this.audioElement.src = data.audio.url;
      this.audioElement.volume = this.currentVolume;
      this.audioElement.muted = false;
      this.audioElement.loop = false; // JANGAN looping

      // SINKRONISASI WAKTU PLAY (LATE-JOIN AUDIO SYNC):
      // Jika outlet baru membuka web/telat tersambung saat audio file sudah berjalan di tengah-tengah,
      // lompat langsung ke detik yang sama persis dengan yang sedang diputar di operator/outlet lain.
      if (data.started_at) {
        const startTime = new Date(data.started_at).getTime();
        const elapsedSeconds = Math.max(0, (Date.now() - startTime) / 1000);

        this.audioElement.onloadedmetadata = () => {
          if (elapsedSeconds > 0 && elapsedSeconds < this.audioElement.duration) {
            console.log(`⏩ [Late Join Sync] Audio disinkronkan ke detik ke-${elapsedSeconds.toFixed(1)}s`);
            try {
              this.audioElement.currentTime = elapsedSeconds;
            } catch (e) {
              console.warn("Seek error:", e);
            }
          } else if (this.audioElement.duration && elapsedSeconds >= this.audioElement.duration) {
            console.log("⏹️ [Late Join Sync] Audio sudah selesai diputar sebelumnya.");
            this.handleBroadcastEnded({ room_id: data.rtc_room_id || data.room_id });
            return;
          }
        };
      }

      this.audioElement.onended = () => {
        // Validasi apakah audio benar-benar sudah tuntas atau hanya buffer stall prematur
        if (
          this.audioElement &&
          this.audioElement.duration &&
          this.audioElement.currentTime < this.audioElement.duration - 1.5
        ) {
          console.warn(
            `⚠️ Audio receiver stall/terputus pada detik ${this.audioElement.currentTime.toFixed(1)} / ${this.audioElement.duration.toFixed(1)}s. Melanjutkan pemutaran...`
          );
          this.audioElement.play().catch(() => {});
          return;
        }

        console.log("⏹️ Audio file selesai diputar penuh");
        this.handleBroadcastEnded({ room_id: data.rtc_room_id || data.room_id });
      };

      this.audioElement.onstalled = () => {
        console.warn("⚠️ Audio receiver stream stalled, mencoba resume...");
        this.audioElement?.play().catch(() => {});
      };

      this.audioElement.play().catch((err) => {
        console.warn("Autoplay audio file terblokir (butuh klik user):", err);
      });
    }
  }

  // Handler saat siaran berakhir
  handleBroadcastEnded(data) {
    const endRoomId = data?.rtc_room_id || data?.room_id;
    const endBroadcastId = data?.broadcast_id || data?.id;

    // Jika sedang memutar siaran aktif dan event end membawa room_id / broadcast_id:
    // Pastikan event end ini ditujukan untuk siaran yang SEDANG AKTIF.
    // Jika untuk room/broadcast lama yang sudah lewat, ABAIKAN agar audio saat ini tidak mati tiba-tiba!
    if (this.currentBroadcast && (endRoomId || endBroadcastId)) {
      const currentRoomId = this.currentBroadcast.rtc_room_id || this.currentBroadcast.room_id || this.currentRoomId;
      const currentBcId = this.currentBroadcast.broadcast_id || this.currentBroadcast.id;

      if (endRoomId && currentRoomId && String(endRoomId) !== String(currentRoomId)) {
        console.log(`ℹ️ Event broadcast.ended untuk room lain (${endRoomId} != ${currentRoomId}), abaikan agar audio tidak terputus.`);
        return;
      }
      if (endBroadcastId && currentBcId && String(endBroadcastId) !== String(currentBcId)) {
        console.log(`ℹ️ Event broadcast.ended untuk broadcast lain (${endBroadcastId} != ${currentBcId}), abaikan agar audio tidak terputus.`);
        return;
      }
    }

    console.log("🛑 Siaran saat ini berakhir, kembali ke standby");
    this.cleanupAudioPlayback();
    this.clearReadyRetry();
    this.leaveRoomChannel();
    this.closePeerConnection();
    this.stopBackgroundAudioKeepAlive();

    this.currentBroadcast = null;
    this.currentRoomId = null;
    this.remoteStream = null;

    if (this.onBroadcastEnded) {
      this.onBroadcastEnded(data);
    }
  }

  clearReadyRetry() {
    if (this.readyRetryTimer) {
      clearInterval(this.readyRetryTimer);
      this.readyRetryTimer = null;
    }
  }

  // WebRTC Room Flow
  async joinWebRTCRoom(roomId, broadcastId) {
    if (this.currentRoomId && this.currentRoomId !== roomId) {
      this.leaveRoomChannel();
    }
    this.currentRoomId = roomId;

    this.clearReadyRetry();
    this.closePeerConnection();
    this.pendingRemoteIce = [];

    const outletId = parseInt(this.outlet?.id, 10);
    const myDeviceId = getOrCreateDeviceId();

    // 1. Setup PeerConnection
    await this.setupPeerConnection(roomId, broadcastId);

    // 2. Subscribe ke room channel `broadcast.${roomId}`
    const roomChannelName = `broadcast.${roomId}`;
    this.roomChannel = echo.channel(roomChannelName);

    const onOfferReceived = async (offerData) => {
      console.log("==========================================");
      console.log("📥 WEBRTC OFFER DITERIMA DARI OPERATOR!");
      console.log("Offer data:", offerData);
      console.log("==========================================");

      const targetOutletId = offerData.outlet_id ? parseInt(offerData.outlet_id, 10) : null;
      if (targetOutletId && targetOutletId !== outletId) {
        console.log(`Offer untuk outlet ${targetOutletId}, bukan untuk outlet ${outletId}`);
        return;
      }

      // Filter device_id jika ada pada Offer
      if (offerData.device_id && offerData.device_id !== myDeviceId) {
        console.log(`Offer untuk device lain (${offerData.device_id}), abaikan di device ini (${myDeviceId})`);
        return;
      }

      this.clearReadyRetry();
      await this.handleWebRTCOffer(offerData, roomId, broadcastId);
    };

    const onIceReceived = (iceData) => {
      const targetOutletId = iceData.outlet_id ? parseInt(iceData.outlet_id, 10) : null;
      if (targetOutletId && targetOutletId !== outletId) {
        return;
      }
      if (iceData.device_id && iceData.device_id !== myDeviceId) {
        return;
      }
      console.log("🧊 Menerima Operator ICE:", iceData);
      this.handleOperatorIce(iceData);
    };

    // Listen WebRTC Offer dari Operator (dengan fallback format nama event)
    this.roomChannel.listen(".webrtc.offer", onOfferReceived);
    this.roomChannel.listen("webrtc.offer", onOfferReceived);
    this.roomChannel.listen(".App\\Events\\WebRTCOffer", onOfferReceived);

    // Listen Operator ICE Candidate
    this.roomChannel.listen(".webrtc.operator.ice", onIceReceived);
    this.roomChannel.listen("webrtc.operator.ice", onIceReceived);
    this.roomChannel.listen(".App\\Events\\WebRTCOperatorToOutletIce", onIceReceived);
    this.roomChannel.listen("App\\Events\\WebRTCOperatorToOutletIce", onIceReceived);
    this.roomChannel.listen(".App\\Events\\WebRTCOperatorIceCandidate", onIceReceived);

    // 3. FUNGSI UNTUK KIRIM SINYAL RECEIVER READY
    let hasSentInitialReady = false;
    const sendReadySignal = async () => {
      if (this.peerConnection && this.peerConnection.remoteDescription) {
        this.clearReadyRetry();
        return;
      }
      try {
        console.log(`📤 Mengirim sinyal receiver ready (Room: ${roomId}, Outlet: ${outletId}, Device: ${myDeviceId})...`);
        await petugasService.sendReceiverReady({
          roomId,
          outletId,
          deviceId: myDeviceId,
        });
      } catch (e) {
        console.error("Gagal mengirim receiver ready:", e);
      }
    };

    // 4. Kirim sinyal ready begitu channel tersubscribe
    this.roomChannel.subscribed(async () => {
      if (!hasSentInitialReady) {
        hasSentInitialReady = true;
        console.log(`✅ WebRTC Room Channel ${roomChannelName} subscribed!`);
        await sendReadySignal();
      }
    });

    // Fallback: Kirim sekali jika channel sudah langsung aktif
    if (!hasSentInitialReady) {
      hasSentInitialReady = true;
      sendReadySignal();
    }

    let retryCount = 0;
    this.readyRetryTimer = setInterval(async () => {
      retryCount++;
      if (retryCount > 4 || (this.peerConnection && this.peerConnection.remoteDescription)) {
        this.clearReadyRetry();
        return;
      }
      console.log(`🔄 Retry receiver ready signal ke-${retryCount}...`);
      await sendReadySignal();
    }, 2500);
  }

  async setupPeerConnection(roomId, broadcastId) {
    const iceServers = await petugasService.getIceServers();
    const config = {
      iceServers,
      sdpSemantics: "unified-plan",
    };

    const outletId = parseInt(this.outlet?.id, 10);
    const myDeviceId = getOrCreateDeviceId();

    this.peerConnection = new RTCPeerConnection(config);

    // Track event: audio stream masuk dari Operator
    this.peerConnection.ontrack = (event) => {
      console.log("==========================================");
      console.log("🔊 REMOTE AUDIO TRACK DITERIMA DARI OPERATOR!");
      console.log("Kind:", event.track.kind, "Streams:", event.streams ? event.streams.length : 0);
      console.log("==========================================");

      const stream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([event.track]);
      this.remoteStream = stream;

      // Pastikan audio track diaktifkan
      if (event.track) {
        event.track.enabled = true;
      }

      if (this.audioElement) {
        this.audioElement.pause();
        this.audioElement.removeAttribute("src");
        this.audioElement.src = "";
        this.audioElement.srcObject = this.remoteStream;
        this.audioElement.muted = false;
        this.audioElement.volume = this.currentVolume;

        this.audioElement.play().catch((err) => {
          console.warn("⚠️ Autoplay dicegah browser (butuh klik):", err);
        });
      }

      // Hubungkan ke Web Audio API Analyser HANYA untuk visualizer gelombang suara (TIDAK ke destination agar tidak echo/patah-patah)
      if (this.audioContext && this.analyser) {
        try {
          if (this.audioContext.state === "suspended") {
            this.audioContext.resume().catch(() => {});
          }
          if (this.currentAudioSource) {
            try { this.currentAudioSource.disconnect(); } catch(e){}
          }
          this.currentAudioSource = this.audioContext.createMediaStreamSource(this.remoteStream);
          this.currentAudioSource.connect(this.analyser);
          console.log("📊 Analyser berhasil tersambung ke stream visualizer (bersih tanpa echo)");
        } catch (err) {
          console.warn("Analyser connection error:", err);
        }
      }
    };

    // ICE Candidate dari Petugas dikirim balik ke Operator
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && event.candidate.candidate) {
        console.log("🧊 Mengirim ICE Petugas ke Operator:", event.candidate.candidate);
        petugasService.sendIceCandidate({
          roomId,
          outletId,
          deviceId: myDeviceId,
          candidate: {
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex,
          },
        });
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState;
      console.log(`🔗 WebRTC Connection State: ${state}`);
      if (this.onConnectionState) {
        this.onConnectionState(state);
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      console.log(`🧊 WebRTC ICE Connection State: ${this.peerConnection?.iceConnectionState}`);
    };
  }

  async handleWebRTCOffer(offerData, roomId, broadcastId) {
    if (!this.peerConnection) {
      await this.setupPeerConnection(roomId, broadcastId);
    }

    try {
      const outletId = parseInt(this.outlet?.id, 10);
      const myDeviceId = getOrCreateDeviceId();
      const rawOffer = offerData.offer || offerData;

      if (!rawOffer || !rawOffer.sdp) {
        console.warn("Format Offer tidak valid:", rawOffer);
        return;
      }

      // Normalisasi SDP offer
      let cleanOfferSdp = String(rawOffer.sdp)
        .replace(/\\:/g, ":")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .split("\n")
        .map((line) => line.trimEnd())
        .filter((line) => line.length > 0)
        .join("\r\n") + "\r\n";

      console.log("📄 Setting Remote Description (Offer)...");
      await this.peerConnection.setRemoteDescription(
        new RTCSessionDescription({
          type: rawOffer.type || "offer",
          sdp: cleanOfferSdp,
        })
      );

      // Flush pending ICE candidates dari operator yang datang lebih awal
      if (this.pendingRemoteIce.length > 0) {
        console.log(`🧊 Menerapkan ${this.pendingRemoteIce.length} buffered ICE candidates...`);
        for (const cand of this.pendingRemoteIce) {
          try {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(cand));
          } catch (e) {
            console.warn("Error adding buffered ICE:", e);
          }
        }
        this.pendingRemoteIce = [];
      }

      console.log("📝 Creating WebRTC Answer...");
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      // Normalisasi SDP answer
      let cleanAnswerSdp = String(answer.sdp)
        .replace(/\\:/g, ":")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .split("\n")
        .map((line) => line.trimEnd())
        .filter((line) => line.length > 0)
        .join("\r\n") + "\r\n";

      console.log(`📤 Mengirim WebRTC Answer ke Operator (Room: ${roomId}, Outlet: ${outletId}, Device: ${myDeviceId})...`);
      const res = await petugasService.sendAnswer({
        roomId,
        outletId,
        deviceId: myDeviceId,
        sdp: cleanAnswerSdp,
      });

      console.log("✅ WebRTC Answer berhasil terkirim!", res?.data);
    } catch (err) {
      console.error("❌ Gagal memproses WebRTC Offer:", err);
    }
  }

  async handleOperatorIce(iceData) {
    const cand = iceData.candidate || iceData;
    if (!cand || !cand.candidate) return;

    if (!this.peerConnection || !this.peerConnection.remoteDescription) {
      console.log("⏳ Buffering Operator ICE candidate...");
      this.pendingRemoteIce.push(cand);
      return;
    }

    try {
      await this.peerConnection.addIceCandidate(
        new RTCIceCandidate({
          candidate: cand.candidate,
          sdpMid: cand.sdpMid,
          sdpMLineIndex: cand.sdpMLineIndex,
        })
      );
    } catch (e) {
      console.warn("Gagal add ICE candidate:", e);
    }
  }

  leaveRoomChannel() {
    if (this.currentRoomId) {
      echo.leaveChannel(`broadcast.${this.currentRoomId}`);
      this.currentRoomId = null;
    }
    this.roomChannel = null;
  }

  closePeerConnection() {
    if (this.peerConnection) {
      this.peerConnection.onconnectionstatechange = null;
      this.peerConnection.onicecandidate = null;
      this.peerConnection.oniceconnectionstatechange = null;
      this.peerConnection.ontrack = null;
      this.peerConnection.close();
      this.peerConnection = null;
    }
  }

  // Dapatkan level frekuensi audio realtime (0 - 255) untuk Canvas visualizer
  getAudioFrequencyData() {
    if (this.analyser && this.dataArray) {
      this.analyser.getByteFrequencyData(this.dataArray);
      return this.dataArray;
    }
    return null;
  }
}

export const petugasReceiver = new PetugasReceiver();
export default petugasReceiver;
