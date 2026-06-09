import React, { useState, useEffect, useRef, useContext } from "react";
import {
  View, Text, TouchableOpacity,
  StyleSheet, Platform, ActivityIndicator,
} from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import * as Location from "expo-location";
import { COLORS, LANGUAGES, t } from "../theme";
import { AppContext } from "../../App";

const PLACES_KEY = "AIzaSyB8wxgXxQxskgUZG868g_4Qdsezr07i9yA";

// ─── Dark map style ────────────────────────────────────────────────────────────
const DARK_MAP_STYLE = [
  { elementType: "geometry",               stylers: [{ color: "#1a1f2e" }] },
  { elementType: "labels.text.stroke",     stylers: [{ color: "#1a1f2e" }] },
  { elementType: "labels.text.fill",       stylers: [{ color: "#8a9bb0" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill",  stylers: [{ color: "#c0c8d8" }] },
  { featureType: "poi",                    elementType: "labels",             stylers: [{ visibility: "off" }] },
  { featureType: "road",                   elementType: "geometry",           stylers: [{ color: "#2c3347" }] },
  { featureType: "road",                   elementType: "geometry.stroke",    stylers: [{ color: "#1a1f2e" }] },
  { featureType: "road",                   elementType: "labels.text.fill",   stylers: [{ color: "#6b7a94" }] },
  { featureType: "road.highway",           elementType: "geometry",           stylers: [{ color: "#3d4a63" }] },
  { featureType: "road.highway",           elementType: "geometry.stroke",    stylers: [{ color: "#1a1f2e" }] },
  { featureType: "road.highway",           elementType: "labels.text.fill",   stylers: [{ color: "#a0aec0" }] },
  { featureType: "transit",               elementType: "geometry",            stylers: [{ color: "#252d40" }] },
  { featureType: "water",                  elementType: "geometry",           stylers: [{ color: "#0d1520" }] },
  { featureType: "water",                  elementType: "labels.text.fill",   stylers: [{ color: "#3a4a5c" }] },
  { featureType: "landscape",             elementType: "geometry",            stylers: [{ color: "#1a2030" }] },
];

// ─── Default region ────────────────────────────────────────────────────────────
const BANGALORE = { latitude: 12.9716, longitude: 77.5946, latitudeDelta: 0.045, longitudeDelta: 0.045 };

// ─── Ambulance simulation helpers ─────────────────────────────────────────────
const AMB_SEED = [
  { dlat:  0.008, dlng:  0.005, type: "BLS", label: "SL-01" },
  { dlat: -0.006, dlng:  0.011, type: "ALS", label: "SL-02" },
  { dlat:  0.004, dlng: -0.009, type: "ICU", label: "SL-03" },
  { dlat: -0.011, dlng: -0.004, type: "BLS", label: "SL-04" },
  { dlat:  0.013, dlng:  0.003, type: "BLS", label: "SL-05" },
];

function createAmbulances(base) {
  return AMB_SEED.map((s, i) => ({
    id: i,
    type: s.type,
    label: s.label,
    coord: { latitude: base.latitude + s.dlat, longitude: base.longitude + s.dlng },
    dir: { lat: s.dlat > 0 ? -1 : 1, lng: s.dlng > 0 ? -1 : 1 },
  }));
}

function moveAmbulances(prev, base) {
  if (!base) return prev;
  return prev.map(amb => {
    const step = 0.00018;
    const jitter = 0.6 + Math.random() * 0.8;
    const newLat = amb.coord.latitude + step * amb.dir.lat * jitter;
    const newLng = amb.coord.longitude + step * amb.dir.lng * jitter;
    const dirLat = Math.abs(newLat - base.latitude) > 0.016 ? -amb.dir.lat : amb.dir.lat;
    const dirLng = Math.abs(newLng - base.longitude) > 0.016 ? -amb.dir.lng : amb.dir.lng;
    return { ...amb, coord: { latitude: newLat, longitude: newLng }, dir: { lat: dirLat, lng: dirLng } };
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${PLACES_KEY}`
    );
    const data = await res.json();
    if (data.results?.length) {
      // Return short locality name (e.g. "Indiranagar, Bangalore")
      const comp = data.results[0].address_components;
      const locality    = comp.find(c => c.types.includes("sublocality_level_1") || c.types.includes("locality"))?.long_name;
      const city        = comp.find(c => c.types.includes("administrative_area_level_2") || c.types.includes("locality"))?.long_name;
      if (locality && city && locality !== city) return `${locality}, ${city}`;
      return data.results[0].formatted_address.split(",").slice(0, 2).join(",");
    }
  } catch {}
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

// ─── 3 × 3 services grid ──────────────────────────────────────────────────────
const GRID = [
  { icon: "📅", label: "Schedule",      screen: "Schedule",       params: {} },
  { icon: "✈️", label: "Air Ambulance", screen: "AirAmbulance",   params: {} },
  { icon: "🎪", label: "Event",         screen: "EventAmbulance", params: {} },
  { icon: "🛡️", label: "Standby",       screen: "Standby",        params: {} },
  { icon: "🏠", label: "Home Care",     screen: "HomeCare",       params: {} },
  { icon: "❄️", label: "Freezer Box",   screen: "FreezerBox",     params: {} },
  { icon: "⚰️", label: "Remains",       screen: "Remains",        params: {} },
  { icon: "🕉️", label: "Antim Yatra",  screen: "AntimYatra",     params: {} },
  { icon: "🚂", label: "Train",         screen: "Train",          params: {} },
];

// ─── Custom marker views ───────────────────────────────────────────────────────
function UserPin() {
  return (
    <View style={mk.userOuter}>
      <View style={mk.userInner} />
    </View>
  );
}

const AMB_COLORS = { BLS: "#22c55e", ALS: "#3b82f6", ICU: "#e8192c" };

function AmbPin({ type }) {
  const accent = AMB_COLORS[type] || "#22c55e";
  return (
    <View style={[mk.ambWrap, { borderColor: accent }]}>
      <Text style={mk.ambEmoji}>🚑</Text>
      <View style={[mk.ambDot, { backgroundColor: accent }]} />
    </View>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function HomeScreen({ navigation }) {
  const { lang, setLang } = useContext(AppContext);

  const [userCoord,  setUserCoord]  = useState(null);
  const [userLabel,  setUserLabel]  = useState("Getting location…");
  const [locLoading, setLocLoading] = useState(true);
  const [ambulances, setAmbulances] = useState([]);

  const coordRef       = useRef(null);
  const mapRef         = useRef(null);
  const ambCreated     = useRef(false);

  // ── GPS on mount ────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setUserLabel("Location permission denied");
        setLocLoading(false);
        return;
      }
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const coord = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        coordRef.current = coord;
        setUserCoord(coord);
        const label = await reverseGeocode(coord.latitude, coord.longitude);
        setUserLabel(label);
        // Animate map to user
        mapRef.current?.animateToRegion(
          { ...coord, latitudeDelta: 0.035, longitudeDelta: 0.035 },
          900
        );
      } catch {
        const last = await Location.getLastKnownPositionAsync();
        if (last) {
          const coord = { latitude: last.coords.latitude, longitude: last.coords.longitude };
          coordRef.current = coord;
          setUserCoord(coord);
          const label = await reverseGeocode(coord.latitude, coord.longitude);
          setUserLabel(label);
          mapRef.current?.animateToRegion(
            { ...coord, latitudeDelta: 0.035, longitudeDelta: 0.035 },
            900
          );
        } else {
          setUserLabel("Bangalore, Karnataka");
        }
      }
      setLocLoading(false);
    })();
  }, []);

  // ── Create ambulances once GPS is ready ─────────────────────────────────────
  useEffect(() => {
    if (!userCoord || ambCreated.current) return;
    ambCreated.current = true;
    setAmbulances(createAmbulances(userCoord));
  }, [userCoord]);

  // ── Slowly move ambulances every 2 s ────────────────────────────────────────
  useEffect(() => {
    if (ambulances.length === 0) return;
    const id = setInterval(() => {
      setAmbulances(prev => moveAmbulances(prev, coordRef.current));
    }, 2000);
    return () => clearInterval(id);
  }, [ambulances.length]);

  const nextLang = () => {
    const idx = LANGUAGES.indexOf(lang);
    setLang(LANGUAGES[(idx + 1) % LANGUAGES.length]);
  };

  return (
    <View style={styles.container}>

      {/* ── Full-screen map ──────────────────────────────────────────────────── */}
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        customMapStyle={DARK_MAP_STYLE}
        initialRegion={BANGALORE}
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        moveOnMarkerPress={false}
      >
        {/* User location — green pin */}
        {userCoord && (
          <Marker coordinate={userCoord} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
            <UserPin />
          </Marker>
        )}

        {/* Nearby ambulances */}
        {ambulances.map(amb => (
          <Marker
            key={amb.id}
            coordinate={amb.coord}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <AmbPin type={amb.type} />
          </Marker>
        ))}
      </MapView>

      {/* ── Floating top bar ─────────────────────────────────────────────────── */}
      <View style={styles.topBar}>
        {/* Logo + location */}
        <View style={styles.topLeft}>
          <Text style={styles.brand}>
            <Text style={{ color: COLORS.red }}>Save</Text>
            <Text style={{ color: COLORS.white }}>Life</Text>
          </Text>
          <View style={styles.locationRow}>
            {locLoading
              ? <ActivityIndicator size="small" color={COLORS.red} style={{ marginRight: 6 }} />
              : <Text style={styles.locationDot}>📍</Text>
            }
            <Text style={styles.locationTxt} numberOfLines={1}>{userLabel}</Text>
          </View>
        </View>

        {/* Right controls */}
        <View style={styles.topRight}>
          <TouchableOpacity style={styles.langChip} onPress={nextLang}>
            <Text style={styles.langTxt}>{lang}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.profileBtn}
            onPress={() => navigation.navigate("Profile")}
          >
            <Text style={{ fontSize: 18 }}>👤</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Live badge ───────────────────────────────────────────────────────── */}
      {ambulances.length > 0 && (
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveTxt}>{ambulances.length} units nearby</Text>
        </View>
      )}

      {/* ── Bottom sheet ─────────────────────────────────────────────────────── */}
      <View style={styles.sheet}>
        <View style={styles.handle} />

        {/* Greeting + status */}
        <View style={styles.greetRow}>
          <Text style={styles.greetTxt}>{getGreeting()} 👋</Text>
          <View style={styles.readyBadge}>
            <View style={styles.readyDot} />
            <Text style={styles.readyTxt}>
              {t(lang, "Ready", "ಸಿದ್ಧ", "तैयार", "సిద్ధం", "தயார்", "തയ്യാർ")}
            </Text>
          </View>
        </View>

        {/* WHERE TO — primary CTA */}
        <TouchableOpacity
          style={styles.whereToBtn}
          onPress={() => navigation.navigate("MapBooking")}
          activeOpacity={0.88}
        >
          <View style={styles.searchIcoBox}>
            <Text style={{ fontSize: 18 }}>🔍</Text>
          </View>
          <Text style={styles.whereToTxt}>
            {t(lang, "Where to?", "ಎಲ್ಲಿಗೆ?", "कहाँ जाना है?", "ఎక్కడికి?", "எங்கு?", "എങ്ങോട്ട്?")}
          </Text>
          <View style={styles.whereToArrow}>
            <Text style={{ color: COLORS.white, fontSize: 16, fontWeight: "700" }}>→</Text>
          </View>
        </TouchableOpacity>

        {/* 3 × 3 services grid */}
        <View style={styles.grid}>
          {[0, 1, 2].map(row => (
            <View key={row} style={styles.gridRow}>
              {GRID.slice(row * 3, row * 3 + 3).map(s => (
                <TouchableOpacity
                  key={s.label}
                  style={styles.gridCell}
                  onPress={() => navigation.navigate(s.screen, s.params)}
                  activeOpacity={0.75}
                >
                  <Text style={styles.cellIco}>{s.icon}</Text>
                  <Text style={styles.cellLbl} numberOfLines={2}>{s.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

// ─── Marker styles ────────────────────────────────────────────────────────────
const mk = StyleSheet.create({
  // User location — pulsing green circle
  userOuter: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: "rgba(34,197,94,0.25)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "rgba(34,197,94,0.5)",
  },
  userInner: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: COLORS.green,
  },

  // Ambulance pin
  ambWrap: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: "rgba(5,6,8,0.88)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1.5,
    shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 4,
    elevation: 6,
  },
  ambEmoji: { fontSize: 20, lineHeight: 22 },
  ambDot: {
    position: "absolute", bottom: 4, right: 4,
    width: 7, height: 7, borderRadius: 3.5,
    borderWidth: 1, borderColor: "rgba(5,6,8,0.9)",
  },
});

// ─── Screen styles ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  // ── Top bar ──────────────────────────────────────────────────────────────────
  topBar: {
    position: "absolute",
    top: Platform.OS === "ios" ? 54 : 40,
    left: 0, right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    zIndex: 10,
  },
  topLeft: {
    backgroundColor: "rgba(5,6,8,0.82)",
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 0.5, borderColor: "rgba(255,255,255,0.1)",
    maxWidth: "70%",
  },
  brand: { fontSize: 20, fontWeight: "900", lineHeight: 22 },
  locationRow: { flexDirection: "row", alignItems: "center", marginTop: 3 },
  locationDot: { fontSize: 11, marginRight: 3 },
  locationTxt: {
    color: COLORS.grayDim, fontSize: 11, fontWeight: "500", flexShrink: 1,
  },
  topRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  langChip: {
    backgroundColor: "rgba(232,25,44,0.15)",
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7,
    borderWidth: 0.5, borderColor: "rgba(232,25,44,0.35)",
  },
  langTxt: { color: COLORS.red, fontWeight: "800", fontSize: 12 },
  profileBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(5,6,8,0.82)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 0.5, borderColor: "rgba(255,255,255,0.12)",
  },

  // ── Live units badge ──────────────────────────────────────────────────────────
  liveBadge: {
    position: "absolute",
    top: Platform.OS === "ios" ? 120 : 106,
    alignSelf: "center",
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(5,6,8,0.8)",
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 0.5, borderColor: "rgba(34,197,94,0.3)",
    zIndex: 10,
  },
  liveDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: COLORS.green,
  },
  liveTxt: { color: COLORS.green, fontSize: 11, fontWeight: "700" },

  // ── Bottom sheet ──────────────────────────────────────────────────────────────
  sheet: {
    position: "absolute",
    bottom: 0, left: 0, right: 0,
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingBottom: Platform.OS === "ios" ? 36 : 22,
    paddingTop: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.55,
    shadowRadius: 18,
    elevation: 28,
  },
  handle: {
    width: 38, height: 4, borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignSelf: "center",
    marginBottom: 14,
  },

  // Greeting row
  greetRow: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  greetTxt: { color: COLORS.white, fontSize: 15, fontWeight: "700" },
  readyBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(34,197,94,0.12)",
    borderRadius: 100, paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 0.5, borderColor: "rgba(34,197,94,0.3)",
  },
  readyDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: COLORS.green },
  readyTxt: { color: COLORS.green, fontSize: 11, fontWeight: "700" },

  // Where to button
  whereToBtn: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: COLORS.red,
    borderRadius: 16, paddingVertical: 15, paddingHorizontal: 16,
    marginBottom: 14,
    shadowColor: COLORS.red,
    shadowOpacity: 0.45, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  searchIcoBox: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: "rgba(0,0,0,0.22)",
    alignItems: "center", justifyContent: "center",
  },
  whereToTxt: { flex: 1, color: COLORS.white, fontSize: 16, fontWeight: "700" },
  whereToArrow: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.22)",
    alignItems: "center", justifyContent: "center",
  },

  // 3×3 services grid
  grid: { gap: 8 },
  gridRow: { flexDirection: "row", gap: 8 },
  gridCell: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 14, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.09)",
    paddingVertical: 12,
    alignItems: "center", justifyContent: "center",
    gap: 6,
  },
  cellIco: { fontSize: 28 },
  cellLbl: {
    color: "rgba(255,255,255,0.72)", fontSize: 11, fontWeight: "500",
    textAlign: "center", lineHeight: 15,
    paddingHorizontal: 4,
  },
});
