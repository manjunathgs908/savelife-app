import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { COLORS } from "../theme";

export default function HomeCareScreen({ navigation }) {
  return (
    <View style={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation?.goBack()}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Home Care</Text>
      </View>

      {/* Center content */}
      <View style={styles.center}>
        <View style={styles.iconBox}>
          <Text style={styles.icon}>🏠</Text>
          <Text style={styles.iconBadge}>🩺</Text>
        </View>
        <Text style={styles.title}>Home Care</Text>
        <Text style={styles.subtitle}>Coming Soon</Text>
        <Text style={styles.message}>
          We are working on this service.{"\n"}Stay tuned!
        </Text>
      </View>

      {/* Notify Me button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.notifyBtn}
          activeOpacity={0.85}
          onPress={() =>
            Alert.alert("Thank you!", "We will notify you when available!")
          }
        >
          <Text style={styles.notifyBtnText}>🔔  Notify Me</Text>
        </TouchableOpacity>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingTop: 50 },

  // Header
  header: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 18, paddingBottom: 14, borderBottomWidth: 0.5, borderBottomColor: "rgba(255,255,255,0.07)" },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 10 },
  backArrow: { color: COLORS.white, fontSize: 20 },
  headerTitle: { color: COLORS.white, fontSize: 17, fontWeight: "700" },

  // Center
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  iconBox: { width: 100, height: 100, borderRadius: 28, backgroundColor: "rgba(232,25,44,0.1)", borderWidth: 0.5, borderColor: "rgba(232,25,44,0.3)", alignItems: "center", justifyContent: "center", marginBottom: 24, position: "relative" },
  icon: { fontSize: 46 },
  iconBadge: { position: "absolute", bottom: 8, right: 8, fontSize: 20 },
  title: { color: COLORS.white, fontSize: 26, fontWeight: "800", marginBottom: 8 },
  subtitle: { color: COLORS.red, fontSize: 14, fontWeight: "700", letterSpacing: 2, textTransform: "uppercase", marginBottom: 20 },
  message: { color: COLORS.grayDim, fontSize: 15, textAlign: "center", lineHeight: 24 },

  // Footer
  footer: { padding: 18 },
  notifyBtn: { backgroundColor: COLORS.red, borderRadius: 12, paddingVertical: 16, alignItems: "center" },
  notifyBtnText: { color: COLORS.white, fontSize: 15, fontWeight: "700" },
});
