import {
  FileAudio,
  Plus,
  Upload,
  Trash2,
  Play,
  Pause,
  Loader2,
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
  onlineOutlets = [],
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
  // CLEANUP SAAT COMPONENT DITUTUP
  // ============================================================

  useEffect(() => {

    return () => {

      console.log(
        "🧹 UploadAudio cleanup"
      );

      WebRTCAudioService
        .stop()
        .catch((error) => {
          console.error(
            "❌ Cleanup WebRTC audio gagal:",
            error
          );
        });

    };

  }, []);

  // ============================================================
  // LISTENER WEBRTC AUDIO SERVICE
  // ============================================================

  useEffect(() => {

    WebRTCAudioService.setStateListener(
      (state) => {

        console.log(
          "📡 WebRTC Audio State:",
          state
        );

        // ------------------------------------------------------
        // STATE STRING
        // ------------------------------------------------------

        if (state === "stopped") {

          setPlayingId(null);

          setBroadcastLoading(false);

          return;
        }

        if (state === "ended") {

          setPlayingId(null);

          setBroadcastLoading(false);

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

      WebRTCAudioService.setStateListener(
        null
      );

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

    const files = Array.from(
      e.target.files || []
    );

    if (!files.length) {
      return;
    }

    try {

      setUploading(true);

      for (const file of files) {

        console.log(
          "📤 Upload audio:",
          {
            name: file.name,
            type: file.type,
            size: file.size,
          }
        );

        // ------------------------------------------------------
        // UPLOAD
        // ------------------------------------------------------

        const response =
          await audio.upload(file);

        console.log(
          "✅ Upload berhasil:",
          response
        );
      }

      // --------------------------------------------------------
      // RELOAD DATA
      // --------------------------------------------------------

      await loadAudios();

    } catch (error) {

      console.error(
        "❌ Upload audio gagal:",
        error.response?.data || error
      );

    } finally {

      setUploading(false);

      /**
       * Reset input agar file yang sama
       * bisa dipilih lagi.
       */

      e.target.value = "";
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
      // fitur bicara langsung: "all" -> semua outlet online,
      // "specific" -> outlet yang dicentang.
      // ========================================================

      const selectedOutlets =
        targetMode === "all"
          ? onlineOutlets
          : onlineOutlets.filter((outlet) =>
              selected.has(outlet.id)
            );

      if (!selectedOutlets.length) {
        alert.error(
          "Pilih minimal satu outlet yang online"
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
            ADD BUTTON
        ==================================================== */}

        <button
          type="button"
          onClick={handleSelectFile}
          disabled={
            uploading ||
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

              Mengupload...

            </>

          ) : (

            <>

              <Plus size={16} />

              Tambah Audio

            </>

          )}

        </button>

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
                    playingId ===
                    audioItem.id;

                  return (

                    <div
                      key={audioItem.id}
                      className="
                        flex
                        items-center
                        gap-4
                        rounded-xl
                        border
                        border-neutral-800
                        bg-neutral-900
                        px-4
                        py-3
                        transition
                        hover:border-neutral-700
                      "
                    >

                      {/* ========================================
                          ICON
                      ======================================== */}

                      <div
                        className="
                          flex
                          h-10
                          w-10
                          flex-shrink-0
                          items-center
                          justify-center
                          rounded-lg
                          bg-orange-500/10
                        "
                      >

                        <FileAudio
                          size={19}
                          className="text-orange-500"
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
                          className="
                            truncate
                            text-sm
                            font-medium
                            text-neutral-200
                          "
                        >
                          {audioItem.name ||
                            audioItem.original_name ||
                            "Audio"}
                        </p>

                        <p
                          className="
                            mt-0.5
                            text-xs
                            text-neutral-500
                          "
                        >
                          {formatSize(
                            audioItem.size_bytes
                          )}
                        </p>

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
                        className="
                          flex
                          h-8
                          w-8
                          items-center
                          justify-center
                          rounded-lg
                          text-neutral-500
                          transition
                          hover:bg-neutral-800
                          hover:text-white
                          disabled:cursor-not-allowed
                          disabled:opacity-50
                        "
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

    </div>
  );
}