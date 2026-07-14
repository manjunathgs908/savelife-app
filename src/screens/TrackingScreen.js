import React, { useState, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, Linking } from "react-native";
import { COLORS } from "../theme";

const CANCEL_REASONS = [
  "Driver is taking too long",
  "Wrong ambulance type",
  "Patient condition improved",
  "Booked by mistake",
  "Found another ambulance",
  "Other",
];

const TRACK_API = "https://api.savelife.health/api/trips";
const POLL_INTERVAL_MS = 5000;

const STATUS_LABELS = {
  booked    : { emoji: "🔵", text: "Finding ambulance..." },
  dispatched: { emoji: "🔵", text: "Driver on the way" },
  en_route  : { emoji: "🟡", text: "Ambulance en route" },
  completed : { emoji: "🟢", text: "Trip completed" },
  cancelled : { emoji: "🔴", text: "Trip cancelled" },
};

export default function TrackingScreen({ navigation, route }) {
  const tripId = route?.params?.tripId;

  const [tripInfo, setTripInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancelReason, setCancelReason] = useState(null);
  const intervalRef = useRef(null);

  // ── Poll the public tracking endpoint every 5 seconds ──
  // Carries driver/vehicle/addresses/status plus pickupOtp — the OTP
  // card below and the driver card share this single poll.
  useEffect(() => {
    if (!tripId) {
      setLoading(false);
      return;
    }

    const fetchTrip = async () => {
      try {
        const res = await fetch(`${TRACK_API}/${tripId}/track`);
        if (res.ok) {
          const data = await res.json();
          setTripInfo(data.trip);
        }
      } catch (err) {
        // Silent — next poll retries automatically.
      } finally {
        setLoading(false);
      }
    };

    fetchTrip();
    intervalRef.current = setInterval(fetchTrip, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [tripId]);

  function openCancelModal() {
    setCancelReason(null);
    setCancelModalVisible(true);
  }

  function closeCancelModal() {
    setCancelModalVisible(false);
  }

  function handleConfirmCancel() {
    if (!cancelReason) return;
    setCancelModalVisible(false);
    navigation.navigate("Main");
  }

  function callDriver() {
    if (tripInfo?.driver?.phone) {
      Linking.openURL(`tel:${tripInfo.driver.phone}`);
    }
  }

  const statusInfo = STATUS_LABELS[tripInfo?.status] || STATUS_LABELS.booked;
  const initials = tripInfo?.driver?.name
    ? tripInfo.driver.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
    : "??";

  return (
    <View style={styles.container}>
      <View style={styles.map}>
        <View style={styles.mapTop}>
          <TouchableOpacity style={styles.backLight} onPress={() => navigation.navigate("Main")}>
            <Text style={{ color: COLORS.white, fontSize: 17 }}>← LIVE</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.ambEmoji}>🚑</Text>
      </View>

      <ScrollView style={styles.sheet} contentContainerStyle={{ paddingBottom: 20 }}>
        <View style={styles.handle} />
        <Text style={styles.status}>
          {statusInfo.emoji} {statusInfo.text}
        </Text>

        {loading ? (
          <Text style={styles.waitingTxt}>Loading trip details...</Text>
        ) : (
          <View style={styles.driverCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.driverName}>{tripInfo.driver.name}</Text>
              <Text style={styles.driverMeta}>
                {tripInfo.vehicle?.type || ""} • {tripInfo.vehicle?.registrationNumber || "—"}
              </Text>
            </View>
            <TouchableOpacity style={styles.callBtn} onPress={callDriver}>
              <Text style={styles.callBtnTxt}>📞</Text>
            </TouchableOpacity>
          </View>
        )}

        {tripInfo?.pickupOtp && (
          <View style={styles.otpCard}>
            <Text style={styles.otpLabel}>PICKUP OTP</Text>
            <Text style={styles.otpDigits}>{tripInfo.pickupOtp}</Text>
            <Text style={styles.otpHint}>Share this OTP with your driver to start the trip</Text>
          </View>
        )}

        {(tripInfo?.pickupAddress || tripInfo?.dropAddress) && (
          <View style={styles.addressCard}>
            {tripInfo?.pickupAddress && (
              <View style={styles.addressRow}>
                <Text style={styles.addressDot}>●</Text>
                <Text style={styles.addressText} numberOfLines={2}>{tripInfo.pickupAddress}</Text>
              </View>
            )}
            {tripInfo?.dropAddress && (
              <View style={styles.addressRow}>
                <Text style={[styles.addressDot, { color: COLORS.red }]}>●</Text>
                <Text style={styles.addressText} numberOfLines={2}>{tripInfo.dropAddress}</Text>
              </View>
            )}
          </View>
        )}

        {tripInfo?.pickupVerified && (
          <View style={styles.verifiedBanner}>
            <Text style={styles.verifiedTxt}>✅ Pickup confirmed — heading to hospital</Text>
          </View>
        )}

        {tripInfo?.status !== "completed" && tripInfo?.status !== "cancelled" && (
          <TouchableOpacity style={styles.cancelBtn} onPress={openCancelModal}>
            <Text style={styles.cancelBtnTxt}>Cancel Booking</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <Modal visible={cancelModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Why are you cancelling?</Text>
            {CANCEL_REASONS.map((reason) => (
              <TouchableOpacity
                key={reason}
                style={[styles.reasonRow, cancelReason === reason && styles.reasonRowActive]}
                onPress={() => setCancelReason(reason)}
              >
                <Text style={styles.reasonTxt}>{reason}</Text>
              </TouchableOpacity>
            ))}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={closeCancelModal}>
                <Text style={styles.modalCancelTxt}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmBtn, !cancelReason && { opacity: 0.5 }]}
                onPress={handleConfirmCancel}
                disabled={!cancelReason}
              >
                <Text style={styles.modalConfirmTxt}>Confirm Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  map: { height: 260, backgroundColor: "#1a1a2e", alignItems: "center", justifyContent: "center" },
  mapTop: { position: "absolute", top: 44, left: 16, right: 16 },
  backLight: { backgroundColor: "rgba(0,0,0,0.4)", paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, alignSelf: "flex-start" },
  ambEmoji: { fontSize: 60 },

  sheet: { flex: 1, backgroundColor: COLORS.bg, marginTop: -20, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#444", alignSelf: "center", marginBottom: 16 },
  status: { color: COLORS.text, fontSize: 17, fontWeight: "700", marginBottom: 16 },

  waitingTxt: { color: COLORS.grayDim, fontSize: 14, textAlign: "center" },

  driverCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#1a1a2e", borderRadius: 14, padding: 14, marginBottom: 16 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.red, alignItems: "center", justifyContent: "center", marginRight: 12 },
  avatarText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  driverName: { color: COLORS.text, fontSize: 16, fontWeight: "700" },
  driverMeta: { color: COLORS.grayDim, fontSize: 13, marginTop: 2 },
  callBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.red, alignItems: "center", justifyContent: "center" },
  callBtnTxt: { fontSize: 18 },

  otpCard: { backgroundColor: "rgba(232,25,44,0.15)", borderRadius: 14, borderWidth: 1, borderColor: "rgba(232,25,44,0.3)", padding: 14, alignItems: "center", marginBottom: 16 },
  otpLabel: { color: COLORS.red, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  otpDigits: { color: COLORS.text, fontSize: 32, fontWeight: "900", letterSpacing: 8, marginTop: 4 },
  otpHint: { color: COLORS.grayDim, fontSize: 11.5, marginTop: 6, textAlign: "center" },

  addressCard: { backgroundColor: "#1a1a2e", borderRadius: 14, padding: 14, marginBottom: 16, gap: 10 },
  addressRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  addressDot: { color: COLORS.grayDim, fontSize: 10, marginTop: 3 },
  addressText: { color: COLORS.text, fontSize: 13, flex: 1 },

  verifiedBanner: { backgroundColor: "rgba(16,185,129,0.15)", borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: "rgba(16,185,129,0.3)" },
  verifiedTxt: { color: "#10b981", fontSize: 13, fontWeight: "700", textAlign: "center" },

  cancelBtn: { borderWidth: 1, borderColor: "#444", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  cancelBtnTxt: { color: COLORS.grayDim, fontSize: 15, fontWeight: "600" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalBox: { backgroundColor: COLORS.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  modalTitle: { color: COLORS.text, fontSize: 17, fontWeight: "700", marginBottom: 16 },
  reasonRow: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, marginBottom: 8, backgroundColor: "#1a1a2e" },
  reasonRowActive: { backgroundColor: COLORS.red },
  reasonTxt: { color: COLORS.text, fontSize: 14 },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 12 },
  modalCancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: "#444", alignItems: "center" },
  modalCancelTxt: { color: COLORS.grayDim, fontWeight: "600" },
  modalConfirmBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: COLORS.red, alignItems: "center" },
  modalConfirmTxt: { color: "#fff", fontWeight: "700" },
});
