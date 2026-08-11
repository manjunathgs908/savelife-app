import React, { useState, useEffect, useRef, useContext } from "react";
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, Platform, ActivityIndicator, Dimensions, Alert,
} from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import * as Location from "expo-location";
import { ensureLocationPermission } from "../utils/locationPermission";
import { COLORS } from "../theme";
import { AppContext } from "../../App";
import { EMERGENCY_DISCLAIMER } from "../utils/legal";

const { width: SCREEN_W } = Dimensions.get("window");
const PLACES_KEY = "AIzaSyB8wxgXxQxskgUZG868g_4Qdsezr07i9yA";

// ─── Layout constants ─────────────────────────────────────────────────────────
const CARD_GAP = 10;
const SIDE_PAD = 16;
const CARD_W   = (SCREEN_W - SIDE_PAD * 2 - CARD_GAP * 2) / 3;
const CARD_H   = Math.round(CARD_W * 0.95);   // ≈ 103 px on 375 pt screen

const MAP_H   = 225;    // map container height
const OVERLAP = 16;     // how far the location card slides over the map bottom

// ─── Map default region ───────────────────────────────────────────────────────
const BANGALORE = {
  latitude: 12.9716, longitude: 77.5946,
  latitudeDelta: 0.04, longitudeDelta: 0.04,
};

// ─── Ambulance simulation ─────────────────────────────────────────────────────
const AMB_SEED = [
  { dlat:  0.008, dlng:  0.005, type: "BLS" },
  { dlat: -0.006, dlng:  0.011, type: "ALS" },
  { dlat:  0.004, dlng: -0.009, type: "ICU" },
  { dlat: -0.011, dlng: -0.004, type: "BLS" },
  { dlat:  0.013, dlng:  0.003, type: "BLS" },
];

function createAmbulances(base) {
  return AMB_SEED.map((s, i) => ({
    id: i, type: s.type,
    coord: { latitude: base.latitude + s.dlat, longitude: base.longitude + s.dlng },
    dir:   { lat: s.dlat > 0 ? -1 : 1, lng: s.dlng > 0 ? -1 : 1 },
  }));
}

function moveAmbulances(prev, base) {
  if (!base) return prev;
  return prev.map(amb => {
    const step = 0.00018, jitter = 0.6 + Math.random() * 0.8;
    const newLat = amb.coord.latitude  + step * amb.dir.lat * jitter;
    const newLng = amb.coord.longitude + step * amb.dir.lng * jitter;
    const dirLat = Math.abs(newLat - base.latitude)  > 0.016 ? -amb.dir.lat : amb.dir.lat;
    const dirLng = Math.abs(newLng - base.longitude) > 0.016 ? -amb.dir.lng : amb.dir.lng;
    return { ...amb, coord: { latitude: newLat, longitude: newLng }, dir: { lat: dirLat, lng: dirLng } };
  });
}

async function reverseGeocode(lat, lng) {
  try {
    const res  = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${PLACES_KEY}`
    );
    const data = await res.json();
    if (data.results?.length) {
      const comp = data.results[0].address_components;
      const locality = comp.find(c =>
        c.types.includes("sublocality_level_1") || c.types.includes("locality")
      )?.long_name;
      const city = comp.find(c =>
        c.types.includes("administrative_area_level_2") || c.types.includes("locality")
      )?.long_name;
      if (locality && city && locality !== city) return `${locality}, ${city}`;
      return data.results[0].formatted_address.split(",").slice(0, 2).join(",");
    }
  } catch {}
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

// ─── 9 service cards ──────────────────────────────────────────────────────────
// Grid layout:
//  Row 1 → Emergency · Air Ambulance · Air Cargo
//  Row 2 → Freezer Box · Dead Body Transport · Event
//  Row 3 → Antim Yatra · Train Transport · Standby Ambulance
const SERVICES = [
  { icon: "🚑", label: "Emergency\nAmbulance", subtitle: "Fastest Response",
    screen: "BookingFlow",    bg: "#e8192c", light: false, popular: true,
    gloss: "rgba(255,255,255,0.26)" },
  { icon: "🚁", label: "Air Ambulance",         subtitle: "Quick & Safe",
    screen: "AirAmbulance",   bg: "#0d9488", light: false, popular: false,
    gloss: "rgba(255,255,255,0.22)" },
  { icon: "✈️", label: "Air Cargo",             subtitle: "Body Shifting",
    screen: "Remains",        bg: "#5b21b6", light: false, popular: false,
    gloss: "rgba(255,255,255,0.20)" },
  { icon: "❄️", label: "Freezer Box",           subtitle: "Safe & Hygienic",
    screen: "FreezerBox",     bg: "#6d28d9", light: false, popular: false,
    gloss: "rgba(255,255,255,0.20)" },
  { icon: "⚰️", label: "Dead Body\nTransport",  subtitle: "Dignified Service",
    screen: "DeadBodyTransport", bg: "#ea580c", light: false, popular: false,
    gloss: "rgba(255,255,255,0.22)" },
  { icon: "🎪", label: "Event\nAmbulance",       subtitle: "Events & Occasions",
    screen: "EventAmbulance", bg: "#d97706", light: false, popular: false,
    gloss: "rgba(255,255,255,0.24)" },
  { icon: "🔥", label: "Antim Yatra",            subtitle: "Local Cremation",
    screen: "AntimYatra",     bg: "#fef3c7", light: true,  popular: false,
    gloss: "rgba(0,0,0,0.04)" },
  { icon: "🚂", label: "Train\nTransport",        subtitle: "Pan India Service",
    screen: "Train",          bg: "#0891b2", light: false, popular: false,
    gloss: "rgba(255,255,255,0.22)" },
  { icon: "🛡️", label: "Standby\nAmbulance",     subtitle: "On Standby 24/7",
    screen: "Standby",        bg: "#7c3aed", light: false, popular: false,
    gloss: "rgba(255,255,255,0.20)" },
];

// ─── Map markers ──────────────────────────────────────────────────────────────
const AMB_COLOR = { BLS: "#ef4444", ALS: "#3b82f6", ICU: "#dc2626" };

function UserPin() {
  return (
    <View style={mk.userOuter}>
      <View style={mk.userMid}>
        <View style={mk.userCore} />
      </View>
    </View>
  );
}

function AmbPin({ type }) {
  const color = AMB_COLOR[type] || "#ef4444";
  return (
    <View style={{ alignItems: "center" }}>
      <View style={[mk.pinCircle, { backgroundColor: color }]}>
        <Text style={mk.pinEmoji}>🚑</Text>
      </View>
      <View style={[mk.pinTail, { borderTopColor: color }]} />
    </View>
  );
}

// ─── Service card ─────────────────────────────────────────────────────────────
function ServiceCard({ svc, onPress }) {
  return (
    <TouchableOpacity
      style={[
        styles.svcCard,
        { backgroundColor: svc.bg },
      ]}
      onPress={onPress}
      activeOpacity={0.80}
    >
      {/* Gradient gloss: bright circle clipped to top-right corner */}
      <View style={[styles.cardGloss, { backgroundColor: svc.gloss }]} />

      {/* Popular badge — Emergency Ambulance only */}
      {svc.popular && (
        <View style={styles.popularBadge}>
          <Text style={styles.popularTxt}>🔥 Popular</Text>
        </View>
      )}

      {/* Icon fills top portion */}
      <View style={styles.iconWrap}>
        <Text style={styles.svcEmoji}>{svc.icon}</Text>
      </View>

      {/* Label + subtitle sit at the bottom */}
      <View>
        <Text style={[styles.svcName, svc.light ? styles.nameDark : styles.nameWhite]}>
          {svc.label}
        </Text>
        <Text
          style={[styles.svcSub, svc.light ? styles.subDark : styles.subWhite]}
          numberOfLines={1}
        >
          {svc.subtitle}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Promotional banner ────────────────────────────────────────────────────────
function PromoBanner() {
  return (
    <View style={styles.promoBanner}>
      <View style={styles.promoGloss} />

      <View style={styles.promoLeft}>
        <Text style={styles.promoTagline}>Fast. Safe. Reliable.</Text>
        <Text style={styles.promoBody}>
          SaveLife is always there when you need us.
        </Text>
        <TouchableOpacity style={styles.promoBtn} activeOpacity={0.8}>
          <Text style={styles.promoBtnTxt}>Know More  →</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.promoRight}>
        <Text style={styles.promoAmbEmoji}>🚑</Text>
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function HomeScreen({ navigation }) {
  useContext(AppContext);

  const [userCoord,       setUserCoord]       = useState(null);
  const [userLabel,       setUserLabel]       = useState("Getting location…");
  const [locLoading,      setLocLoading]      = useState(true);
  const [ambulances,      setAmbulances]      = useState([]);

  const coordRef   = useRef(null);
  const mapRef     = useRef(null);
  const ambCreated = useRef(false);

  useEffect(() => {
    (async () => {
      const granted = await ensureLocationPermission();
      if (!granted) {
        setUserLabel("Bangalore, Karnataka");
        setLocLoading(false);
        return;
      }
      try {
        const loc   = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const coord = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        coordRef.current = coord;
        setUserCoord(coord);
        const label = await reverseGeocode(coord.latitude, coord.longitude);
        setUserLabel(label);
        mapRef.current?.animateToRegion({ ...coord, latitudeDelta: 0.035, longitudeDelta: 0.035 }, 900);
      } catch {
        const last = await Location.getLastKnownPositionAsync();
        if (last) {
          const coord = { latitude: last.coords.latitude, longitude: last.coords.longitude };
          coordRef.current = coord;
          setUserCoord(coord);
          const label = await reverseGeocode(coord.latitude, coord.longitude);
          setUserLabel(label);
          mapRef.current?.animateToRegion({ ...coord, latitudeDelta: 0.035, longitudeDelta: 0.035 }, 900);
        } else {
          setUserLabel("Bangalore, Karnataka");
        }
      }
      setLocLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!userCoord || ambCreated.current) return;
    ambCreated.current = true;
    setAmbulances(createAmbulances(userCoord));
  }, [userCoord]);

  useEffect(() => {
    if (ambulances.length === 0) return;
    const id = setInterval(
      () => setAmbulances(prev => moveAmbulances(prev, coordRef.current)),
      2000
    );
    return () => clearInterval(id);
  }, [ambulances.length]);

  const nearest = ambulances.find(a => a.type === "BLS") ?? ambulances[0];

  // ── Booking flow entry point — tapping the search bar or the Emergency
  //    Ambulance card both open the full Destination screen, where pickup
  //    (auto-detected GPS) and the hospital/destination search both live.
  function openDestinationScreen(flow) {
    navigation.navigate("DestinationScreen", {
      gpsCoord: userCoord,
      gpsLabel: userLabel,
      flow,
    });
  }

  return (
    <View style={styles.root}>

      {/* ══════════════════════════════ HEADER ═══════════════════════════════ */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.menuBtn} activeOpacity={0.7}>
          <Text style={styles.menuIcon}>≡</Text>
        </TouchableOpacity>

        <View style={styles.brand}>
          <Text style={styles.brandTxt}>
            <Text style={{ color: COLORS.text }}>Save</Text>
            <Text style={{ color: COLORS.red  }}>Life</Text>
          </Text>
          <TouchableOpacity style={styles.locationRow} activeOpacity={0.7}>
            {locLoading
              ? <ActivityIndicator size="small" color={COLORS.red} style={{ marginRight: 4 }} />
              : <Text style={styles.locPin}>📍</Text>
            }
            <Text style={styles.locationLbl} numberOfLines={1}>{userLabel}</Text>
            <Text style={styles.chevron}> ›</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.bellWrap} activeOpacity={0.7}>
            <Text style={styles.bellEmoji}>🔔</Text>
            <View style={styles.bellBadge} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.sosBtn} activeOpacity={0.85}>
            <Text style={styles.sosEmoji}>📞</Text>
            <Text style={styles.sosTxt}>SOS</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ═══════════════════════════════ MAP ═════════════════════════════════
          MAP_H = 225px
          nearestCard + liveBtn are at bottom: (OVERLAP + 10) = 26px from
          the map's bottom edge — safely above the OVERLAP zone where the
          location card slides in.
      */}
      <View style={styles.mapWrap}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFill}
          initialRegion={BANGALORE}
          showsMyLocationButton={false}
          showsCompass={false}
          toolbarEnabled={false}
          moveOnMarkerPress={false}
        >
          {userCoord && (
            <Marker coordinate={userCoord} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
              <UserPin />
            </Marker>
          )}
          {ambulances.map(amb => (
            <Marker
              key={amb.id}
              coordinate={amb.coord}
              anchor={{ x: 0.5, y: 1.0 }}
              tracksViewChanges={false}
            >
              <AmbPin type={amb.type} />
            </Marker>
          ))}
        </MapView>

        {/* Nearest Ambulance — BOTTOM-LEFT */}
        {nearest && (
          <View style={styles.nearestCard}>
            <Text style={styles.nearestLbl}>Nearest Ambulance</Text>
            <View style={styles.nearestRow}>
              <Text style={styles.nearestTime}>2 min away</Text>
              <View style={styles.nearestDot} />
            </View>
            <View style={styles.nearestPill}>
              <Text style={styles.nearestPillTxt}>{nearest.type} Ambulance</Text>
            </View>
          </View>
        )}

        {/* Live Tracking — BOTTOM-RIGHT */}
        <TouchableOpacity
          style={styles.liveBtn}
          // TODO: wire up to the new tracking screen once it's built — TrackingScreen.js was removed
          onPress={() => Alert.alert("Live Tracking", "Live tracking is coming soon.")}
          activeOpacity={0.85}
        >
          <Text style={styles.liveIco}>🎯</Text>
          <Text style={styles.liveTxt}>Live Tracking</Text>
        </TouchableOpacity>
      </View>

      {/* ═══════════════════════ SCROLLABLE CONTENT ══════════════════════════ */}
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >

        {/* ── Search bar — navigates to the full Destination screen ────────── */}
        <TouchableOpacity
          style={styles.searchBarWrap}
          onPress={openDestinationScreen}
          activeOpacity={0.85}
        >
          <View style={styles.searchBarIcoWrap}>
            <Text style={styles.searchBarIco}>🔍</Text>
          </View>
          <Text style={styles.searchBarTxt} numberOfLines={1}>
            Search Hospital / Emergency Destination
          </Text>
          <View style={styles.searchBarArrow}>
            <Text style={styles.searchBarArrowTxt}>→</Text>
          </View>
        </TouchableOpacity>

        {/* ── Our Services ──────────────────────────────────────────────────── */}
        <View style={styles.svcSection}>

          <View style={styles.svcHeader}>
            <Text style={styles.svcTitle}>Our Services</Text>
            <TouchableOpacity activeOpacity={0.7}>
              <Text style={styles.viewAll}>View All</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.grid}>
            {/* Rows 1–3 : each row = 3 equal cards */}
            {[0, 1, 2].map(row => (
              <View key={row} style={styles.gridRow}>
                {SERVICES.slice(row * 3, row * 3 + 3).map(svc => (
                  <ServiceCard
                    key={svc.label}
                    svc={svc}
                    onPress={() => {
                      if (svc.screen === "BookingFlow") openDestinationScreen();
                      else if (svc.screen === "DeadBodyTransport") openDestinationScreen("deadbody");
                      else navigation.navigate(svc.screen);
                    }}
                  />
                ))}
              </View>
            ))}
          </View>

          <PromoBanner />

          {/* Standing emergency disclaimer — not dismissible, no close affordance. */}
          <Text style={styles.disclaimer}>{EMERGENCY_DISCLAIMER}</Text>

        </View>
      </ScrollView>

    </View>
  );
}

// ─── Marker styles ────────────────────────────────────────────────────────────
const mk = StyleSheet.create({
  // Google-Maps-style blue pulsing user dot
  userOuter: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: "rgba(59,130,246,0.14)",
    alignItems: "center", justifyContent: "center",
  },
  userMid: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: "rgba(59,130,246,0.28)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "rgba(255,255,255,0.88)",
  },
  userCore: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: "#3b82f6" },

  // Teardrop ambulance pin
  pinCircle: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2.5, borderColor: "#fff",
    shadowColor: "#000", shadowOpacity: 0.30, shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 }, elevation: 6,
  },
  pinEmoji: { fontSize: 19, lineHeight: 21 },
  pinTail: {
    width: 0, height: 0,
    borderLeftWidth: 7, borderRightWidth: 7, borderTopWidth: 12,
    borderLeftColor: "transparent", borderRightColor: "transparent",
    marginTop: -1,
  },
});

// ─── Screen styles ────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },

  // ══ HEADER ══════════════════════════════════════════════════════════════════
  header: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.bg,
    paddingTop: Platform.OS === "ios" ? 52 : 38,
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
    shadowColor: "#000",
    shadowOpacity: 0.06, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    zIndex: 10,
  },
  menuBtn: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: COLORS.bg3,
    alignItems: "center", justifyContent: "center",
  },
  menuIcon: { fontSize: 22, color: COLORS.text, lineHeight: 24 },

  brand: { flex: 1 },
  brandTxt: {
    fontSize: 24, fontWeight: "900",
    letterSpacing: -0.6, lineHeight: 28,
  },
  locationRow: { flexDirection: "row", alignItems: "center", marginTop: 1 },
  locPin: { fontSize: 10, marginRight: 2 },
  locationLbl: {
    color: COLORS.gray, fontSize: 12, fontWeight: "500",
    flexShrink: 1,
  },
  chevron: { color: COLORS.red, fontSize: 13, fontWeight: "700" },

  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  bellWrap: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: COLORS.bg3,
    alignItems: "center", justifyContent: "center",
  },
  bellEmoji: { fontSize: 17 },
  bellBadge: {
    position: "absolute", top: 5, right: 5,
    width: 9, height: 9, borderRadius: 4.5,
    backgroundColor: COLORS.red,
    borderWidth: 1.5, borderColor: COLORS.bg,
  },
  sosBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: COLORS.red,
    borderRadius: 100, paddingHorizontal: 15, paddingVertical: 9,
    shadowColor: COLORS.red,
    shadowOpacity: 0.45, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 7,
  },
  sosEmoji: { fontSize: 13 },
  sosTxt: { color: "#fff", fontSize: 13, fontWeight: "800", letterSpacing: 0.8 },

  // ══ MAP ═════════════════════════════════════════════════════════════════════
  mapWrap: {
    height: MAP_H,
    backgroundColor: "#e5e8ec",
    overflow: "hidden",
  },

  // Nearest Ambulance card — bottom-left, above the overlap zone
  nearestCard: {
    position: "absolute",
    bottom: OVERLAP + 10,   // 26 px from map bottom
    left: 12,
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 12, paddingVertical: 10,
    shadowColor: "#000",
    shadowOpacity: 0.18, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 6,
  },
  nearestLbl: {
    color: "#6b7280", fontSize: 9, fontWeight: "700",
    letterSpacing: 0.6, textTransform: "uppercase",
    marginBottom: 4,
  },
  nearestRow: {
    flexDirection: "row", alignItems: "center",
    gap: 5, marginBottom: 6,
  },
  nearestTime: { color: "#22c55e", fontSize: 15, fontWeight: "800" },
  nearestDot:  {
    width: 7, height: 7, borderRadius: 3.5,
    backgroundColor: "#22c55e",
  },
  nearestPill: {
    alignSelf: "flex-start",
    backgroundColor: "#f3f4f6",
    borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3,
  },
  nearestPillTxt: { color: "#374151", fontSize: 10.5, fontWeight: "700" },

  // Live Tracking button — bottom-right, same vertical level as nearestCard
  liveBtn: {
    position: "absolute",
    bottom: OVERLAP + 10,
    right: 12,
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingHorizontal: 13, paddingVertical: 8,
    shadowColor: "#000",
    shadowOpacity: 0.14, shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 }, elevation: 4,
    borderWidth: 0.5, borderColor: COLORS.border,
  },
  liveIco: { fontSize: 13 },
  liveTxt: { color: "#111827", fontSize: 12, fontWeight: "700" },

  // ══ SCROLL ══════════════════════════════════════════════════════════════════
  scroll: { flex: 1, backgroundColor: COLORS.bg },
  scrollContent: { paddingBottom: 36 },

  // ══ MAIN BOOKING SEARCH BAR ═════════════════════════════════════════════════
  searchBarWrap: {
    flexDirection: "row", alignItems: "center", gap: 12,
    marginHorizontal: 16,
    marginTop: -OVERLAP,        // slides OVERLAP px up over the map bottom
    marginBottom: 20,
    backgroundColor: COLORS.bg,
    borderRadius: 18,
    paddingHorizontal: 16, paddingVertical: 16,
    shadowColor: "#000",
    shadowOpacity: 0.11, shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
    borderWidth: 0.5, borderColor: COLORS.border,
  },
  searchBarIcoWrap: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: "#fff0f1",
    alignItems: "center", justifyContent: "center",
  },
  searchBarIco: { fontSize: 17 },
  searchBarTxt: { flex: 1, color: COLORS.gray, fontSize: 14, fontWeight: "600" },
  searchBarArrow: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: COLORS.red,
    alignItems: "center", justifyContent: "center",
  },
  searchBarArrowTxt: { color: "#fff", fontSize: 15, fontWeight: "800" },

  // ══ SERVICES SECTION ════════════════════════════════════════════════════════
  svcSection: { paddingHorizontal: SIDE_PAD },
  disclaimer: {
    color: COLORS.grayDim, fontSize: 11, lineHeight: 16,
    textAlign: "center", marginTop: 18, marginBottom: 6,
  },
  svcHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginBottom: 12,
  },
  svcTitle: { color: COLORS.text, fontSize: 18, fontWeight: "800" },
  viewAll:  { color: COLORS.red,  fontSize: 13, fontWeight: "600" },

  grid:    { gap: CARD_GAP },
  gridRow: { flexDirection: "row", gap: CARD_GAP },

  // ── Service card ─────────────────────────────────────────────────────────────
  svcCard: {
    flex: 1,
    height: CARD_H,
    borderRadius: 16,
    padding: 9,
    overflow: "hidden",        // clips the cardGloss circle
    shadowColor: "#000",
    shadowOpacity: 0.13,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },

  // Gradient shimmer — large circle positioned to bleed from top-right corner
  cardGloss: {
    position: "absolute",
    top: -24, right: -24,
    width: 80, height: 80,
    borderRadius: 40,
  },

  // "🔥 Popular" badge
  popularBadge: {
    position: "absolute", top: 8, right: 8,
    backgroundColor: "rgba(255,255,255,0.28)",
    borderRadius: 100, paddingHorizontal: 6, paddingVertical: 2.5,
    borderWidth: 0.8, borderColor: "rgba(255,255,255,0.55)",
  },
  popularTxt: { color: "#fff", fontSize: 9, fontWeight: "800" },

  // Icon area — expands to fill card top
  iconWrap: { flex: 1, justifyContent: "flex-start", paddingTop: 2 },
  svcEmoji: { fontSize: 28, lineHeight: 32 },

  // Label + subtitle
  svcName: { fontSize: 11, fontWeight: "700", lineHeight: 14 },
  nameWhite: { color: "#ffffff" },
  nameDark:  { color: "#78350f" },
  svcSub:    { fontSize: 9, marginTop: 1 },
  subWhite:  { color: "rgba(255,255,255,0.76)" },
  subDark:   { color: "#92400e" },

  // ── Promo banner ─────────────────────────────────────────────────────────────
  promoBanner: {
    marginTop: CARD_GAP,
    borderRadius: 16,
    backgroundColor: "#fff5f5",
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
    shadowColor: COLORS.red,
    shadowOpacity: 0.10, shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
    borderWidth: 1, borderColor: "rgba(232,25,44,0.12)",
  },

  promoGloss: {
    position: "absolute",
    top: -20, right: 52,
    width: 70, height: 70, borderRadius: 35,
    backgroundColor: "rgba(232,25,44,0.07)",
  },

  promoLeft: {
    flex: 1, padding: 14,
  },
  promoTagline: {
    color: COLORS.red,
    fontSize: 15, fontWeight: "900",
    letterSpacing: -0.2, lineHeight: 19,
  },
  promoBody: {
    color: COLORS.gray,
    fontSize: 12, lineHeight: 16, fontWeight: "500",
    marginTop: 4,
  },
  promoBtn: {
    alignSelf: "flex-start",
    marginTop: 10,
    borderWidth: 1.5, borderColor: COLORS.red,
    borderRadius: 100, paddingHorizontal: 12, paddingVertical: 5,
  },
  promoBtnTxt: { color: COLORS.red, fontSize: 11, fontWeight: "700" },

  promoRight: {
    width: 72,
    alignItems: "center", justifyContent: "center",
  },
  promoAmbEmoji: { fontSize: 40, lineHeight: 46 },
});

