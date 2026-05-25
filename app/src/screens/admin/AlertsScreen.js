import React, { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import api from "../../api";

const EVENTS_ENDPOINT = "/admin/events";
const POLL_MS = 3000;

const ORANGE = "#FF7A00";
const GRAY = "#9E9E9E";
const BG = "#FFFFFF";

function fmtTime(ms) {
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return String(ms);
  }
}

function fmtRemaining(ms) {
  if (typeof ms !== "number" || isNaN(ms)) return null;
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = String(Math.floor(totalSec / 60)).padStart(2, "0");
  const s = String(totalSec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function statusLabel(status) {
  const s = String(status || "loading").toLowerCase();
  if (s === "ready") return "พร้อมใช้งาน";
  if (s === "refreshing") return "กำลังรีเฟรช";
  if (s === "error") return "โหลดไม่สำเร็จ";
  return "กำลังโหลด";
}

function eventLabel(value) {
  const s = String(value || "").toLowerCase();

  if (s.includes("violation")) return "ตรวจพบการจอดผิดเงื่อนไข";
  if (s.includes("occupied_no_reservation") || s.includes("occupied_unreserved")) {
    return "พบรถจอดโดยไม่มีการจอง";
  }
  if (s.includes("confirm_rejected")) return "การยืนยันการจอดถูกปฏิเสธ";
  if (s.includes("wait_confirm")) return "รอผู้ใช้ยืนยันการจอด";
  if (s.includes("reserved")) return "ช่องจอดถูกจอง";
  if (s.includes("occupied")) return "ช่องจอดกำลังถูกใช้งาน";
  if (s.includes("available") || s.includes("idle")) return "ช่องจอดว่าง";

  return "การแจ้งเตือน";
}

function severityFrom(data) {
  const sev = String(data?.severity || data?.level || "").toLowerCase();
  if (sev.includes("high") || sev.includes("critical")) return "high";
  if (sev.includes("medium") || sev.includes("warn")) return "medium";
  if (sev.includes("low") || sev.includes("info")) return "low";

  const type = String(data?.type || data?.event || data?.state || "").toLowerCase();
  if (
    type.includes("violation") ||
    type.includes("occupied_no_reservation") ||
    type.includes("occupied_unreserved")
  )
    return "high";
  if (type.includes("wait_confirm") || type.includes("confirm_rejected"))
    return "medium";
  return "low";
}

function titleFrom(data) {
  const type = String(data?.type || data?.event || data?.state || "alert").toLowerCase();
  const slotId = data?.slotId || data?.slot;

  const label = eventLabel(type);

  return slotId ? `${label} • ${slotId}` : label;
}

function detailFrom(data) {
  const userId = data?.userId;
  const message = data?.message || data?.msg;
  const remainingMs = data?.remainingMs;
  const parts = [];

  if (userId) parts.push(`ผู้ใช้: ${userId}`);

  const remaining = fmtRemaining(remainingMs);
  if (remaining) parts.push(`เวลาคงเหลือ: ${remaining}`);

  if (message) parts.push(eventLabel(message));
  return parts.join(" • ");
}

function severityRank(severity) {
  const s = String(severity || "low").toLowerCase();
  if (s === "high") return 3;
  if (s === "medium") return 2;
  return 1;
}

export default function AlertsScreen() {
  const [alerts, setAlerts] = useState([]); // newest first
  const [acked, setAcked] = useState({}); // { [key]: true }
  const [loadingStatus, setLoadingStatus] = useState("loading");

  const visibleAlerts = useMemo(() => {
    return alerts.filter((a) => !acked[a.key]);
  }, [alerts, acked]);

  const loadEvents = useCallback(async () => {
    try {
      setLoadingStatus((prev) => (prev === "ready" ? "refreshing" : "loading"));
      const { data } = await api.get(`${EVENTS_ENDPOINT}?limit=100`);
      const items = Array.isArray(data?.items) ? data.items : [];

      const mapped = items.map((item, index) => {
        const state = String(item?.state || item?.type || item?.event || "alert").toLowerCase();
        const slotId = item?.slotId ? String(item.slotId) : undefined;
        const userId = item?.userId ? String(item.userId) : undefined;
        const tsValue = item?.receivedAt || item?.ts || item?.updatedAt;
        const ts = tsValue ? new Date(tsValue).getTime() : Date.now() - index;

        return {
          key: `${slotId || "unknown-slot"}-${state}-${ts}-${index}`,
          ts,
          severity: severityFrom({ ...item, state }),
          title: titleFrom({ ...item, state }),
          detail: detailFrom({ ...item, state }),
          slotId,
          userId,
          raw: item,
          data: item,
        };
      });

      mapped.sort((a, b) => {
        const sev = severityRank(b.severity) - severityRank(a.severity);
        if (sev !== 0) return sev;
        return b.ts - a.ts;
      });

      setAlerts(mapped);
      setLoadingStatus("ready");
    } catch (e) {
      const message =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        e?.message ||
        "Failed to load recent events";
      console.log("[AdminAlerts] loadEvents error:", message);
      setLoadingStatus("error");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadEvents();

      const timer = setInterval(() => {
        void loadEvents();
      }, POLL_MS);

      return () => clearInterval(timer);
    }, [loadEvents])
  );

  const ackOne = (key) => setAcked((prev) => ({ ...prev, [key]: true }));
  const clearAcked = () => setAcked({});
  const clearAll = () => {
    setAcked({});
    setAlerts([]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerCard}>
        <Text style={styles.title}>การแจ้งเตือนระบบ</Text>
        <Text style={styles.subtitle}>
          Status: <Text style={styles.mono}>{statusLabel(loadingStatus)}</Text>
        </Text>
        <View style={styles.summaryRow}>
          <View style={styles.summaryChip}>
            <Text style={styles.summaryText}>ทั้งหมด {alerts.length}</Text>
          </View>
          <View style={styles.summaryChip}>
            <Text style={styles.summaryText}>แสดงอยู่ {visibleAlerts.length}</Text>
          </View>
        </View>

        <View style={styles.actionsRow}>
          <Pressable onPress={clearAcked} style={[styles.btn, styles.btnGhost]}>
            <Text style={[styles.btnText, styles.btnGhostText]}>ยกเลิกการซ่อนทั้งหมด</Text>
          </Pressable>
          <Pressable onPress={clearAll} style={[styles.btn, styles.btnDanger]}>
            <Text style={styles.btnText}>ล้างรายการ</Text>
          </Pressable>
        </View>

        <Pressable onPress={() => { void loadEvents(); }} style={[styles.btn, styles.btnGhost, { marginTop: 10, alignSelf: "flex-start" }]}> 
          <Text style={[styles.btnText, styles.btnGhostText]}>รีเฟรช</Text>
        </Pressable>
      </View>

      <FlatList
        data={visibleAlerts}
        keyExtractor={(item) => item.key}
        contentContainerStyle={visibleAlerts.length ? { paddingBottom: 24 } : styles.emptyWrap}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>ยังไม่มีการแจ้งเตือน</Text>
            <Text style={styles.emptySub}>
              ถ้ายังไม่มีรายการ ให้เช็คว่า Backend เชื่อม MQTT อยู่, IoT ส่ง status กลับมาแล้ว
              และลองกดรีเฟรชอีกครั้ง
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <View style={styles.row}>
                  <Badge severity={item.severity} />
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                </View>
                <Text style={styles.cardMeta}>
                  {fmtTime(item.ts)}
                  {item.userId ? ` • ผู้ใช้ ${item.userId}` : ""}
                  {item.slotId ? ` • ช่อง ${item.slotId}` : ""}
                </Text>
              </View>

              <Pressable onPress={() => ackOne(item.key)} style={styles.ackBtn}>
                <Text style={styles.ackText}>ซ่อน</Text>
              </Pressable>
            </View>

            {!!item.detail && <Text style={styles.cardBody}>{item.detail}</Text>}
          </View>
        )}
      />
    </View>
  );
}

function Badge({ severity }) {
  const s = String(severity || "low").toLowerCase();
  const { bg, fg, label } = (() => {
    if (s === "high") return { bg: "#FFEBEE", fg: "#B71C1C", label: "สำคัญ" };
    if (s === "medium") return { bg: "#FFF3E0", fg: "#E65100", label: "เตือน" };
    return { bg: "#E8F5E9", fg: "#1B5E20", label: "ทั่วไป" };
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
  title: { fontSize: 22, fontWeight: "800", marginBottom: 6, color: "#111" },
  subtitle: { color: "#666", marginBottom: 10, lineHeight: 20 },
  mono: { fontFamily: "monospace", color: "#333" },

  summaryRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  summaryChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "#FDE7CF",
  },
  summaryText: { color: ORANGE, fontWeight: "800", fontSize: 12 },

  actionsRow: { flexDirection: "row", gap: 10 },
  btn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: "#FFF", fontWeight: "800" },
  btnGhost: { borderWidth: 1, borderColor: "#EEE", backgroundColor: "#FFF" },
  btnGhostText: { color: GRAY },
  btnDanger: { backgroundColor: ORANGE },

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
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: "800", color: "#111" },
  cardMeta: { marginTop: 6, color: GRAY, fontSize: 12 },
  cardBody: { marginTop: 10, color: "#333", lineHeight: 20 },

  ackBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#EEE",
    backgroundColor: "#FFF",
  },
  ackText: { color: ORANGE, fontWeight: "900" },

  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeText: { fontSize: 12, fontWeight: "900", letterSpacing: 0.3 },
});