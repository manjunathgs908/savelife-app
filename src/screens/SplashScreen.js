import React, { useEffect } from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { COLORS } from "../theme";
import storage from "../utils/storage";

export default function SplashScreen({ navigation }) {
  useEffect(() => {
    const t = setTimeout(async () => {
      // Fail closed: Login unless BOTH a session and a consent record exist.
      // A token alone is not enough — anyone who signed in before the consent
      // gate shipped, or whose data Android restored from a backup, still has
      // a valid-looking token and would otherwise never see the gate.
      let token = null;
      let consentAt = null;
      try {
        [token, consentAt] = await Promise.all([
          storage.getItem("userToken"),
          storage.getItem("consentAcceptedAt"),
        ]);
      } catch {
        // Unreadable storage is not evidence of consent. Both stay null and
        // the user goes to Login, rather than the read throwing and leaving
        // the app stranded on this screen forever.
      }
      navigation.replace(token && consentAt ? "Main" : "Login");
    }, 1800);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={styles.container}>
      <Image
        source={require("../../assets/icon.png")}
        style={styles.logo}
        resizeMode="contain"
      />
      <Text style={styles.wordmark}>SaveLife</Text>
      <Text style={styles.tag}>ಒಂದು Tap. ಜೀವ ಉಳಿಸು.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: { width: 160, height: 160 },
  wordmark: {
    color: COLORS.white,
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: 1,
    marginTop: 24,
  },
  tag: {
    marginTop: 14,
    color: COLORS.white,
    fontSize: 14,
    letterSpacing: 1,
    opacity: 0.9,
  },
});
