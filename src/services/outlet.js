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
};

export default outlet;
