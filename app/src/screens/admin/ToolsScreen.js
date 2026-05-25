import React, { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import api from "../../api";

// Theme (align with user app)
const ORANGE = "#FF7A00";
const GRAY = "#9E9E9E";
const BG = "#FFFFFF";
const RED = "#FF3333";

export default function ToolsScreen() {
  const [slotId, setSlotId] = useState("slot01");
  const [userId, setUserId] = useState("U001");
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);

  const sendCmd = async (action) => {
    if (sending) return;

    const cleanSlotId = String(slotId || "").trim();
    const cleanUserId = String(userId || "").trim();
    const cleanAction = String(action || "").trim().toLowerCase();

    if (!cleanSlotId) {
      setMsg("❌ กรุณาระบุ slotId");
      return;
    }

    if (!/^slot\d+$/i.test(cleanSlotId)) {
      setMsg("❌ รูปแบบช่องจอดไม่ถูกต้อง (เช่น slot01)");
      return;
    }

    try {
      setSending(true);
      setMsg("กำลังส่งคำสั่ง...");

      const payload = {
        slotId: cleanSlotId,
        action: cleanAction,
        userId: cleanUserId || undefined,
      };

      console.log("[AdminTools] POST /admin/commands", payload);
      await api.post("/admin/commands", payload);
      setMsg(`✅ ระบบส่งคำสั่ง ${cleanAction} ไปยัง ${cleanSlotId} แล้ว`);
    } catch (e) {
      const message =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        e?.message ||
        "Command failed";
      console.log("[AdminTools] command error:", message);
      setMsg(`❌ ${message}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerCard}>
        <Text style={styles.title}>เครื่องมือจัดการระบบ</Text>
        <Text style={styles.subtitle}>
          หน้านี้ใช้ส่งคำสั่งไปยัง Backend ก่อน แล้วให้ Backend เป็นตัวกลางคุยกับ IoT
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>ส่งคำสั่งไปยังช่องจอด</Text>

        <Text style={styles.label}>ช่องจอด (slotId)</Text>
        <TextInput
          value={slotId}
          onChangeText={setSlotId}
          autoCapitalize="none"
          style={styles.input}
          placeholder="slot01"
        />

        <Text style={styles.label}>รหัสผู้ใช้ (ไม่บังคับ)</Text>
        <TextInput
          value={userId}
          onChangeText={setUserId}
          autoCapitalize="none"
          style={styles.input}
          placeholder="U001"
        />


        <View style={styles.btnRow}>
          <Pressable
            onPress={() => { void sendCmd("reserve"); }}
            style={[styles.btn, styles.btnPrimary, sending && styles.btnDisabled]}
            disabled={sending}
          >
            <Text style={styles.btnText}>จอง</Text>
          </Pressable>
          <Pressable
            onPress={() => { void sendCmd("cancel"); }}
            style={[styles.btn, styles.btnGhost, sending && styles.btnDisabledGhost]}
            disabled={sending}
          >
            <Text style={[styles.btnText, styles.btnGhostText]}>ยกเลิก</Text>
          </Pressable>
        </View>

        <View style={styles.btnRow}>
          <Pressable
            onPress={() => { void sendCmd("expire"); }}
            style={[styles.btn, styles.btnGhost, sending && styles.btnDisabledGhost]}
            disabled={sending}
          >
            <Text style={[styles.btnText, styles.btnGhostText]}>หมดเวลา</Text>
          </Pressable>
          <Pressable
            onPress={() => { void sendCmd("confirm"); }}
            style={[styles.btn, styles.btnPrimary, sending && styles.btnDisabled]}
            disabled={sending}
          >
            <Text style={styles.btnText}>ยืนยัน</Text>
          </Pressable>
        </View>

        {!!msg && <Text style={[styles.msg, msg.startsWith("❌") && styles.msgError]}>{msg}</Text>}

        <Text style={styles.hint}>
          * ระบบจะตรวจสิทธิ์และสถานะเซนเซอร์ก่อนส่งคำสั่งไปยังอุปกรณ์
        </Text>
      </View>
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
  subtitle: { color: "#666", lineHeight: 20 },

  card: {
    borderWidth: 1,
    borderColor: "#EEE",
    borderRadius: 14,
    padding: 14,
    backgroundColor: "#FFF",
  },
  cardTitle: { fontWeight: "900", marginBottom: 10, color: ORANGE },

  label: { marginTop: 8, marginBottom: 6, color: GRAY, fontWeight: "800" },
  input: {
    borderWidth: 1,
    borderColor: "#EEE",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#FFF",
  },

  btnRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: "#FFF", fontWeight: "900" },

  btnPrimary: { backgroundColor: ORANGE },
  btnDisabled: { opacity: 0.6 },
  btnDisabledGhost: { opacity: 0.6 },
  btnGhost: { borderWidth: 1, borderColor: "#EEE", backgroundColor: "#FFF" },
  btnGhostText: { color: ORANGE },

  msg: { marginTop: 10, color: "#111", fontWeight: "800", lineHeight: 20 },
  msgError: { color: RED },
  hint: { marginTop: 12, color: "#777", fontSize: 12, lineHeight: 18 },
});