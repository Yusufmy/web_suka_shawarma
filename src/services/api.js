import axios from "axios";

const api = axios.create({
    baseURL: "https://api-radio.sukashawarma.com/api",
    headers: {
        Accept: "application/json",
    },
});

api.interceptors.request.use(
    (config) => {
        const token =
            localStorage.getItem("operator_token");

        if (token) {
            config.headers.Authorization =
                `Bearer ${token}`;
        }

        return config;
    },

    (error) => {
        return Promise.reject(error);
    }
);

api.interceptors.response.use(
    (response) => {
        return response;
    },

    (error) => {
        console.error(
            "❌ API ERROR:",
            {
                url: error.config?.url,
                method: error.config?.method,
                status: error.response?.status,
                data: error.response?.data,
            }
        );

        return Promise.reject(error);
    }
);

export default api;