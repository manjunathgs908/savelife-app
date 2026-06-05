import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator,
} from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import * as Location from "expo-location";
import { COLORS, getBookingConfig } from "../theme";

const MAPS_KEY = "AIzaSyDbfZSXgpZqZy3pzyt2Is0b1YWZQduy8dY";

function decodePolyline(encoded) {
  const pts = [];
  let i = 0, lat = 0, lng = 0;
  while (i < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = result = 0;
    do { b = encoded.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    pts.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return pts;
}

export default function BookingWizardScreen({ navigation, route }) {
  const service = route.params?.service || "bls";
  const cfg = getBookingConfig(service);
  const svcName = { bls: "BLS", als: "ALS", icu: "ICU" }[service] || "Ambulance";

  const steps = cfg.isAdvanced
    ? ["location", "vehicle", "ac", "staff", "addons", "review"]
    : ["location", "vehicle", "ac", "addons", "review"];

  const [step, setStep] = useState(1);
  const [vehicle, setVehicle] = useState(null);
  const [ac, setAc] = useState(null);
  const [staff, setStaff] = useState(null);
  const [addons, setAddons] = useState([]);

  const [pickup, setPickup] = useState(null);
  const [dropoff, setDropoff] = useState(null);
  const [routeCoords, setRouteCoords] = useState([]);
  const [realDist, setRealDist] = useState(null);
  const [realDuration, setRealDuration] = useState(null);
  const [locLoading, setLocLoading] = useState(true);
  const mapRef = useRef(null);

  const cur = steps[step - 1];
  const dist = realDist ?? 8.4;

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocLoading(false);
        return;
      }
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setPickup({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      } catch {
        const last = await Location.getLastKnownPositionAsync();
        if (last) {
          setPickup({ latitude: last.coords.latitude, longitude: last.coords.longitude });
        }
      }
      setLocLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!pickup || !dropoff) return;
    fetchRoute(pickup, dropoff);
  }, [dropoff]);

  async function fetchRoute(from, to) {
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/directions/json` +
        `?origin=${from.latitude},${from.longitude}` +
        `&destination=${to.latitude},${to.longitude}` +
        `&key=${MAPS_KEY}`
      );
      const data = await res.json();
      if (data.routes?.length) {
        const leg = data.routes[0].legs[0];
        setRealDist(leg.distance.value / 1000);
        setRealDuration(leg.duration.value);
        setRouteCoords(decodePolyline(data.routes[0].overview_polyline.points));
        setTimeout(() => {
          mapRef.current?.fitToCoordinates([from, to], {
            edgePadding: { top: 60, right: 50, bottom: 60, left: 50 },
            animated: true,
          });
        }, 400);
      }
    } catch (_) {}
  }

  const perKm = vehicle ? cfg.vehicles.find((v) => v.id === vehicle)?.rate || 0 : 0;
  const distFare = Math.round(perKm * dist);
  const acFare = ac === "ac" ? cfg.acPrice : 0;
  const staffFare = staff ? cfg.staffPrice[staff] : 0;
  const addonFare = addons.reduce((s, id) => s + (cfg.addons.find((a) => a.id === id)?.price || 0), 0);
  const total = distFare + acFare + staffFare + addonFare;

  const toggleAddon = (id) =>
    setAddons((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));

  const next = () =>
    step < steps.length ? setStep(step + 1) : navigation.navigate("Searching", { service });
  const back = () => (step > 1 ? setStep(step - 1) : navigation.goBack());

  const canNext =
    cur === "location" ? !!dropoff :
    cur === "vehicle" ? !!vehicle :
    cur === "ac" ? !!ac :
    cur === "staff" ? !!staff : true;

  const OptCard = ({ active, onPress, icon, name, desc, radio = true, check = false }) => (
    <TouchableOpacity
      style={[styles.opt, { borderColor: active ? COLORS.red : COLORS.border, backgroundColor: active ? "rgba(232,25,44,0.08)" : COLORS.bg3 }]}
      onPress={onPress}
    >
      {icon ? <View style={styles.optIcon}><Text style={{ fontSize: 24 }}>{icon}</Text></View> : null}
      <View style={{ flex: 1 }}>
        <Text style={styles.optName}>{name}</Text>
        {desc ? <Text style={styles.optDesc}>{desc}</Text> : null}
      </View>
      {radio && (
        <View style={[styles.radio, { borderColor: active ? COLORS.red : "rgba(255,255,255,0.3)" }]}>
          {active && <View style={styles.radioDot} />}
        </View>
      )}
      {check && (
        <View style={[styles.checkbox, { backgroundColor: active ? COLORS.red : "transparent", borderColor: active ? COLORS.red : "rgba(255,255,255,0.3)" }]}>
          {active && <Text style={{ color: "#fff", fontSize: 13 }}>✓</Text>}
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.back} onPress={back}>
          <Text style={{ color: COLORS.white, fontSize: 20 }}>←</Text>
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>{svcName} Ambulance</Text>
          <Text style={styles.stepLbl}>Step {step} of {steps.length}</Text>
        </View>
      </View>

      <View style={styles.dots}>
        {steps.map((_, i) => (
          <View key={i} style={[styles.dot, { backgroundColor: i < step ? COLORS.red : "rgba(255,255,255,0.12)", width: i === step - 1 ? 26 : 8 }]} />
        ))}
      </View>

      {step > 1 && (
        <View style={styles.fareBar}>
          <View>
            <Text style={styles.fareLbl}>Estimated Fare • {dist.toFixed(1)} km</Text>
            <Text style={styles.fareAmt}>₹{total.toLocaleString()}</Text>
          </View>
          <View style={styles.fareTag}><Text style={styles.fareTagText}>LIVE</Text></View>
        </View>
      )}

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 18 }}>

        {cur === "location" && (
          <>
            <Text style={styles.q}>Pickup & Drop</Text>
            <Text style={styles.qHint}>Tap on the map to set your drop location</Text>

            {locLoading ? (
              <View style={styles.mapPlaceholder}>
                <ActivityIndicator color={COLORS.red} size="large" />
                <Text style={styles.mapPlaceholderText}>Getting your location…</Text>
              </View>
            ) : !pickup ? (
              <View style={styles.mapPlaceholder}>
                <Text style={{ fontSize: 32 }}>📍</Text>
                <Text style={styles.mapPlaceholderText}>Location unavailable</Text>
                <Text style={styles.mapPlaceholderSub}>Enable location permission and try again</Text>
              </View>
            ) : (
              <View style={styles.mapContainer}>
                <MapView
                  ref={mapRef}
                  provider={PROVIDER_GOOGLE}
                  style={styles.map}
                  initialRegion={{
                    latitude: pickup.latitude,
                    longitude: pickup.longitude,
                    latitudeDelta: 0.04,
                    longitudeDelta: 0.04,
                  }}
                  onPress={(e) => setDropoff(e.nativeEvent.coordinate)}
                >
                  <Marker coordinate={pickup} pinColor="green" title="Pickup" />
                  {dropoff && <Marker coordinate={dropoff} pinColor="red" title="Drop" />}
                  {routeCoords.length > 0 && (
                    <Polyline
                      coordinates={routeCoords}
                      strokeColor={COLORS.red}
                      strokeWidth={3}
                    />
                  )}
                </MapView>
                {!dropoff && (
                  <View style={styles.mapHint} pointerEvents="none">
                    <View style={styles.mapHintBubble}>
                      <Text style={styles.mapHintText}>👆 Tap to set drop location</Text>
                    </View>
                  </View>
                )}
              </View>
            )}

            <View style={styles.locField}>
              <Text style={{ color: COLORS.green, fontSize: 16 }}>●</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.locLbl}>Pickup Location</Text>
                <Text style={styles.locVal}>
                  {locLoading ? "Getting location…" : pickup ? "📍 Current Location" : "Location unavailable"}
                </Text>
              </View>
            </View>
            <View style={styles.connector} />
            <View style={styles.locField}>
              <Text style={{ color: COLORS.red, fontSize: 16 }}>●</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.locLbl}>Drop Location</Text>
                <Text style={styles.locVal}>
                  {dropoff
                    ? `📍 ${dropoff.latitude.toFixed(4)}°, ${dropoff.longitude.toFixed(4)}°`
                    : "Tap on map to select"}
                </Text>
              </View>
            </View>

            {realDist != null && (
              <View style={styles.distRow}>
                <Text style={styles.distText}>
                  📏 {realDist.toFixed(1)} km • ~{Math.round(realDuration / 60)} min
                </Text>
              </View>
            )}
          </>
        )}

        {cur === "vehicle" && (
          <>
            <Text style={styles.q}>Choose Vehicle</Text>
            {cfg.vehicles.map((v) => (
              <OptCard key={v.id} active={vehicle === v.id} onPress={() => setVehicle(v.id)}
                icon={v.icon} name={v.name} desc={`₹${v.rate}/km • ₹${Math.round(v.rate * dist)} this trip`} />
            ))}
          </>
        )}

        {cur === "ac" && (
          <>
            <Text style={styles.q}>AC Preference</Text>
            <OptCard active={ac === "ac"} onPress={() => setAc("ac")} icon="❄️" name="With AC" desc="+₹200" />
            <OptCard active={ac === "nonac"} onPress={() => setAc("nonac")} icon="🌡️" name="Without AC" desc="Free" />
          </>
        )}

        {cur === "staff" && (
          <>
            <Text style={styles.q}>Medical Staff</Text>
            <OptCard active={staff === "nurse"} onPress={() => setStaff("nurse")} icon="👩‍⚕️" name="Nurse" desc="+₹500" />
            <OptCard active={staff === "doctor"} onPress={() => setStaff("doctor")} icon="🩺" name="Doctor" desc="+₹1,200" />
          </>
        )}

        {cur === "addons" && (
          <>
            <Text style={styles.q}>Add Equipment</Text>
            <Text style={styles.qHint}>Select what you need, or skip if none</Text>
            {cfg.addons.map((a) => (
              <OptCard key={a.id} active={addons.includes(a.id)} onPress={() => toggleAddon(a.id)}
                name={a.name} desc={`₹${a.price}`} radio={false} check />
            ))}
          </>
        )}

        {cur === "review" && (
          <>
            <Text style={styles.q}>Review & Confirm</Text>
            <View style={styles.reviewCard}>
              <Row l="Service" v={`${svcName} Ambulance`} />
              <Row l="Vehicle" v={cfg.vehicles.find((v) => v.id === vehicle)?.name || "—"} />
              <Row l="AC" v={ac === "ac" ? "With AC" : "Without AC"} />
              {cfg.isAdvanced && <Row l="Staff" v={staff === "doctor" ? "Doctor" : staff === "nurse" ? "Nurse" : "—"} />}
              <Row l="Equipment" v={addons.length ? `${addons.length} items` : "None"} />
              <Row l="Distance" v={`${dist.toFixed(1)} km`} />
            </View>
            <View style={styles.breakdown}>
              <FbRow l={`Distance (${dist.toFixed(1)} km × ₹${perKm})`} v={`₹${distFare}`} />
              {acFare > 0 && <FbRow l="AC charge" v={`₹${acFare}`} />}
              {staffFare > 0 && <FbRow l="Medical staff" v={`₹${staffFare}`} />}
              {addonFare > 0 && <FbRow l="Equipment" v={`₹${addonFare}`} />}
              <View style={styles.fbTotal}>
                <Text style={styles.fbTotalText}>Total</Text>
                <Text style={[styles.fbTotalText, { color: COLORS.red }]}>₹{total.toLocaleString()}</Text>
              </View>
            </View>
          </>
        )}

      </ScrollView>

      <View style={styles.footer}>
        {cur === "addons" && (
          <TouchableOpacity style={styles.skip} onPress={next}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.btn, { opacity: canNext ? 1 : 0.4, flex: 1 }]}
          disabled={!canNext}
          onPress={next}
        >
          <Text style={styles.btnText}>
            {step === steps.length ? `Confirm • ₹${total.toLocaleString()}` : "Next"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const Row = ({ l, v }) => (
  <View style={styles.revRow}>
    <Text style={styles.revLbl}>{l}</Text>
    <Text style={styles.revVal}>{v}</Text>
  </View>
);

const FbRow = ({ l, v }) => (
  <View style={styles.fbRow}>
    <Text style={styles.fbText}>{l}</Text>
    <Text style={styles.fbText}>{v}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingTop: 50 },
  header: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 18 },
  back: { width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.bg3, alignItems: "center", justifyContent: "center" },
  title: { color: COLORS.white, fontSize: 20, fontWeight: "700" },
  stepLbl: { color: COLORS.grayDim, fontSize: 11, marginTop: 2 },
  dots: { flexDirection: "row", gap: 6, paddingHorizontal: 18, paddingVertical: 14, alignItems: "center" },
  dot: { height: 8, borderRadius: 4 },
  fareBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginHorizontal: 18, marginBottom: 8, padding: 14, backgroundColor: "rgba(232,25,44,0.1)", borderWidth: 1, borderColor: "rgba(232,25,44,0.3)", borderRadius: 14 },
  fareLbl: { color: COLORS.gray, fontSize: 11 },
  fareAmt: { color: COLORS.white, fontSize: 24, fontWeight: "800", marginTop: 2 },
  fareTag: { backgroundColor: "rgba(232,25,44,0.2)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100 },
  fareTagText: { color: COLORS.red, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  q: { color: COLORS.white, fontSize: 19, fontWeight: "700", marginBottom: 6 },
  qHint: { color: COLORS.grayDim, fontSize: 12, marginBottom: 16 },
  mapContainer: { height: 240, borderRadius: 14, overflow: "hidden", marginBottom: 16 },
  map: { flex: 1 },
  mapPlaceholder: { height: 240, backgroundColor: COLORS.bg3, borderRadius: 14, marginBottom: 16, alignItems: "center", justifyContent: "center", gap: 10, borderWidth: 1, borderColor: COLORS.border },
  mapPlaceholderText: { color: COLORS.white, fontSize: 14, fontWeight: "600" },
  mapPlaceholderSub: { color: COLORS.grayDim, fontSize: 12 },
  mapHint: { position: "absolute", bottom: 12, left: 0, right: 0, alignItems: "center" },
  mapHintBubble: { backgroundColor: "rgba(0,0,0,0.65)", paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20 },
  mapHintText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  locField: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, backgroundColor: COLORS.bg3, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12 },
  locLbl: { color: COLORS.grayDim, fontSize: 11 },
  locVal: { color: COLORS.white, fontSize: 14, marginTop: 3, fontWeight: "500" },
  connector: { width: 2, height: 18, backgroundColor: "rgba(255,255,255,0.15)", marginLeft: 26 },
  distRow: { marginTop: 12, padding: 12, backgroundColor: "rgba(34,197,94,0.1)", borderRadius: 10, borderWidth: 1, borderColor: "rgba(34,197,94,0.25)" },
  distText: { color: COLORS.green, fontWeight: "600", fontSize: 13, textAlign: "center" },
  opt: { flexDirection: "row", alignItems: "center", gap: 14, padding: 15, borderRadius: 14, borderWidth: 1, marginBottom: 11 },
  optIcon: { width: 48, height: 48, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.05)", alignItems: "center", justifyContent: "center" },
  optName: { color: COLORS.white, fontWeight: "600", fontSize: 15 },
  optDesc: { color: COLORS.grayDim, fontSize: 12, marginTop: 2 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: COLORS.red },
  checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  reviewCard: { backgroundColor: COLORS.bg3, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, padding: 18, marginBottom: 14 },
  revRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" },
  revLbl: { color: COLORS.grayDim, fontSize: 13 },
  revVal: { color: COLORS.white, fontSize: 13, fontWeight: "600" },
  breakdown: { backgroundColor: COLORS.bg3, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, padding: 18 },
  fbRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 7 },
  fbText: { color: COLORS.gray, fontSize: 13 },
  fbTotal: { flexDirection: "row", justifyContent: "space-between", paddingTop: 12, marginTop: 6, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.1)" },
  fbTotalText: { color: COLORS.white, fontSize: 17, fontWeight: "800" },
  footer: { padding: 18, flexDirection: "row", gap: 10 },
  skip: { paddingHorizontal: 28, paddingVertical: 16, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: COLORS.border, borderRadius: 12 },
  skipText: { color: COLORS.gray, fontSize: 15, fontWeight: "600" },
  btn: { backgroundColor: COLORS.red, borderRadius: 12, paddingVertical: 16, alignItems: "center" },
  btnText: { color: COLORS.white, fontSize: 16, fontWeight: "700" },
});
