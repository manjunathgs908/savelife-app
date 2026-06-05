import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { COLORS } from "../theme";

export default function LoginScreen({ navigation }) {
  const [phone, setPhone] = useState("");
  const valid = phone.length === 10;

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>
        <Text style={{ color: COLORS.red }}>Save</Text>
        <Text style={{ color: COLORS.white }}>Life</Text>
      </Text>
      <View style={styles.center}>
        <Text style={styles.icon}>🚑</Text>
        <Text style={styles.title}>Welcome</Text>
        <Text style={styles.sub}>Enter your phone number to book an ambulance instantly</Text>

        <View style={styles.phoneRow}>
          <View style={styles.cc}><Text style={styles.ccText}>+91</Text></View>
          <TextInput
            style={styles.input}
            placeholder="10 digit number"
            placeholderTextColor={COLORS.grayDim}
            keyboardType="number-pad"
            maxLength={10}
            value={phone}
            onChangeText={(v) => setPhone(v.replace(/[^0-9]/g, ""))}
          />
        </View>

        <TouchableOpacity
          style={[styles.btn, { opacity: valid ? 1 : 0.4 }]}
          disabled={!valid}
          onPress={() => navigation.navigate("Otp", { phone })}
        >
          <Text style={styles.btnText}>Get OTP</Text>
        </TouchableOpacity>

        <Text style={styles.terms}>By continuing you agree to our Terms & Privacy Policy</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: 28, paddingTop: 70 },
  logo: { fontSize: 22, fontWeight: "800" },
  center: { flex: 1, justifyContent: "center" },
  icon: { fontSize: 52, marginBottom: 20 },
  title: { color: COLORS.white, fontSize: 30, fontWeight: "800", marginBottom: 8 },
  sub: { color: COLORS.gray, fontSize: 14, lineHeight: 22, marginBottom: 32 },
  phoneRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  cc: { backgroundColor: COLORS.bg3, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 18, justifyContent: "center" },
  ccText: { color: COLORS.white, fontWeight: "600", fontSize: 16 },
  input: { flex: 1, backgroundColor: COLORS.bg3, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 16, color: COLORS.white, fontSize: 16 },
  btn: { backgroundColor: COLORS.red, borderRadius: 12, paddingVertical: 16, alignItems: "center" },
  btnText: { color: COLORS.white, fontSize: 16, fontWeight: "700" },
  terms: { color: COLORS.grayDim, fontSize: 11, textAlign: "center", marginTop: 20, lineHeight: 16 },
});
