import React, { useState, useRef, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { COLORS } from "../theme";
import storage from "../utils/storage";
import { requestOtp, verifyOtp, OTP_LENGTH } from "../utils/authApi";

// Seconds before "Resend" becomes tappable. Every resend costs an SMS and the
// first one is usually just slow, so the wait is the cheapest thing that stops
// a queue of duplicate messages.
const RESEND_AFTER = 30;

export default function OtpScreen({ navigation, route }) {
  const phone = route.params?.phone || "";
  const [otp, setOtp] = useState(Array(OTP_LENGTH).fill(""));
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  const [seconds, setSeconds] = useState(RESEND_AFTER);
  const refs = useRef([]);

  const code = otp.join("");
  const complete = code.length === OTP_LENGTH;
  const canVerify = complete && !verifying && !expired;

  // Only present while the backend's test-number mode is on, so the flow can
  // be driven without a handset. Absent in normal operation.
  const testOtp = route.params?.testOtp || null;

  useEffect(() => {
    if (seconds <= 0) return undefined;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  const handle = (i, v) => {
    if (!/^[0-9]?$/.test(v)) return;
    const next = [...otp];
    next[i] = v;
    setOtp(next);
    if (error) setError("");
    if (v && i < OTP_LENGTH - 1) refs.current[i + 1]?.focus();
  };

  // Backspace on an empty box steps back, so a mistyped code can be cleared
  // without reaching for each box in turn.
  const handleKey = (i, e) => {
    if (e.nativeEvent.key === "Backspace" && !otp[i] && i > 0) refs.current[i - 1]?.focus();
  };

  const clear = () => {
    setOtp(Array(OTP_LENGTH).fill(""));
    refs.current[0]?.focus();
  };

  const submit = async () => {
    setVerifying(true);
    setError("");
    const r = await verifyOtp(phone, code);
    setVerifying(false);

    if (!r.ok) {
      setError(r.message);
      // An expired or spent code cannot be retyped into working. The boxes are
      // disabled and the only way forward is Resend, which is made available
      // immediately rather than behind the countdown.
      if (r.code === "OTP_EXPIRED" || r.code === "OTP_LOCKED") {
        setExpired(true);
        setSeconds(0);
      } else {
        clear();
      }
      return;
    }

    // A real signed token from the server, not a marker string. SplashScreen
    // reads this back to decide whether a session exists.
    await storage.setItem("userToken", r.token);
    // Persisted so ConfirmBookingScreen can send it as patientPhone — same key
    // FreezerBoxBookingScreen.js already reads.
    await storage.setItem("user_phone", phone);
    navigation.replace("Main");
  };

  const resend = async () => {
    setResending(true);
    setError("");
    const r = await requestOtp(phone);
    setResending(false);

    if (!r.ok) {
      setError(r.message);
      return;
    }
    setExpired(false);
    setSeconds(RESEND_AFTER);
    clear();
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
        <Text style={{ color: COLORS.text, fontSize: 20 }}>←</Text>
      </TouchableOpacity>
      <View style={styles.center}>
        <Text style={styles.title}>Verify OTP</Text>
        <Text style={styles.sub}>Enter the {OTP_LENGTH}-digit code sent to +91 {phone}</Text>

        <View style={styles.otpRow}>
          {otp.map((d, i) => (
            <TextInput
              key={i}
              ref={(el) => (refs.current[i] = el)}
              style={[
                styles.box,
                { borderColor: error ? COLORS.red : d ? COLORS.red : COLORS.border },
                expired && styles.boxDisabled,
              ]}
              keyboardType="number-pad"
              maxLength={1}
              value={d}
              editable={!verifying && !expired}
              onChangeText={(v) => handle(i, v)}
              onKeyPress={(e) => handleKey(i, e)}
              autoFocus={i === 0}
            />
          ))}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {testOtp ? (
          <Text style={styles.testHint}>Test mode — your code is {testOtp}</Text>
        ) : null}

        <TouchableOpacity
          style={[styles.btn, { opacity: canVerify ? 1 : 0.4 }]}
          disabled={!canVerify}
          onPress={submit}
        >
          {verifying
            ? <ActivityIndicator color={COLORS.white} />
            : <Text style={styles.btnText}>Verify &amp; Continue</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={resend} disabled={seconds > 0 || resending}>
          <Text style={styles.resend}>
            Didn't get code?{" "}
            <Text style={{ color: seconds > 0 || resending ? COLORS.grayDim : COLORS.red }}>
              {resending ? "Sending…" : seconds > 0 ? `Resend in ${seconds}s` : "Resend"}
            </Text>
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: 28, paddingTop: 60 },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.bg3, alignItems: "center", justifyContent: "center" },
  center: { flex: 1, justifyContent: "center" },
  title: { color: COLORS.text, fontSize: 30, fontWeight: "800", marginBottom: 8 },
  sub: { color: COLORS.gray, fontSize: 14, lineHeight: 22, marginBottom: 32 },
  otpRow: { flexDirection: "row", gap: 8, marginBottom: 20, justifyContent: "center" },
  // Narrower than the old four-box row so six fit on a small handset without
  // wrapping. Same height and weight, so the screen reads as it did before.
  box: { flex: 1, maxWidth: 52, height: 62, backgroundColor: COLORS.bg3, borderWidth: 2, borderRadius: 12, textAlign: "center", color: COLORS.text, fontSize: 24, fontWeight: "700" },
  boxDisabled: { opacity: 0.5 },
  error: { color: COLORS.red, fontSize: 13, lineHeight: 19, textAlign: "center", marginBottom: 16 },
  testHint: { color: COLORS.grayDim, fontSize: 12, textAlign: "center", marginBottom: 16 },
  btn: { backgroundColor: COLORS.red, borderRadius: 12, paddingVertical: 16, alignItems: "center", justifyContent: "center", minHeight: 54 },
  btnText: { color: COLORS.white, fontSize: 16, fontWeight: "700" },
  resend: { color: COLORS.grayDim, fontSize: 13, textAlign: "center", marginTop: 18 },
});
