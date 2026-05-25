import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";

// --- Base URL resolution ---
// APK/real devices must use the deployed backend URL. Do not fallback to emulator-only URLs.
const ENV_BASE = process.env.EXPO_PUBLIC_API_BASE_URL;
const PROD_API = "https://smartparking-backend-8frt.onrender.com";

let baseURL = ENV_BASE || PROD_API;

console.log("[API URL]", baseURL);

const DEBUG_API = String(process.env.EXPO_PUBLIC_DEBUG_API || "false") === "true";

const api = axios.create({ 
  baseURL,
  withCredentials: true, // enable sending cookies with requests
});

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  })

  failedQueue = [];
}

export function setToken(token) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}

api.interceptors.response.use(
  response => response,
  async error => {
    const originalRequest = error.config;

    if (error.response && error.response.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise(function(resolve, reject) {
          failedQueue.push({resolve, reject})
        }).then(token => {
          originalRequest.headers['Authorization'] = 'Bearer ' + token;
          return api(originalRequest);
        }).catch(err => {
          return Promise.reject(err);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // try refresh by stored refresh_token first; fallback to cookie-based if backend supports it
        const storedRt = await AsyncStorage.getItem("refresh_token");
        const payload = { refresh_token: storedRt || null };
        const refreshResponse = await axios.post(`${baseURL}/auth/refresh`, payload, { withCredentials: true });
        const newToken = refreshResponse?.data?.access_token;
        const newRt    = refreshResponse?.data?.refresh_token;
        if (!newToken) throw new Error("refresh missing access_token");
        // persist & apply token
        await AsyncStorage.setItem("access_token", newToken);
        if (newRt) await AsyncStorage.setItem("refresh_token", newRt);
        setToken(newToken);
        api.defaults.headers.common.Authorization = `Bearer ${newToken}`;
        processQueue(null, newToken);
        return api(originalRequest);
      } catch (err) {
        processQueue(err, null);
        try { await AsyncStorage.multiRemove(["access_token", "refresh_token"]); } catch (_) {}
        setToken(null);
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// —— Debug interceptors ——
if (DEBUG_API) {
  api.interceptors.request.use((config) => {
    const isAuth =
      config.url?.includes("/auth/login") ||
      config.url?.includes("/auth/register");

    const body =
      isAuth && config.data
        ? { ...config.data, password: "******" }
        : config.data || config.params;

    console.log(
      "[REQ]",
      config.method?.toUpperCase(),
      config.baseURL || baseURL,
      config.url,
      body || ""
    );

    return config;
  });

  api.interceptors.response.use(
    (res) => {
      console.log("[RES]", res.status, res.config.url);
      return res;
    },
    (err) => {
      if (err.response) {
        console.log(
          "[ERR]",
          err.response.status,
          err.config?.url,
          err.response.data?.message || err.response.data
        );
      } else {
        console.log("[ERR] NETWORK", err.message, err.config?.url);
      }
      return Promise.reject(err);
    }
  );
}

export const getHistory = (params) => api.get("/bookings/history", { params });

export default api;