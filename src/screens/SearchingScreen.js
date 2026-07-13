import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Animated, Easing, Dimensions, ScrollView, TouchableOpacity, Alert } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { COLORS } from "../theme";

const { height: SCREEN_H } = Dimensions.get("window");
const FALLBACK_REGION = {
  latitude: 12.9716, longitude: 77.5946,
  latitudeDelta: 0.08, longitudeDelta: 0.08,
};
const COORD_DELTA = { latitudeDelta: 0.05, longitudeDelta: 0.05 };

const TIMELINE_STEPS = [
  { key: "confirmed", label: "Booking Confirmed" },
  { key: "finding", label: "Finding Nearest Ambulance" },
  { key: "contacting", label: "Contacting Driver" },
  { key: "assigned", label: "Ambulance Assigned" },
  { key: "tracking", label: "Live Tracking" },
];
const ACTIVE_STEP_INDEX = 1; // "Finding Nearest Ambulance" — this screen's own state

const TRACK_API = "https://api.savelife.health/api/trips";
const POLL_INTERVAL_MS = 3000;
const DRIVER_ASSIGNED_STATUSES = ["dispatched", "en_route", "completed", "cancelled"];

export default function SearchingScreen({ navigation, route }) {
  const { tripId, pickupCoord, pickupLabel, dropCoord, dropLabel, dist, fare, selectedAmb, service } = route.params || {};
  const ambName = selectedAmb?.name || service;

  const mapRef = useRef(null);
  const barAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const [trackWidth, setTrackWidth] = useState(0);

  useEffect(() => {
    const barLoop = Animated.loop(
      Animated.timing(barAnim, {
        toValue: 1,
        duration: 1100,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      })
    );
    barLoop.start();

    const pulseLoop = Animated.loop(
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 1500,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      })
    );
    pulseLoop.start();

    return () => { barLoop.stop(); pulseLoop.stop(); };
  }, []);

  // Poll the backend until a driver is actually assigned, then hand off to Tracking.
  useEffect(() => {
    if (!tripId) return;
    let active = true;
    let pollHandle = null;

    const poll = async () => {
      try {
        const res = await fetch(`${TRACK_API}/${tripId}/track`);
        if (res.ok) {
          const data = await res.json();
          const trip = data.trip;
          const driverAssigned = !!trip?.driver || DRIVER_ASSIGNED_STATUSES.includes(trip?.status);
          if (driverAssigned && active) {
            clearInterval(pollHandle);
            navigation.replace("Tracking", route.params);
          }
        }
      } catch (err) {
        // Silent — next poll retries automatically.
      }
    };

    poll();
    pollHandle = setInterval(poll, POLL_INTERVAL_MS);

    return () => { active = false; clearInterval(pollHandle); };
  }, [tripId]);

  useEffect(() => {
    if (!pickupCoord || !dropCoord) return;
    const t = setTimeout(() => {
      mapRef.current?.fitToCoordinates([pickupCoord, dropCoord], {
        edgePadding: { top: 70, right: 50, bottom: 70, left: 50 },
        animated: true,
      });
    }, 300);
    return () => clearTimeout(t);
  }, [pickupCoord, dropCoord]);

  const initialRegion = pickupCoord
    ? { latitude: pickupCoord.latitude, longitude: pickupCoord.longitude, ...COORD_DELTA }
    : dropCoord
    ? { latitude: dropCoord.latitude, longitude: dropCoord.longitude, ...COORD_DELTA }
    : FALLBACK_REGION;

  const barWidthPx = trackWidth * 0.35;
  const translateX = barAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-barWidthPx, trackWidth],
  });

  const markerPulseScale = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] });
  const markerPulseOpacity = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] });
  const stepPulseScale = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] });
  const stepPulseOpacity = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] });

  function handleCancel() {
    navigation.navigate("Main");
  }

  function handleSupport() {
    Alert.alert("Need Help?", "Our support team is here for you — reach out anytime from Profile > Help & Support.");
  }

  return (
    <View style={styles.container}>
      <View style={styles.mapWrap}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          initialRegion={initialRegion}
          scrollEnabled={false}
          zoomEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          moveOnMarkerPress={false}
        >
          {pickupCoord && (
            <Marker coordinate={pickupCoord} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges title="Pickup" description={pickupLabel}>
              <View style={styles.pickupMarkerWrap}>
                <Animated.View
                  style={[
                    styles.markerPulseRing,
                    { transform: [{ scale: markerPulseScale }], opacity: markerPulseOpacity },
                  ]}
                />
                <View style={styles.pickupMarker}>
                  <View style={styles.pickupMarkerDot} />
                </View>
              </View>
            </Marker>
          )}
          {dropCoord && (
            <Marker coordinate={dropCoord} anchor={{ x: 0.5, y: 1 }} tracksViewChanges={false} title="Drop" description={dropLabel}>
              <View style={styles.dropMarker}>
                <View style={styles.dropMarkerHead} />
                <View style={styles.dropMarkerTail} />
              </View>
            </Marker>
          )}
          {pickupCoord && dropCoord && (
            <Polyline
              coordinates={[pickupCoord, dropCoord]}
              strokeColor={COLORS.red}
              strokeWidth={3}
              lineDashPattern={[8, 8]}
            />
          )}
        </MapView>
      </View>

      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
          <Text style={styles.title}>Finding the Nearest Ambulance</Text>
          <Text style={styles.subtitle}>
            We're locating the nearest available ambulance. This usually takes less than 30 seconds.
          </Text>

          <View
            style={styles.progressTrack}
            onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
          >
            {trackWidth > 0 && (
              <Animated.View
                style={[styles.progressBar, { width: barWidthPx, transform: [{ translateX }] }]}
              />
            )}
          </View>

          {/* Progress timeline */}
          <View style={styles.timeline}>
            {TIMELINE_STEPS.map((step, i) => {
              const isDone = i < ACTIVE_STEP_INDEX;
              const isActive = i === ACTIVE_STEP_INDEX;
              const isFirst = i === 0;
              const isLast = i === TIMELINE_STEPS.length - 1;
              const prevDone = i - 1 < ACTIVE_STEP_INDEX;
              return (
                <View key={step.key} style={styles.timelineStep}>
                  <View style={styles.timelineIconRow}>
                    <View style={[styles.timelineConnectorH, isFirst && styles.timelineConnectorHidden, prevDone && !isFirst && styles.timelineConnectorDone]} />
                    <View style={styles.timelineIconWrap}>
                      {isActive && (
                        <Animated.View
                          style={[
                            styles.timelinePulseRing,
                            { transform: [{ scale: stepPulseScale }], opacity: stepPulseOpacity },
                          ]}
                        />
                      )}
                      <View style={[styles.timelineIcon, isDone && styles.timelineIconDone, isActive && styles.timelineIconActive]}>
                        {isDone ? (
                          <Text style={styles.timelineCheck}>✓</Text>
                        ) : isActive ? (
                          <View style={styles.timelineActiveDot} />
                        ) : null}
                      </View>
                    </View>
                    <View style={[styles.timelineConnectorH, isLast && styles.timelineConnectorHidden, isDone && !isLast && styles.timelineConnectorDone]} />
                  </View>
                  <Text
                    style={[styles.timelineLabel, (isDone || isActive) && styles.timelineLabelActive]}
                    numberOfLines={2}
                  >
                    {step.label}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Booking details */}
          {(pickupLabel || dropLabel || ambName) && (
            <View style={styles.detailsCard}>
              {pickupLabel && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailIcon}>📍</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailLabel}>Pickup</Text>
                    <Text style={styles.detailValue} numberOfLines={2}>{pickupLabel}</Text>
                  </View>
                </View>
              )}
              {dropLabel && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailIcon}>🏁</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailLabel}>Destination</Text>
                    <Text style={styles.detailValue} numberOfLines={2}>{dropLabel}</Text>
                  </View>
                </View>
              )}
              {ambName && (
                <View style={[styles.detailRow, { marginBottom: 0 }]}>
                  <Text style={styles.detailIcon}>🚑</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailLabel}>Ambulance Type</Text>
                    <Text style={styles.detailValue}>{ambName}</Text>
                  </View>
                </View>
              )}

              {dist != null && fare != null && (
                <>
                  <View style={styles.divider} />
                  <Text style={styles.fareRow}>{dist.toFixed(1)} km · ₹{fare.toLocaleString()}</Text>
                </>
              )}
            </View>
          )}

          {/* Info banner */}
          <View style={styles.infoBanner}>
            <Text style={styles.infoBannerIcon}>📱</Text>
            <Text style={styles.infoBannerText}>
              Please keep your phone reachable while we connect you with the nearest ambulance.
            </Text>
          </View>
        </ScrollView>

        <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel} activeOpacity={0.8}>
          <Text style={styles.cancelBtnTxt}>Cancel Booking</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleSupport} activeOpacity={0.7}>
          <Text style={styles.supportLink}>Need Help? Contact Support</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  mapWrap: { width: "100%", height: SCREEN_H * 0.4 },
  map: { ...StyleSheet.absoluteFillObject },

  pickupMarkerWrap: { width: 26, height: 26, alignItems: "center", justifyContent: "center" },
  markerPulseRing: {
    position: "absolute", width: 26, height: 26, borderRadius: 13,
    backgroundColor: COLORS.red,
  },
  pickupMarker: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: COLORS.bg, borderWidth: 3, borderColor: COLORS.text,
    alignItems: "center", justifyContent: "center",
  },
  pickupMarkerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.text },

  dropMarker: { alignItems: "center" },
  dropMarkerHead: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: COLORS.red, borderWidth: 3, borderColor: COLORS.bg,
  },
  dropMarkerTail: {
    width: 0, height: 0, marginTop: -3,
    borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 9,
    borderLeftColor: "transparent", borderRightColor: "transparent",
    borderTopColor: COLORS.red,
  },

  sheet: {
    flex: 1,
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 32, borderTopRightRadius: 32,
    marginTop: -28,
    paddingTop: 14, paddingHorizontal: 22, paddingBottom: 18,
    shadowColor: "#000", shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08, shadowRadius: 16, elevation: 12,
  },
  sheetHandle: {
    width: 44, height: 4, borderRadius: 2,
    backgroundColor: COLORS.border, alignSelf: "center", marginBottom: 16,
  },

  title: { color: COLORS.text, fontSize: 20, fontWeight: "800", textAlign: "center" },
  subtitle: {
    color: COLORS.grayDim, fontSize: 13, textAlign: "center",
    marginTop: 6, lineHeight: 18, paddingHorizontal: 6,
  },

  progressTrack: {
    width: "100%", height: 4, borderRadius: 2,
    backgroundColor: COLORS.border, overflow: "hidden",
    marginTop: 18,
  },
  progressBar: { height: 4, borderRadius: 2, backgroundColor: COLORS.red },

  // Timeline (horizontal stepper)
  timeline: { flexDirection: "row", marginTop: 24 },
  timelineStep: { flex: 1, alignItems: "center" },
  timelineIconRow: { flexDirection: "row", alignItems: "center", width: "100%" },
  timelineIconWrap: { width: 22, height: 22, alignItems: "center", justifyContent: "center" },
  timelinePulseRing: {
    position: "absolute", width: 22, height: 22, borderRadius: 11,
    backgroundColor: COLORS.red,
  },
  timelineIcon: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: COLORS.bg2, borderWidth: 1.5, borderColor: COLORS.border,
    alignItems: "center", justifyContent: "center",
  },
  timelineIconDone: { backgroundColor: COLORS.green, borderColor: COLORS.green },
  timelineIconActive: { backgroundColor: COLORS.red, borderColor: COLORS.red },
  timelineCheck: { color: COLORS.bg, fontSize: 11, fontWeight: "800" },
  timelineActiveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.bg },
  timelineConnectorH: {
    flex: 1, height: 2,
    backgroundColor: COLORS.border,
  },
  timelineConnectorHidden: { backgroundColor: "transparent" },
  timelineConnectorDone: { backgroundColor: COLORS.green },
  timelineLabel: {
    color: COLORS.grayDim, fontSize: 10.5, fontWeight: "500",
    textAlign: "center", marginTop: 6, paddingHorizontal: 2,
  },
  timelineLabelActive: { color: COLORS.text, fontWeight: "700" },

  // Booking details card
  detailsCard: {
    backgroundColor: COLORS.bg2, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border,
    padding: 14, marginTop: 20,
  },
  detailRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 12 },
  detailIcon: { fontSize: 15, marginTop: 1 },
  detailLabel: { color: COLORS.grayDim, fontSize: 10.5, fontWeight: "700", letterSpacing: 0.4, marginBottom: 2 },
  detailValue: { color: COLORS.text, fontSize: 13.5, fontWeight: "600", lineHeight: 18 },

  divider: { width: "100%", height: 1, backgroundColor: COLORS.border, marginTop: 2, marginBottom: 12 },
  fareRow: { color: COLORS.text, fontSize: 13.5, fontWeight: "700" },

  // Info banner
  infoBanner: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: COLORS.bg2, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border,
    padding: 12, marginTop: 16,
  },
  infoBannerIcon: { fontSize: 17 },
  infoBannerText: { flex: 1, color: COLORS.grayDim, fontSize: 12, lineHeight: 17 },

  // Bottom buttons
  cancelBtn: {
    borderWidth: 1.5, borderColor: COLORS.red, borderRadius: 14,
    paddingVertical: 14, alignItems: "center", marginTop: 14,
    backgroundColor: COLORS.bg,
  },
  cancelBtnTxt: { color: COLORS.red, fontSize: 15, fontWeight: "700" },
  supportLink: {
    color: COLORS.grayDim, fontSize: 12.5, fontWeight: "600",
    textAlign: "center", marginTop: 12,
  },
});
