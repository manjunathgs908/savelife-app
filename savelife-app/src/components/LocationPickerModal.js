import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, Platform, ActivityIndicator, Modal,
} from "react-native";
import * as Location from "expo-location";
import { COLORS } from "../theme";
import storage from "../utils/storage";

const PLACES_KEY = "AIzaSyB8wxgXxQxskgUZG868g_4Qdsezr07i9yA";

export const PICKUP_RECENT_KEY = "@savelife_pickup_recents";
export const DEST_RECENT_KEY   = "@savelife_dest_recents";
const FAV_HOME_KEY = "@savelife_fav_home";
const FAV_WORK_KEY = "@savelife_fav_work";

async function reverseGeocode(lat, lng) {
  try {
    const res  = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${PLACES_KEY}`
    );
    const data = await res.json();
    if (data.results?.length) return data.results[0].formatted_address;
  } catch {}
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
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

async function fetchNearbyHospitals(coord) {
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json` +
      `?location=${coord.latitude},${coord.longitude}` +
      `&radius=5000&type=hospital&key=${PLACES_KEY}&language=en&rankby=prominence`
    );
    const data = await res.json();
    if (data.results?.length) {
      return data.results.slice(0, 5).map(p => ({
        place_id: p.place_id,
        name:     p.name,
        vicinity: p.vicinity || "",
        coord: { latitude: p.geometry.location.lat, longitude: p.geometry.location.lng },
      }));
    }
  } catch {}
  return [];
}

/**
 * Shared bottom-sheet location picker — GPS auto-resolve, live Places
 * autocomplete, recents, favourites (Home/Work) and nearby-hospital search.
 * Used by both DestinationScreen.js (pickup edit + destination search) and
 * ScheduleScreen.js (pickup + drop fields).
 *
 * Each feature beyond search+recents is opt-in via props, since not every
 * call site wants all of them (e.g. pickup-edit doesn't need hospitals).
 */
export default function LocationPickerModal({
  visible,
  title = "Select Location",
  placeholder = "Search address or landmark…",
  recentsKey,
  showCurrentLocation = false,
  showFavourites = false,
  showHospitals = false,
  biasCoord,
  hospitalAnchorCoord,
  onSelect,
  onClose,
}) {
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState("idle"); // idle | loading | results | empty
  const [predictions, setPredictions] = useState([]);
  const debRef = useRef(null);

  const [gpsCoord,   setGpsCoord]   = useState(null);
  const [gpsLabel,   setGpsLabel]   = useState("Getting location…");
  const [gpsLoading, setGpsLoading] = useState(true);

  const [recents, setRecents] = useState([]);
  const [favourites, setFavourites] = useState({ home: null, work: null });
  const [settingFav, setSettingFav] = useState(null); // "home" | "work" | null

  const [hospitals,    setHospitals]    = useState([]);
  const [hospsLoading, setHospsLoading] = useState(false);

  const anchorCoord = hospitalAnchorCoord ?? biasCoord ?? gpsCoord;

  useEffect(() => {
    if (!visible) return;
    setQuery(""); setPredictions([]); setPhase("idle"); setSettingFav(null);

    if (recentsKey) loadRecents();
    if (showCurrentLocation) resolveGPS();
    if (showFavourites) loadFavourites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (!visible || !showHospitals || !anchorCoord) return;
    setHospsLoading(true);
    fetchNearbyHospitals(anchorCoord).then(setHospitals).finally(() => setHospsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, showHospitals, anchorCoord?.latitude, anchorCoord?.longitude]);

  async function loadRecents() {
    try {
      const raw = await storage.getItem(recentsKey);
      setRecents(raw ? JSON.parse(raw) : []);
    } catch {}
  }

  async function loadFavourites() {
    try {
      const [h, w] = await Promise.all([storage.getItem(FAV_HOME_KEY), storage.getItem(FAV_WORK_KEY)]);
      setFavourites({ home: h ? JSON.parse(h) : null, work: w ? JSON.parse(w) : null });
    } catch {}
  }

  async function resolveGPS() {
    setGpsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") { setGpsLabel("Location permission denied"); setGpsLoading(false); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coord = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      setGpsCoord(coord);
      setGpsLabel(await reverseGeocode(coord.latitude, coord.longitude));
    } catch {
      setGpsLabel("Unable to get location");
    } finally {
      setGpsLoading(false);
    }
  }

  function onChangeQuery(text) {
    setQuery(text);
    clearTimeout(debRef.current);
    if (text.length < 2) { setPredictions([]); setPhase("idle"); return; }
    setPhase("loading");
    debRef.current = setTimeout(async () => {
      try {
        const bias = biasCoord ? `&location=${biasCoord.latitude},${biasCoord.longitude}&radius=50000` : "";
        const res = await fetch(
          `https://maps.googleapis.com/maps/api/place/autocomplete/json` +
          `?input=${encodeURIComponent(text)}&key=${PLACES_KEY}&language=en&components=country:in${bias}`
        );
        const data = await res.json();
        const preds = data.predictions || [];
        setPredictions(preds);
        setPhase(preds.length ? "results" : "empty");
      } catch { setPhase("empty"); }
    }, 350);
  }

  async function pushToRecents(item) {
    if (!recentsKey) return;
    try {
      const raw = await storage.getItem(recentsKey);
      const arr = raw ? JSON.parse(raw) : [];
      const next = [item, ...arr.filter(r => r.place_id !== item.place_id)].slice(0, 6);
      await storage.setItem(recentsKey, JSON.stringify(next));
    } catch {}
  }

  function finalizeSelection(coord, label) {
    if (settingFav) {
      const key = settingFav === "home" ? FAV_HOME_KEY : FAV_WORK_KEY;
      const value = { coord, label };
      storage.setItem(key, JSON.stringify(value)).catch(() => {});
      setFavourites(prev => ({ ...prev, [settingFav]: value }));
      setSettingFav(null);
    }
    onSelect({ coord, label });
  }

  async function handleSelectPrediction(pred) {
    try {
      const result = await fetchPlaceDetails(pred.place_id, pred.description);
      await pushToRecents({ place_id: pred.place_id, label: result.label, coord: result.coord });
      finalizeSelection(result.coord, result.label);
    } catch {}
  }

  function handleSelectRecent(r) {
    if (r.coord) finalizeSelection(r.coord, r.label);
  }

  async function handleSelectHospital(h) {
    await pushToRecents({ place_id: h.place_id, label: h.name, coord: h.coord });
    finalizeSelection(h.coord, `${h.name}${h.vicinity ? ", " + h.vicinity : ""}`);
  }

  function handleFavouriteTap(key) {
    const fav = favourites[key];
    if (fav) finalizeSelection(fav.coord, fav.label);
    else setSettingFav(key);
  }

  const idleListData = useMemo(() => {
    const rows = [];
    if (showCurrentLocation) rows.push({ id: "__cur", type: "current" });
    if (showFavourites) {
      rows.push({ id: "__fav_hdr", type: "hdr", title: "⭐ Favourites" });
      rows.push({ id: "__fav_home", type: "favourite", key: "home", icon: "🏠", label: "Home", data: favourites.home });
      rows.push({ id: "__fav_work", type: "favourite", key: "work", icon: "💼", label: "Work", data: favourites.work });
    }
    if (recents.length > 0) {
      rows.push({ id: "__rec_hdr", type: "hdr", title: "🕐 Recent Locations" });
      recents.forEach((r, i) => rows.push({ id: `rec_${i}`, type: "recent", data: r }));
    }
    if (showHospitals) {
      rows.push({ id: "__hosp_hdr", type: "hdr", title: "🏥 Nearby Hospitals" });
      if (hospsLoading) rows.push({ id: "__hosp_loading", type: "hosp_loading" });
      else if (hospitals.length === 0) rows.push({ id: "__hosp_none", type: "hosp_empty" });
      else hospitals.forEach(h => rows.push({ id: `hosp_${h.place_id}`, type: "hospital", data: h }));
    }
    return rows;
  }, [showCurrentLocation, showFavourites, favourites, recents, showHospitals, hospitals, hospsLoading]);

  function renderIdleItem({ item }) {
    switch (item.type) {
      case "hdr":
        return <Text style={s.sectionHdr}>{item.title}</Text>;
      case "current":
        return (
          <TouchableOpacity
            style={s.row}
            onPress={() => gpsCoord && finalizeSelection(gpsCoord, gpsLabel)}
            disabled={!gpsCoord}
            activeOpacity={0.7}
          >
            <View style={[s.rowIco, s.icoBlue]}>
              {gpsLoading ? <ActivityIndicator size="small" color="#3b82f6" /> : <Text style={{ fontSize: 16 }}>📍</Text>}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.rowMain, { color: "#3b82f6" }]}>Use Current Location</Text>
              <Text style={s.rowSub} numberOfLines={1}>{gpsLabel}</Text>
            </View>
          </TouchableOpacity>
        );
      case "favourite":
        return (
          <TouchableOpacity style={s.row} onPress={() => handleFavouriteTap(item.key)} activeOpacity={0.7}>
            <View style={[s.rowIco, s.icoYellow]}><Text style={{ fontSize: 16 }}>{item.icon}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowMain}>{item.label}</Text>
              <Text style={s.rowSub} numberOfLines={1}>
                {item.data ? item.data.label : "Tap to set"}
              </Text>
            </View>
          </TouchableOpacity>
        );
      case "recent":
        return (
          <TouchableOpacity style={s.row} onPress={() => handleSelectRecent(item.data)} activeOpacity={0.7}>
            <View style={[s.rowIco, s.icoGray]}><Text style={{ fontSize: 14 }}>🕐</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowMain} numberOfLines={1}>{item.data.label}</Text>
              {item.data.sublabel ? <Text style={s.rowSub} numberOfLines={1}>{item.data.sublabel}</Text> : null}
            </View>
          </TouchableOpacity>
        );
      case "hospital":
        return (
          <TouchableOpacity style={s.row} onPress={() => handleSelectHospital(item.data)} activeOpacity={0.7}>
            <View style={[s.rowIco, s.icoRed]}><Text style={{ fontSize: 14 }}>🏥</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowMain} numberOfLines={1}>{item.data.name}</Text>
              <Text style={s.rowSub} numberOfLines={1}>{item.data.vicinity}</Text>
            </View>
          </TouchableOpacity>
        );
      case "hosp_loading":
        return (
          <View style={s.inlineLoad}>
            <ActivityIndicator size="small" color={COLORS.red} />
            <Text style={s.inlineLoadTxt}>Finding nearby hospitals…</Text>
          </View>
        );
      case "hosp_empty":
        return <Text style={s.rowEmpty}>No hospitals found nearby</Text>;
      default:
        return null;
    }
  }

  function renderPredictionItem({ item }) {
    return (
      <TouchableOpacity style={s.row} onPress={() => handleSelectPrediction(item)} activeOpacity={0.7}>
        <View style={[s.rowIco, s.icoGray]}><Text style={{ fontSize: 14 }}>📍</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={s.rowMain} numberOfLines={1}>
            {item.structured_formatting?.main_text || item.description}
          </Text>
          {item.structured_formatting?.secondary_text ? (
            <Text style={s.rowSub} numberOfLines={1}>{item.structured_formatting.secondary_text}</Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose} />
      <View style={s.kvWrap} pointerEvents="box-none">
        <View style={s.sheet}>
          <View style={s.handle} />
          <View style={s.headerRow}>
            <TouchableOpacity style={s.backBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={s.backArrow}>←</Text>
            </TouchableOpacity>
            <Text style={s.title}>
              {settingFav ? `Set ${settingFav === "home" ? "Home" : "Work"} Location` : title}
            </Text>
          </View>
          <View style={s.inputRow}>
            <Text style={s.searchIco}>🔍</Text>
            <TextInput
              style={s.input}
              placeholder={placeholder}
              placeholderTextColor={COLORS.grayDim}
              value={query}
              onChangeText={onChangeQuery}
              autoFocus
              autoCorrect={false}
            />
            {phase === "loading" && <ActivityIndicator size="small" color={COLORS.red} />}
          </View>
          {phase === "empty" ? (
            <Text style={s.rowEmpty}>No results found</Text>
          ) : phase === "results" ? (
            <FlatList
              data={predictions}
              keyExtractor={item => item.place_id}
              keyboardShouldPersistTaps="handled"
              renderItem={renderPredictionItem}
              style={{ maxHeight: 360 }}
            />
          ) : (
            <FlatList
              data={idleListData}
              keyExtractor={item => item.id}
              keyboardShouldPersistTaps="handled"
              renderItem={renderIdleItem}
              style={{ maxHeight: 360 }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  kvWrap: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingTop: 10, paddingHorizontal: 16,
    paddingBottom: Platform.OS === "ios" ? 42 : 24,
    maxHeight: "85%",
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: COLORS.border, alignSelf: "center", marginBottom: 12,
  },
  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: COLORS.bg3, alignItems: "center", justifyContent: "center",
    marginRight: 10,
  },
  backArrow: { fontSize: 20, color: COLORS.text, lineHeight: 22 },
  title: { fontSize: 17, fontWeight: "700", color: COLORS.text },
  inputRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: COLORS.bg2, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1.5, borderColor: COLORS.border,
    marginBottom: 10,
  },
  input: { flex: 1, fontSize: 15, color: COLORS.text },
  searchIco: { fontSize: 16, marginRight: 8, opacity: 0.5 },

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
  icoBlue:   { backgroundColor: "#eff6ff" },
  icoGray:   { backgroundColor: COLORS.bg3 },
  icoRed:    { backgroundColor: "#fee2e2" },
  icoYellow: { backgroundColor: "#fef9c3" },
  rowMain:  { fontSize: 14, fontWeight: "600", color: COLORS.text },
  rowSub:   { fontSize: 12, color: COLORS.grayDim, marginTop: 2 },
  rowEmpty: { fontSize: 12, color: COLORS.grayDim, paddingVertical: 10, paddingLeft: 4 },

  inlineLoad:    { flexDirection: "row", alignItems: "center", paddingVertical: 14 },
  inlineLoadTxt: { fontSize: 13, color: COLORS.grayDim, marginLeft: 10 },
});
