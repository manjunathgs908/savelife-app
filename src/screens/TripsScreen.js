import React from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { COLORS } from "../theme";

const HISTORY = [
  { id: 1, type: "BLS", date: "May 28, 2026", from: "Indiranagar", to: "Manipal Hospital", fare: "₹800" },
  { id: 2, type: "ALS", date: "May 15, 2026", from: "Whitefield", to: "Columbia Asia", fare: "₹1,500" },
  { id: 3, type: "ICU", date: "Apr 30, 2026", from: "Jayanagar", to: "Apollo Hospital", fare: "₹2,500" },
];

export default function TripsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.header}>Booking History</Text>
      <ScrollView contentContainerStyle={{ padding: 18 }}>
        {HISTORY.map((h) => (
          <View key={h.id} style={styles.card}>
            <View style={styles.top}>
              <Text style={styles.type}>🚑 {h.type} Ambulance</Text>
              <Text style={styles.status}>Completed</Text>
            </View>
            <Text style={styles.date}>{h.date}</Text>
            <Text style={styles.route}>
              <Text style={{ color: "rgba(255,255,255,0.3)" }}>● </Text>{h.from}{"\n"}
              <Text style={{ color: COLORS.red }}>● </Text>{h.to}
            </Text>
            <View style={styles.footer}>
              <Text style={styles.fare}>{h.fare}</Text>
              <Text style={styles.rebook}>Rebook →</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingTop: 50 },
  header: { color: COLORS.white, fontSize: 22, fontWeight: "800", paddingHorizontal: 22, paddingBottom: 18 },
  card: { backgroundColor: COLORS.bg3, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, padding: 16, marginBottom: 12 },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  type: { color: COLORS.white, fontWeight: "700", fontSize: 14 },
  status: { color: COLORS.green, fontSize: 11, fontWeight: "600", backgroundColor: "rgba(34,197,94,0.12)", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 100, overflow: "hidden" },
  date: { color: COLORS.grayDim, fontSize: 12, marginTop: 4 },
  route: { color: COLORS.gray, fontSize: 13, marginTop: 10, lineHeight: 22 },
  footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
  fare: { color: COLORS.red, fontWeight: "800", fontSize: 16 },
  rebook: { color: COLORS.gray, fontSize: 13, fontWeight: "600" },
});
