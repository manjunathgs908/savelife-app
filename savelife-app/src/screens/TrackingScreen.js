import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { COLORS } from "../theme";

export default function TrackingScreen({ navigation }) {
  const [eta, setEta] = useState(7);

  useEffect(() => {
    const i = setInterval(() => setEta((e) => Math.max(0, e - 1)), 1500);
    return () => clearInterval(i);
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.map}>
        <View style={styles.mapTop}>
          <TouchableOpacity style={styles.backLight} onPress={() => navigation.navigate("Main")}>
            <Text style={{ color: COLORS.white, fontSize: 17 }}>←</Text>
          </TouchableOpacity>
          <View style={styles.live}><Text style={styles.liveText}>● LIVE</Text></View>
        </View>
        <Text style={styles.ambEmoji}>🚑</Text>
        <View style={styles.etaFloat}>
          <Text style={styles.etaBig}>{eta}</Text>
          <Text style={styles.etaLbl}>min</Text>
        </View>
      </View>

      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.status}>
          {eta > 4 ? "🔵 Driver on the way" : eta > 1 ? "🟡 Approaching" : "🟢 Almost there!"}
        </Text>
        <View style={styles.driverCard}>
          <View style={styles.avatar}><Text style={styles.avatarText}>RK</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.driverName}>Ravi Kumar</Text>
            <Text style={styles.driverMeta}>BLS • KA-01-AB-1234</Text>
            <Text style={styles.driverRate}>⭐ 4.9 (320 trips)</Text>
          </View>
          <TouchableOpacity style={styles.callBtn}><Text style={{ fontSize: 16 }}>📞</Text></TouchableOpacity>
          <TouchableOpacity style={styles.chatBtn}><Text style={{ fontSize: 16 }}>💬</Text></TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.cancel} onPress={() => navigation.navigate("Main")}>
          <Text style={styles.cancelText}>Cancel Booking</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  map: { height: "45%", backgroundColor: "#0a0d14", paddingTop: 50 },
  mapTop: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 18 },
  backLight: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  live: { backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100, alignSelf: "flex-start" },
  liveText: { color: COLORS.red, fontSize: 10, fontWeight: "800" },
  ambEmoji: { fontSize: 32, position: "absolute", top: "40%", left: "20%" },
  etaFloat: { position: "absolute", bottom: 18, left: 18, backgroundColor: "rgba(0,0,0,0.75)", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, alignItems: "center", borderWidth: 1, borderColor: "rgba(232,25,44,0.4)" },
  etaBig: { color: COLORS.red, fontSize: 26, fontWeight: "900" },
  etaLbl: { color: COLORS.gray, fontSize: 9 },
  sheet: { flex: 1, backgroundColor: COLORS.bg2, borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: -24, padding: 18 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(0,0,0,0.12)", alignSelf: "center", marginBottom: 14 },
  status: { color: COLORS.gray, fontSize: 13, textAlign: "center", marginBottom: 14 },
  driverCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "rgba(0,0,0,0.04)", borderRadius: 14, padding: 13, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.red, alignItems: "center", justifyContent: "center" },
  avatarText: { color: COLORS.white, fontWeight: "700" },
  driverName: { color: COLORS.text, fontWeight: "700", fontSize: 14 },
  driverMeta: { color: COLORS.grayDim, fontSize: 11, marginTop: 2 },
  driverRate: { color: COLORS.gray, fontSize: 11, marginTop: 2 },
  callBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.red, alignItems: "center", justifyContent: "center" },
  chatBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.08)", alignItems: "center", justifyContent: "center" },
  cancel: { marginTop: "auto", paddingVertical: 13, borderWidth: 1, borderColor: "rgba(0,0,0,0.15)", borderRadius: 12, alignItems: "center" },
  cancelText: { color: COLORS.gray, fontSize: 13 },
});
