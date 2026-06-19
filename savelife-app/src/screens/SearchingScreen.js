import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, Easing } from "react-native";
import { COLORS } from "../theme";

export default function SearchingScreen({ navigation, route }) {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true })).start();
    const t = setTimeout(() => navigation.replace("Tracking", route.params), 2500);
    return () => clearTimeout(t);
  }, []);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <View style={styles.container}>
      <View style={styles.spinnerBox}>
        <Animated.View style={[styles.ring, { transform: [{ rotate }] }]} />
        <Text style={{ fontSize: 42 }}>🚑</Text>
      </View>
      <Text style={styles.title}>Finding nearest ambulance</Text>
      <Text style={styles.sub}>🤖 AI dispatching • Detecting location</Text>
      <Text style={styles.loc}>📍 Indiranagar, Bangalore</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, alignItems: "center", justifyContent: "center" },
  spinnerBox: { width: 110, height: 110, alignItems: "center", justifyContent: "center", marginBottom: 24 },
  ring: { position: "absolute", width: 110, height: 110, borderRadius: 55, borderWidth: 3, borderColor: "transparent", borderTopColor: COLORS.red, borderRightColor: COLORS.red },
  title: { color: COLORS.text, fontSize: 18, fontWeight: "700" },
  sub: { color: COLORS.grayDim, fontSize: 12, marginTop: 8 },
  loc: { color: COLORS.red, fontSize: 13, marginTop: 12, fontWeight: "600" },
});
