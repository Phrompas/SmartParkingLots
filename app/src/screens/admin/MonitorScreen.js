import React, { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import api from "../../api";

const ORANGE = "#FF7A00";
const GRAY = "#9E9E9E";
const BG = "#FFFFFF";

const LIVE_ENDPOINT = "/admin/live";
const POLL_MS = 3000;

function nowIso() {
  return new Date().toISOString();
}

function fmtTime(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function fmtRemaining(ms) {
  if (typeof ms !== "number" || isNaN(ms)) return "-";
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = String(Math.floor(totalSec / 60)).padStart(2, "0");
  const s = String(totalSec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function getLiveRemainingMs(item) {
  if (typeof item?.remainingMs !== "number") return null;

  const updatedAtMs = new Date(item.updatedAt).getTime();
  if (!Number.isFinite(updatedAtMs)) return item.remainingMs;

  const elapsedMs = Date.now() - updatedAtMs;
  return Math.max(0, item.remainingMs - elapsedMs);
}

function statusLabel(status) {
  const s = String(status || "").toLowerCase();

  if (s === "ready") return "พร้อมใช้งาน";
  if (s === "refreshing") return "กำลังรีเฟรช";
  if (s === "error") return "โหลดไม่สำเร็จ";
  if (s === "loading" || !s) return "กำลังโหลด";

  if (s.includes("occupied_no_reservation") || s.includes("occupied_unreserved")) {
    return "มีรถจอดโดยไม่มีการจอง";
  }
  if (s.includes("confirm_rejected")) return "ยืนยันการจอดไม่ผ่าน";
  if (s.includes("wait_confirm")) return "รอผู้ใช้ยืนยันการจอด";
  if (s.includes("available") || s.includes("idle")) return "ว่าง";
  if (s.includes("reserved")) return "ถูกจอง";
  if (s.includes("occupied")) return "กำลังใช้งาน";
  if (s.includes("violation")) return "ยืนยันไม่สำเร็จ";

  return "ไม่ทราบสถานะ";
}

export default function MonitorScreen() {
  const [slots, setSlots] = useState({});
  const [loadingStatus, setLoadingStatus] = useState("loading");
  const [tick, setTick] = useState(0);

  const loadLive = useCallback(async () => {
    try {
      setLoadingStatus((prev) => (prev === "ready" ? "refreshing" : "loading"));

      const { data } = await api.get(LIVE_ENDPOINT);
      const items = Array.isArray(data?.items) ? data.items : [];

      const next = {};

      for (const item of items) {
        const slotId = String(item?.slotId || "").trim();
        if (!slotId) continue;

        const remainingMs =
          typeof item?.remainingMs === "number"
            ? item.remainingMs
            : typeof item?.remainingMs === "string" && item.remainingMs.trim() !== ""
            ? Number(item.remainingMs)
            : undefined;

        next[slotId] = {
          slotId,
          state: String(item?.state || "unknown"),
          userId: item?.userId ? String(item.userId) : undefined,
          remainingMs: Number.isFinite(remainingMs) ? remainingMs : undefined,
          updatedAt: item?.receivedAt || item?.updatedAt || nowIso(),
          topic: item?.topic || "Backend API",
        };
      }

      setSlots(next);
      setLoadingStatus("ready");
    } catch (e) {
      const message =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        e?.message ||
        "Failed to load live statuses";

      console.log("[AdminMonitor] loadLive error:", message);
      setLoadingStatus("error");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadLive();

      const pollTimer = setInterval(() => {
        void loadLive();
      }, POLL_MS);

      const tickTimer = setInterval(() => {
        setTick((x) => x + 1);
      }, 1000);

      return () => {
        clearInterval(pollTimer);
        clearInterval(tickTimer);
      };
    }, [loadLive])
  );

  const list = useMemo(() => {
    const arr = Object.values(slots);

    arr.sort((a, b) => {
      const na = Number(String(a.slotId).replace(/\D/g, ""));
      const nb = Number(String(b.slotId).replace(/\D/g, ""));

      if (!isNaN(na) && !isNaN(nb)) return na - nb;

      return String(a.slotId || "").localeCompare(String(b.slotId || ""));
    });

    return arr;
  }, [slots, tick]);

  return (
    <View style={styles.container}>
      <View style={styles.headerCard}>
        <Text style={styles.headerTitle}>มอนิเตอร์ช่องจอดแบบเรียลไทม์</Text>

        <Text style={styles.headerSub}>
          สถานะระบบ: <Text style={styles.mono}>{statusLabel(loadingStatus)}</Text>
        </Text>

        <Text style={styles.headerHint}>
          หน้านี้ดึงข้อมูลล่าสุดจาก Backend และนับเวลาถอยหลังจากค่า remainingMs ของเซนเซอร์
        </Text>

        <Pressable
          style={styles.refreshBtn}
          onPress={() => {
            void loadLive();
          }}
        >
          <Text style={styles.refreshBtnText}>รีเฟรช</Text>
        </Pressable>
      </View>

      <FlatList
        data={list}
        keyExtractor={(item) => String(item.slotId)}
        contentContainerStyle={list.length ? { paddingBottom: 24 } : styles.emptyWrap}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>ยังไม่มีข้อมูลสถานะ</Text>
            <Text style={styles.emptySub}>
              ถ้ายังไม่มีข้อมูล ให้เช็คว่า Backend เชื่อม MQTT อยู่ และ IoT ส่ง status กลับมาแล้ว
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const liveRemainingMs = getLiveRemainingMs(item);

          return (
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.slotId}>{item.slotId}</Text>
                <Badge state={item.state} />
              </View>

              <View style={styles.kvRow}>
                <Text style={styles.k}>สถานะ</Text>
                <Text style={styles.v}>{statusLabel(item.state)}</Text>
              </View>

              <View style={styles.kvRow}>
                <Text style={styles.k}>ผู้ใช้</Text>
                <Text style={styles.v}>
                  {item.userId ? `User #${item.userId}` : "-"}
                </Text>
              </View>

              <View style={styles.kvRow}>
                <Text style={styles.k}>เวลาคงเหลือ</Text>
                <Text style={styles.v}>{fmtRemaining(liveRemainingMs)}</Text>
              </View>

              <View style={styles.kvRow}>
                <Text style={styles.k}>อัปเดตล่าสุด</Text>
                <Text style={styles.v}>{fmtTime(item.updatedAt)}</Text>
              </View>

              <View style={styles.kvRow}>
                <Text style={styles.k}>แหล่งข้อมูล</Text>
                <Text style={styles.vSmall}>{item.topic}</Text>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

function Badge({ state }) {
  const s = String(state || "").toLowerCase();

  const { bg, fg, label } = (() => {
    if (s.includes("violation"))
      return { bg: "#FFF3E0", fg: "#E65100", label: "ผิดเงื่อนไข" };

    if (s.includes("occupied_no_reservation") || s.includes("occupied_unreserved"))
      return { bg: "#FFEBEE", fg: "#B71C1C", label: "ไม่มีการจอง" };

    if (s.includes("occupied"))
      return { bg: "#FFEBEE", fg: "#B71C1C", label: "ใช้งานอยู่" };

    if (s.includes("wait"))
      return { bg: "#E3F2FD", fg: "#0D47A1", label: "รอยืนยัน" };

    if (s.includes("reserved"))
      return { bg: "#E8F5E9", fg: "#1B5E20", label: "ถูกจอง" };

    if (s.includes("idle") || s.includes("available"))
      return { bg: "#F5F5F5", fg: "#424242", label: "ว่าง" };

    return {
      bg: "#F5F5F5",
      fg: "#424242",
      label: "ไม่ทราบ",
    };
  })();

  return (
    <View style={[styles.badge, { backgroundColor: bg, borderColor: fg }]}>
      <Text style={[styles.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG, padding: 16 },

  headerCard: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#EEE",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },

  headerTitle: { fontSize: 18, fontWeight: "800", color: "#111" },
  headerSub: { marginTop: 6, color: GRAY },
  headerHint: { marginTop: 6, color: "#666", lineHeight: 20 },
  mono: { fontFamily: "monospace" },

  refreshBtn: {
    marginTop: 10,
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#EEE",
    backgroundColor: "#FFF",
  },

  refreshBtnText: { color: ORANGE, fontWeight: "800" },

  emptyWrap: { flexGrow: 1, justifyContent: "center" },

  emptyCard: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#EEE",
    borderRadius: 14,
    padding: 16,
  },

  emptyTitle: { fontSize: 16, fontWeight: "800", color: "#111" },
  emptySub: { marginTop: 6, color: "#666", lineHeight: 20 },

  card: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#EEE",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  slotId: { fontSize: 16, fontWeight: "800", color: "#111" },

  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },

  badgeText: { fontSize: 12, fontWeight: "800", letterSpacing: 0.3 },

  kvRow: { flexDirection: "row", marginTop: 8 },
  k: { width: 92, color: GRAY, fontWeight: "700" },
  v: { flex: 1, color: "#111", fontWeight: "600" },
  vSmall: { flex: 1, color: "#333", fontSize: 12, fontFamily: "monospace" },
});