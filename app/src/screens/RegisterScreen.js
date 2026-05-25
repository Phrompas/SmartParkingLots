import { useState, useContext } from "react";
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { AuthContext } from "../AuthContext";

const ORANGE = "#D7902E";
const BORDER = "#C9CDD2";

export default function RegisterScreen({ navigation }) {
  const { register } = useContext(AuthContext);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onRegister = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await register(username.trim(), email.trim(), password);
      alert("สมัครสมาชิกสำเร็จ!");
      navigation.replace("Login");
    } catch (e) {
      alert(e?.response?.data?.message || "Register failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.topBar} />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Text style={styles.appTitle}>สร้างบัญชีใหม่</Text>

        <View style={styles.fieldBlock}>
          <Text style={styles.label}>ชื่อผู้ใช้</Text>
          <TextInput
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
        </View>

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

        <View style={styles.fieldBlock}>
          <Text style={styles.label}>รหัสผ่าน</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
        </View>

        <Pressable
          onPress={onRegister}
          disabled={loading || !username || !email || !password}
          style={({ pressed }) => [
            styles.filledBtn,
            (loading || !username || !email || !password) && styles.btnDisabled,
            pressed && styles.btnPressed,
          ]}
        >
          <Text style={styles.filledText}>{loading ? "กำลังสมัคร..." : "ยืนยันการสมัคร"}</Text>
        </Pressable>

        <Pressable onPress={() => navigation.replace("Login")} style={{ marginTop: 20 }}>
          <Text style={{ color: ORANGE, textAlign: "center", fontWeight: "600" }}>
            กลับไปหน้าเข้าสู่ระบบ
          </Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FFFFFF" },
  topBar: { height: 70, backgroundColor: ORANGE },
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 24 },
  appTitle: {
    fontSize: 36,
    fontWeight: "700",
    color: ORANGE,
    marginBottom: 28,
    paddingHorizontal: 8,
  },
  fieldBlock: { marginBottom: 12 },
  label: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  filledBtn: {
    backgroundColor: ORANGE,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
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