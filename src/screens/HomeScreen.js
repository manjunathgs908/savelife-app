import React, { useState, useContext, useRef } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Animated, Easing } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { COLORS, SERVICES, LANGUAGES, t } from "../theme";
import { AppContext } from "../../App";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export default function HomeScreen({ navigation }) {
  const { lang, setLang } = useContext(AppContext);
  const [holding, setHolding] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const holdAnim = useRef(null);

  const R = 100;
  const CIRC = 2 * Math.PI * R;
  const dashOffset = progress.interpolate({ inputRange: [0, 1], outputRange: [CIRC, 0] });

  const nextLang = () => {
    const idx = LANGUAGES.indexOf(lang);
    setLang(LANGUAGES[(idx + 1) % LANGUAGES.length]);
  };

  const startHold = () => {
    setHolding(true);
    Animated.timing(scale, { toValue: 0.95, duration: 100, useNativeDriver: true }).start();
    holdAnim.current = Animated.timing(progress, { toValue: 1, duration: 1200, easing: Easing.linear, useNativeDriver: false });
    holdAnim.current.start(({ finished }) => {
      if (finished) {
        setHolding(false);
        progress.setValue(0);
        scale.setValue(1);
        navigation.navigate("SelectType");
      }
    });
  };
  const endHold = () => {
    setHolding(false);
    if (holdAnim.current) holdAnim.current.stop();
    Animated.parallel([
      Animated.timing(progress, { toValue: 0, duration: 200, useNativeDriver: false }),
      Animated.timing(scale, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>
            <Text style={{ color: COLORS.red }}>Save</Text>
            <Text style={{ color: COLORS.white }}>Life</Text> 🚑
          </Text>
          <Text style={styles.location}>📍 Indiranagar, Bangalore</Text>
        </View>
        <TouchableOpacity style={styles.langBtn} onPress={nextLang}>
          <Text style={styles.langText}>{lang}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.emergencyTag}>
        ● {t(lang, "EMERGENCY READY", "ತುರ್ತು ಸಿದ್ಧ", "आपातकालीन तैयार", "అత్యవసర సిద్ధం", "அவசர தயார்", "അടിയന്തിര തയ്യാർ")}
      </Text>

      {/* Big button */}
      <View style={styles.btnArea}>
        <Svg width={210} height={210} style={StyleSheet.absoluteFill} viewBox="0 0 220 220">
          <Circle cx="110" cy="110" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
          <AnimatedCircle
            cx="110" cy="110" r={R} fill="none" stroke={COLORS.red} strokeWidth="5"
            strokeDasharray={CIRC} strokeDashoffset={dashOffset} strokeLinecap="round"
            transform="rotate(-90 110 110)"
          />
        </Svg>
        <Animated.View style={{ transform: [{ scale }] }}>
          <TouchableOpacity
            activeOpacity={1}
            onPressIn={startHold}
            onPressOut={endHold}
            style={styles.bigBtn}
          >
            <Text style={{ fontSize: 42 }}>🚑</Text>
            <Text style={styles.btnTitle}>{t(lang, "BOOK", "ಬುಕ್", "बुक", "బుక్", "புக்", "ബുക്")}</Text>
            <Text style={styles.btnSub}>{t(lang, "AMBULANCE", "ಆಂಬುಲೆನ್ಸ್", "एम्बुलेंस", "అంబులెన్స్", "ஆம்புலன்ஸ்", "ആംബുലൻസ്")}</Text>
            <View style={styles.oneTap}>
              <Text style={styles.oneTapText}>{t(lang, "ONE TAP", "ಒಂದೇ ಟ್ಯಾಪ್", "एक टैप", "ఒకే ట్యాప్", "ஒரே தட்டு", "ഒറ്റ ടാപ്പ്")}</Text>
            </View>
          </TouchableOpacity>
        </Animated.View>
      </View>
      <Text style={styles.hint}>
        {holding ? "Hold..." : t(lang, "Press & hold to book", "ಒತ್ತಿ ಹಿಡಿಯಿರಿ", "दबाकर रखें", "నొక్కి పట్టుకోండి", "அழுத்திப் பிடிக்கவும்", "അമർത്തിപ്പിടിക്കുക")}
      </Text>

      {/* Services */}
      <Text style={styles.servicesLabel}>ALL SERVICES</Text>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.grid}>
        {SERVICES.map((s) => (
          <TouchableOpacity
            key={s.label}
            style={styles.card}
            onPress={() => navigation.navigate(s.screen, { service: "bls", serviceName: s.label })}
          >
            <Text style={{ fontSize: 26 }}>{s.icon}</Text>
            <Text style={styles.cardLabel}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingTop: 50 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 22 },
  brand: { fontSize: 24, fontWeight: "800" },
  location: { color: COLORS.grayDim, fontSize: 12, marginTop: 3 },
  langBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(232,25,44,0.12)", borderWidth: 1, borderColor: "rgba(232,25,44,0.3)", alignItems: "center", justifyContent: "center" },
  langText: { color: COLORS.red, fontWeight: "700", fontSize: 13 },
  emergencyTag: { color: COLORS.red, fontSize: 10, fontWeight: "700", letterSpacing: 2, paddingHorizontal: 22, paddingTop: 18 },
  btnArea: { alignItems: "center", justifyContent: "center", height: 220, marginVertical: 4 },
  bigBtn: { width: 160, height: 160, borderRadius: 80, backgroundColor: COLORS.red, alignItems: "center", justifyContent: "center", shadowColor: COLORS.red, shadowOpacity: 0.6, shadowRadius: 30, elevation: 16 },
  btnTitle: { color: COLORS.white, fontSize: 18, fontWeight: "900", letterSpacing: 2, marginTop: 3 },
  btnSub: { color: "rgba(255,255,255,0.85)", fontSize: 9, fontWeight: "600", letterSpacing: 1 },
  oneTap: { marginTop: 6, backgroundColor: "rgba(0,0,0,0.25)", paddingHorizontal: 10, paddingVertical: 2, borderRadius: 100 },
  oneTapText: { color: COLORS.white, fontSize: 8, fontWeight: "700", letterSpacing: 1 },
  hint: { textAlign: "center", color: COLORS.grayDim, fontSize: 11, marginBottom: 12 },
  servicesLabel: { color: COLORS.grayDim, fontSize: 11, fontWeight: "700", letterSpacing: 1.5, paddingHorizontal: 22, paddingBottom: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", paddingHorizontal: 18, paddingBottom: 20 },
  card: { width: "31%", aspectRatio: 1, backgroundColor: COLORS.bg3, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, alignItems: "center", justifyContent: "center", marginBottom: 10, gap: 8 },
  cardLabel: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "500", textAlign: "center" },
});
