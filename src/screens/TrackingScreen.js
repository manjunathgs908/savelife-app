import React, { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, Linking, Share, ActivityIndicator, Alert } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { COLORS } from "../theme";
import { getRouteInfo, haversineDistanceKm } from "../utils/routeUtils";

// Only refetch the ambulance -> pickup route once the driver has moved
// this far from where the last route was computed — the driver's GPS
// pings every ~10s and moves only a little each time, so refetching a
// real Directions route on every 5s poll would burn quota for no visual
// benefit. 300m keeps the line visually accurate without hammering the API.
const ROUTE_REFETCH_KM = 0.3;

const TRACK_API = "https://api.savelife.health/api/trips";
const POLL_INTERVAL_MS = 5000;
const COORD_DELTA = { latitudeDelta: 0.05, longitudeDelta: 0.05 };

// TEMPORARY — no real support/helpline number exists anywhere in this
// app today (ProfileScreen's "Help & Support" row has no handler either;
// SearchingScreen's equivalent button just shows an Alert). Falls back
// to the same Alert-based stub until a real number is wired in.
const HELPLINE_PHONE = null;

// Ambulance model has no explicit paramedic/crew field — derived
// heuristically from service type (matches utils/ambulanceServiceTypes.js
// on the backend). ALS/ACLS/NICU imply a paramedic/medical attendant on
// board; BLS/body-shifting types don't.
const PARAMEDIC_TYPES = ["ALS_TEMPO", "ACLS_TEMPO", "NICU_TEMPO", "ALS", "ACLS", "NICU"];

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
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState(null);
  const [routeCoords, setRouteCoords] = useState([]);
  const intervalRef = useRef(null);
  const lastRouteOriginRef = useRef(null);

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

  // Ambulance -> pickup route line. Only meaningful pre-pickup (matches
  // trackTrip's own distanceToPickupKm/etaMinutes gating) — there's no
  // drop-side coordinate anywhere to route toward post-pickup. Throttled
  // to avoid a Directions API call on every 5s poll (see ROUTE_REFETCH_KM).
  const driverLat = trip?.driverLocation?.lat;
  const driverLng = trip?.driverLocation?.lng;
  useEffect(() => {
    if (driverLat == null || driverLng == null || !pickupCoord || trip?.pickupVerified) {
      if (trip?.pickupVerified) setRouteCoords([]); // clear the stale line once picked up
      return;
    }

    const driverPoint = { latitude: driverLat, longitude: driverLng };
    const last = lastRouteOriginRef.current;
    if (last && haversineDistanceKm(last, driverPoint) < ROUTE_REFETCH_KM) return;

    lastRouteOriginRef.current = driverPoint;
    let cancelled = false;
    getRouteInfo(driverPoint, pickupCoord).then(result => {
      if (!cancelled) setRouteCoords(result.coords);
    });
    return () => { cancelled = true; };
  }, [driverLat, driverLng, trip?.pickupVerified]);

  function callDriver() {
    if (trip?.driver?.phone) Linking.openURL(`tel:${trip.driver.phone}`);
  }

  function openCancelModal() {
    setCancelReason(null);
    setCancelError(null);
    setCancelModalVisible(true);
  }

  function closeCancelModal() {
    if (cancelling) return; // don't let the backdrop/✕ dismiss mid-request
    setCancelModalVisible(false);
  }

  async function handleConfirmCancel() {
    if (!cancelReason || cancelling) return;
    setCancelling(true);
    setCancelError(null);
    try {
      const res = await fetch(`${TRACK_API}/${tripId}/customer-cancel`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelReason }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setCancelError(data.message || "Could not cancel your trip. Please try again.");
        return;
      }
      setCancelModalVisible(false);
      navigation.navigate("Main");
    } catch (err) {
      setCancelError("Network error — please check your connection and try again.");
    } finally {
      setCancelling(false);
    }
  }

  function callHelpline() {
    if (HELPLINE_PHONE) {
      Linking.openURL(`tel:${HELPLINE_PHONE}`);
    } else {
      Alert.alert("Need Help?", "Our support team is here for you — reach out anytime from Profile > Help & Support.");
    }
  }

  async function shareTrip() {
    if (!trip) return;
    const veh = trip.vehicle;
    const vehicleLine = veh ? `${veh.registrationNumber}${veh.type ? ` · ${veh.type}` : ""}` : "";
    try {
      await Share.share({
        message:
          `🚑 Tracking a SaveLife ambulance${trip.driver?.name ? ` driven by ${trip.driver.name}` : ""}.\n` +
          (vehicleLine ? `Vehicle: ${vehicleLine}\n` : "") +
          `Pickup: ${trip.pickup?.address || "—"}\n` +
          `Drop: ${trip.dropAddress || "—"}\n` +
          `Live status: ${STATUS_LABELS[trip.status] || trip.status}\n` +
          `savelife://track/${tripId}`,
      });
    } catch (err) {
      // Silent — Share.share rejecting just means the user dismissed the sheet.
    }
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
  const isParamedicVehicle = trip?.vehicle?.type && PARAMEDIC_TYPES.includes(trip.vehicle.type);
  const vehicleLabel = trip?.vehicle
    ? [trip.vehicle.typeLabel || trip.vehicle.type, trip.vehicle.model].filter(Boolean).join(" · ")
    : null;
  const ratingLabel = trip?.driver?.ratingCount > 0
    ? `★ ${trip.driver.ratingAvg} (${trip.driver.completedTripsCount} trips)`
    : trip?.driver ? "New driver" : null;

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
            <Marker coordinate={pickupCoord} title="Pickup" pinColor={COLORS.green} />
            {dropCoord && <Marker coordinate={dropCoord} title="Drop" pinColor={COLORS.gray} />}
            {driverLat != null && driverLng != null && (
              <Marker
                coordinate={{ latitude: driverLat, longitude: driverLng }}
                title={trip?.driver?.name || "Ambulance"}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View style={styles.ambulanceMarker}>
                  <Text style={{ fontSize: 18 }}>🚑</Text>
                </View>
              </Marker>
            )}
            {routeCoords.length > 0 && (
              <Polyline coordinates={routeCoords} strokeColor={COLORS.red} strokeWidth={3} />
            )}
          </MapView>
        ) : (
          <View style={styles.mapPlaceholder}>
            <Text style={{ fontSize: 40 }}>🚑</Text>
          </View>
        )}
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.navigate("Main")}>
          <Text style={styles.backBtnTxt}>←</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.shareBtn} onPress={shareTrip}>
          <Text style={styles.backBtnTxt}>↗</Text>
        </TouchableOpacity>
      </View>

      {/* ── Bottom card — fixed portion of the screen, own internal scroll ── */}
      <View style={styles.card}>
        <View style={styles.handle} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
          <Text style={[styles.statusTxt, trip?.etaMinutes == null && styles.statusTxtNoEta]}>{statusLabel}</Text>
          {trip?.etaMinutes != null && (
            <Text style={styles.etaTxt}>
              🕐 ~{trip.etaMinutes} min away{trip.distanceToPickupKm != null ? ` · ${trip.distanceToPickupKm} km` : ""}
            </Text>
          )}

          {loading ? (
            <Text style={styles.loadingTxt}>Loading trip details…</Text>
          ) : (
            <View style={styles.driverRow}>
              <View style={styles.avatar}><Text style={styles.avatarTxt}>{initials}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.driverName}>{trip?.driver?.name || "Assigning driver…"}</Text>
                <Text style={styles.driverMeta}>
                  {vehicleLabel
                    ? `${vehicleLabel} • ${trip.vehicle.registrationNumber}`
                    : trip?.vehicle
                      ? `${trip.vehicle.type} • ${trip.vehicle.registrationNumber}`
                      : "Vehicle details pending"}
                </Text>
                {(ratingLabel || isParamedicVehicle) && (
                  <Text style={styles.driverSubMeta}>
                    {[ratingLabel, isParamedicVehicle && "🩺 Paramedic on board"].filter(Boolean).join("  ·  ")}
                  </Text>
                )}
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

          {(trip?.pickup?.address || trip?.dropAddress) && (
            <View style={styles.addressCard}>
              {trip?.pickup?.address && (
                <View style={styles.addressRow}>
                  <View style={styles.timelineDotCol}>
                    <Text style={styles.addressDot}>●</Text>
                    <View style={styles.timelineLine} />
                  </View>
                  <Text style={styles.addressText} numberOfLines={2}>{trip.pickup.address}</Text>
                </View>
              )}
              {trip?.dropAddress && (
                <View style={styles.addressRow}>
                  <View style={styles.timelineDotCol}>
                    <Text style={[styles.addressDot, { color: COLORS.red }]}>●</Text>
                  </View>
                  <Text style={styles.addressText} numberOfLines={2}>{trip.dropAddress}</Text>
                </View>
              )}
            </View>
          )}

          {(trip?.estimatedDistanceKm != null || trip?.estimatedFare != null) && (
            <View style={styles.summaryRow}>
              {trip.estimatedDistanceKm != null && (
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryValue}>{trip.estimatedDistanceKm} km</Text>
                  <Text style={styles.summaryLabel}>Distance</Text>
                </View>
              )}
              {trip.estimatedFare != null && (
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryValue}>₹{trip.estimatedFare}</Text>
                  <Text style={styles.summaryLabel}>Est. Fare</Text>
                </View>
              )}
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{trip.paymentPreference === "cash" ? "Cash" : trip.paymentPreference === "upi" ? "UPI" : "Card"}</Text>
                <Text style={styles.summaryLabel}>Payment</Text>
              </View>
            </View>
          )}

          <View style={styles.rowButtons}>
            <TouchableOpacity style={styles.helplineBtn} onPress={callHelpline}>
              <Text style={styles.helplineBtnTxt}>☎️ Helpline</Text>
            </TouchableOpacity>
            {showCancel && (
              <TouchableOpacity style={[styles.cancelBtn, { flex: 1 }]} onPress={openCancelModal}>
                <Text style={styles.cancelBtnTxt}>Cancel Booking</Text>
              </TouchableOpacity>
            )}
          </View>
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

            {cancelError && <Text style={styles.cancelErrorTxt}>{cancelError}</Text>}

            <TouchableOpacity style={styles.goBackBtn} onPress={closeCancelModal} activeOpacity={0.75} disabled={cancelling}>
              <Text style={styles.goBackText}>Go Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmCancelBtn, (!cancelReason || cancelling) && { opacity: 0.4 }]}
              disabled={!cancelReason || cancelling}
              onPress={handleConfirmCancel}
            >
              {cancelling
                ? <ActivityIndicator color={COLORS.white} />
                : <Text style={styles.confirmCancelText}>Cancel Booking</Text>}
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
  shareBtn: {
    position: "absolute", top: 50, right: 18,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center",
  },
  ambulanceMarker: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: COLORS.white, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: COLORS.red,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 2, elevation: 3,
  },

  card: {
    maxHeight: "52%",
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 18, paddingTop: 10,
    shadowColor: "#000", shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08, shadowRadius: 16, elevation: 12,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: "center", marginBottom: 14 },
  statusTxt: { color: COLORS.text, fontSize: 16, fontWeight: "700" },
  etaTxt: { color: COLORS.green, fontSize: 12.5, fontWeight: "600", marginTop: 3, marginBottom: 11 },
  statusTxtNoEta: { marginBottom: 14 },

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
  driverSubMeta: { color: COLORS.green, fontSize: 11, marginTop: 3, fontWeight: "600" },
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
  timelineDotCol: { alignItems: "center", width: 10 },
  timelineLine: { width: 1, flex: 1, minHeight: 14, backgroundColor: COLORS.border, marginTop: 3 },
  addressDot: { color: COLORS.grayDim, fontSize: 10 },
  addressText: { color: COLORS.text, fontSize: 12.5, flex: 1 },

  summaryRow: {
    flexDirection: "row", backgroundColor: COLORS.bg2, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border, padding: 13, marginBottom: 12,
  },
  summaryItem: { flex: 1, alignItems: "center" },
  summaryValue: { color: COLORS.text, fontWeight: "700", fontSize: 13.5 },
  summaryLabel: { color: COLORS.grayDim, fontSize: 10.5, marginTop: 2 },

  rowButtons: { flexDirection: "row", gap: 10, marginTop: 4 },
  helplineBtn: { paddingVertical: 13, paddingHorizontal: 16, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, alignItems: "center" },
  helplineBtnTxt: { color: COLORS.gray, fontSize: 13, fontWeight: "600" },
  cancelBtn: { paddingVertical: 13, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, alignItems: "center" },
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

  cancelErrorTxt: { color: COLORS.red, fontSize: 12.5, textAlign: "center", marginTop: 6 },
  goBackBtn: { paddingVertical: 14, alignItems: "center", marginTop: 4 },
  goBackText: { color: COLORS.grayDim, fontSize: 14, fontWeight: "600" },
  confirmCancelBtn: { backgroundColor: COLORS.red, borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 4 },
  confirmCancelText: { color: COLORS.white, fontSize: 16, fontWeight: "700" },
});
