import api from "./api";

const outlet = {
    getAll: async () => {
        const response = await api.get("/outlet");

        return response.data;
    },

    getById: async (id) => {
        const response = await api.get(`/outlet/${id}`);

        return response.data;
    },

    create: async ({ code, name }) => {
        const response = await api.post("/outlet", { code, name });

        return response.data;
    },

    update: async (id, { code, name }) => {
        const response = await api.put(`/outlet/${id}`, { code, name });

        return response.data;
    },

    remove: async (id) => {
        const response = await api.delete(`/outlet/${id}`);

        return response.data;
    },

    // Lepas paksa pairing device outlet (tablet hilang/rusak/
    // diganti) - lihat OutletAuthService::resetDevice di backend.
    resetDevice: async (id) => {
        const response = await api.post(`/outlet/${id}/reset-device`);

        return response.data;
    },
};

export default outlet;
