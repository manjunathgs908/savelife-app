import React, { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { COLORS, AMB_TYPES } from "../theme";

export default function SelectTypeScreen({ navigation }) {
  const [selected, setSelected] = useState(null);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
          <Text style={{ color: COLORS.white, fontSize: 20 }}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Select Ambulance</Text>
      </View>
      <Text style={styles.hint}>Choose the type you need</Text>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 18 }}>
        {AMB_TYPES.map((a) => (
          <TouchableOpacity
            key={a.id}
            style={[styles.card, { borderColor: selected === a.id ? COLORS.red : COLORS.border, backgroundColor: selected === a.id ? "rgba(232,25,44,0.08)" : COLORS.bg3 }]}
            onPress={() => setSelected(a.id)}
          >
            <View style={styles.iconBox}><Text style={{ fontSize: 28 }}>{a.icon}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{a.name}</Text>
              <Text style={styles.desc}>{a.desc}</Text>
            </View>
            <View style={[styles.radio, { borderColor: selected === a.id ? COLORS.red : "rgba(255,255,255,0.3)" }]}>
              {selected === a.id && <View style={styles.radioDot} />}
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={{ padding: 18 }}>
        <TouchableOpacity
          style={[styles.btn, { opacity: selected ? 1 : 0.4 }]}
          disabled={!selected}
          onPress={() => navigation.navigate("Booking", { service: selected })}
        >
          <Text style={styles.btnText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingTop: 50 },
  header: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 18 },
  back: { width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.bg3, alignItems: "center", justifyContent: "center" },
  title: { color: COLORS.white, fontSize: 20, fontWeight: "700" },
  hint: { color: COLORS.grayDim, fontSize: 13, paddingHorizontal: 22, paddingVertical: 14 },
  card: { flexDirection: "row", alignItems: "center", gap: 14, padding: 15, borderRadius: 16, borderWidth: 1, marginBottom: 11 },
  iconBox: { width: 50, height: 50, borderRadius: 13, backgroundColor: "rgba(232,25,44,0.1)", alignItems: "center", justifyContent: "center" },
  name: { color: COLORS.white, fontWeight: "700", fontSize: 15 },
  desc: { color: COLORS.grayDim, fontSize: 12, marginTop: 2 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: COLORS.red },
  btn: { backgroundColor: COLORS.red, borderRadius: 12, paddingVertical: 16, alignItems: "center" },
  btnText: { color: COLORS.white, fontSize: 16, fontWeight: "700" },
});
