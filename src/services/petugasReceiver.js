import echo from "../websocket/echo";
import petugasService from "./petugasService";

class PetugasReceiver {
  constructor() {
    this.outlet = null;
    this.token = null;
    this.audioElement = null;
    this.peerConnection = null;
    this.currentBroadcast = null;
    this.heartbeatTimer = null;
    this.roomChannel = null;
    this.audioContext = null;
    this.analyser = null;
    this.dataArray = null;
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

  // Inisialisasi audio element & audio context
  initAudio(audioEl) {
    this.audioElement = audioEl;
    if (this.audioElement) {
      this.audioElement.muted = false;
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

    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.src = "";
      this.audioElement.srcObject = null;
    }

    if (echo && this.isListening) {
      echo.leaveChannel("outlets");
      this.isListening = false;
    }

    this.outlet = null;
    this.token = null;
    this.currentBroadcast = null;
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

  // Cek siaran aktif saat app pertama kali dibuka
  async checkActiveBroadcast() {
    if (!this.outlet?.id || this.token === "offline_preview_token") return;
    try {
      const activeRes = await petugasService.getActiveBroadcast(this.outlet.id);
      if (activeRes?.active && activeRes?.data) {
        console.log("📡 Ditemukan siaran yang sedang aktif:", activeRes.data);
        this.handleBroadcastStarted(activeRes.data);
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

    // 2. Live mic broadcast ended
    channel.listen(".broadcast.ended", (data) => {
      console.log("🛑 Event broadcast.ended diterima:", data);
      this.handleBroadcastEnded(data);
    });

    // 3. Audio file broadcast started
    channel.listen(".audio.broadcast.started", (data) => {
      console.log("🎵 Event audio.broadcast.started diterima:", data);
      this.handleAudioBroadcastStarted(data);
    });

    // 4. Audio file broadcast ended
    channel.listen(".audio.broadcast.ended", (data) => {
      console.log("🛑 Event audio.broadcast.ended diterima:", data);
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

    this.currentBroadcast = data;
    // Beri tahu UI bahwa siaran dimulai dan sedang dalam proses connecting WebRTC
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

    this.currentBroadcast = data;

    // Jika ada file audio URL langsung
    if (data.audio?.url && this.audioElement) {
      this.audioElement.srcObject = null;
      this.audioElement.src = data.audio.url;
      this.audioElement.play().then(() => {
        if (this.onAudioConnected) {
          this.onAudioConnected(data);
        }
      }).catch((err) => {
        console.warn("Autoplay audio file terblokir:", err);
        if (this.onAudioConnected) {
          this.onAudioConnected(data);
        }
      });
    }
  }

  // Handler saat siaran berakhir
  handleBroadcastEnded(data) {
    console.log("Siaran berakhir, kembali ke standby");
    this.clearReadyRetry();
    this.leaveRoomChannel();
    this.closePeerConnection();

    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.src = "";
      this.audioElement.srcObject = null;
    }

    this.currentBroadcast = null;
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
    this.clearReadyRetry();
    this.leaveRoomChannel();
    this.closePeerConnection();
    this.pendingRemoteIce = [];

    const outletId = parseInt(this.outlet?.id, 10);

    // 1. Setup PeerConnection DULU
    await this.setupPeerConnection(roomId, broadcastId);

    // 2. Subscribe ke room channel `broadcast.${roomId}`
    const roomChannelName = `broadcast.${roomId}`;
    this.roomChannel = echo.channel(roomChannelName);

    // Listen WebRTC Offer dari Operator
    this.roomChannel.listen(".webrtc.offer", async (offerData) => {
      console.log("📥 Menerima WebRTC Offer dari Operator:", offerData);

      const targetOutletId = offerData.outlet_id ? parseInt(offerData.outlet_id, 10) : null;
      if (targetOutletId && targetOutletId !== outletId) {
        console.log(`Offer untuk outlet ${targetOutletId}, bukan untuk outlet ${outletId}`);
        return;
      }

      this.clearReadyRetry();
      await this.handleWebRTCOffer(offerData, roomId, broadcastId);
    });

    // Listen Operator ICE Candidate
    this.roomChannel.listen(".webrtc.operator.ice", (iceData) => {
      console.log("🧊 Menerima Operator ICE:", iceData);
      const targetOutletId = iceData.outlet_id ? parseInt(iceData.outlet_id, 10) : null;
      if (targetOutletId && targetOutletId !== outletId) {
        return;
      }
      this.handleOperatorIce(iceData);
    });

    // 3. FUNGSI UNTUK KIRIM SINYAL RECEIVER READY
    const sendReadySignal = async () => {
      try {
        console.log(`📤 Mengirim sinyal receiver ready (Room: ${roomId}, Outlet: ${outletId})...`);
        await petugasService.sendReceiverReady({
          roomId,
          outletId,
        });
      } catch (e) {
        console.error("Gagal mengirim receiver ready:", e);
      }
    };

    // 4. Pastikan channel sudah tersubscribe sebelum kirim ready, atau kirim langsung + retry
    this.roomChannel.subscribed(async () => {
      console.log(`✅ WebRTC Room Channel ${roomChannelName} subscribed!`);
      await sendReadySignal();
    });

    // Fallback: Kirim sinyal ready langsung & ulangi tiap 1.5 detik jika offer belum datang (maksimal 3x)
    let retryCount = 0;
    await sendReadySignal();

    this.readyRetryTimer = setInterval(async () => {
      retryCount++;
      if (retryCount > 3 || (this.peerConnection && this.peerConnection.remoteDescription)) {
        this.clearReadyRetry();
        return;
      }
      console.log(`🔄 Retry receiver ready signal ke-${retryCount}...`);
      await sendReadySignal();
    }, 1500);
  }

  async setupPeerConnection(roomId, broadcastId) {
    const iceServers = await petugasService.getIceServers();
    const config = {
      iceServers,
      sdpSemantics: "unified-plan",
    };

    const outletId = parseInt(this.outlet?.id, 10);

    this.peerConnection = new RTCPeerConnection(config);

    // Audio Receiver Transceiver
    this.peerConnection.addTransceiver("audio", { direction: "recvonly" });

    // Track event: audio diterima dari Operator (SEPERTI FLUTTER APK)
    this.peerConnection.ontrack = (event) => {
      console.log("==========================================");
      console.log("🔊 REMOTE AUDIO TRACK DITERIMA DARI OPERATOR!");
      console.log("Kind:", event.track.kind, "Streams:", event.streams.length);
      console.log("==========================================");

      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];

        if (this.audioElement) {
          this.audioElement.srcObject = this.remoteStream;
          this.audioElement.muted = false;

          const playPromise = this.audioElement.play();
          if (playPromise !== undefined) {
            playPromise
              .then(() => {
                console.log("▶️ Audio streaming berhasil diputar di speaker!");
              })
              .catch((err) => {
                console.warn("⚠️ Autoplay dicegah browser, butuh interaksi klik:", err);
              });
          }
        }

        // Hubungkan ke Web Audio API Analyser untuk visualizer gelombang suara
        if (this.audioContext && this.analyser) {
          try {
            if (this.audioContext.state === "suspended") {
              this.audioContext.resume();
            }
            const source = this.audioContext.createMediaStreamSource(this.remoteStream);
            source.connect(this.analyser);
            console.log("📊 Analyser berhasil tersambung ke stream");
          } catch (err) {
            console.warn("Analyser connection error:", err);
          }
        }

        // HANYA PINDAH KE HALAMAN LIVE KETIKA AUDIO TRACK BENAR-BENAR DITERIMA
        if (this.onAudioConnected && this.currentBroadcast) {
          this.onAudioConnected(this.currentBroadcast);
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

      if (state === "connected" && this.onAudioConnected && this.currentBroadcast) {
        this.onAudioConnected(this.currentBroadcast);
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
      const rawOffer = offerData.offer || offerData;

      if (!rawOffer || !rawOffer.sdp) {
        console.warn("Format Offer tidak valid:", rawOffer);
        return;
      }

      console.log("📄 Setting Remote Description (Offer)...");
      await this.peerConnection.setRemoteDescription(
        new RTCSessionDescription({
          type: rawOffer.type || "offer",
          sdp: rawOffer.sdp,
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

      console.log(`📤 Mengirim WebRTC Answer ke Operator (Room: ${roomId}, Outlet: ${outletId})...`);
      await petugasService.sendAnswer({
        roomId,
        outletId,
        sdp: answer.sdp,
      });

      console.log("✅ WebRTC Answer berhasil terkirim!");
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
    if (this.roomChannel && this.currentBroadcast?.rtc_room_id) {
      echo.leaveChannel(`broadcast.${this.currentBroadcast.rtc_room_id}`);
      this.roomChannel = null;
    }
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
