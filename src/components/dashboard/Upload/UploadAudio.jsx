import {
  FileAudio,
  Plus,
  Upload,
  Trash2,
  Play,
  Pause,
  Loader2,
  Link2,
  X,
  Sparkles,
} from "lucide-react";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import audio from "../../../services/audio";
import WebRTCAudioService from "../../../services/webrct_audio_service";
import alert from "../../../helpers/alert";

export default function UploadAudio({
  targetMode = "all",
  selected = new Set(),
  outlets = [],
  onOutletAudioStateChange,
}) {
  // ============================================================
  // FILE INPUT
  // ============================================================

  const fileInputRef = useRef(null);

  // ============================================================
  // STATE
  // ============================================================

  /**
   * ID audio yang sedang dimainkan
   */
  const [playingId, setPlayingId] = useState(null);

  /**
   * Progres playback audio (menit/detik & persentase)
   */
  const [playbackProgress, setPlaybackProgress] = useState({
    currentTime: 0,
    duration: 0,
    percentage: 0,
  });

  /**
   * Data audio
   */
  const [audios, setAudios] = useState([]);

  /**
   * Loading GET audio
   */
  const [loading, setLoading] = useState(true);

  /**
   * Loading upload
   */
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  /**
   * ID audio yang sedang dihapus
   */
  const [deletingId, setDeletingId] = useState(null);

  /**
   * Loading ketika start broadcast
   */
  const [broadcastLoading, setBroadcastLoading] =
    useState(false);

  /**
   * Tahap broadcast saat ini: "starting" | "connecting"
   */
  const [broadcastStatus, setBroadcastStatus] =
    useState("starting");

  /**
   * State Modal Import Audio via Link (YouTube / TikTok / dll)
   */
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);

  // ============================================================
  // BERITAHU OUTLET KALAU TAB DITUTUP/REFRESH SAAT MASIH BROADCAST
  //
  // beforeunload/pagehide TIDAK BISA menunggu request axios biasa
  // selesai (browser keburu nutup tab-nya) - sendBeacon didesain
  // khusus buat kasus ini: request dikirim best-effort tanpa
  // menahan proses unload. Endpoint audio/broadcast/end sengaja
  // tidak butuh token auth (lihat routes/api.php), jadi bisa
  // dipanggil langsung dari sendBeacon (yang tidak bisa set header
  // Authorization sama sekali).
  // ============================================================

  useEffect(() => {
    function notifyBroadcastEndOnUnload() {
      const roomId = WebRTCAudioService.roomId;

      if (!roomId) {
        return;
      }

      const outletIds = (WebRTCAudioService.outlets || []).map(
        (o) => o.id
      );

      const blob = new Blob(
        [
          JSON.stringify({
            room_id: roomId,
            outlet_ids: outletIds,
            natural: false,
          }),
        ],
        { type: "application/json" }
      );

      navigator.sendBeacon(
        "https://api-radio.sukashawarma.com/api/audio/webrtc/audio/broadcast/end",
        blob
      );
    }

    window.addEventListener("pagehide", notifyBroadcastEndOnUnload);
    window.addEventListener("beforeunload", notifyBroadcastEndOnUnload);

    return () => {
      window.removeEventListener(
        "pagehide",
        notifyBroadcastEndOnUnload
      );
      window.removeEventListener(
        "beforeunload",
        notifyBroadcastEndOnUnload
      );
    };
  }, []);

  // ============================================================
  // GET AUDIO
  // ============================================================

  async function loadAudios() {
    try {
      setLoading(true);

      const response = await audio.getAll();

      console.log(
        "🎵 Audio response:",
        response
      );

      /**
       * Support:
       *
       * [
       *   {...}
       * ]
       *
       * atau:
       *
       * {
       *   data: [...]
       * }
       */

      const audioData = Array.isArray(response)
        ? response
        : response?.data || [];

      setAudios(audioData);

    } catch (error) {

      console.error(
        "❌ Gagal mengambil audio:",
        error.response?.data || error
      );

    } finally {

      setLoading(false);
    }
  }

  // ============================================================
  // LOAD AUDIO SAAT COMPONENT DIBUKA
  // ============================================================

  useEffect(() => {
    loadAudios();
  }, []);

  // ============================================================
  // LISTENER WEBRTC AUDIO SERVICE & PROGRESS
  // ============================================================

  useEffect(() => {
    // ----------------------------------------------------------
    // RESTORE JIKA SUDAH ADA BROADCAST BERJALAN
    // ----------------------------------------------------------
    const currentlyPlaying = WebRTCAudioService.getCurrentlyPlaying();
    if (currentlyPlaying && currentlyPlaying.isPlaying) {
      setPlayingId(currentlyPlaying.audioId);
      const percentage =
        currentlyPlaying.duration > 0
          ? Math.min(
              100,
              Math.max(
                0,
                (currentlyPlaying.currentTime / currentlyPlaying.duration) * 100
              )
            )
          : 0;
      setPlaybackProgress({
        currentTime: currentlyPlaying.currentTime,
        duration: currentlyPlaying.duration,
        percentage,
      });
    }

    const handleSyncOnVisible = () => {
      const current = WebRTCAudioService.getCurrentlyPlaying();
      if (current && current.isPlaying) {
        setPlayingId((prev) => (prev !== current.audioId ? current.audioId : prev));
        const percentage =
          current.duration > 0
            ? Math.min(100, Math.max(0, (current.currentTime / current.duration) * 100))
            : 0;
        setPlaybackProgress({
          currentTime: current.currentTime,
          duration: current.duration,
          percentage,
        });
      }
    };

    document.addEventListener("visibilitychange", handleSyncOnVisible);
    window.addEventListener("focus", handleSyncOnVisible);

    WebRTCAudioService.setProgressCallback(
      ({ currentTime, duration }) => {
        const percentage =
          duration > 0
            ? Math.min(100, Math.max(0, (currentTime / duration) * 100))
            : 0;

        setPlaybackProgress({
          currentTime,
          duration,
          percentage,
        });
      }
    );

    WebRTCAudioService.setStateListener(
      (state) => {

        console.log(
          "📡 WebRTC Audio State:",
          state
        );

        // ------------------------------------------------------
        // STATE STRING
        // ------------------------------------------------------

        if (state === "stopped" || state === "ended") {

          setPlayingId(null);

          setBroadcastLoading(false);

          setPlaybackProgress({
            currentTime: 0,
            duration: 0,
            percentage: 0,
          });

          return;
        }

        if (state === "playing") {

          setBroadcastLoading(false);

          return;
        }

        // ------------------------------------------------------
        // STATE OBJECT
        // ------------------------------------------------------

        if (
          typeof state === "object" &&
          state !== null
        ) {

          console.log(
            "🏪 Outlet WebRTC state:",
            state
          );

          setBroadcastStatus("connecting");

          // Teruskan status per-outlet ke parent supaya bisa
          // ditampilkan real-time di sidebar - penting terutama
          // untuk outlet yang jaringannya lambat/terkendala, jadi
          // operator tahu outlet itu sedang menyusul memutar audio
          // (bukan cuma diam tanpa keterangan).
          onOutletAudioStateChange?.(state);

          if (
            state.state === "connected"
          ) {

            console.log(
              `✅ Outlet ${state.outletId} CONNECTED`
            );

          }

          if (
            state.state === "failed"
          ) {

            console.error(
              `❌ Outlet ${state.outletId} FAILED`
            );

          }

          if (
            state.state === "disconnected"
          ) {

            console.warn(
              `⚠️ Outlet ${state.outletId} DISCONNECTED`
            );

          }
        }

      }
    );

    // ----------------------------------------------------------
    // CLEANUP LISTENER
    // ----------------------------------------------------------

    return () => {
      WebRTCAudioService.setStateListener(null);
      WebRTCAudioService.setProgressCallback(null);
      document.removeEventListener("visibilitychange", handleSyncOnVisible);
      window.removeEventListener("focus", handleSyncOnVisible);
    };

  }, []);

  // ============================================================
  // OPEN FILE PICKER
  // ============================================================

  function handleSelectFile() {

    fileInputRef.current?.click();

  }

  // ============================================================
  // UPLOAD AUDIO
  // ============================================================

  async function handleFileChange(e) {
    const files = Array.from(e.target.files || []);

    if (!files.length) {
      return;
    }

    try {
      setUploading(true);
      setUploadProgress(0);

      for (const file of files) {
        const response = await audio.upload(file, (progress) => {
          setUploadProgress(progress);
        });

        console.log("✅ Upload audio selesai:", response);
      }

      await loadAudios();
      alert.success("File audio berhasil di-upload ke server!");

    } catch (error) {
      console.error("❌ Upload audio gagal:", error.response?.data || error);

      const status = error.response?.status;
      const apiMsg = error.response?.data?.message || (error.response?.data?.errors?.file?.[0]);

      if (status === 413) {
        alert.error("Ukuran file terlalu besar (Nginx 413 Payload Too Large). Konfigurasi client_max_body_size di server perlu dinaikkan.");
      } else if (status === 422) {
        alert.error(apiMsg || "Server menolak file: Batas upload_max_filesize di php.ini server masih 2MB.");
      } else {
        alert.error(apiMsg || "Gagal meng-upload file audio ke server.");
      }

    } finally {
      setUploading(false);
      setUploadProgress(0);
      e.target.value = "";
    }
  }

  // ============================================================
  // IMPORT AUDIO DARI LINK URL (YOUTUBE / TIKTOK / DLL)
  // ============================================================

  async function handleImportUrl(e) {
    e?.preventDefault();
    const cleanUrl = importUrl.trim();
    if (!cleanUrl) {
      alert.error("Masukkan link URL video/audio terlebih dahulu.");
      return;
    }

    try {
      setImporting(true);
      const res = await audio.importUrl(cleanUrl);
      alert.success(res?.message || "Audio berhasil diekstrak dan disimpan!");
      setImportUrl("");
      setImportModalOpen(false);
      await loadAudios();
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.message ||
        "Gagal mengekstrak audio dari link tersebut.";
      alert.error(msg);
    } finally {
      setImporting(false);
    }
  }

  // ============================================================
  // DELETE AUDIO
  // ============================================================

  async function handleDelete(id) {

    // ----------------------------------------------------------
    // JIKA AUDIO SEDANG PLAY
    // ----------------------------------------------------------

    if (playingId === id) {

      try {

        await WebRTCAudioService.stop();

      } catch (error) {

        console.error(
          "❌ Gagal stop audio:",
          error
        );

      }

      setPlayingId(null);
    }

    try {

      setDeletingId(id);

      // --------------------------------------------------------
      // DELETE API
      // --------------------------------------------------------

      await audio.delete(id);

      // --------------------------------------------------------
      // UPDATE STATE
      // --------------------------------------------------------

      setAudios((previous) =>
        previous.filter(
          (item) => item.id !== id
        )
      );

    } catch (error) {

      console.error(
        "❌ Gagal menghapus audio:",
        error.response?.data || error
      );

    } finally {

      setDeletingId(null);
    }
  }

  // ============================================================
  // FORMAT FILE SIZE
  // ============================================================

  function formatSize(size) {
      const bytes = Number(size);

      if (!bytes || bytes <= 0) {
          return "0 KB";
      }

      const kb = bytes / 1024;

      if (kb < 1024) {
          return `${kb.toFixed(2)} KB`;
      }

      const mb = kb / 1024;
      return `${mb.toFixed(2)} MB`;
  }

  // ============================================================
  // FORMAT TIME (MM:SS)
  // ============================================================

  function formatTime(seconds) {
      if (!seconds || isNaN(seconds) || seconds <= 0) {
          return "00:00";
      }

      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);

      return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  // ============================================================
  // GET AUDIO URL
  // ============================================================

  function getAudioUrl(audioItem) {

    return (
      audioItem.url ||
      audioItem.file_url ||
      audioItem.path ||
      null
    );
  }

  // ============================================================
  // PLAY / STOP AUDIO BROADCAST
  // ============================================================

  async function handlePlay(audioItem) {

    const url =
      getAudioUrl(audioItem);

    // ----------------------------------------------------------
    // VALIDATE URL
    // ----------------------------------------------------------

    if (!url) {

      console.warn(
        "⚠️ URL audio tidak ditemukan:",
        audioItem
      );

      return;
    }

    try {

      // ========================================================
      // JIKA AUDIO YANG SAMA SEDANG PLAY
      // ========================================================

      if (
        playingId === audioItem.id
      ) {

        console.log(
          "⏹️ STOP AUDIO:",
          audioItem.original_name ||
          audioItem.name
        );

        await WebRTCAudioService.stop();

        setPlayingId(null);

        return;
      }

      // ========================================================
      // STOP BROADCAST SEBELUMNYA
      // ========================================================

      console.log(
        "🛑 Stop broadcast sebelumnya..."
      );

      await WebRTCAudioService.stop();

      // ========================================================
      // ROOM ID
      // ========================================================

      const roomId =
        `audio-${Date.now()}`;

      // ========================================================
      // TARGET OUTLET
      //
      // Ikuti pilihan outlet operator (sidebar), sama seperti
      // fitur bicara langsung: "all" -> SEMUA outlet (bukan cuma
      // yang online - outlet offline/terminated tetap dapat
      // notifikasi FCM dan bisa nyambung belakangan begitu app-nya
      // dibuka), "specific" -> outlet yang dicentang (juga tanpa
      // syarat online, sama seperti webrtc.js).
      // ========================================================

      const selectedOutlets =
        targetMode === "all"
          ? outlets
          : outlets.filter((outlet) =>
              selected.has(outlet.id)
            );

      if (!selectedOutlets.length) {
        alert.error(
          targetMode === "all"
            ? "Tidak ada outlet terdaftar"
            : "Pilih minimal satu outlet"
        );

        return;
      }

      // ========================================================
      // LOG
      // ========================================================

      console.log(
        "===================================="
      );

      console.log(
        "🎵 START AUDIO BROADCAST"
      );

      console.log(
        "===================================="
      );

      console.log(
        "🎵 Audio:",
        audioItem
      );

      console.log(
        "🔗 URL:",
        url
      );

      console.log(
        "🏠 Room:",
        roomId
      );

      console.log(
        "🏪 Outlets:",
        selectedOutlets
      );

      // ========================================================
      // SET LOADING
      // ========================================================

      setBroadcastStatus("starting");

      setBroadcastLoading(true);

      // ========================================================
      // START WEBRTC
      // ========================================================

      await WebRTCAudioService.start({
        audioUrl: url,
        roomId: roomId,
        outlets: selectedOutlets,
        audioId: audioItem.id,
        audioName:
          audioItem.original_name ||
          audioItem.name,
        targetMode: targetMode,
      });

      // ========================================================
      // SUCCESS
      // ========================================================

      setPlayingId(
        audioItem.id
      );

      setBroadcastLoading(false);

      console.log(
        "===================================="
      );

      console.log(
        "✅ AUDIO BROADCAST STARTED"
      );

      console.log(
        "===================================="
      );

    } catch (error) {

      console.error(
        "===================================="
      );

      console.error(
        "❌ FAILED START AUDIO BROADCAST"
      );

      console.error(
        error
      );

      console.error(
        "===================================="
      );

      setPlayingId(null);

      setBroadcastLoading(false);

    }
  }

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">

      {/* ======================================================
          HEADER
      ====================================================== */}

      <div
        className="
          flex
          flex-wrap
          items-center
          justify-between
          gap-3
          border-b
          border-neutral-800
          px-4
          py-4
          sm:px-6
        "
      >

        <div className="min-w-0">

          <h2
            className="
              text-base
              font-semibold
              text-white
            "
          >
            Audio
          </h2>

          <p
            className="
              mt-1
              text-xs
              text-neutral-500
            "
          >
            Kelola audio yang akan disiarkan ke outlet.
          </p>

        </div>

        {/* ====================================================
            ACTION BUTTONS (IMPORT LINK & UPLOAD FILE)
        ==================================================== */}

        <div className="flex flex-wrap items-center gap-2">
          {/* TOMBOL IMPORT DARI LINK */}
          {/* <button
            type="button"
            onClick={() => setImportModalOpen(true)}
            disabled={uploading || importing || broadcastLoading}
            className="
              flex
              shrink-0
              items-center
              gap-2
              rounded-lg
              border
              border-neutral-700
              bg-neutral-800/80
              px-3.5
              py-2
              text-sm
              font-medium
              text-neutral-200
              shadow-sm
              transition
              hover:border-orange-500/60
              hover:bg-neutral-800
              hover:text-orange-400
              active:scale-[0.98]
              disabled:cursor-not-allowed
              disabled:opacity-50
            "
          >
            <Link2 size={15} className="text-orange-400" />
            <span>Import dari Link</span>
          </button> */}

          {/* TOMBOL UPLOAD FILE MP3 */}
          <button
            type="button"
            onClick={handleSelectFile}
            disabled={
              uploading ||
              importing ||
              broadcastLoading
            }
            className="
              flex
              shrink-0
              items-center
              gap-2
              rounded-lg
              bg-gradient-to-b
              from-orange-500
              to-orange-700
              px-4
              py-2
              text-sm
              font-semibold
              text-white
              shadow-lg
              shadow-orange-900/20
              transition
              hover:brightness-110
              active:scale-[0.98]
              disabled:cursor-not-allowed
              disabled:opacity-50
            "
          >
            {uploading ? (
              <>
                <Loader2
                  size={16}
                  className="animate-spin"
                />
                Mengupload {uploadProgress > 0 ? `(${uploadProgress}%)` : "..."}
              </>
            ) : (
              <>
                <Plus size={16} />
                Tambah Audio
              </>
            )}
          </button>
        </div>

      </div>

      {/* ======================================================
          FILE INPUT
      ====================================================== */}

      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        multiple
        onChange={handleFileChange}
        className="hidden"
      />

      {/* ======================================================
          CONTENT
      ====================================================== */}

      <div
        className="
          min-h-0
          flex-1
          overflow-y-auto
          p-4
          sm:p-6
        "
      >

        {/* ====================================================
            LOADING
        ==================================================== */}

        {loading ? (

          <div
            className="
              flex
              h-full
              min-h-[300px]
              items-center
              justify-center
            "
          >

            <div
              className="
                flex
                flex-col
                items-center
              "
            >

              <Loader2
                size={28}
                className="
                  animate-spin
                  text-orange-500
                "
              />

              <p
                className="
                  mt-3
                  text-xs
                  text-neutral-500
                "
              >
                Memuat audio...
              </p>

            </div>

          </div>

        ) : audios.length === 0 ? (

          /* ==================================================
              EMPTY STATE
          ================================================== */

          <div
            className="
              flex
              h-full
              min-h-[300px]
              items-center
              justify-center
            "
          >

            <div
              className="
                flex
                flex-col
                items-center
                text-center
              "
            >

              <div
                className="
                  mb-4
                  flex
                  h-16
                  w-16
                  items-center
                  justify-center
                  rounded-full
                  bg-orange-500/10
                "
              >

                <Upload
                  size={28}
                  className="text-orange-500"
                />

              </div>

              <h3
                className="
                  text-sm
                  font-semibold
                  text-neutral-200
                "
              >
                Belum ada audio
              </h3>

              <p
                className="
                  mt-1
                  max-w-sm
                  text-xs
                  text-neutral-500
                "
              >
                Tambahkan file audio untuk digunakan
                sebagai materi siaran.
              </p>

              <button
                type="button"
                onClick={handleSelectFile}
                disabled={uploading}
                className="
                  mt-5
                  flex
                  items-center
                  gap-2
                  rounded-lg
                  border
                  border-neutral-700
                  bg-neutral-900
                  px-4
                  py-2
                  text-xs
                  font-semibold
                  text-neutral-300
                  transition
                  hover:border-orange-500
                  hover:text-orange-500
                  disabled:opacity-50
                "
              >

                <Plus size={15} />

                Tambah Audio

              </button>

            </div>

          </div>

        ) : (

          /* ==================================================
              AUDIO LIST
          ================================================== */

          <div
            className="
              mx-auto
              w-full
              max-w-3xl
            "
          >

            <div
              className="
                mb-4
                flex
                items-center
                justify-between
              "
            >

              <p
                className="
                  text-xs
                  text-neutral-500
                "
              >
                {audios.length} audio tersedia
              </p>

              {/* =================================================
                  BROADCAST STATUS
              ================================================= */}

              {broadcastLoading && (

                <div
                  className="
                    flex
                    items-center
                    gap-2
                    text-xs
                    text-orange-500
                  "
                >

                  <Loader2
                    size={13}
                    className="animate-spin"
                  />

                  Menghubungkan...

                </div>

              )}

              {playingId !== null &&
                !broadcastLoading && (

                <div
                  className="
                    flex
                    items-center
                    gap-2
                    text-xs
                    text-green-500
                  "
                >

                  <span
                    className="
                      h-2
                      w-2
                      animate-pulse
                      rounded-full
                      bg-green-500
                    "
                  />

                  Broadcasting

                </div>

              )}

            </div>

            {/* ==================================================
                AUDIO ITEMS
            ================================================== */}

            <div className="space-y-2">

              {audios.map(
                (audioItem) => {

                  const isPlaying =
                    playingId === audioItem.id;

                  return (
                    <div
                      key={audioItem.id}
                      className={`
                        flex
                        flex-col
                        rounded-xl
                        border
                        px-4
                        py-3
                        transition-all
                        duration-200
                        ${
                          isPlaying
                            ? "border-orange-500/60 bg-neutral-900 shadow-lg shadow-orange-950/20"
                            : "border-neutral-800 bg-neutral-900 hover:border-neutral-700"
                        }
                      `}
                    >
                      <div className="flex items-center gap-4">
                        {/* ========================================
                            ICON
                        ======================================== */}

                        <div
                          className={`
                            flex
                            h-10
                            w-10
                            flex-shrink-0
                            items-center
                            justify-center
                            rounded-lg
                            transition-colors
                            ${
                              isPlaying
                                ? "bg-orange-500/20 text-orange-400 ring-1 ring-orange-500/30"
                                : "bg-orange-500/10 text-orange-500"
                            }
                          `}
                        >
                          <FileAudio
                            size={19}
                            className={isPlaying ? "animate-pulse" : ""}
                          />
                        </div>

                        {/* ========================================
                            INFO
                        ======================================== */}

                        <div
                          className="
                            min-w-0
                            flex-1
                          "
                        >
                          <p
                            className={`
                              truncate
                              text-sm
                              font-medium
                              ${
                                isPlaying
                                  ? "font-semibold text-orange-300"
                                  : "text-neutral-200"
                              }
                            `}
                          >
                            {audioItem.name ||
                              audioItem.original_name ||
                              "Audio"}
                          </p>

                          <div className="mt-0.5 flex items-center gap-2 text-xs text-neutral-500">
                            <span>{formatSize(audioItem.size_bytes)}</span>
                            {isPlaying && (
                              <span className="flex items-center gap-1 font-mono text-[11px] text-orange-400">
                                • Sedang Mengudara
                              </span>
                            )}
                          </div>
                        </div>

                        {/* ========================================
                            PLAY / PAUSE
                        ======================================== */}

                        <button
                          type="button"
                          onClick={() =>
                            handlePlay(
                              audioItem
                            )
                          }
                          disabled={
                            broadcastLoading
                          }
                          className={`
                            flex
                            h-8
                            w-8
                            items-center
                            justify-center
                            rounded-lg
                            transition
                            disabled:cursor-not-allowed
                            disabled:opacity-50
                            ${
                              isPlaying
                                ? "bg-orange-500/20 text-orange-400 ring-1 ring-orange-500/40 hover:bg-orange-500/30"
                                : "text-neutral-500 hover:bg-neutral-800 hover:text-white"
                            }
                          `}
                          title={
                            isPlaying
                              ? "Stop"
                              : "Broadcast"
                          }
                        >
                          {isPlaying ? (
                            <Pause
                              size={15}
                            />
                          ) : (
                            <Play
                              size={15}
                            />
                          )}
                        </button>

                        {/* ========================================
                            DELETE
                        ======================================== */}

                        <button
                          type="button"
                          disabled={
                            deletingId ===
                              audioItem.id ||
                            isPlaying ||
                            broadcastLoading
                          }
                          onClick={() =>
                            handleDelete(
                              audioItem.id
                            )
                          }
                          className="
                            flex
                            h-8
                            w-8
                            items-center
                            justify-center
                            rounded-lg
                            text-neutral-600
                            transition
                            hover:bg-red-500/10
                            hover:text-red-400
                            disabled:cursor-not-allowed
                            disabled:opacity-50
                          "
                          title="Hapus"
                        >
                          {deletingId ===
                          audioItem.id ? (
                            <Loader2
                              size={15}
                              className="
                                animate-spin
                              "
                            />
                          ) : (
                            <Trash2
                              size={15}
                            />
                          )}
                        </button>
                      </div>

                      {/* ========================================
                          READ-ONLY PROGRESS BAR
                          (Tidak bisa di-scrub / diubah-ubah durasi & progress-nya)
                      ======================================== */}
                      {isPlaying && (
                        <div className="mt-3 border-t border-neutral-800/80 pt-2.5 select-none pointer-events-none">
                          <div className="mb-1.5 flex items-center justify-between font-mono text-[11px] font-medium text-neutral-400">
                            <span className="flex items-center gap-1.5 font-semibold text-orange-400">
                              <span className="inline-block h-1.5 w-1.5 animate-ping rounded-full bg-orange-500" />
                              {formatTime(playbackProgress.currentTime)}
                            </span>
                            <span className="font-semibold text-neutral-400">
                              {formatTime(playbackProgress.duration)}
                            </span>
                          </div>

                          {/* Progress Bar Track - Strictly Read-Only */}
                          <div className="h-2 w-full overflow-hidden rounded-full border border-neutral-800/80 bg-neutral-950 shadow-inner">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-orange-600 via-orange-500 to-amber-400 transition-all duration-200"
                              style={{
                                width: `${playbackProgress.percentage}%`,
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }
              )}

            </div>

          </div>

        )}

      </div>

      {/* ======================================================
          MODAL: MENGHUBUNGKAN BROADCAST
      ====================================================== */}

      {broadcastLoading && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">

          <div className="w-full max-w-[420px] rounded-2xl bg-neutral-900 p-6 text-center shadow-2xl sm:p-8">

            <div className="mx-auto mb-5 h-12 w-12 animate-spin rounded-full border-4 border-neutral-700 border-t-white" />

            <h2 className="text-xl font-semibold text-white">
              Menghubungkan Broadcast
            </h2>

            <p className="mt-2 text-sm text-neutral-400">
              {broadcastStatus === "starting" &&
                "Menyiapkan broadcast audio..."}

              {broadcastStatus === "connecting" &&
                "Menghubungkan ke outlet..."}
            </p>

          </div>

        </div>
      )}

      {/* ======================================================
          MODAL: IMPORT AUDIO DARI LINK URL (YT / TIKTOK / DLL)
      ====================================================== */}
      {importModalOpen && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="relative w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl">
            {/* Header Modal */}
            <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-500">
                  <Link2 size={20} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">
                    Import Audio dari Link
                  </h3>
                  <p className="text-xs text-neutral-400">
                    YouTube, TikTok, Instagram Reels, SoundCloud, dll.
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled={importing}
                onClick={() => {
                  if (!importing) {
                    setImportModalOpen(false);
                    setImportUrl("");
                  }
                }}
                className="rounded-lg p-1.5 text-neutral-400 transition hover:bg-neutral-800 hover:text-white disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>

            {/* Form Input */}
            <form onSubmit={handleImportUrl} className="mt-5 space-y-4">
              <div>
                <label className="mb-2 block text-xs font-medium text-neutral-300">
                  Link Video / Audio:
                </label>
                <div className="relative">
                  <input
                    type="url"
                    required
                    disabled={importing}
                    placeholder="https://www.youtube.com/watch?v=... atau https://vt.tiktok.com/..."
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                    className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white placeholder-neutral-500 transition focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:opacity-60"
                  />
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-neutral-500">
                  💡 Server akan otomatis mengekstrak suaranya menjadi file MP3 jernih tanpa iklan dan langsung menyimpannya ke daftar materi siaran.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  disabled={importing}
                  onClick={() => {
                    setImportModalOpen(false);
                    setImportUrl("");
                  }}
                  className="rounded-lg px-4 py-2 text-xs font-medium text-neutral-400 transition hover:bg-neutral-800 hover:text-white disabled:opacity-50"
                >
                  Batal
                </button>

                <button
                  type="submit"
                  disabled={importing || !importUrl.trim()}
                  className="flex items-center gap-2 rounded-lg bg-gradient-to-b from-orange-500 to-orange-700 px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-orange-900/30 transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {importing ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      <span>Sedang Mengekstrak Audio...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={15} />
                      <span>Ekstrak & Simpan</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}