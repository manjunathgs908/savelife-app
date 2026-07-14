import React, { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, Linking } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { COLORS } from "../theme";

const TRACK_API = "https://api.savelife.health/api/trips";
const POLL_INTERVAL_MS = 5000;
const COORD_DELTA = { latitudeDelta: 0.05, longitudeDelta: 0.05 };

const STATUS_LABELS = {
  booked    : "Booking Confirmed",
  dispatched: "Driver On The Way",
  en_route  : "Ambulance En Route",
  completed : "Trip Completed",
  cancelled : "Trip Cancelled",
};

const CANCEL_REASONS = [
  "Driver is taking too long",
  "Wrong ambulance type",
  "Patient condition improved",
  "Booked by mistake",
  "Found another ambulance",
  "Other",
];

export default function TrackingScreen({ navigation, route }) {
  const { tripId, pickupCoord, dropCoord } = route.params || {};

  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancelReason, setCancelReason] = useState(null);
  const intervalRef = useRef(null);

  // Poll the customer tracking endpoint every 5 seconds — status, driver,
  // vehicle, addresses, and pickupOtp all come from this one response.
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
          if (data.success) setTrip(data.trip);
        }
      } catch (err) {
        // Silent — next poll retries automatically.
      } finally {
        setLoading(false);
      }
    };

    fetchTrip();
    intervalRef.current = setInterval(fetchTrip, POLL_INTERVAL_MS);
    return () => clearInterval(intervalRef.current);
  }, [tripId]);

  function callDriver() {
    if (trip?.driver?.phone) Linking.openURL(`tel:${trip.driver.phone}`);
  }

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

  // No tripId at all (e.g. screen opened directly) — show a safe empty
  // state instead of trying to fetch/poll with an undefined id.
  if (!tripId) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyEmoji}>🚑</Text>
        <Text style={styles.emptyTitle}>No active trip</Text>
        <Text style={styles.emptySub}>You don't have a trip to track right now.</Text>
        <TouchableOpacity style={styles.emptyBtn} onPress={() => navigation.navigate("Main")}>
          <Text style={styles.emptyBtnTxt}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const statusLabel = STATUS_LABELS[trip?.status] || "Finding your ambulance...";
  const initials = trip?.driver?.name
    ? trip.driver.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
    : "?";
  const showCancel = trip?.status !== "completed" && trip?.status !== "cancelled";

  const mapRegion = pickupCoord
    ? { latitude: pickupCoord.latitude, longitude: pickupCoord.longitude, ...COORD_DELTA }
    : null;

  return (
    <View style={styles.container}>
      {/* ── Map — stays visible, never covered by the card below ── */}
      <View style={styles.mapWrap}>
        {mapRegion ? (
          <MapView
            provider={PROVIDER_GOOGLE}
            style={StyleSheet.absoluteFillObject}
            initialRegion={mapRegion}
          >
            <Marker coordinate={pickupCoord} title="Pickup" pinColor={COLORS.red} />
            {dropCoord && <Marker coordinate={dropCoord} title="Drop" pinColor={COLORS.gray} />}
          </MapView>
        ) : (
          <View style={styles.mapPlaceholder}>
            <Text style={{ fontSize: 40 }}>🚑</Text>
          </View>
        )}
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.navigate("Main")}>
          <Text style={styles.backBtnTxt}>←</Text>
        </TouchableOpacity>
      </View>

      {/* ── Bottom card — fixed portion of the screen, own internal scroll ── */}
      <View style={styles.card}>
        <View style={styles.handle} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
          <Text style={styles.statusTxt}>{statusLabel}</Text>

          {loading ? (
            <Text style={styles.loadingTxt}>Loading trip details…</Text>
          ) : (
            <View style={styles.driverRow}>
              <View style={styles.avatar}><Text style={styles.avatarTxt}>{initials}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.driverName}>{trip?.driver?.name || "Assigning driver…"}</Text>
                <Text style={styles.driverMeta}>
                  {trip?.vehicle ? `${trip.vehicle.type} • ${trip.vehicle.registrationNumber}` : "Vehicle details pending"}
                </Text>
              </View>
              {trip?.driver?.phone && (
                <TouchableOpacity style={styles.callBtn} onPress={callDriver}>
                  <Text style={{ fontSize: 16 }}>📞</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {trip?.pickupOtp && (
            <View style={styles.otpCard}>
              <Text style={styles.otpLabel}>PICKUP OTP</Text>
              <Text style={styles.otpDigits}>{trip.pickupOtp}</Text>
              <Text style={styles.otpHint}>Share this OTP with your driver</Text>
            </View>
          )}

          {(trip?.pickupAddress || trip?.dropAddress) && (
            <View style={styles.addressCard}>
              {trip?.pickupAddress && (
                <View style={styles.addressRow}>
                  <Text style={styles.addressDot}>●</Text>
                  <Text style={styles.addressText} numberOfLines={2}>{trip.pickupAddress}</Text>
                </View>
              )}
              {trip?.dropAddress && (
                <View style={styles.addressRow}>
                  <Text style={[styles.addressDot, { color: COLORS.red }]}>●</Text>
                  <Text style={styles.addressText} numberOfLines={2}>{trip.dropAddress}</Text>
                </View>
              )}
            </View>
          )}

          {showCancel && (
            <TouchableOpacity style={styles.cancelBtn} onPress={openCancelModal}>
              <Text style={styles.cancelBtnTxt}>Cancel Booking</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>

      {/* Cancellation reason bottom sheet — same pattern used elsewhere in this app */}
      <Modal
        visible={cancelModalVisible}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={closeCancelModal}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeCancelModal} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Cancel Booking?</Text>
              <TouchableOpacity onPress={closeCancelModal}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSub}>Let us know why — this helps us improve</Text>

            {CANCEL_REASONS.map(reason => {
              const active = cancelReason === reason;
              return (
                <TouchableOpacity
                  key={reason}
                  style={[styles.reasonRow, active && styles.reasonRowActive]}
                  onPress={() => setCancelReason(reason)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.reasonText, active && styles.reasonTextActive]}>{reason}</Text>
                  <View style={[styles.radio, active && styles.radioActive]}>
                    {active && <View style={styles.radioDot} />}
                  </View>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity style={styles.goBackBtn} onPress={closeCancelModal} activeOpacity={0.75}>
              <Text style={styles.goBackText}>Go Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmCancelBtn, !cancelReason && { opacity: 0.4 }]}
              disabled={!cancelReason}
              onPress={handleConfirmCancel}
            >
              <Text style={styles.confirmCancelText}>Cancel Booking</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  mapWrap: { flex: 1, backgroundColor: "#0a0d14" },
  mapPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  backBtn: {
    position: "absolute", top: 50, left: 18,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center",
  },
  backBtnTxt: { color: COLORS.white, fontSize: 17 },

  card: {
    maxHeight: "52%",
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 18, paddingTop: 10,
    shadowColor: "#000", shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08, shadowRadius: 16, elevation: 12,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: "center", marginBottom: 14 },
  statusTxt: { color: COLORS.text, fontSize: 16, fontWeight: "700", marginBottom: 14 },

  loadingTxt: { color: COLORS.grayDim, fontSize: 13, marginBottom: 12 },

  driverRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: COLORS.bg2, borderRadius: 14, padding: 13,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 12,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.red, alignItems: "center", justifyContent: "center" },
  avatarTxt: { color: COLORS.white, fontWeight: "700" },
  driverName: { color: COLORS.text, fontWeight: "700", fontSize: 14 },
  driverMeta: { color: COLORS.grayDim, fontSize: 11.5, marginTop: 2 },
  callBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.red, alignItems: "center", justifyContent: "center" },

  otpCard: {
    backgroundColor: "rgba(232,25,44,0.06)", borderRadius: 14,
    borderWidth: 1, borderColor: "rgba(232,25,44,0.25)",
    padding: 14, alignItems: "center", marginBottom: 12,
  },
  otpLabel: { color: COLORS.red, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  otpDigits: { color: COLORS.text, fontSize: 32, fontWeight: "900", letterSpacing: 8, marginTop: 4 },
  otpHint: { color: COLORS.grayDim, fontSize: 11.5, marginTop: 6, textAlign: "center" },

  addressCard: {
    backgroundColor: COLORS.bg2, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border,
    padding: 13, marginBottom: 12, gap: 8,
  },
  addressRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  addressDot: { color: COLORS.grayDim, fontSize: 10, marginTop: 3 },
  addressText: { color: COLORS.text, fontSize: 12.5, flex: 1 },

  cancelBtn: { paddingVertical: 13, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, alignItems: "center", marginTop: 4 },
  cancelBtnTxt: { color: COLORS.gray, fontSize: 13 },

  emptyContainer: { flex: 1, backgroundColor: COLORS.bg, alignItems: "center", justifyContent: "center", padding: 24 },
  emptyEmoji: { fontSize: 42, marginBottom: 12 },
  emptyTitle: { color: COLORS.text, fontSize: 17, fontWeight: "700" },
  emptySub: { color: COLORS.grayDim, fontSize: 13, marginTop: 6, textAlign: "center" },
  emptyBtn: { marginTop: 20, backgroundColor: COLORS.red, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 28 },
  emptyBtnTxt: { color: COLORS.white, fontWeight: "700", fontSize: 14 },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: COLORS.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 28, maxHeight: "85%" },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(0,0,0,0.15)", alignSelf: "center", marginBottom: 14 },
  modalHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  modalTitle: { color: COLORS.text, fontSize: 18, fontWeight: "700" },
  modalClose: { color: COLORS.grayDim, fontSize: 16, padding: 4 },
  modalSub: { color: COLORS.grayDim, fontSize: 12.5, marginBottom: 16 },

  reasonRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 14, backgroundColor: "rgba(0,0,0,0.03)",
    borderRadius: 14, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)",
    marginBottom: 10,
  },
  reasonRowActive: { borderColor: "rgba(232,25,44,0.5)", backgroundColor: "rgba(232,25,44,0.08)" },
  reasonText: { color: COLORS.text, fontSize: 14, fontWeight: "500" },
  reasonTextActive: { color: COLORS.text, fontWeight: "700" },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: "rgba(0,0,0,0.3)", alignItems: "center", justifyContent: "center" },
  radioActive: { borderColor: COLORS.red },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: COLORS.red },

  goBackBtn: { paddingVertical: 14, alignItems: "center", marginTop: 4 },
  goBackText: { color: COLORS.grayDim, fontSize: 14, fontWeight: "600" },
  confirmCancelBtn: { backgroundColor: COLORS.red, borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 4 },
  confirmCancelText: { color: COLORS.white, fontSize: 16, fontWeight: "700" },
});
