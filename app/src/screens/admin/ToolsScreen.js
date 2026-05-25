import React, { useState } from "react";
import {
  Pressable,
  ScrollView,
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

  const [discountMinutes, setDiscountMinutes] = useState("60");
  const [generatedCode, setGeneratedCode] = useState("");

  const [freeMinutes, setFreeMinutes] = useState("0");
  const [billingBlockMin, setBillingBlockMin] = useState("1");
  const [ratePer30Min, setRatePer30Min] = useState("5");
  const [dailyMax, setDailyMax] = useState("100");

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

  const handleGenerateCode = async () => {
    try {

      const { data } = await api.post(
        "/admin/discount-codes",
        {
          discount_minutes:
            Number(discountMinutes)
        }
      );

      setGeneratedCode(
        data?.item?.code || ""
      );

      setMsg("✅ สร้างโค้ดสำเร็จ");

    } catch (e) {

      setMsg(
        `❌ ${e?.response?.data?.message ||
        "สร้างโค้ดไม่สำเร็จ"
        }`
      );
    }
  };

  const handleUpdateParkingFee =
    async () => {

      try {

        await api.post(
          "/admin/parking-fee",
          {
            free_minutes:
              Number(freeMinutes),

            billing_block_min:
              Number(billingBlockMin),

            rate_per_30min:
              Number(ratePer30Min),

            daily_max:
              Number(dailyMax)
          }
        );

        setMsg(
          "✅ อัปเดตค่าจอดสำเร็จ"
        );

      } catch (e) {

        setMsg(
          `❌ ${e?.response?.data?.message ||
          "อัปเดตค่าจอดไม่สำเร็จ"
          }`
        );

      }
    };

  return (

    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
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

        <View
          style={{
            marginTop: 25,
            paddingTop: 20,
            borderTopWidth: 1,
            borderColor: "#EEE"
          }}
        >

          <Text
            style={styles.cardTitle}
          >
            สร้างโค้ดส่วนลด
          </Text>

          <TextInput
            value={discountMinutes}
            onChangeText={setDiscountMinutes}
            keyboardType="numeric"
            style={styles.input}
            placeholder="60"
          />

          <Pressable
            onPress={handleGenerateCode}
            style={[
              styles.btn,
              styles.btnPrimary,
              { marginTop: 10 }
            ]}
          >
            <Text style={styles.btnText}>
              สร้างโค้ด
            </Text>
          </Pressable>

          {!!generatedCode && (

            <Text
              style={{
                marginTop: 10,
                fontWeight: "800",
                fontSize: 16
              }}
            >
              Code:
              {generatedCode}
            </Text>

          )}

        </View>


        <View
          style={{
            marginTop: 25,
            paddingTop: 20,
            borderTopWidth: 1,
            borderColor: "#EEE"
          }}
        >

          <Text style={styles.label}>

            ฟรีกี่นาที

          </Text>

          <TextInput

            value={freeMinutes}

            onChangeText={setFreeMinutes}

            keyboardType="numeric"

            style={styles.input}

            placeholder="เช่น 15"

          />

          <Text style={styles.inputHint}>

            15 = ฟรี 15 นาทีแรก

          </Text>

          <Text style={styles.label}>

            คิดเงินทุกกี่นาที

          </Text>

          <TextInput

            value={billingBlockMin}

            onChangeText={setBillingBlockMin}

            keyboardType="numeric"

            style={styles.input}

            placeholder="เช่น 30"

          />

          <Text style={styles.inputHint}>

            30 = คิดค่าจอดทุก 30 นาที

          </Text>

          <Text style={styles.label}>

            ราคา/รอบ

          </Text>

          <TextInput

            value={ratePer30Min}

            onChangeText={setRatePer30Min}

            keyboardType="numeric"

            style={styles.input}

            placeholder="เช่น 20"

          />

          <Text style={styles.inputHint}>

            20 = 20 บาทต่อรอบ

          </Text>

          <Text style={styles.label}>

            ราคาสูงสุด

          </Text>

          <TextInput

            value={dailyMax}

            onChangeText={setDailyMax}

            keyboardType="numeric"

            style={styles.input}

            placeholder="เช่น 250"

          />

          <Text style={styles.inputHint}>

            250 = เก็บไม่เกิน 250 บาท

          </Text>

          <Pressable

            onPress={() => {

              void handleUpdateParkingFee();

            }}

            style={[

              styles.btn,

              styles.btnPrimary,

              styles.singleBtn

            ]}

          >

            <Text style={styles.btnText}>

              บันทึกค่าจอดรถ

            </Text>

          </Pressable>

          <TextInput
            value={freeMinutes}
            onChangeText={setFreeMinutes}
            style={styles.input}
            placeholder="ฟรี"
          />

          <TextInput
            value={billingBlockMin}
            onChangeText={setBillingBlockMin}
            style={styles.input}
            placeholder="คิดทุก"
          />

          <TextInput
            value={ratePer30Min}
            onChangeText={setRatePer30Min}
            style={styles.input}
            placeholder="ราคา"
          />

          <TextInput
            value={dailyMax}
            onChangeText={setDailyMax}
            style={styles.input}
            placeholder="สูงสุด"
          />

          <Pressable
            onPress={handleUpdateParkingFee}
            style={[
              styles.btn,
              styles.btnPrimary,
              { marginTop: 10 }
            ]}
          >
            <Text style={styles.btnText}>
              บันทึก
            </Text>
          </Pressable>

        </View>

        {!!msg && <Text style={[styles.msg, msg.startsWith("❌") && styles.msgError]}>{msg}</Text>}

        <Text style={styles.hint}>
          * ระบบจะตรวจสิทธิ์และสถานะเซนเซอร์ก่อนส่งคำสั่งไปยังอุปกรณ์
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG
  },

  content: {
    padding: 16,
    paddingBottom: 40
  },

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
  inputHint: {
    marginTop: 4,
    marginBottom: 8,
    fontSize: 12,
    color: "#777",
  },
  hint: { marginTop: 12, color: "#777", fontSize: 12, lineHeight: 18 },
});