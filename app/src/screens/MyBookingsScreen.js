import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, Alert, ScrollView } from "react-native";
import api from "../api";

const ORANGE = "#D38C28";
const GRAY = "#8C8C8C";
const RED = "#E35545";

function fmtDuration(ms) {
  if (ms < 0) ms = 0;
  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export default function MyBookingsScreen({ navigation }) {
  const [booking, setBooking] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const { data } = await api.get("/bookings/me/current");
      setBooking(data);
    } catch (e) {
      console.log("[ERR] load current", e?.response?.data || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Reload booking whenever screen is focused (to sync with navigation/MQTT)
  useEffect(() => {
    const unsub = navigation?.addListener?.("focus", () => {
      load();
    });
    return unsub;
  }, [navigation]);

  // tick timer for elapsed time
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsedText = useMemo(() => {
    if (!booking) return "";
    const base =
      booking.checked_in_at ||
      booking.checkedInAt ||
      booking.start_time ||
      booking.startTime;
    const start = base ? new Date(base).getTime() : NaN;
    if (!Number.isFinite(start)) return "00:00:00";
    return fmtDuration(now - start);
  }, [booking, now]);

  const handleCancel = async () => {
    if (!booking) return;
    Alert.alert("ยืนยัน", "ต้องการยกเลิกการจองใช่หรือไม่?", [
      { text: "ไม่ใช่" },
      {
        text: "ยกเลิก",
        style: "destructive",
        onPress: async () => {
          try {
            setLoading(true);
            await api.post(`/bookings/${booking.reservation_id}/cancel`);
            Alert.alert("สำเร็จ", "ยกเลิกการจองแล้ว");
            await load();
            navigation?.navigate?.("Locations") || navigation?.goBack?.();
          } catch (e) {
            Alert.alert("ผิดพลาด", e?.response?.data?.message || e.message);
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      <View style={styles.topBar} />
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 14 }}>
          <Text style={styles.title}>{booking?.location_name || "ข้อมูลที่จอดรถ"}</Text>
          <View style={styles.divider} />
        </View>

        {booking ? (
          <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
            <Text style={styles.sectionTitle}>ข้อมูลที่จอดรถ</Text>

            <View style={styles.rowLine}>
              <Text style={styles.label}>ชั้น</Text>
              <Text style={styles.value}>{booking.floor_number ?? "-"}</Text>
            </View>
            <View style={styles.rowLine}>
              <Text style={styles.label}>เลขที่เสา</Text>
              <Text style={styles.value}>{booking.space_number ?? "-"}</Text>
            </View>
            <View style={styles.rowLine}>
              <Text style={styles.label}>สถานะ</Text>
              <Text style={styles.value}>{booking.status}</Text>
            </View>

            {booking.status === "checked-in" ? (
              <View style={[styles.elapsedBox, { marginTop: 24 }]}>
                <Text style={styles.elapsedLabel}>เวลาที่จอดแล้ว</Text>
                <Text style={styles.elapsedValue}>{elapsedText}</Text>
              </View>
            ) : (
              <View style={{ marginTop: 24 }}>
                <Text style={{ color: GRAY }}>
                  ยังไม่ยืนยันการจอด (แสดงเวลาเมื่อกดยืนยันการจอดและเข้าสถานะกำลังจอด)
                </Text>
              </View>
            )}
          </View>
        ) : (
          <View style={{ paddingHorizontal: 20, paddingTop: 24 }}>
            <Text style={{ fontSize: 18 }}>ไม่มีการจองที่ใช้งานอยู่</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.bottomBar}>
        {booking && booking.status !== "checked-in" ? (
          <Pressable
            style={[
              styles.btnOutline,
              { borderColor: RED, opacity: loading ? 0.6 : 1 },
            ]}
            onPress={handleCancel}
            disabled={loading}
          >
            <Text style={[styles.btnOutlineText, { color: RED }]}>ยกเลิกการจอง</Text>
          </Pressable>
        ) : (
          <View style={{ height: 52 }} />
        )}
        <Pressable style={styles.btnFilled} onPress={() => navigation?.navigate?.("Locations") || navigation?.goBack?.()}>
          <Text style={styles.btnFilledText}>กลับหน้าหลัก</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { height: 88, backgroundColor: ORANGE },
  title: { fontSize: 28, fontWeight: "900", color: ORANGE },
  divider: { height: 1, backgroundColor: "#E9E9E9", marginTop: 8 },
  sectionTitle: { fontSize: 26, fontWeight: "900", marginBottom: 8, marginTop: 12 },
  rowLine: {
    paddingVertical: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: { color: GRAY, fontSize: 18, fontWeight: "700" },
  value: { color: "#111827", fontSize: 20, fontWeight: "700" },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 10,
    backgroundColor: "#fff",
  },
  btnOutline: {
    borderWidth: 2,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  btnOutlineText: { fontWeight: "800", fontSize: 16 },
  btnFilled: {
    backgroundColor: ORANGE,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnFilledText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  elapsedBox: {
    borderWidth: 1,
    borderColor: ORANGE,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  elapsedLabel: { color: ORANGE, fontWeight: "800", fontSize: 16, marginBottom: 6 },
  elapsedValue: { color: ORANGE, fontWeight: "900", fontSize: 28 },
});