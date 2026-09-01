import axios from "axios";
import { getApiBaseUrl } from "../config/app_config";

export const API_BASE_URL = getApiBaseUrl();

const api = axios.create({
    baseURL: API_BASE_URL,
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