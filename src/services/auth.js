import api from './api';

const auth = {
    login: async (email, password) => {
        const response = await api.post("/auth/operator-login",{
            email,
            password,
        });

        return response.data;
    },

    logout: async () => {
        const response = await api.post("/auth/logout");

        return response.data;
    },
};

export default auth;