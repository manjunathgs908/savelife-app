import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Image, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../theme";
import { LEGAL, openLegal } from "../utils/legal";
import storage from "../utils/storage";
import { requestOtp } from "../utils/authApi";

export default function LoginScreen({ navigation }) {
  const [phone, setPhone] = useState("");
  // Starts unticked, always. Never pre-tick a consent box — consent has to be
  // an affirmative action by the user, not a default.
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const valid = phone.length === 10;
  const canContinue = valid && consent && !sending;

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>
        <Text style={{ color: COLORS.red }}>Save</Text>
        <Text style={{ color: COLORS.text }}>Life</Text>
      </Text>
      <View style={styles.center}>
        <Image
          source={require("../../assets/icon.png")}
          style={styles.icon}
          resizeMode="contain"
        />
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
            onChangeText={(v) => {
              setPhone(v.replace(/[^0-9]/g, ""));
              if (error) setError("");
            }}
            editable={!sending}
          />
        </View>

        {/* Whatever the backend could not do, in its own words. Rendered above
            the consent block so it sits next to the field it is about. */}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* Consent gate. Only the box toggles — the paragraph carries the two
            legal links, so a stray tap on the text must not grant consent. */}
        <View style={styles.consentRow}>
          <TouchableOpacity
            onPress={() => setConsent((c) => !c)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: consent }}
            accessibilityLabel="I agree to the terms and consent to data collection"
            style={[styles.checkbox, consent && styles.checkboxOn]}
          >
            {consent && <Ionicons name="checkmark" size={15} color={COLORS.white} />}
          </TouchableOpacity>

          <Text style={styles.consentText}>
            By continuing, I confirm I am 18 or older and I agree to SaveLife's{" "}
            <Text style={styles.link} onPress={() => openLegal(LEGAL.terms)}>
              Terms of Service
            </Text>{" "}
            and{" "}
            <Text style={styles.link} onPress={() => openLegal(LEGAL.privacy)}>
              Privacy Policy
            </Text>
            . I consent to SaveLife collecting my phone number, name, location and
            trip details to provide ambulance services. I can withdraw consent or
            delete my account anytime from my Profile.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.btn, { opacity: canContinue ? 1 : 0.4 }]}
          disabled={!canContinue}
          onPress={async () => {
            // Recorded here, at the affirmative tap, because this button is
            // only reachable with the box ticked (canContinue). SplashScreen
            // reads this key back — without it, a session alone never gets
            // past Login again.
            try {
              await storage.setItem("consentAcceptedAt", new Date().toISOString());
            } catch {
              // Never block the emergency path on a storage write. The cost is
              // that the gate shows again next launch, which is the safe way
              // to fail.
            }

            // The OTP screen is only reachable once an SMS has actually been
            // sent. Navigating first and asking afterwards would show someone
            // six empty boxes and no code on the way.
            setSending(true);
            setError("");
            const r = await requestOtp(phone);
            setSending(false);

            if (!r.ok) {
              setError(r.message);
              return;
            }
            navigation.navigate("Otp", { phone, testOtp: r.testOtp });
          }}
        >
          {sending
            ? <ActivityIndicator color={COLORS.white} />
            : <Text style={styles.btnText}>Get OTP</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: 28, paddingTop: 70 },
  logo: { fontSize: 22, fontWeight: "800" },
  center: { flex: 1, justifyContent: "center" },
  icon: { width: 64, height: 64, marginBottom: 20 },
  title: { color: COLORS.text, fontSize: 30, fontWeight: "800", marginBottom: 8 },
  sub: { color: COLORS.gray, fontSize: 14, lineHeight: 22, marginBottom: 32 },
  phoneRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  cc: { backgroundColor: COLORS.bg3, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 18, justifyContent: "center" },
  ccText: { color: COLORS.text, fontWeight: "600", fontSize: 16 },
  input: { flex: 1, backgroundColor: COLORS.bg3, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 16, color: COLORS.text, fontSize: 16 },
  btn: { backgroundColor: COLORS.red, borderRadius: 12, paddingVertical: 16, alignItems: "center", justifyContent: "center", minHeight: 54 },
  btnText: { color: COLORS.white, fontSize: 16, fontWeight: "700" },
  error: { color: COLORS.red, fontSize: 13, lineHeight: 19, marginTop: -8, marginBottom: 16 },
  consentRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 20 },
  checkbox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 1.5, borderColor: COLORS.border,
    alignItems: "center", justifyContent: "center",
    marginTop: 1,
  },
  checkboxOn: { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
  consentText: { flex: 1, color: COLORS.gray, fontSize: 11.5, lineHeight: 17 },
  link: { color: COLORS.brand, fontWeight: "700" },
});
