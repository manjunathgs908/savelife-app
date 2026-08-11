// Prominent disclosure for location, per Google Play's User Data policy.
//
// The rules this satisfies:
//   - the disclosure is in-app, not only in the store listing or policy page
//   - it appears during normal use, immediately before the runtime prompt
//   - it names the data (precise location) and what it is used for
//   - it requires an affirmative tap ("Allow") to proceed to the OS prompt
//   - it does not auto-dismiss: there is no backdrop-tap handler and no timer
//   - dismissal is NOT consent — "Not now" and the Android back button both
//     resolve false and the OS prompt is never reached
//
// <LocationDisclosureHost /> is mounted once in App.js. Every screen calls
// ensureLocationPermission() instead of requestForegroundPermissionsAsync()
// directly, so there is exactly one place the disclosure can be bypassed.
import React, { useState, useRef, useEffect, useCallback } from "react";
import { View, Text, Modal, TouchableOpacity, StyleSheet } from "react-native";
import * as Location from "expo-location";
import { COLORS } from "../theme";

// Set by the host on mount. Module-level so the 12 call sites can stay plain
// async functions rather than each having to render a modal of their own.
let openDisclosure = null;

/**
 * Show the disclosure, then (only on affirmative consent) the OS prompt.
 * @returns {Promise<boolean>} true only if foreground location is granted.
 */
export async function ensureLocationPermission() {
  // Already granted — no OS prompt will appear, so no disclosure is due.
  const current = await Location.getForegroundPermissionsAsync();
  if (current.status === "granted") return true;

  if (!openDisclosure) {
    // Host isn't mounted. Fail closed: better to lose the GPS fix than to hit
    // the OS prompt with no disclosure in front of it.
    if (__DEV__) {
      console.warn(
        "[locationPermission] LocationDisclosureHost is not mounted — " +
          "blocking the request rather than prompting without disclosure."
      );
    }
    return false;
  }

  const accepted = await openDisclosure();
  if (!accepted) return false;

  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === "granted";
}

export function LocationDisclosureHost() {
  const [visible, setVisible] = useState(false);
  const resolver = useRef(null);

  useEffect(() => {
    openDisclosure = () =>
      new Promise((resolve) => {
        resolver.current = resolve;
        setVisible(true);
      });
    return () => {
      openDisclosure = null;
      // Unmounting mid-prompt must not leave a caller awaiting forever.
      resolver.current?.(false);
      resolver.current = null;
    };
  }, []);

  const finish = useCallback((accepted) => {
    setVisible(false);
    const resolve = resolver.current;
    resolver.current = null;
    resolve?.(accepted);
  }, []);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // Android hardware back. Dismissal, never consent.
      onRequestClose={() => finish(false)}
    >
      {/* No onPress on the backdrop — tapping outside must not dismiss. */}
      <View style={s.backdrop}>
        <View style={s.card}>
          <Text style={s.title}>Location access</Text>
          <Text style={s.body}>
            SaveLife needs your precise location to dispatch the nearest
            ambulance to you and to show your pickup point to the driver.
          </Text>

          <TouchableOpacity style={s.allow} activeOpacity={0.85} onPress={() => finish(true)}>
            <Text style={s.allowTxt}>Allow</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.deny} activeOpacity={0.7} onPress={() => finish(false)}>
            <Text style={s.denyTxt}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  card: {
    width: "100%",
    backgroundColor: COLORS.bg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 22,
  },
  title: { color: COLORS.text, fontSize: 19, fontWeight: "800", marginBottom: 10 },
  body: { color: COLORS.gray, fontSize: 14, lineHeight: 21, marginBottom: 22 },
  allow: {
    backgroundColor: COLORS.brand,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
  },
  allowTxt: { color: COLORS.white, fontSize: 15, fontWeight: "700" },
  deny: { paddingVertical: 13, alignItems: "center", marginTop: 4 },
  denyTxt: { color: COLORS.gray, fontSize: 14, fontWeight: "600" },
});
