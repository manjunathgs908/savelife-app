import React, { useState, useEffect, useRef, useContext, useMemo } from "react";
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, Platform, ActivityIndicator, Dimensions,
  TextInput, FlatList, Modal, KeyboardAvoidingView,
} from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import * as Location from "expo-location";
import { COLORS } from "../theme";
import { AppContext } from "../../App";
import storage from "../utils/storage";

const { width: SCREEN_W } = Dimensions.get("window");
const PLACES_KEY = "AIzaSyB8wxgXxQxskgUZG868g_4Qdsezr07i9yA";

// ─── Layout constants ─────────────────────────────────────────────────────────
const CARD_GAP = 10;
const SIDE_PAD = 16;
const CARD_W   = (SCREEN_W - SIDE_PAD * 2 - CARD_GAP * 2) / 3;
const CARD_H   = Math.round(CARD_W * 1.28);   // ≈ 138 px on 375 pt screen

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

// ─── 10 service cards ─────────────────────────────────────────────────────────
// Grid layout:
//  Row 1 → Emergency · Schedule · Air Ambulance
//  Row 2 → Air Cargo · Freezer Box · Dead Body Transport
//  Row 3 → Event · Antim Yatra · Train
//  Row 4 → Standby (1 col) · Promo banner (2 cols)
const SERVICES = [
  { icon: "🚑", label: "Emergency\nAmbulance", subtitle: "Fastest Response",
    screen: "BookingFlow",    bg: "#e8192c", light: false, popular: true,
    gloss: "rgba(255,255,255,0.26)" },
  { icon: "📅", label: "Schedule\nAmbulance",  subtitle: "Book in Advance",
    screen: "Schedule",       bg: "#1a56db", light: false, popular: false,
    gloss: "rgba(255,255,255,0.22)" },
  { icon: "🚁", label: "Air Ambulance",         subtitle: "Quick & Safe",
    screen: "AirAmbulance",   bg: "#0d9488", light: false, popular: false,
    gloss: "rgba(255,255,255,0.22)" },
  { icon: "✈️", label: "Air Cargo",             subtitle: "Body Shifting",
    screen: "HomeCare",       bg: "#5b21b6", light: false, popular: false,
    gloss: "rgba(255,255,255,0.20)" },
  { icon: "❄️", label: "Freezer Box",           subtitle: "Safe & Hygienic",
    screen: "FreezerBox",     bg: "#6d28d9", light: false, popular: false,
    gloss: "rgba(255,255,255,0.20)" },
  { icon: "⚰️", label: "Dead Body\nTransport",  subtitle: "Dignified Service",
    screen: "Remains",        bg: "#ea580c", light: false, popular: false,
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
function ServiceCard({ svc, onPress, fixedWidth }) {
  return (
    <TouchableOpacity
      style={[
        styles.svcCard,
        { backgroundColor: svc.bg },
        fixedWidth && { flex: 0, width: CARD_W },
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

// ─── Promotional banner (spans 2 columns) ─────────────────────────────────────
function PromoCard() {
  return (
    <View style={styles.promoCard}>
      <View style={styles.promoGloss} />

      <View style={styles.promoLeft}>
        <Text style={styles.promoTagline}>Fast.{"\n"}Safe.{"\n"}Reliable.</Text>
        <Text style={styles.promoBody}>
          SaveLife is always there{"\n"}when you need us.
        </Text>
        <TouchableOpacity style={styles.promoBtn} activeOpacity={0.8}>
          <Text style={styles.promoBtnTxt}>Know More  →</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.promoRight}>
        <Text style={styles.promoAmbEmoji}>🚑</Text>
        <Text style={styles.promoBrandLbl}>SaveLife</Text>
      </View>
    </View>
  );
}

// ─── Drop-location bottom sheet — Ola-style "Where to?" search ───────────────
const DROP_RECENT_KEY = "@savelife_drop_recents";

function DropSearchSheet({ visible, anchorCoord, onClose, onSelect }) {
  const [query,       setQuery]       = useState("");
  // phase: "idle" | "loading" | "results" | "empty"
  const [phase,       setPhase]       = useState("idle");
  const [predictions, setPredictions] = useState([]);

  const [hospitals,    setHospitals]    = useState([]);
  const [hospsLoading, setHospsLoading] = useState(false);
  const [recents,      setRecents]      = useState([]);

  const debRef = useRef(null);

  useEffect(() => {
    if (!visible) return;
    setQuery(""); setPredictions([]); setPhase("idle");
    loadRecents();
    if (anchorCoord) { setHospsLoading(true); fetchNearbyHospitals(anchorCoord); }
  }, [visible]);

  async function loadRecents() {
    try {
      const raw = await storage.getItem(DROP_RECENT_KEY);
      setRecents(raw ? JSON.parse(raw) : []);
    } catch {}
  }

  async function fetchNearbyHospitals(coord) {
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/nearbysearch/json` +
        `?location=${coord.latitude},${coord.longitude}` +
        `&radius=5000&type=hospital&key=${PLACES_KEY}&language=en&rankby=prominence`
      );
      const data = await res.json();
      if (data.results?.length) {
        setHospitals(
          data.results.slice(0, 5).map(p => ({
            place_id: p.place_id,
            name:     p.name,
            vicinity: p.vicinity || "",
            coord: { latitude: p.geometry.location.lat, longitude: p.geometry.location.lng },
          }))
        );
      }
    } catch {}
    setHospsLoading(false);
  }

  function onChangeQuery(text) {
    setQuery(text);
    clearTimeout(debRef.current);
    if (text.length < 2) { setPredictions([]); setPhase("idle"); return; }
    setPhase("loading");
    debRef.current = setTimeout(async () => {
      try {
        const bias = anchorCoord
          ? `&location=${anchorCoord.latitude},${anchorCoord.longitude}&radius=50000`
          : "";
        const res = await fetch(
          `https://maps.googleapis.com/maps/api/place/autocomplete/json` +
          `?input=${encodeURIComponent(text)}&key=${PLACES_KEY}` +
          `&language=en&components=country:in${bias}`
        );
        const data  = await res.json();
        const preds = data.predictions || [];
        setPredictions(preds);
        setPhase(preds.length ? "results" : "empty");
      } catch {
        setPhase("empty");
      }
    }, 350);
  }

  async function fetchPlaceDetails(place_id, fallbackLabel) {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json` +
      `?place_id=${place_id}&fields=geometry,formatted_address&key=${PLACES_KEY}`
    );
    const data = await res.json();
    if (!data.result?.geometry) throw new Error("no geometry");
    return {
      coord: {
        latitude:  data.result.geometry.location.lat,
        longitude: data.result.geometry.location.lng,
      },
      label: data.result.formatted_address || fallbackLabel,
    };
  }

  async function pushToRecents(item) {
    try {
      const raw  = await storage.getItem(DROP_RECENT_KEY);
      const arr  = raw ? JSON.parse(raw) : [];
      const next = [item, ...arr.filter(r => r.place_id !== item.place_id)].slice(0, 6);
      await storage.setItem(DROP_RECENT_KEY, JSON.stringify(next));
    } catch {}
  }

  async function handleSelectPrediction(pred) {
    try {
      const result = await fetchPlaceDetails(pred.place_id, pred.description);
      await pushToRecents({
        place_id: pred.place_id,
        label:    result.label,
        sublabel: pred.structured_formatting?.secondary_text || "",
        coord:    result.coord,
      });
      onSelect(result);
    } catch {}
  }

  async function handleSelectHospital(h) {
    await pushToRecents({ place_id: h.place_id, label: h.name, sublabel: h.vicinity, coord: h.coord });
    onSelect({ coord: h.coord, label: `${h.name}${h.vicinity ? ", " + h.vicinity : ""}` });
  }

  async function handleSelectRecent(r) {
    if (r.coord) {
      onSelect({ coord: r.coord, label: r.label });
    } else {
      try {
        const result = await fetchPlaceDetails(r.place_id, r.label);
        onSelect(result);
      } catch {}
    }
  }

  const listData = useMemo(() => {
    if (phase === "results") {
      return predictions.map(p => ({ id: p.place_id, type: "prediction", data: p }));
    }
    const rows = [];
    if (recents.length > 0) {
      rows.push({ id: "__rec_hdr", type: "section_header", title: "🕐 Recent Searches" });
      recents.forEach((r, i) => rows.push({ id: `rec_${i}`, type: "recent", data: r }));
    }
    rows.push({ id: "__hosp_hdr", type: "section_header", title: "🏥 Nearby Hospitals" });
    if (hospsLoading) {
      rows.push({ id: "__hosp_loading", type: "hospitals_loading" });
    } else if (hospitals.length === 0) {
      rows.push({ id: "__hosp_none", type: "hospitals_empty" });
    } else {
      hospitals.forEach(h => rows.push({ id: `hosp_${h.place_id}`, type: "hospital", data: h }));
    }
    return rows;
  }, [phase, predictions, hospitals, hospsLoading, recents]);

  function renderItem({ item }) {
    switch (item.type) {

      case "section_header":
        return <Text style={dsh.sectionHdr}>{item.title}</Text>;

      case "recent":
        return (
          <TouchableOpacity style={dsh.row} onPress={() => handleSelectRecent(item.data)} activeOpacity={0.7}>
            <View style={[dsh.rowIco, dsh.icoGray]}>
              <Text style={{ fontSize: 14 }}>🕐</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={dsh.rowMain} numberOfLines={1}>{item.data.label}</Text>
              {item.data.sublabel ? (
                <Text style={dsh.rowSub} numberOfLines={1}>{item.data.sublabel}</Text>
              ) : null}
            </View>
          </TouchableOpacity>
        );

      case "hospital":
        return (
          <TouchableOpacity style={dsh.row} onPress={() => handleSelectHospital(item.data)} activeOpacity={0.7}>
            <View style={[dsh.rowIco, dsh.icoRed]}>
              <Text style={{ fontSize: 14 }}>🏥</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={dsh.rowMain} numberOfLines={1}>{item.data.name}</Text>
              <Text style={dsh.rowSub} numberOfLines={1}>{item.data.vicinity}</Text>
            </View>
          </TouchableOpacity>
        );

      case "prediction":
        return (
          <TouchableOpacity style={dsh.row} onPress={() => handleSelectPrediction(item.data)} activeOpacity={0.7}>
            <View style={[dsh.rowIco, dsh.icoGray]}>
              <Text style={{ fontSize: 14 }}>📍</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={dsh.rowMain} numberOfLines={1}>
                {item.data.structured_formatting?.main_text || item.data.description}
              </Text>
              {item.data.structured_formatting?.secondary_text ? (
                <Text style={dsh.rowSub} numberOfLines={1}>
                  {item.data.structured_formatting.secondary_text}
                </Text>
              ) : null}
            </View>
          </TouchableOpacity>
        );

      case "hospitals_loading":
        return (
          <View style={dsh.inlineLoad}>
            <ActivityIndicator size="small" color={COLORS.red} />
            <Text style={dsh.inlineLoadTxt}>Finding nearby hospitals…</Text>
          </View>
        );

      case "hospitals_empty":
        return <Text style={dsh.rowEmpty}>No hospitals found nearby</Text>;

      default:
        return null;
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <TouchableOpacity style={dsh.overlay} activeOpacity={1} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={dsh.kvWrap}
        pointerEvents="box-none"
      >
        <View style={dsh.sheet}>
          <View style={dsh.handle} />

          <View style={dsh.headerRow}>
            <TouchableOpacity style={dsh.backBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={dsh.backArrow}>←</Text>
            </TouchableOpacity>
            <Text style={dsh.sheetTitle}>Drop Location</Text>
          </View>

          <View style={dsh.inputRow}>
            <Text style={dsh.searchIco}>🔍</Text>
            <TextInput
              style={dsh.input}
              placeholder="Search hospital, area or address…"
              placeholderTextColor={COLORS.grayDim}
              value={query}
              onChangeText={onChangeQuery}
              autoFocus
              autoCorrect={false}
              returnKeyType="search"
            />
            {phase === "loading" && (
              <ActivityIndicator size="small" color={COLORS.red} style={{ marginHorizontal: 4 }} />
            )}
            {query.length > 0 && phase !== "loading" && (
              <TouchableOpacity onPress={() => { setQuery(""); setPredictions([]); setPhase("idle"); }}>
                <Text style={dsh.clearBtn}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {phase === "empty" ? (
            <View style={dsh.emptyState}>
              <Text style={dsh.emptyIco}>🔍</Text>
              <Text style={dsh.emptyTitle}>No results found</Text>
              <Text style={dsh.emptySub}>Try a different name or address</Text>
            </View>
          ) : (
            <FlatList
              data={listData}
              keyExtractor={item => item.id}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              renderItem={renderItem}
              contentContainerStyle={{ paddingBottom: 8 }}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function HomeScreen({ navigation }) {
  useContext(AppContext);

  const [userCoord,       setUserCoord]       = useState(null);
  const [userLabel,       setUserLabel]       = useState("Getting location…");
  const [locLoading,      setLocLoading]      = useState(true);
  const [ambulances,      setAmbulances]      = useState([]);

  // Ola-style "Where to?" drop selection — pickup is always the auto-detected GPS
  const [dropSheetVisible, setDropSheetVisible] = useState(false);
  const [dropCoord,        setDropCoord]        = useState(null);
  const [dropLabel,        setDropLabel]        = useState("");
  const [dist,             setDist]             = useState(null);
  const [duration,         setDuration]         = useState(null);
  const [routeLoading,     setRouteLoading]     = useState(false);

  const coordRef   = useRef(null);
  const mapRef     = useRef(null);
  const ambCreated = useRef(false);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
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

  // ── Route preview once both pickup (GPS) and drop are known ───────────────
  // Same Directions-API + Haversine-fallback approach used elsewhere in the app.
  useEffect(() => {
    if (!userCoord || !dropCoord) { setDist(null); setDuration(null); return; }

    function haversineFallback() {
      const R = 6371;
      const dLat = ((dropCoord.latitude  - userCoord.latitude)  * Math.PI) / 180;
      const dLng = ((dropCoord.longitude - userCoord.longitude) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((userCoord.latitude * Math.PI) / 180) *
        Math.cos((dropCoord.latitude * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
      const km = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      setDist(parseFloat(km.toFixed(1)));
      setDuration(Math.round((km / 30) * 3600)); // assume 30 km/h
    }

    setRouteLoading(true);
    (async () => {
      try {
        const url =
          `https://maps.googleapis.com/maps/api/directions/json` +
          `?origin=${userCoord.latitude},${userCoord.longitude}` +
          `&destination=${dropCoord.latitude},${dropCoord.longitude}` +
          `&key=${PLACES_KEY}`;
        const r = await fetch(url);
        const d = await r.json();
        if (d.routes?.length) {
          const leg = d.routes[0].legs[0];
          setDist(leg.distance.value / 1000);
          setDuration(leg.duration.value);
        } else {
          haversineFallback();
        }
      } catch {
        haversineFallback();
      } finally {
        setRouteLoading(false);
      }
    })();
  }, [userCoord, dropCoord]);

  // ── Booking flow entry point — tapping the search bar or the Emergency
  //    Ambulance card both open the inline drop-search sheet. Pickup is
  //    always the auto-detected GPS shown below the search bar.
  function openDropSheet() {
    setDropSheetVisible(true);
  }

  function handleDropSelect({ coord, label }) {
    setDropCoord(coord);
    setDropLabel(label);
    setDropSheetVisible(false);
  }

  function handleFindAmbulance() {
    navigation.navigate("AmbulanceList", {
      pickupCoord: userCoord,
      pickupLabel: userLabel,
      dropCoord,
      dropLabel,
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
          onPress={() => navigation.navigate("Tracking")}
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

        {/* ── "Where to?" search bar, or the route card once drop is set ───── */}
        {!dropCoord ? (
          <>
            <TouchableOpacity
              style={styles.searchBarWrap}
              onPress={openDropSheet}
              activeOpacity={0.85}
            >
              <View style={styles.searchBarIcoWrap}>
                <Text style={styles.searchBarIco}>🔍</Text>
              </View>
              <Text style={styles.searchBarTxt} numberOfLines={1}>
                Where should we send the ambulance?
              </Text>
              <View style={styles.searchBarArrow}>
                <Text style={styles.searchBarArrowTxt}>→</Text>
              </View>
            </TouchableOpacity>

            <Text style={styles.pickupHint} numberOfLines={1}>
              📍 Pickup: {locLoading ? "Getting your location…" : userLabel}
            </Text>
          </>
        ) : (
          <View style={styles.routeCardWrap}>
            <View style={styles.routeCard}>
              <View style={styles.routeEndpointRow}>
                <View style={styles.dotGreen} />
                <Text style={styles.routeAddr} numberOfLines={1}>{userLabel}</Text>
              </View>

              <View style={styles.routeDivider} />

              <View style={styles.routeEndpointRow}>
                <View style={styles.dotRed} />
                <Text style={styles.routeAddr} numberOfLines={1}>{dropLabel}</Text>
                <TouchableOpacity onPress={openDropSheet} activeOpacity={0.7}>
                  <Text style={styles.changeBtn}>Change</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.routeDistTxt}>
                {routeLoading
                  ? "Calculating route…"
                  : dist != null
                    ? `${dist.toFixed(1)} km · ~${Math.round(duration / 60)} min`
                    : ""}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.findAmbBtn}
              onPress={handleFindAmbulance}
              activeOpacity={0.85}
            >
              <Text style={styles.findAmbTxt}>Find Ambulance  →</Text>
            </TouchableOpacity>
          </View>
        )}

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
                    onPress={() => svc.screen === "BookingFlow"
                      ? openDropSheet()
                      : navigation.navigate(svc.screen)
                    }
                  />
                ))}
              </View>
            ))}

            {/* Row 4 : Standby (1 col) + Promo banner (fills remaining ≈ 2 cols) */}
            <View style={styles.gridRow}>
              <ServiceCard
                svc={SERVICES[9]}
                onPress={() => navigation.navigate(SERVICES[9].screen)}
                fixedWidth
              />
              <PromoCard />
            </View>
          </View>

        </View>
      </ScrollView>

      {/* Inline "Where to?" drop search — Ola style */}
      <DropSearchSheet
        visible={dropSheetVisible}
        anchorCoord={userCoord}
        onClose={() => setDropSheetVisible(false)}
        onSelect={handleDropSelect}
      />

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
    marginBottom: 8,
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
  pickupHint: {
    color: COLORS.grayDim, fontSize: 12, fontWeight: "500",
    marginHorizontal: 16, marginBottom: 20,
  },

  // ── Route card (shown once drop is selected) + Find Ambulance button ────────
  routeCardWrap: { marginHorizontal: 16, marginTop: -OVERLAP, marginBottom: 20 },
  routeCard: {
    backgroundColor: COLORS.bg,
    borderRadius: 18,
    paddingHorizontal: 16, paddingVertical: 14,
    shadowColor: "#000",
    shadowOpacity: 0.11, shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
    borderWidth: 0.5, borderColor: COLORS.border,
    marginBottom: 12,
  },
  routeEndpointRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 8,
  },
  dotGreen: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: "#22c55e", flexShrink: 0,
  },
  dotRed: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: COLORS.red, flexShrink: 0,
  },
  routeAddr: { flex: 1, color: COLORS.text, fontSize: 13, fontWeight: "600" },
  routeDivider: { height: 0.5, backgroundColor: COLORS.border, marginLeft: 4 },
  changeBtn: { color: COLORS.red, fontSize: 12, fontWeight: "700" },
  routeDistTxt: {
    color: COLORS.grayDim, fontSize: 11.5, fontWeight: "600",
    marginTop: 4, marginLeft: 20,
  },
  findAmbBtn: {
    backgroundColor: COLORS.red,
    borderRadius: 14, paddingVertical: 16,
    alignItems: "center",
    shadowColor: COLORS.red,
    shadowOpacity: 0.38, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  findAmbTxt: { color: "#fff", fontSize: 16, fontWeight: "800" },

  // ══ SERVICES SECTION ════════════════════════════════════════════════════════
  svcSection: { paddingHorizontal: SIDE_PAD },
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
    padding: 11,
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
  iconWrap: { flex: 1, justifyContent: "flex-start", paddingTop: 4 },
  svcEmoji: { fontSize: 38, lineHeight: 44 },

  // Label + subtitle
  svcName: { fontSize: 12, fontWeight: "700", lineHeight: 16 },
  nameWhite: { color: "#ffffff" },
  nameDark:  { color: "#78350f" },
  svcSub:    { fontSize: 10, marginTop: 2 },
  subWhite:  { color: "rgba(255,255,255,0.76)" },
  subDark:   { color: "#92400e" },

  // ── Promo banner ─────────────────────────────────────────────────────────────
  promoCard: {
    flex: 1,
    height: CARD_H,
    borderRadius: 16,
    backgroundColor: "#fff5f5",
    flexDirection: "row",
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
    flex: 1, padding: 11,
    justifyContent: "space-between",
  },
  promoTagline: {
    color: COLORS.red,
    fontSize: 12.5, fontWeight: "900",
    letterSpacing: -0.2, lineHeight: 16,
  },
  promoBody: {
    color: COLORS.gray,
    fontSize: 9, lineHeight: 13, fontWeight: "500",
  },
  promoBtn: {
    alignSelf: "flex-start",
    borderWidth: 1.5, borderColor: COLORS.red,
    borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3.5,
  },
  promoBtnTxt: { color: COLORS.red, fontSize: 9, fontWeight: "700" },

  promoRight: {
    width: 62,
    alignItems: "center", justifyContent: "flex-end",
    paddingBottom: 8, paddingRight: 4,
  },
  promoAmbEmoji: { fontSize: 38, lineHeight: 44 },
  promoBrandLbl: {
    color: COLORS.red, fontSize: 7.5, fontWeight: "800",
    letterSpacing: 0.3, marginTop: 2,
  },
});

// ─── Drop-search bottom-sheet styles ───────────────────────────────────────────
const dsh = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  kvWrap: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingTop: 10, paddingHorizontal: 16,
    paddingBottom: Platform.OS === "ios" ? 42 : 24,
    maxHeight: "88%",
    shadowColor: "#000",
    shadowOpacity: 0.18, shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 },
    elevation: 24,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: "center", marginBottom: 14,
  },

  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: COLORS.bg3,
    alignItems: "center", justifyContent: "center",
    marginRight: 10,
  },
  backArrow:  { fontSize: 20, color: COLORS.text, lineHeight: 22 },
  sheetTitle: { fontSize: 17, fontWeight: "700", color: COLORS.text },

  inputRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: COLORS.bg2,
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1.5, borderColor: COLORS.border,
    marginBottom: 6,
  },
  searchIco: { fontSize: 16, marginRight: 8, opacity: 0.5 },
  input:     { flex: 1, fontSize: 15, color: COLORS.text },
  clearBtn:  { fontSize: 14, color: COLORS.grayDim, paddingHorizontal: 4 },

  sectionHdr: {
    fontSize: 11, fontWeight: "700", color: COLORS.grayDim,
    textTransform: "uppercase", letterSpacing: 0.6,
    paddingTop: 16, paddingBottom: 4,
  },

  row: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 11,
    borderBottomWidth: 0.5, borderBottomColor: COLORS.border,
  },
  rowIco: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: COLORS.bg3,
    alignItems: "center", justifyContent: "center",
    marginRight: 12,
  },
  icoGray: { backgroundColor: COLORS.bg3 },
  icoRed:  { backgroundColor: "#fee2e2" },

  rowMain:  { fontSize: 14, fontWeight: "600", color: COLORS.text },
  rowSub:   { fontSize: 12, color: COLORS.grayDim, marginTop: 2 },
  rowEmpty: { fontSize: 12, color: COLORS.grayDim, paddingVertical: 10, paddingLeft: 4 },

  inlineLoad:    { flexDirection: "row", alignItems: "center", paddingVertical: 14 },
  inlineLoadTxt: { fontSize: 13, color: COLORS.grayDim, marginLeft: 10 },

  emptyState: { alignItems: "center", paddingVertical: 48 },
  emptyIco:   { fontSize: 36, marginBottom: 12 },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: COLORS.text, marginBottom: 6 },
  emptySub:   { fontSize: 13, color: COLORS.grayDim, textAlign: "center" },
});
