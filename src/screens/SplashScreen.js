import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { COLORS } from "../theme";
import storage from "../utils/storage";

export default function SplashScreen({ navigation }) {
  useEffect(() => {
    const t = setTimeout(async () => {
      const token = await storage.getItem("userToken");
      navigation.replace(token ? "Main" : "Login");
    }, 1800);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>
        <Text style={{ color: COLORS.red }}>Save</Text>
        <Text style={{ color: COLORS.text }}>Life</Text>
      </Text>
      <View style={styles.pulse}>
        <Text style={{ fontSize: 52 }}>🚑</Text>
      </View>
      <Text style={styles.tag}>ಒಂದು Tap. ಜೀವ ಉಳಿಸು.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, alignItems: "center", justifyContent: "center" },
  logo: { fontSize: 34, fontWeight: "800", letterSpacing: 1, marginBottom: 40 },
  pulse: {
    width: 120, height: 120, borderRadius: 60, backgroundColor: COLORS.red,
    alignItems: "center", justifyContent: "center",
    shadowColor: COLORS.red, shadowOpacity: 0.6, shadowRadius: 30, elevation: 20,
  },
  tag: { marginTop: 36, color: COLORS.gray, fontSize: 14, letterSpacing: 1 },
});
