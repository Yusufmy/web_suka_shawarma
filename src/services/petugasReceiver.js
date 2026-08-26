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

    // Callbacks for UI
    this.onBroadcastStarted = null;
    this.onBroadcastEnded = null;
    this.onAudioPlaying = null;
    this.onConnectionState = null;
    this.isListening = false;
  }

  // Inisialisasi audio element & audio context
  initAudio(audioEl) {
    this.audioElement = audioEl;
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
  }

  // Heartbeat loop
  startHeartbeat() {
    this.stopHeartbeat();
    if (this.token) {
      petugasService.sendHeartbeat(this.token);
    }
    this.heartbeatTimer = setInterval(() => {
      if (this.token) {
        petugasService.sendHeartbeat(this.token);
      }
    }, 15000);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // Cek siaran aktif saat app pertama kali dibuka
  async checkActiveBroadcast() {
    if (!this.outlet?.id) return;
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
    if (this.onBroadcastStarted) {
      this.onBroadcastStarted(data);
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
    if (this.onBroadcastStarted) {
      this.onBroadcastStarted(data);
    }

    // Jika ada file audio URL langsung
    if (data.audio?.url && this.audioElement) {
      this.audioElement.srcObject = null;
      this.audioElement.src = data.audio.url;
      this.audioElement.play().catch((err) => {
        console.warn("Autoplay audio file terblokir:", err);
      });
    }
  }

  // Handler saat siaran berakhir
  handleBroadcastEnded(data) {
    console.log("Siaran berakhir, kembali ke standby");
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

  // WebRTC Room Flow
  async joinWebRTCRoom(roomId, broadcastId) {
    this.leaveRoomChannel();
    this.closePeerConnection();

    // 1. Subscribe ke room channel `broadcast.${roomId}`
    this.roomChannel = echo.channel(`broadcast.${roomId}`);

    this.roomChannel.listen(".webrtc.offer", (offerData) => {
      console.log("📥 Menerima WebRTC Offer dari Operator:", offerData);
      // Validasi apakah offer untuk outlet ini
      const targetOutletId = offerData.outlet_id;
      if (targetOutletId && String(targetOutletId) !== String(this.outlet?.id)) {
        return;
      }
      this.handleWebRTCOffer(offerData, roomId, broadcastId);
    });

    this.roomChannel.listen(".webrtc.operator.ice", (iceData) => {
      console.log("🧊 Menerima Operator ICE:", iceData);
      const targetOutletId = iceData.outlet_id;
      if (targetOutletId && String(targetOutletId) !== String(this.outlet?.id)) {
        return;
      }
      this.handleOperatorIce(iceData);
    });

    // 2. Buat RTCPeerConnection & kirim sinyal "ready" ke Operator
    await this.setupPeerConnection(roomId, broadcastId);

    try {
      console.log("📤 Mengirim sinyal receiver ready...");
      await petugasService.sendReceiverReady({
        roomId,
        outletId: this.outlet.id,
      });
    } catch (e) {
      console.error("Gagal mengirim receiver ready:", e);
    }
  }

  async setupPeerConnection(roomId, broadcastId) {
    const iceServers = await petugasService.getIceServers();
    const config = {
      iceServers,
      sdpSemantics: "unified-plan",
    };

    this.peerConnection = new RTCPeerConnection(config);

    // Audio Receiver Transceiver
    this.peerConnection.addTransceiver("audio", { direction: "recvonly" });

    // Track event: audio diterima
    this.peerConnection.ontrack = (event) => {
      console.log("🔊 WebRTC Remote Track diterima:", event.track);
      if (event.streams && event.streams[0] && this.audioElement) {
        this.audioElement.srcObject = event.streams[0];
        this.audioElement.play().catch((err) => {
          console.warn("Autoplay terblokir browser, butuh interaksi user:", err);
        });

        // Hubungkan ke Web Audio API Analyser
        if (this.audioContext && this.analyser) {
          try {
            if (this.audioContext.state === "suspended") {
              this.audioContext.resume();
            }
            const source = this.audioContext.createMediaStreamSource(event.streams[0]);
            source.connect(this.analyser);
          } catch (err) {
            console.warn("Analyser connection error:", err);
          }
        }
      }
    };

    // ICE Candidate
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        petugasService.sendIceCandidate({
          roomId,
          outletId: this.outlet.id,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState;
      console.log("🔗 WebRTC Connection State:", state);
      if (this.onConnectionState) {
        this.onConnectionState(state);
      }
    };
  }

  async handleWebRTCOffer(offerData, roomId, broadcastId) {
    if (!this.peerConnection) {
      await this.setupPeerConnection(roomId, broadcastId);
    }

    try {
      const rawOffer = offerData.offer || offerData;
      await this.peerConnection.setRemoteDescription(
        new RTCSessionDescription(rawOffer)
      );

      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      console.log("📤 Mengirim WebRTC Answer ke Operator...");
      await petugasService.sendAnswer({
        roomId,
        outletId: this.outlet.id,
        sdp: answer.sdp,
      });
    } catch (err) {
      console.error("Gagal memproses WebRTC Offer:", err);
    }
  }

  async handleOperatorIce(iceData) {
    if (!this.peerConnection || !iceData.candidate) return;
    try {
      await this.peerConnection.addIceCandidate(
        new RTCIceCandidate(iceData.candidate)
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
