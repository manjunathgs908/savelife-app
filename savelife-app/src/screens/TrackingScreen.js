import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  Modal, ScrollView, TextInput, Alert,
} from "react-native";
import { COLORS } from "../theme";

const CANCEL_CHARGE_THRESHOLD_MIN = 5;
const CANCEL_CHARGE_AMOUNT = 500;

const CANCEL_REASONS = [
  { id: "mistake",            label: "Booked by mistake" },
  { id: "improved",           label: "Patient condition improved" },
  { id: "arranged_other",     label: "Family arranged another ambulance" },
  { id: "too_long",           label: "Ambulance taking too long" },
  { id: "wrong_pickup",       label: "Wrong pickup location" },
  { id: "wrong_type",         label: "Wrong ambulance selected" },
  { id: "admitted_elsewhere", label: "Patient admitted elsewhere" },
  { id: "patient_expired",    label: "Patient expired" },
  { id: "other",              label: "Other" },
];

// ─── "Why are you cancelling?" bottom sheet ───────────────────────────────────
function CancelReasonSheet({ visible, chargeApplies, onClose, onConfirm }) {
  const [selectedReason, setSelectedReason] = useState(null);
  const [customReason,   setCustomReason]   = useState("");

  useEffect(() => {
    if (visible) { setSelectedReason(null); setCustomReason(""); }
  }, [visible]);

  const canConfirm = !!selectedReason && (selectedReason !== "other" || customReason.trim().length > 0);

  function handleConfirmPress() {
    const reasonLabel = selectedReason === "other"
      ? customReason.trim()
      : CANCEL_REASONS.find(r => r.id === selectedReason)?.label;
    onConfirm(reasonLabel);
  }

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <TouchableOpacity style={cs.overlay} activeOpacity={1} onPress={onClose} />
      <View style={cs.kvWrap} pointerEvents="box-none">
        <View style={cs.sheet}>
          <View style={cs.handle} />
          <Text style={cs.title}>Why are you cancelling?</Text>

          {chargeApplies && (
            <View style={cs.warningBanner}>
              <Text style={cs.warningIco}>⚠️</Text>
              <Text style={cs.warningTxt}>
                Cancellation charge of ₹{CANCEL_CHARGE_AMOUNT} applies as the ambulance is already en route
              </Text>
            </View>
          )}

          <ScrollView style={cs.reasonList} showsVerticalScrollIndicator={false}>
            {CANCEL_REASONS.map(r => {
              const active = selectedReason === r.id;
              return (
                <TouchableOpacity
                  key={r.id}
                  style={[cs.reasonRow, active && cs.reasonRowActive]}
                  onPress={() => setSelectedReason(r.id)}
                  activeOpacity={0.75}
                >
                  <Text style={[cs.reasonTxt, active && cs.reasonTxtActive]}>{r.label}</Text>
                  <View style={[cs.radio, active && cs.radioActive]}>
                    {active && <View style={cs.radioDot} />}
                  </View>
                </TouchableOpacity>
              );
            })}

            {selectedReason === "other" && (
              <TextInput
                style={cs.customInput}
                placeholder="Please type your reason…"
                placeholderTextColor={COLORS.grayDim}
                value={customReason}
                onChangeText={setCustomReason}
                multiline
                autoFocus
              />
            )}

            <View style={{ height: 8 }} />
          </ScrollView>

          <TouchableOpacity
            style={[cs.confirmBtn, !canConfirm && cs.confirmBtnDisabled]}
            disabled={!canConfirm}
            onPress={handleConfirmPress}
            activeOpacity={canConfirm ? 0.85 : 1}
          >
            <Text style={cs.confirmTxt}>
              {chargeApplies ? `Confirm Cancellation (₹${CANCEL_CHARGE_AMOUNT} charge)` : "Confirm Cancellation"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={cs.goBackBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={cs.goBackTxt}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function TrackingScreen({ navigation, route }) {
  const [eta, setEta] = useState(7);
  const [cancelSheetVisible, setCancelSheetVisible]   = useState(false);
  // Computed fresh at the moment "Cancel Booking" is tapped — NOT derived from
  // render, since the eta countdown's setInterval stops triggering re-renders
  // once eta hits 0 (React bails out when state doesn't change), which would
  // freeze a render-derived value stale long before the 5-minute mark.
  const [cancelChargeApplies, setCancelChargeApplies] = useState(false);

  // Dispatch time — the moment the driver was assigned. This screen always
  // shows an assigned driver immediately, so "assigned" = screen mount time.
  const dispatchTimeRef = useRef(new Date());

  // No real backend booking ID exists yet anywhere upstream (ConfirmBookingScreen
  // posts to /api/trips but never receives/forwards one) — generate a stable
  // client-side reference for this session so cancellation has something to log.
  const bookingIdRef = useRef(route?.params?.bookingId ?? `SL-${Date.now().toString(36).toUpperCase()}`);

  useEffect(() => {
    const i = setInterval(() => setEta((e) => Math.max(0, e - 1)), 1500);
    return () => clearInterval(i);
  }, []);

  function getMinutesElapsed() {
    return (Date.now() - dispatchTimeRef.current.getTime()) / 60000;
  }

  function getCancellationCharge() {
    return getMinutesElapsed() >= CANCEL_CHARGE_THRESHOLD_MIN ? CANCEL_CHARGE_AMOUNT : 0;
  }

  function openCancelSheet() {
    setCancelChargeApplies(getCancellationCharge() > 0);
    setCancelSheetVisible(true);
  }

  function handleCancelConfirm(reasonLabel) {
    const minutesElapsed = getMinutesElapsed();
    const charge = getCancellationCharge();

    const cancellationData = {
      bookingId: bookingIdRef.current,
      cancelledBy: "Customer",
      cancelReason: reasonLabel,
      cancelTime: new Date().toISOString(),
      cancellationCharge: charge,
      minutesElapsedSinceDispatch: Math.round(minutesElapsed * 10) / 10,
    };

    // TODO: wire to a real cancellation API once one exists — for now this
    // mirrors how ConfirmBookingScreen.js logs its booking payload.
    console.log("[Cancellation]", cancellationData);

    setCancelSheetVisible(false);
    Alert.alert(
      "Booking Cancelled",
      charge > 0
        ? `Your booking has been cancelled. A cancellation charge of ₹${charge} has been applied.`
        : "Your booking has been cancelled.",
      [{ text: "OK", onPress: () => navigation.navigate("Main") }]
    );
  }

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
        <TouchableOpacity style={styles.cancel} onPress={openCancelSheet}>
          <Text style={styles.cancelText}>Cancel Booking</Text>
        </TouchableOpacity>
      </View>

      <CancelReasonSheet
        visible={cancelSheetVisible}
        chargeApplies={cancelChargeApplies}
        onClose={() => setCancelSheetVisible(false)}
        onConfirm={handleCancelConfirm}
      />
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

// ─── Cancellation sheet styles ──────────────────────────────────────────────────
const cs = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  kvWrap: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingHorizontal: 20, paddingTop: 12,
    paddingBottom: 28,
    maxHeight: "85%",
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: COLORS.border, alignSelf: "center", marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: "800", color: COLORS.text, marginBottom: 14 },

  warningBanner: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: "#fff0f1",
    borderRadius: 12, padding: 12, marginBottom: 14,
    borderWidth: 1, borderColor: "rgba(232,25,44,0.3)",
  },
  warningIco: { fontSize: 16, marginTop: 1 },
  warningTxt: { flex: 1, color: COLORS.red, fontSize: 12.5, fontWeight: "600", lineHeight: 18 },

  reasonList: { maxHeight: 340 },
  reasonRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderWidth: 1.5, borderColor: COLORS.border,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 8,
    backgroundColor: COLORS.bg2,
  },
  reasonRowActive: { borderColor: COLORS.red, backgroundColor: "#fff0f1" },
  reasonTxt: { flex: 1, fontSize: 14, fontWeight: "500", color: COLORS.text, marginRight: 10 },
  reasonTxtActive: { color: COLORS.red, fontWeight: "700" },
  radio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: COLORS.border,
    alignItems: "center", justifyContent: "center",
  },
  radioActive: { borderColor: COLORS.red },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.red },

  customInput: {
    borderWidth: 1.5, borderColor: COLORS.border,
    borderRadius: 14, padding: 12, marginTop: 2,
    fontSize: 14, color: COLORS.text,
    backgroundColor: COLORS.bg2,
    minHeight: 70, textAlignVertical: "top",
  },

  confirmBtn: {
    backgroundColor: COLORS.red, borderRadius: 14, paddingVertical: 16,
    alignItems: "center", marginTop: 14,
    shadowColor: COLORS.red, shadowOpacity: 0.35, shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  confirmBtnDisabled: { backgroundColor: COLORS.grayDim, shadowOpacity: 0, elevation: 0 },
  confirmTxt: { color: "#fff", fontSize: 15, fontWeight: "800" },

  goBackBtn: { alignItems: "center", paddingVertical: 14 },
  goBackTxt: { color: COLORS.gray, fontSize: 14, fontWeight: "600" },
});
