import { useContext, useEffect, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import api from "../api";
import { AuthContext } from "../AuthContext";

const ORANGE = "#D38C28";
const GRAY = "#8C8C8C";
const RED = "#E35545";

const GREEN = "#16a34a";

export default function ProfileScreen({ navigation }) {
  const { user, logout } = useContext(AuthContext);

  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);

  const [username, setUsername] = useState("");
  const [birthDate, setBirthDate] = useState(""); // YYYY-MM-DD or empty
  const [email, setEmail] = useState("");
  const [wallet, setWallet] = useState(0);
  const [plate, setPlate] = useState("");

  const display = (v) => (v === null || v === undefined || v === "" ? "–" : String(v));

  const fmtBirthDate = (v) => {
    const value = display(v);
    return value === "–" ? value : value.slice(0, 10);
  };

  const fmtMoney = (v) => `${Number(v || 0).toFixed(2)} บาท`;

  const goAdmin = () => {
    // AdminTabs is registered at the Root Stack (App.js). When Profile is inside MainTabs,
    // use the parent navigator to reach the root route reliably.
    const parent = navigation?.getParent?.();
    if (parent?.navigate) parent.navigate("AdminTabs");
    else navigation.navigate("AdminTabs");
  };

  const isAdmin = String(user?.role || "").toLowerCase() === "admin";

  useEffect(() => {
    // bootstrap from context first for instant UI
    if (user) {
      setUsername(user.full_name || user.username || "");
      setBirthDate(user.birth_date ? String(user.birth_date).slice(0, 10) : "");
      setEmail(user.email || "");
      setWallet(Number(user.wallet_balance || 0));
      setPlate(user.plate_number || "");
    }
    // then fetch fresh from server
    (async () => {
      try {
        setLoading(true);
        const { data } = await api.get("/users/me");
        setUsername(data?.full_name || data?.username || "");
        setBirthDate(data?.birth_date ? String(data.birth_date).slice(0, 10) : "");
        setEmail(data?.email || "");
        setWallet(Number(data?.wallet_balance || 0));
        setPlate(data?.plate_number || "");
      } catch (e) {
        // keep context values if fetch fails
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      {/* Top bar */}
      <View style={styles.topBar} />
      <ScrollView contentContainerStyle={{ paddingBottom: 110 }}>
        {/* Title */}
        <View style={{ paddingHorizontal: 20, paddingTop: 14 }}>
          <Text style={styles.title}>ข้อมูลผู้ใช้</Text>
          <Text style={styles.subtitle}>จัดการข้อมูลส่วนตัว ดูยอดคงเหลือ และเข้าสู่เครื่องมือของผู้ดูแลระบบ</Text>
          <View style={styles.divider} />
        </View>

        {/* Content */}
        <View style={{ paddingHorizontal: 20, paddingTop: 10 }}>
          {loading ? (
            <View style={{ paddingVertical: 30, alignItems: "center" }}>
              <ActivityIndicator size="large" color={ORANGE} />
              <Text style={{ marginTop: 10, color: GRAY }}>กำลังโหลด...</Text>
            </View>
          ) : (
            <>
              {/* ชื่อ */}
              <Text style={styles.fieldLabel}>ชื่อผู้ใช้</Text>
              {editing ? (
                <TextInput
                  style={styles.input}
                  placeholder="เช่น Alex"
                  value={username}
                  onChangeText={setUsername}
                />
              ) : (
                <Text style={styles.fieldValue}>{display(username)}</Text>
              )}

              {/* วันเกิด */}
              <Text style={styles.fieldLabel}>วันเกิด</Text>
              {editing ? (
                <TextInput
                  style={styles.input}
                  placeholder="2002-08-15"
                  keyboardType="numbers-and-punctuation"
                  value={birthDate}
                  onChangeText={setBirthDate}
                />
              ) : (
                <Text style={styles.fieldValue}>{fmtBirthDate(birthDate)}</Text>
              )}

              {/* อีเมล (อ่านอย่างเดียว) */}
              <Text style={styles.fieldLabel}>อีเมล</Text>
              <Text style={[styles.fieldValue, { color: GRAY }]}>{display(email)}</Text>

              {/* กระเป๋าเงิน */}
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
                <Text style={styles.fieldLabel}>ยอดคงเหลือ</Text>
                <Text style={[styles.fieldValue, { color: GREEN }]}>{fmtMoney(wallet)}</Text>
              </View>

              {/* ทะเบียนรถ */}
              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>ทะเบียนรถ</Text>
              {editing ? (
                <TextInput
                  style={styles.input}
                  placeholder="9กก-1234 กรุงเทพมหานคร"
                  value={plate}
                  onChangeText={setPlate}
                  autoCapitalize="characters"
                />
              ) : (
                <Text style={styles.fieldValue}>{display(plate)}</Text>
              )}

              {isAdmin && (
                <View style={{ marginTop: 18 }}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.adminBtn,
                      pressed && Platform.OS === "ios" ? { opacity: 0.85 } : null,
                    ]}
                    onPress={goAdmin}
                  >
                    <Text style={styles.adminBtnText}>เครื่องมือผู้ดูแลระบบ</Text>
                    <Text style={styles.adminBtnSub}>ไปยังหน้ามอนิเตอร์ แจ้งเตือน และสั่งงานระบบ</Text>
                  </Pressable>
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>

      {/* Bottom buttons */}
      <View style={styles.bottomBar}>
        <Pressable
          style={[styles.btnOutline, { borderColor: RED }]}
          onPress={async () => {
            try {
              await logout();
            } catch (_) {}

            // Reset to Login at the ROOT stack (Profile is inside MainTabs, so we need parent navigators)
            const rootNav = navigation?.getParent?.()?.getParent?.() || navigation?.getParent?.() || navigation;
            try {
              rootNav?.reset?.({ index: 0, routes: [{ name: "Login" }] });
            } catch (_) {
              // fallback
              try { rootNav?.navigate?.("Login"); } catch (_) {}
            }
          }}
        >
          <Text style={[styles.btnOutlineText, { color: RED }]}>ออกจากระบบ</Text>
        </Pressable>

        <Pressable
          style={[styles.btnFilled]}
          onPress={async () => {
            if (!editing) { setEditing(true); return; }
            // save
            try {
              setLoading(true);
              await api.put("/users/me", {
                username: username?.trim() || undefined,
                birth_date: birthDate ? birthDate : null,
                plate_number: plate?.trim() || null,
              });
              setEditing(false);
              Alert.alert("บันทึกแล้ว", "อัปเดตข้อมูลโปรไฟล์สำเร็จ");
              // refresh wallet/name from server (optional)
              const { data } = await api.get("/users/me");
              setUsername(data?.full_name || data?.username || username);
              setBirthDate(data?.birth_date ? String(data.birth_date).slice(0, 10) : birthDate);
              setEmail(data?.email || email);
              setWallet(Number(data?.wallet_balance || wallet));
              setPlate(data?.plate_number || plate);
            } catch (e) {
              Alert.alert("บันทึกไม่สำเร็จ", e?.response?.data?.message || "กรุณาลองใหม่");
            } finally {
              setLoading(false);
            }
          }}
        >
          <Text style={styles.btnFilledText}>{editing ? "บันทึก" : "แก้ไขข้อมูลผู้ใช้"}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  topBar: { height: 88, backgroundColor: ORANGE },
  title: { fontSize: 28, fontWeight: "900", color: ORANGE },
  subtitle: { marginTop: 6, color: "#6B7280", lineHeight: 20 },
  divider: { height: 1, backgroundColor: "#E9E9E9", marginTop: 10 },

  rowBlock: { paddingVertical: 18 },
  nameText: { fontSize: 22, fontWeight: "800", color: "#1F2937" },

  rowLine: {
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: { color: GRAY, fontSize: 16, fontWeight: "700" },
  value: { color: "#1F2937", fontSize: 16, fontWeight: "700" },
  link: { color: ORANGE, fontSize: 16, fontWeight: "800" },

  fieldLabel: { color: GRAY, fontSize: 14, fontWeight: "700", marginTop: 12 },
  fieldValue: { color: "#1F2937", fontSize: 16, fontWeight: "700", marginTop: 6, lineHeight: 22 },
  input: {
    marginTop: 6,
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: "#FAFAFA",
  },

  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 10,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
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

  adminBtn: {
    borderWidth: 2,
    borderColor: ORANGE,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: "#FFF7ED",
  },
  adminBtnText: { fontWeight: "900", fontSize: 16, color: ORANGE },
  adminBtnSub: { marginTop: 4, color: "#666", fontWeight: "700" },
});