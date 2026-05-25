import { createContext, useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import api, { setToken } from "./api";

export const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [accessToken, setAccessToken] = useState(null);
  const [refreshToken, setRefreshToken] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Keep axios Authorization header in sync with current token
  useEffect(() => {
    setToken(accessToken);
  }, [accessToken]);

  const isAuthenticated = !!accessToken && !!user;
  const authReady = !loading;

  const clearSession = useCallback(async () => {
    setAccessToken(null);
    setRefreshToken(null);
    setUser(null);
    setToken(null);
    await AsyncStorage.multiRemove([
      "access_token",
      "refresh_token",
    ]);
  }, []);

  // --- Load tokens on app start ---
  useEffect(() => {
    (async () => {
      try {
        const storedAccessToken = await AsyncStorage.getItem("access_token");
        const storedRefreshToken = await AsyncStorage.getItem("refresh_token");
        if (storedAccessToken) {
          setAccessToken(storedAccessToken);
          setToken(storedAccessToken);
        }
        if (storedRefreshToken) setRefreshToken(storedRefreshToken);
        // fetch user only if we already have an access token
        if (storedAccessToken) await fetchUser(storedAccessToken);
      } catch (_) {
        await clearSession();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // --- Refresh token ---
  const refreshTokenFunc = useCallback(async () => {
    if (!refreshToken) throw new Error("no refresh token");
    const { data } = await api.post("/auth/refresh", {
      refresh_token: refreshToken,
    });
    if (!data?.access_token || !data?.refresh_token)
      throw new Error("invalid refresh response");
    setAccessToken(data.access_token);
    setRefreshToken(data.refresh_token);
    setToken(data.access_token);
    await AsyncStorage.setItem("access_token", data.access_token);
    await AsyncStorage.setItem("refresh_token", data.refresh_token);
    return data.access_token;
  }, [refreshToken]);

  // --- Fetch current user info ---
  const fetchUser = useCallback(
    async (token = accessToken) => {
      if (!token) return; // no token, do nothing
      try {
        const { data } = await api.get("/auth/me");
        setUser(data);
      } catch (err) {
        const status = err?.response?.status;

        // Some backends return 403 for invalid/expired token
        const isAuthError = status === 401 || status === 403;

        if (isAuthError && refreshToken) {
          // try to refresh once, then retry /auth/me
          try {
            const newAccess = await refreshTokenFunc();
            setToken(newAccess);
            const { data } = await api.get("/auth/me");
            setUser(data);
            return;
          } catch (_) {
            // fall through to logout below
          }
        }

        // if unauthorized/forbidden or other fatal errors -> clear tokens locally only
        if (isAuthError) {
          // Token invalid → clear local state only (do NOT call backend logout)
          await clearSession();
        } else {
          console.warn("fetchUser failed", err?.message || String(err));
        }
      }
    },
    [accessToken, refreshToken, refreshTokenFunc, clearSession]
  );

  // --- Login ---
  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });

    if (!data?.access_token || !data?.refresh_token) {
      throw new Error("Invalid login response");
    }

    setAccessToken(data.access_token);
    setRefreshToken(data.refresh_token);
    setToken(data.access_token);

    await AsyncStorage.setItem("access_token", data.access_token);
    await AsyncStorage.setItem("refresh_token", data.refresh_token);

    if (data.user) {
      setUser(data.user);
    } else {
      await fetchUser(data.access_token);
    }
  };

  // --- Register ---
  const register = async (username, email, password, birth_date) => {
    await api.post("/auth/register", { username, email, password, birth_date });
    await login(email, password);
  };

  // --- Logout ---
  const logout = async () => {
    try {
      if (refreshToken) {
        await api.post("/auth/logout", { refresh_token: refreshToken });
      }
    } catch (err) {
      console.warn("Failed to logout from server", err?.message);
    }
    await clearSession();
  };

  // --- Update user info (future use for Profile edit) ---
  const updateUser = async (updates) => {
    try {
      const { data } = await api.put("/users/me", updates);
      setUser(data);
      return data;
    } catch (err) {
      console.error("Failed to update user", err.message);
      throw err;
    }
  };

  // --- Fetch bookings (optional future) ---
  const fetchBookings = async () => {
    try {
      const { data } = await api.get("/bookings/me/current");
      return data;
    } catch (err) {
      console.warn("Failed to load bookings", err?.message);
      return null;
    }
  };

  // --- Fetch history (optional future) ---
  const fetchHistory = async () => {
    try {
      const { data } = await api.get("/bookings/me/history");
      return data;
    } catch (err) {
      console.warn("Failed to load booking history", err?.message);
      return [];
    }
  };

  return (
    <AuthContext.Provider
      value={{
        accessToken,
        refreshToken,
        user,
        loading,
        authReady,
        isAuthenticated,
        login,
        register,
        logout,
        fetchUser,
        refreshToken: refreshTokenFunc,
        updateUser,
        fetchBookings,
        fetchHistory,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}