import { useState, useContext } from "react";
import {
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
} from "react-native";
import { AuthContext } from "../AuthContext";

const ORANGE = "#D7902E";
const BORDER = "#C9CDD2";

export default function LoginScreen({ navigation }) {
  const { login } = useContext(AuthContext);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onLogin = async () => {
    if (loading) return;
    setLoading(true);
    try {
      console.log("[LOGIN] start", { email });
      await login(email.trim(), password);
      console.log("[LOGIN] success");
      setPassword("");
    } catch (e) {
      console.log("[LOGIN] error", e?.response?.data || e?.message);
      Alert.alert("เข้าสู่ระบบไม่สำเร็จ", e?.response?.data?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      {/* แถบสีด้านบน */}
      <View style={styles.topBar} />

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* ชื่อแอป สีส้ม กลางจอ */}
        <Text style={styles.appTitle}>Smart Parking Lot</Text>

        {/* อีเมล */}
        <View style={styles.fieldBlock}>
          <Text style={styles.label}>อีเมล</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
            style={styles.input}
          />
        </View>

        {/* รหัสผ่าน */}
        <View style={styles.fieldBlock}>
          <Text style={styles.label}>รหัสผ่าน</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={onLogin}
            returnKeyType="go"
            style={styles.input}
          />
        </View>

        {/* ปุ่ม – แถวเดียว ซ้ายเป็นเส้นกรอบ ขวาเป็นปุ่มทึบ */}
        <View style={styles.buttonRow}>
          <Pressable
            onPress={() => {
              console.log("[NAV] Register pressed");
              navigation.navigate("Register");
            }}
            accessibilityRole="button"
            testID="btn-go-register"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={({ pressed }) => [styles.outlineBtn, pressed && styles.btnPressed]}
          >
            <Text style={styles.outlineText}>สร้างบัญชีใหม่</Text>
          </Pressable>

          <Pressable
            onPress={onLogin}
            disabled={loading || !email || !password}
            style={({ pressed }) => [
              styles.filledBtn,
              (loading || !email || !password) && styles.btnDisabled,
              pressed && styles.btnPressed,
            ]}
          >
            <Text style={styles.filledText}>{loading ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FFFFFF" },
  topBar: { height: 70, backgroundColor: ORANGE },
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 24 },
  appTitle: {
    fontSize: 40,
    fontWeight: "700",
    color: ORANGE,
    textAlign: "left",
    marginBottom: 28,
    paddingHorizontal: 8,
  },
  fieldBlock: { marginBottom: 12 },
  label: { fontSize: 18, fontWeight: "700", color: "#111827", marginBottom: 8, paddingHorizontal: 8 },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  buttonRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 24, paddingHorizontal: 8 },
  outlineBtn: {
    flex: 1,
    borderWidth: 2,
    borderColor: ORANGE,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginRight: 10,
  },
  outlineText: { color: ORANGE, fontWeight: "700", fontSize: 18 },
  filledBtn: {
    flex: 1,
    backgroundColor: ORANGE,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginLeft: 10,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  filledText: { color: "#fff", fontWeight: "800", fontSize: 18 },
  btnDisabled: { opacity: 0.6 },
  btnPressed: { opacity: 0.9 },
});