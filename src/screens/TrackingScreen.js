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
  const mapRef = useRef(null);
  const waitStateSyncedAtRef = useRef(Date.now());
  const [currentRegion, setCurrentRegion] = useState(null);

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
          if (data.success) {
            setTrip(data.trip);
            waitStateSyncedAtRef.current = Date.now();
          }
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
    // Display-only ETA polyline, no fare involved — just skip the update
    // if the Directions call fails rather than crashing on a null result.
    getRouteInfo(driverPoint, pickupCoord).then(result => {
      if (!cancelled && result) setRouteCoords(result.coords);
    });
    return () => { cancelled = true; };
  }, [driverLat, driverLng, trip?.pickupVerified]);

  // Pickup -> drop trip duration for the summary card. Addresses are fixed
  // for the life of the trip, so this only needs to run once (not on the
  // 5s poll) — reuses the same cached Directions helper as the driver route.
  const [tripDurationMin, setTripDurationMin] = useState(null);
  useEffect(() => {
    if (!pickupCoord || !dropCoord) return;
    let cancelled = false;
    // Display-only duration estimate, no fare involved — just skip the
    // update if the Directions call fails rather than crashing on null.
    getRouteInfo(pickupCoord, dropCoord).then(result => {
      if (!cancelled && result) setTripDurationMin(Math.round(result.duration / 60));
    });
    return () => { cancelled = true; };
  }, [pickupCoord, dropCoord]);

  // Wait-charge timer (Blueprint §5.5) — the free-time countdown ticks
  // locally every second purely so the digits move smoothly between 5s
  // polls. The rupee figure is never derived from that tick: it's always
  // whatever waitState.accruedAmount the server last sent, same as what
  // the driver app shows. Server is the source of truth for money.
  const [callingDriver, setCallingDriver] = useState(false);

  const waitState = trip?.waitState;
  const [, forceWaitTick] = useState(0);
  useEffect(() => {
    if (!waitState?.activeSegmentType) return;
    const id = setInterval(() => forceWaitTick(n => n + 1), 1000);
    return () => clearInterval(id);
  }, [waitState?.activeSegmentType]);

  let waitTimerLabel = null;
  let waitChargeLabel = null;
  if (waitState?.activeSegmentType) {
    const secsSincePoll = Math.floor((Date.now() - waitStateSyncedAtRef.current) / 1000);
    const displayFreeRemaining = Math.max(0, (waitState.freeSecondsRemaining || 0) - secsSincePoll);
    if (displayFreeRemaining > 0) {
      const mm = String(Math.floor(displayFreeRemaining / 60)).padStart(2, "0");
      const ss = String(displayFreeRemaining % 60).padStart(2, "0");
      waitTimerLabel = `Free waiting time left ${mm}:${ss}`;
    } else {
      waitChargeLabel = `Waiting charge ₹${waitState.accruedAmount}`;
    }
  }

  // Masked calling via Exotel — the backend no longer returns the driver's
  // raw phone number (see tripController.js:trackTrip), so this places a
  // masked call through POST /api/call/connect instead of a tel: link.
  async function callDriver() {
    if (!tripId || callingDriver) return;
    setCallingDriver(true);
    try {
      const res = await fetch("https://api.savelife.health/api/call/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId, initiator: "customer" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        Alert.alert("Couldn't Connect Call", data.message || "Something went wrong. Please try again.");
        return;
      }
      Alert.alert("Calling Driver", "Your phone will ring shortly — answer it to be connected to the driver.");
    } catch (err) {
      Alert.alert("Couldn't Connect Call", "Network error — please check your connection and try again.");
    } finally {
      setCallingDriver(false);
    }
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

  function zoomBy(factor) {
    const base = currentRegion || mapRegion;
    if (!base || !mapRef.current) return;
    mapRef.current.animateToRegion({
      ...base,
      latitudeDelta: Math.max(0.002, base.latitudeDelta * factor),
      longitudeDelta: Math.max(0.002, base.longitudeDelta * factor),
    }, 200);
  }

  function recenterMap() {
    if (!mapRef.current) return;
    const target = driverLat != null && driverLng != null
      ? { latitude: driverLat, longitude: driverLng, ...COORD_DELTA }
      : mapRegion;
    if (target) mapRef.current.animateToRegion(target, 300);
  }

  function messageDriver() {
    Alert.alert("Message Driver", "In-app chat isn't available yet — please call your driver directly.");
  }

  function editDropLocation() {
    Alert.alert("Edit Drop Location", "Changing the drop location after booking isn't available yet — please contact support.");
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
    ? `★ ${trip.driver.ratingAvg} · ${trip.driver.completedTripsCount} trips`
    : trip?.driver ? "New driver" : null;
  const vehicleBadge = trip?.vehicle?.type ? trip.vehicle.type.replace(/_TEMPO$/i, "").toUpperCase() : null;
  const dropParts = trip?.dropAddress ? trip.dropAddress.split(",") : null;
  const dropTitle = dropParts ? dropParts[0].trim() : null;
  const dropSub = dropParts && dropParts.length > 1 ? dropParts.slice(1).join(",").trim() : null;
  const pickupParts = trip?.pickup?.address ? trip.pickup.address.split(",") : null;
  const pickupTitle = pickupParts ? pickupParts[0].trim() : null;
  const pickupSub = pickupParts && pickupParts.length > 1 ? pickupParts.slice(1).join(",").trim() : null;
  const headerSub = trip?.status === "completed"
    ? "Trip completed"
    : trip?.status === "cancelled"
      ? "This trip was cancelled"
      : "Your ambulance is arriving soon";

  const mapRegion = pickupCoord
    ? { latitude: pickupCoord.latitude, longitude: pickupCoord.longitude, ...COORD_DELTA }
    : null;

  return (
    <View style={styles.container}>
      {/* ── Map — stays visible, never covered by the card below ── */}
      <View style={styles.mapWrap}>
        {mapRegion ? (
          <MapView
            ref={mapRef}
            provider={PROVIDER_GOOGLE}
            style={StyleSheet.absoluteFillObject}
            initialRegion={mapRegion}
            onRegionChangeComplete={setCurrentRegion}
          >
            <Marker coordinate={pickupCoord} anchor={{ x: 0.5, y: 1 }}>
              <View style={styles.pinWrap}>
                <View style={[styles.pinTag, { backgroundColor: COLORS.green }]}>
                  <Text style={styles.pinTagTxt}>Pickup</Text>
                </View>
                <Text style={[styles.pinGlyph, { color: COLORS.green }]}>📍</Text>
              </View>
              {pickupTitle && (
                <View style={styles.pinCallout}>
                  <Text style={styles.pinCalloutTitle} numberOfLines={1}>{pickupTitle}</Text>
                  {pickupSub && <Text style={styles.pinCalloutSub} numberOfLines={1}>{pickupSub}</Text>}
                </View>
              )}
            </Marker>
            {dropCoord && (
              <Marker coordinate={dropCoord} anchor={{ x: 0.5, y: 1 }}>
                <View style={styles.pinWrap}>
                  <View style={[styles.pinTag, { backgroundColor: COLORS.red }]}>
                    <Text style={styles.pinTagTxt}>Drop</Text>
                  </View>
                  <Text style={[styles.pinGlyph, { color: COLORS.red }]}>📍</Text>
                </View>
                {dropTitle && (
                  <View style={styles.pinCallout}>
                    <Text style={styles.pinCalloutTitle} numberOfLines={1}>{dropTitle}</Text>
                    {dropSub && <Text style={styles.pinCalloutSub} numberOfLines={1}>{dropSub}</Text>}
                  </View>
                )}
              </Marker>
            )}
            {driverLat != null && driverLng != null && (
              <Marker
                coordinate={{ latitude: driverLat, longitude: driverLng }}
                title={trip?.driver?.name || "Ambulance"}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                {trip?.etaMinutes != null && (
                  <View style={styles.etaCallout}>
                    <Text style={{ fontSize: 15 }}>🚑</Text>
                    <View style={{ marginLeft: 6 }}>
                      <Text style={styles.etaCalloutMin} numberOfLines={1}>{trip.etaMinutes} min away</Text>
                      {trip.distanceToPickupKm != null && (
                        <Text style={styles.etaCalloutDist} numberOfLines={1}>{Number(trip.distanceToPickupKm).toFixed(1)} km</Text>
                      )}
                    </View>
                  </View>
                )}
                <View style={styles.ambulanceMarker}>
                  <Text style={{ fontSize: 18 }}>🚑</Text>
                </View>
              </Marker>
            )}
            {routeCoords.length > 0 && (
              <Polyline coordinates={routeCoords} strokeColor={COLORS.teal} strokeWidth={4} />
            )}
          </MapView>
        ) : (
          <View style={styles.mapPlaceholder}>
            <Text style={{ fontSize: 40 }}>🚑</Text>
          </View>
        )}

        <TouchableOpacity style={styles.circleBtn} onPress={() => navigation.navigate("Main")}>
          <Text style={styles.circleBtnTxt}>‹</Text>
        </TouchableOpacity>

        <View style={styles.statusCard}>
          <View style={styles.statusDot} />
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={styles.statusCardTitle} numberOfLines={1}>{statusLabel}</Text>
            <Text style={styles.statusCardSub} numberOfLines={1}>{headerSub}</Text>
          </View>
        </View>

        <TouchableOpacity style={[styles.circleBtn, styles.circleBtnRight]} onPress={shareTrip}>
          <Text style={{ fontSize: 15 }}>🛡️</Text>
        </TouchableOpacity>

        <View style={styles.zoomControls}>
          <TouchableOpacity style={styles.zoomBtn} onPress={() => zoomBy(0.5)}>
            <Text style={styles.zoomBtnTxt}>+</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.zoomBtn} onPress={() => zoomBy(2)}>
            <Text style={styles.zoomBtnTxt}>−</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.zoomBtn} onPress={recenterMap}>
            <Text style={{ fontSize: 15 }}>🎯</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Bottom card — fixed portion of the screen, own internal scroll ── */}
      <View style={styles.card}>
        <View style={styles.handle} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
          {loading ? (
            <Text style={styles.loadingTxt}>Loading trip details…</Text>
          ) : (
            <View style={styles.driverRow}>
              <View style={styles.avatar}><Text style={styles.avatarTxt}>{initials}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.driverName}>{trip?.driver?.name || "Assigning driver…"}</Text>
                {(ratingLabel || isParamedicVehicle) && (
                  <Text style={styles.driverSubMeta}>
                    {[ratingLabel, isParamedicVehicle && "🩺 Paramedic on board"].filter(Boolean).join("  ·  ")}
                  </Text>
                )}
              </View>
              <Text style={styles.driverVehicleGlyph}>🚑</Text>
            </View>
          )}

          {trip?.vehicle && (
            <View style={styles.chipRow}>
              <View style={styles.chip}>
                <Text style={{ fontSize: 13 }}>🚐</Text>
                <Text style={styles.chipTxt} numberOfLines={1}>{vehicleLabel || trip.vehicle.type}</Text>
              </View>
              {vehicleBadge && (
                <View style={styles.chip}>
                  <Text style={{ fontSize: 13 }}>❤️</Text>
                  <Text style={styles.chipTxt}>{vehicleBadge}</Text>
                </View>
              )}
              {trip.vehicle.registrationNumber && (
                <View style={styles.chip}>
                  <Text style={styles.chipRegTxt}>{trip.vehicle.registrationNumber}</Text>
                </View>
              )}
            </View>
          )}

          {waitState?.activeSegmentType && (
            <View style={[styles.waitCard, waitChargeLabel ? styles.waitCardCharging : styles.waitCardFree]}>
              <Text style={{ fontSize: 15 }}>⏱️</Text>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[styles.waitCardTitle, waitChargeLabel && styles.waitCardTitleCharging]}>
                  {waitTimerLabel || waitChargeLabel}
                </Text>
                {waitChargeLabel && (
                  <Text style={styles.waitCardSub}>₹{waitState.ratePerMin}/min</Text>
                )}
              </View>
            </View>
          )}

          <View style={styles.rowButtons}>
            {trip?.driver && (
              <TouchableOpacity
                style={[styles.outlineActionBtn, { flex: 1 }, callingDriver && { opacity: 0.6 }]}
                onPress={callDriver}
                disabled={callingDriver}
              >
                {callingDriver ? (
                  <ActivityIndicator size="small" color={COLORS.teal} />
                ) : (
                  <>
                    <Text style={{ fontSize: 15 }}>📞</Text>
                    <Text style={styles.outlineActionBtnTxt}>Call Driver</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.outlineActionBtn, { flex: 1 }]} onPress={messageDriver}>
              <Text style={{ fontSize: 15 }}>💬</Text>
              <Text style={styles.outlineActionBtnTxt}>Message Driver</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.sideBySideRow}>
            {trip?.pickupOtp && (
              <View style={[styles.otpCard, { flex: 1 }]}>
                <View style={styles.otpHeaderRow}>
                  <Text style={{ fontSize: 13 }}>🛡️</Text>
                  <Text style={styles.otpLabel}>PICKUP OTP</Text>
                </View>
                <Text style={styles.otpHint}>Share this OTP with driver at pickup</Text>
                <View style={styles.otpDigitsRow}>
                  {String(trip.pickupOtp).split("").map((d, i) => (
                    <View key={i} style={styles.otpDigitBox}><Text style={styles.otpDigitTxt}>{d}</Text></View>
                  ))}
                </View>
              </View>
            )}
            {dropTitle && (
              <View style={[styles.dropCard, { flex: 1 }]}>
                <View style={styles.dropHeaderRow}>
                  <Text style={styles.dropLabel}>DROP LOCATION</Text>
                  <TouchableOpacity onPress={editDropLocation} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Text style={styles.dropEditTxt}>✎ Edit</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.dropRow}>
                  <Text style={{ fontSize: 13 }}>📍</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dropTitle} numberOfLines={1}>{dropTitle}</Text>
                    {dropSub && <Text style={styles.dropSub} numberOfLines={2}>{dropSub}</Text>}
                  </View>
                </View>
              </View>
            )}
          </View>

          {(trip?.estimatedDistanceKm != null || trip?.estimatedFare != null) && (
            <>
              <Text style={styles.summaryHeading}>TRIP SUMMARY</Text>
              <View style={styles.summaryGrid}>
                {trip.estimatedDistanceKm != null && (
                  <View style={styles.summaryCell}>
                    <Text style={styles.summaryIcon}>📏</Text>
                    <Text style={styles.summaryValue}>{Number(trip.estimatedDistanceKm).toFixed(1)} km</Text>
                    <Text style={styles.summaryLabel}>Distance</Text>
                  </View>
                )}
                {tripDurationMin != null && (
                  <View style={styles.summaryCell}>
                    <Text style={styles.summaryIcon}>⏱️</Text>
                    <Text style={styles.summaryValue}>{tripDurationMin} min</Text>
                    <Text style={styles.summaryLabel}>Duration</Text>
                  </View>
                )}
                {trip.estimatedFare != null && (
                  <>
                    <View style={styles.summaryCell}>
                      <Text style={styles.summaryIcon}>🏷️</Text>
                      <Text style={styles.summaryValue}>₹{trip.estimatedFare}</Text>
                      <Text style={styles.summaryLabel}>Fare</Text>
                    </View>
                    <View style={styles.summaryCell}>
                      <Text style={styles.summaryIcon}>💳</Text>
                      <Text style={styles.summaryValue}>₹{trip.estimatedFare}</Text>
                      <Text style={styles.summaryLabel}>Total</Text>
                    </View>
                  </>
                )}
              </View>
            </>
          )}

          <View style={styles.rowButtons}>
            {showCancel && (
              <TouchableOpacity style={[styles.redOutlineBtn, { flex: 1 }]} onPress={openCancelModal}>
                <Text style={{ fontSize: 15 }}>⊗</Text>
                <Text style={styles.redOutlineBtnTxt}>Cancel Booking</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.shareBtn, { flex: 1 }]} onPress={shareTrip}>
              <Text style={{ fontSize: 14 }}>🔗</Text>
              <Text style={styles.shareBtnTxt}>Share Trip</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.helpBanner} onPress={callHelpline} activeOpacity={0.85}>
            <View style={styles.helpBannerIconWrap}>
              <Text style={{ fontSize: 16 }}>🎧</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.helpBannerTitle}>Need Help? 24×7 Emergency Helpline</Text>
              <Text style={styles.helpBannerSub}>We're here for you anytime.</Text>
            </View>
            <Text style={{ fontSize: 18, color: COLORS.white }}>›</Text>
          </TouchableOpacity>
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

  circleBtn: {
    position: "absolute", top: 50, left: 18,
    width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.white,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 4,
  },
  circleBtnRight: { left: undefined, right: 18 },
  circleBtnTxt: { color: COLORS.text, fontSize: 24, fontWeight: "600", marginTop: -2 },

  statusCard: {
    position: "absolute", top: 50, left: 68, right: 68,
    flexDirection: "row", alignItems: "center",
    backgroundColor: COLORS.white, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 4,
  },
  statusDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: COLORS.teal },
  statusCardTitle: { color: COLORS.teal, fontSize: 14, fontWeight: "700" },
  statusCardSub: { color: COLORS.grayDim, fontSize: 10.5, marginTop: 1 },

  pinWrap: { alignItems: "center" },
  pinTag: { borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8, marginBottom: 2 },
  pinTagTxt: { color: COLORS.white, fontSize: 10, fontWeight: "800" },
  pinGlyph: { fontSize: 26 },
  pinCallout: {
    position: "absolute", top: -46, alignSelf: "center", minWidth: 140,
    backgroundColor: COLORS.white, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 4,
  },
  pinCalloutTitle: { color: COLORS.text, fontWeight: "700", fontSize: 12 },
  pinCalloutSub: { color: COLORS.grayDim, fontSize: 10.5, marginTop: 1 },

  etaCallout: {
    position: "absolute", bottom: 40, alignSelf: "center", flexDirection: "row", alignItems: "center",
    backgroundColor: COLORS.white, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12, minWidth: 130,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 4,
  },
  etaCalloutMin: { color: COLORS.teal, fontSize: 13, fontWeight: "800" },
  etaCalloutDist: { color: COLORS.grayDim, fontSize: 10.5, marginTop: 1 },

  zoomControls: { position: "absolute", bottom: 16, right: 18, gap: 10 },
  zoomBtn: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.white,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: 4,
  },
  zoomBtnTxt: { color: COLORS.text, fontSize: 18, fontWeight: "700" },

  ambulanceMarker: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: COLORS.white, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: COLORS.teal,
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

  loadingTxt: { color: COLORS.grayDim, fontSize: 13, marginBottom: 12 },

  driverRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    marginBottom: 14,
  },
  avatar: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: COLORS.teal,
    alignItems: "center", justifyContent: "center",
  },
  avatarTxt: { color: COLORS.white, fontWeight: "700" },
  driverName: { color: COLORS.text, fontWeight: "700", fontSize: 16 },
  driverSubMeta: { color: COLORS.grayDim, fontSize: 12, marginTop: 3, fontWeight: "600" },
  driverVehicleGlyph: { fontSize: 34 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: COLORS.bg2, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border,
    paddingVertical: 8, paddingHorizontal: 11,
  },
  chipTxt: { color: COLORS.text, fontSize: 12, fontWeight: "600" },
  chipRegTxt: { color: COLORS.teal, fontSize: 12, fontWeight: "700" },

  waitCard: {
    flexDirection: "row", alignItems: "center",
    borderRadius: 14, borderWidth: 1, padding: 13, marginBottom: 12,
  },
  waitCardFree: { backgroundColor: COLORS.tealTint, borderColor: "rgba(20,184,166,0.3)" },
  waitCardCharging: { backgroundColor: "rgba(232,25,44,0.08)", borderColor: "rgba(232,25,44,0.3)" },
  waitCardTitle: { color: COLORS.teal, fontWeight: "800", fontSize: 14 },
  waitCardTitleCharging: { color: COLORS.red },
  waitCardSub: { color: COLORS.grayDim, fontSize: 11, marginTop: 2, fontWeight: "600" },

  redOutlineBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderWidth: 1.5, borderColor: COLORS.red, borderRadius: 12, paddingVertical: 14,
    backgroundColor: COLORS.white,
  },
  redOutlineBtnTxt: { color: COLORS.red, fontWeight: "700", fontSize: 13.5 },
  outlineActionBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderWidth: 1.5, borderColor: COLORS.teal, borderRadius: 12, paddingVertical: 14,
    backgroundColor: COLORS.white,
  },
  outlineActionBtnTxt: { color: COLORS.teal, fontWeight: "700", fontSize: 13.5 },

  sideBySideRow: { flexDirection: "row", gap: 10, marginBottom: 12, alignItems: "stretch" },

  otpCard: {
    backgroundColor: COLORS.tealTint, borderRadius: 14,
    borderWidth: 1, borderColor: "rgba(20,184,166,0.3)",
    padding: 13,
  },
  otpHeaderRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  otpLabel: { color: COLORS.teal, fontSize: 10.5, fontWeight: "800", letterSpacing: 0.5 },
  otpHint: { color: COLORS.grayDim, fontSize: 10, marginTop: 4 },
  otpDigitsRow: { flexDirection: "row", gap: 6, marginTop: 10, justifyContent: "center" },
  otpDigitBox: {
    width: 32, height: 38, borderRadius: 8, borderWidth: 1, borderColor: "rgba(20,184,166,0.35)",
    backgroundColor: COLORS.white, alignItems: "center", justifyContent: "center",
  },
  otpDigitTxt: { color: COLORS.teal, fontSize: 17, fontWeight: "800" },

  dropCard: {
    backgroundColor: COLORS.bg2, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border,
    padding: 13,
  },
  dropHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dropLabel: { color: COLORS.teal, fontSize: 10.5, fontWeight: "800", letterSpacing: 0.5 },
  dropEditTxt: { color: COLORS.teal, fontSize: 11, fontWeight: "700" },
  dropRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 10 },
  dropTitle: { color: COLORS.text, fontWeight: "700", fontSize: 12.5 },
  dropSub: { color: COLORS.grayDim, fontSize: 10.5, marginTop: 2 },

  summaryHeading: { color: COLORS.grayDim, fontSize: 11, fontWeight: "700", letterSpacing: 0.5, marginBottom: 8 },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 14 },
  summaryCell: {
    width: "47%", backgroundColor: COLORS.bg2, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border, padding: 13, alignItems: "flex-start",
  },
  summaryIcon: { fontSize: 15, marginBottom: 6 },
  summaryValue: { color: COLORS.text, fontWeight: "700", fontSize: 15 },
  summaryLabel: { color: COLORS.grayDim, fontSize: 10.5, marginTop: 2 },

  rowButtons: { flexDirection: "row", gap: 10, marginTop: 4, marginBottom: 12 },
  shareBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 14, borderRadius: 12, backgroundColor: COLORS.teal,
  },
  shareBtnTxt: { color: COLORS.white, fontSize: 13.5, fontWeight: "700" },

  helpBanner: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: COLORS.teal, borderRadius: 16, padding: 14,
  },
  helpBannerIconWrap: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  helpBannerTitle: { color: COLORS.white, fontWeight: "700", fontSize: 13.5 },
  helpBannerSub: { color: "rgba(255,255,255,0.75)", fontSize: 11.5, marginTop: 2 },

  emptyContainer: { flex: 1, backgroundColor: COLORS.bg, alignItems: "center", justifyContent: "center", padding: 24 },
  emptyEmoji: { fontSize: 42, marginBottom: 12 },
  emptyTitle: { color: COLORS.text, fontSize: 17, fontWeight: "700" },
  emptySub: { color: COLORS.grayDim, fontSize: 13, marginTop: 6, textAlign: "center" },
  emptyBtn: { marginTop: 20, backgroundColor: COLORS.teal, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 28 },
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
