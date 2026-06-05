import React from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { COLORS } from "../theme";

const FAMILY = [
  { id: 1, name: "Manjunath", rel: "Self", blood: "O+", age: 32, avatar: "M" },
  { id: 2, name: "Lakshmi", rel: "Mother", blood: "B+", age: 58, avatar: "L" },
  { id: 3, name: "Ravi", rel: "Father", blood: "O+", age: 62, avatar: "R" },
];

export default function FamilyScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.header}>Family Profiles</Text>
      <ScrollView contentContainerStyle={{ padding: 18 }}>
        {FAMILY.map((f) => (
          <View key={f.id} style={styles.card}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{f.avatar}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{f.name}</Text>
              <Text style={styles.rel}>{f.rel} • Age {f.age}</Text>
              <Text style={styles.blood}>🩸 {f.blood}</Text>
            </View>
            <TouchableOpacity style={styles.edit}><Text>✏️</Text></TouchableOpacity>
          </View>
        ))}
        <TouchableOpacity style={styles.addBtn}>
          <Text style={styles.addText}>+ Add Family Member</Text>
        </TouchableOpacity>

        <View style={styles.medBox}>
          <Text style={styles.medTitle}>🏥 Medical Info</Text>
          <MedRow l="Blood Group" v="O+" red />
          <MedRow l="Allergies" v="Penicillin" />
          <MedRow l="Conditions" v="Diabetes" />
          <MedRow l="Emergency Contact" v="+91 90088..." />
        </View>
      </ScrollView>
    </View>
  );
}

const MedRow = ({ l, v, red }) => (
  <View style={styles.medRow}>
    <Text style={{ color: COLORS.gray, fontSize: 13 }}>{l}</Text>
    <Text style={{ color: red ? COLORS.red : COLORS.white, fontSize: 13 }}>{v}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingTop: 50 },
  header: { color: COLORS.white, fontSize: 22, fontWeight: "800", paddingHorizontal: 22, paddingBottom: 18 },
  card: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: COLORS.bg3, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, padding: 14, marginBottom: 11 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: COLORS.red, alignItems: "center", justifyContent: "center" },
  avatarText: { color: COLORS.white, fontWeight: "700", fontSize: 18 },
  name: { color: COLORS.white, fontWeight: "700", fontSize: 15 },
  rel: { color: COLORS.grayDim, fontSize: 12, marginTop: 2 },
  blood: { color: COLORS.gray, fontSize: 11, marginTop: 2 },
  edit: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  addBtn: { paddingVertical: 14, backgroundColor: "rgba(232,25,44,0.1)", borderWidth: 1, borderColor: "rgba(232,25,44,0.4)", borderStyle: "dashed", borderRadius: 12, alignItems: "center", marginTop: 4 },
  addText: { color: COLORS.red, fontSize: 14, fontWeight: "600" },
  medBox: { backgroundColor: COLORS.bg3, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, padding: 18, marginTop: 18 },
  medTitle: { color: COLORS.white, fontWeight: "700", fontSize: 15, marginBottom: 14 },
  medRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" },
});
