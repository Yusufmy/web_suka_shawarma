import api from "./api";

const audio = {
  /**
   * Upload audio
   */
  upload: async (file) => {
        try {
            const formData = new FormData();

            formData.append("file", file);

            console.log("📤 Upload audio:", {
                name: file.name,
                type: file.type,
                size: file.size,
            });

            const response = await api.post(
                "/audio/upload",
                formData
            );

            return response.data;
        } catch (error) {
            console.error(
                "❌ Upload audio gagal:",
                error.response?.data || error
            );

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
      const response = await api.get(
        `/audio/${id}`
      );

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
      const response = await api.delete(
        `/audio/${id}`
      );

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