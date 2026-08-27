import api from "./api";

const audio = {
  /**
   * Upload audio dengan log lengkap & progress tracking
   */
  upload: async (file, onProgress) => {
    const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
    console.log("==================================================");
    console.log("🎙️ [AUDIO UPLOAD] MEMULAI PROSES PENGIRIMAN FILE");
    console.log(`📁 Nama File    : ${file.name}`);
    console.log(`📦 Ukuran File  : ${sizeInMB} MB (${file.size} bytes)`);
    console.log(`🎧 Tipe MIME    : ${file.type || "audio/mpeg"}`);
    console.log(`🌐 Target URL   : /audio/upload`);
    console.log("==================================================");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await api.post("/audio/upload", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = progressEvent.total
            ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
            : 0;
          console.log(`📊 [UPLOAD PROGRESS] ${percentCompleted}% (${(progressEvent.loaded / (1024 * 1024)).toFixed(2)} MB / ${progressEvent.total ? (progressEvent.total / (1024 * 1024)).toFixed(2) : "?"} MB)`);
          if (onProgress) {
            onProgress(percentCompleted);
          }
        },
      });

      console.log("==================================================");
      console.log("✅ [AUDIO UPLOAD] BERHASIL DIUPLOAD KE SERVER!");
      console.log("📦 Response Data:", response.data);
      console.log("==================================================");

      return response.data;
    } catch (error) {
      console.log("==================================================");
      console.error("❌ [AUDIO UPLOAD] GAGAL MENGUPLOAD FILE KE SERVER");
      console.error("🔴 Status Code  :", error.response?.status);
      console.error("🔴 Status Text  :", error.response?.statusText);
      console.error("📦 Error Data   :", error.response?.data);

      if (error.response?.status === 422) {
        console.warn(
          "💡 DIAGNOSIS (422): Server PHP menolak file karena directive 'upload_max_filesize' atau 'post_max_size' di php.ini server masih lebih kecil dari ukuran file audio (" +
            sizeInMB +
            " MB)."
        );
      } else if (error.response?.status === 413) {
        console.warn(
          "💡 DIAGNOSIS (413): Web server Nginx menolak request karena 'client_max_body_size' di konfigurasi Nginx server masih default (1M)."
        );
      }
      console.log("==================================================");

      throw error;
    }
  },

  /**
   * Get semua audio
   */
  getAll: async () => {
    try {
      const response = await api.get("/audio");
      return response.data;
    } catch (error) {
      console.error(
        "❌ Gagal mengambil audio:",
        error.response?.data || error
      );
      throw error;
    }
  },

  /**
   * Get detail audio
   */
  getById: async (id) => {
    try {
      const response = await api.get(`/audio/${id}`);
      return response.data;
    } catch (error) {
      console.error(
        "❌ Gagal mengambil detail audio:",
        error.response?.data || error
      );
      throw error;
    }
  },

  /**
   * Delete audio
   */
  delete: async (id) => {
    try {
      const response = await api.delete(`/audio/${id}`);
      return response.data;
    } catch (error) {
      console.error(
        "❌ Gagal menghapus audio:",
        error.response?.data || error
      );
      throw error;
    }
  },
};

export default audio;