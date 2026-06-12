import React, { useContext } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { COLORS, LANGUAGES } from "../theme";
import { AppContext } from "../../App";

const ADDRESSES = [
  { id: 1, label: "Home", icon: "🏠", addr: "12, 4th Cross, Indiranagar, Bangalore" },
  { id: 2, label: "Work", icon: "💼", addr: "Tech Park, Whitefield, Bangalore" },
  { id: 3, label: "Mom's House", icon: "❤️", addr: "45, Jayanagar 7th Block, Bangalore" },
];

export default function ProfileScreen() {
  const { lang, setLang } = useContext(AppContext);
  const nextLang = () => setLang(LANGUAGES[(LANGUAGES.indexOf(lang) + 1) % LANGUAGES.length]);

  const settings = [
    ["🩺", "Medical Information"],
    ["💳", "Payment Methods"],
    ["🛡️", "Insurance"],
    ["🌐", `Language (${lang})`],
    ["⭐", "Rate & Feedback"],
    ["📞", "Help & Support"],
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Profile</Text>
      <ScrollView contentContainerStyle={{ padding: 18 }}>
        <View style={styles.top}>
          <View style={styles.avatar}><Text style={styles.avatarText}>M</Text></View>
          <Text style={styles.name}>Manjunath</Text>
          <Text style={styles.phone}>+91 90088 65545</Text>
        </View>

        <Text style={styles.label}>ADDRESSES</Text>
        {ADDRESSES.map((a) => (
          <View key={a.id} style={styles.addrCard}>
            <View style={styles.addrIcon}><Text style={{ fontSize: 20 }}>{a.icon}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.addrLabel}>{a.label}</Text>
              <Text style={styles.addrText}>{a.addr}</Text>
            </View>
          </View>
        ))}

        <Text style={styles.label}>SETTINGS</Text>
        {settings.map(([ic, l]) => (
          <TouchableOpacity key={l} style={styles.row} onPress={() => l.includes("Language") && nextLang()}>
            <Text style={{ fontSize: 18 }}>{ic}</Text>
            <Text style={styles.rowText}>{l}</Text>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>
        ))}

        <View style={styles.brandFooter}>
          <Text style={styles.brandText}>
            <Text style={{ color: COLORS.red }}>Save</Text>
            <Text style={{ color: COLORS.text }}>Life</Text> 🚑
          </Text>
          <Text style={styles.brandSub}>Powered by MediFleet • v1.0</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingTop: 50 },
  header: { color: COLORS.text, fontSize: 22, fontWeight: "800", paddingHorizontal: 22, paddingBottom: 10 },
  top: { alignItems: "center", paddingVertical: 14 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.red, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  avatarText: { color: COLORS.white, fontWeight: "800", fontSize: 32 },
  name: { color: COLORS.text, fontWeight: "700", fontSize: 20 },
  phone: { color: COLORS.grayDim, fontSize: 13, marginTop: 2 },
  label: { color: COLORS.grayDim, fontSize: 11, fontWeight: "700", letterSpacing: 1.5, marginTop: 20, marginBottom: 12 },
  addrCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: COLORS.bg3, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 13, marginBottom: 10 },
  addrIcon: { width: 42, height: 42, borderRadius: 11, backgroundColor: "rgba(0,0,0,0.05)", alignItems: "center", justifyContent: "center" },
  addrLabel: { color: COLORS.text, fontWeight: "600", fontSize: 14 },
  addrText: { color: COLORS.grayDim, fontSize: 11, marginTop: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.05)" },
  rowText: { flex: 1, color: COLORS.text, fontSize: 14 },
  arrow: { color: COLORS.grayDim, fontSize: 20 },
  brandFooter: { alignItems: "center", paddingVertical: 28 },
  brandText: { fontSize: 22, fontWeight: "800" },
  brandSub: { fontSize: 11, color: COLORS.grayDim, marginTop: 4 },
});
