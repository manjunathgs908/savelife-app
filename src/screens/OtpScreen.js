import React, { useState, useRef } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { COLORS } from "../theme";

export default function OtpScreen({ navigation, route }) {
  const phone = route.params?.phone || "";
  const [otp, setOtp] = useState(["", "", "", ""]);
  const refs = useRef([]);
  const valid = otp.every((d) => d);

  const handle = (i, v) => {
    if (!/^[0-9]?$/.test(v)) return;
    const next = [...otp];
    next[i] = v;
    setOtp(next);
    if (v && i < 3) refs.current[i + 1]?.focus();
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
        <Text style={{ color: COLORS.white, fontSize: 20 }}>←</Text>
      </TouchableOpacity>
      <View style={styles.center}>
        <Text style={styles.title}>Verify OTP</Text>
        <Text style={styles.sub}>Enter the 4-digit code sent to +91 {phone}</Text>

        <View style={styles.otpRow}>
          {otp.map((d, i) => (
            <TextInput
              key={i}
              ref={(el) => (refs.current[i] = el)}
              style={[styles.box, { borderColor: d ? COLORS.red : COLORS.border }]}
              keyboardType="number-pad"
              maxLength={1}
              value={d}
              onChangeText={(v) => handle(i, v)}
            />
          ))}
        </View>

        <TouchableOpacity
          style={[styles.btn, { opacity: valid ? 1 : 0.4 }]}
          disabled={!valid}
          onPress={() => navigation.replace("Main")}
        >
          <Text style={styles.btnText}>Verify & Continue</Text>
        </TouchableOpacity>

        <Text style={styles.resend}>Didn't get code? <Text style={{ color: COLORS.red }}>Resend</Text></Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: 28, paddingTop: 60 },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.bg3, alignItems: "center", justifyContent: "center" },
  center: { flex: 1, justifyContent: "center" },
  title: { color: COLORS.white, fontSize: 30, fontWeight: "800", marginBottom: 8 },
  sub: { color: COLORS.gray, fontSize: 14, lineHeight: 22, marginBottom: 32 },
  otpRow: { flexDirection: "row", gap: 12, marginBottom: 28, justifyContent: "center" },
  box: { width: 56, height: 64, backgroundColor: COLORS.bg3, borderWidth: 2, borderRadius: 14, textAlign: "center", color: COLORS.white, fontSize: 26, fontWeight: "700" },
  btn: { backgroundColor: COLORS.red, borderRadius: 12, paddingVertical: 16, alignItems: "center" },
  btnText: { color: COLORS.white, fontSize: 16, fontWeight: "700" },
  resend: { color: COLORS.grayDim, fontSize: 13, textAlign: "center", marginTop: 18 },
});
