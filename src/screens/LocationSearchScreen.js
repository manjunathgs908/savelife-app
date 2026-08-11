import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View, Text, TouchableOpacity, TextInput, FlatList,
  StyleSheet, Platform, ActivityIndicator, Modal,
} from "react-native";
import * as Location from "expo-location";
import { ensureLocationPermission } from "../utils/locationPermission";
import * as Contacts from "expo-contacts";
import { COLORS } from "../theme";
import storage from "../utils/storage";

const PLACES_KEY = "AIzaSyB8wxgXxQxskgUZG868g_4Qdsezr07i9yA";

const PICKUP_RECENT_KEY = "@savelife_pickup_recents";
const DROP_RECENT_KEY   = "@savelife_drop_recents";

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

// ─── Native system contact picker — no broad contacts permission needed ──────
async function pickContact() {
  try {
    const contact = await Contacts.presentContactPickerAsync();
    if (!contact) return null;
    return {
      name:  contact.name || "Contact",
      phone: contact.phoneNumbers?.[0]?.number ?? null,
    };
  } catch {
    return null;
  }
}

// ─── "Who should the driver contact?" — mandatory, shown only when the user
//     changes Pickup away from their auto-detected GPS location ─────────────
function ContactSheet({ visible, onContinue }) {
  const [selection, setSelection] = useState({ type: "myself", name: null, phone: null });

  useEffect(() => {
    if (visible) setSelection({ type: "myself", name: null, phone: null });
  }, [visible]);

  async function handleChooseContact() {
    const picked = await pickContact();
    if (picked) setSelection({ type: "contact", name: picked.name, phone: picked.phone });
  }

  const isContact = selection.type === "contact";

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={() => {}}>
      <View style={cst.overlay} />
      <View style={cst.kvWrap} pointerEvents="box-none">
        <View style={cst.sheet}>
          <View style={cst.handle} />
          <Text style={cst.title}>Who should the driver contact?</Text>
          <Text style={cst.subtitle}>
            You changed the pickup location — let us know who to reach there
          </Text>

          <TouchableOpacity
            style={[cst.option, !isContact && cst.optionActive]}
            onPress={() => setSelection({ type: "myself", name: null, phone: null })}
            activeOpacity={0.75}
          >
            <View style={[cst.optionIco, !isContact && cst.optionIcoActive]}>
              <Text style={{ fontSize: 20 }}>🧍</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[cst.optionLabel, !isContact && cst.optionLabelActive]}>Myself</Text>
              <Text style={cst.optionSub}>Driver will contact you</Text>
            </View>
            <View style={[cst.radio, !isContact && cst.radioActive]}>
              {!isContact && <View style={cst.radioDot} />}
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[cst.option, isContact && cst.optionActive]}
            onPress={handleChooseContact}
            activeOpacity={0.75}
          >
            <View style={[cst.optionIco, isContact && cst.optionIcoActive]}>
              <Text style={{ fontSize: 20 }}>👥</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[cst.optionLabel, isContact && cst.optionLabelActive]}>
                Choose Another Contact
              </Text>
              <Text style={cst.optionSub} numberOfLines={1}>
                {isContact
                  ? `${selection.name}${selection.phone ? " · " + selection.phone : ""}`
                  : "Pick someone from your contacts"}
              </Text>
            </View>
            <View style={[cst.radio, isContact && cst.radioActive]}>
              {isContact && <View style={cst.radioDot} />}
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={cst.continueBtn} onPress={() => onContinue(selection)} activeOpacity={0.85}>
            <Text style={cst.continueTxt}>Continue</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Ola-style searchable location list — shared by Pickup and Drop steps ─────
export default function LocationSearchScreen({ navigation, route }) {
  const { mode, patientType, contactName, contactPhone } = route.params;
  const isPickup = mode === "pickup";
  const recentKey = isPickup ? PICKUP_RECENT_KEY : DROP_RECENT_KEY;
  const title = isPickup ? "Pickup Location" : "Drop Location";

  // Pickup mode seeds from the GPS already detected on Home; drop mode anchors
  // nearby-hospital search around the pickup point just chosen.
  const seedCoord = isPickup ? route.params.gpsCoord : route.params.pickupCoord;
  const seedLabel = isPickup ? route.params.gpsLabel : null;

  const [query,       setQuery]       = useState("");
  // phase: "idle" | "loading" | "results" | "empty"
  const [phase,       setPhase]       = useState("idle");
  const [predictions, setPredictions] = useState([]);

  const [gpsCoord,   setGpsCoord]   = useState(isPickup ? (seedCoord ?? null) : null);
  const [gpsLabel,   setGpsLabel]   = useState(isPickup ? (seedLabel || "Getting location…") : "");
  const [gpsLoading, setGpsLoading] = useState(false);

  const [hospitals,    setHospitals]    = useState([]);
  const [hospsLoading, setHospsLoading] = useState(false);
  const [recents,      setRecents]      = useState([]);

  // Shown only in pickup mode, only when the chosen pickup differs from GPS
  const [contactSheetVisible, setContactSheetVisible] = useState(false);
  const [pendingPickup,       setPendingPickup]       = useState(null);

  const debRef = useRef(null);
  const anchorCoord = isPickup ? gpsCoord : seedCoord;

  useEffect(() => {
    loadRecents();
    if (isPickup) {
      resolveGPS();
    } else if (seedCoord) {
      setHospsLoading(true);
      fetchNearbyHospitals(seedCoord);
    }
  }, []);

  async function loadRecents() {
    try {
      const raw = await storage.getItem(recentKey);
      setRecents(raw ? JSON.parse(raw) : []);
    } catch {}
  }

  async function resolveGPS() {
    if (seedCoord) {
      setHospsLoading(true);
      fetchNearbyHospitals(seedCoord);
      if (!seedLabel) {
        reverseGeocode(seedCoord.latitude, seedCoord.longitude).then(setGpsLabel).catch(() => {});
      }
    } else {
      setGpsLoading(true);
    }

    try {
      const granted = await ensureLocationPermission();
      if (!granted) {
        if (!seedCoord) setGpsLabel("Location permission denied");
        setGpsLoading(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coord = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      setGpsCoord(coord);
      const label = await reverseGeocode(coord.latitude, coord.longitude);
      setGpsLabel(label);
      if (!seedCoord) { setHospsLoading(true); fetchNearbyHospitals(coord); }
    } catch {
      try {
        const last = await Location.getLastKnownPositionAsync();
        if (last) {
          const coord = { latitude: last.coords.latitude, longitude: last.coords.longitude };
          setGpsCoord(coord);
          const label = await reverseGeocode(coord.latitude, coord.longitude);
          setGpsLabel(label);
          if (!seedCoord) { setHospsLoading(true); fetchNearbyHospitals(coord); }
        } else if (!seedCoord) {
          setGpsLabel("Unable to get location");
        }
      } catch {
        if (!seedCoord) setGpsLabel("Unable to get location");
      }
    } finally {
      setGpsLoading(false);
    }
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
      const raw  = await storage.getItem(recentKey);
      const arr  = raw ? JSON.parse(raw) : [];
      const next = [item, ...arr.filter(r => r.place_id !== item.place_id)].slice(0, 6);
      await storage.setItem(recentKey, JSON.stringify(next));
    } catch {}
  }

  // ── Confirming a location moves to the next step of the flow ─────────────
  // contactInfo is only meaningful in pickup mode — { type, name, phone }
  function proceed(coord, label, contactInfo) {
    if (isPickup) {
      navigation.navigate("LocationSearch", {
        mode: "drop",
        pickupCoord: coord,
        pickupLabel: label,
        patientType:  contactInfo?.type ?? "myself",
        contactName:  contactInfo?.name ?? null,
        contactPhone: contactInfo?.phone ?? null,
      });
    } else {
      navigation.navigate("AmbulanceList", {
        pickupCoord: route.params.pickupCoord,
        pickupLabel: route.params.pickupLabel,
        dropCoord:   coord,
        dropLabel:   label,
        patientType,
        contactName,
        contactPhone,
      });
    }
  }

  // Picking the auto-detected GPS location is NOT "changing" pickup —
  // proceed straight through as "Myself", no contact sheet.
  function handleSelectCurrentLocation() {
    if (!gpsCoord) return;
    proceed(gpsCoord, gpsLabel, { type: "myself", name: null, phone: null });
  }

  // Any other pickup selection IS a change away from GPS — ask who to contact.
  function requestPickupConfirmation(coord, label) {
    if (isPickup) {
      setPendingPickup({ coord, label });
      setContactSheetVisible(true);
    } else {
      proceed(coord, label);
    }
  }

  function handleContactContinue(selection) {
    setContactSheetVisible(false);
    if (pendingPickup) {
      proceed(pendingPickup.coord, pendingPickup.label, selection);
      setPendingPickup(null);
    }
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
      requestPickupConfirmation(result.coord, result.label);
    } catch {}
  }

  async function handleSelectHospital(h) {
    await pushToRecents({ place_id: h.place_id, label: h.name, sublabel: h.vicinity, coord: h.coord });
    requestPickupConfirmation(h.coord, `${h.name}${h.vicinity ? ", " + h.vicinity : ""}`);
  }

  async function handleSelectRecent(r) {
    if (r.coord) {
      requestPickupConfirmation(r.coord, r.label);
    } else {
      try {
        const result = await fetchPlaceDetails(r.place_id, r.label);
        requestPickupConfirmation(result.coord, result.label);
      } catch {}
    }
  }

  // ── Flat list data ─────────────────────────────────────────────────────────
  const listData = useMemo(() => {
    if (phase === "results") {
      return predictions.map(p => ({ id: p.place_id, type: "prediction", data: p }));
    }

    const rows = [];

    if (isPickup) {
      rows.push({ id: "__cur_hdr", type: "section_header", title: "📍 Current Location" });
      rows.push({ id: "__cur", type: "current_location" });
    }

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
  }, [phase, predictions, hospitals, hospsLoading, recents, isPickup]);

  function renderItem({ item }) {
    switch (item.type) {

      case "section_header":
        return <Text style={s.sectionHdr}>{item.title}</Text>;

      case "current_location":
        return (
          <TouchableOpacity
            style={s.row}
            onPress={handleSelectCurrentLocation}
            activeOpacity={gpsCoord ? 0.7 : 1}
            disabled={!gpsCoord && !gpsLoading}
          >
            <View style={[s.rowIco, s.icoBlue]}>
              {gpsLoading
                ? <ActivityIndicator size="small" color="#3b82f6" />
                : <Text style={{ fontSize: 16 }}>📍</Text>
              }
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.rowMain, { color: "#3b82f6" }]}>Use Current Location</Text>
              <Text style={s.rowSub} numberOfLines={1}>{gpsLabel}</Text>
            </View>
            {!!gpsCoord && <Text style={s.rowArrow}>›</Text>}
          </TouchableOpacity>
        );

      case "recent":
        return (
          <TouchableOpacity style={s.row} onPress={() => handleSelectRecent(item.data)} activeOpacity={0.7}>
            <View style={[s.rowIco, s.icoGray]}>
              <Text style={{ fontSize: 14 }}>🕐</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowMain} numberOfLines={1}>{item.data.label}</Text>
              {item.data.sublabel ? (
                <Text style={s.rowSub} numberOfLines={1}>{item.data.sublabel}</Text>
              ) : null}
            </View>
          </TouchableOpacity>
        );

      case "hospital":
        return (
          <TouchableOpacity style={s.row} onPress={() => handleSelectHospital(item.data)} activeOpacity={0.7}>
            <View style={[s.rowIco, s.icoRed]}>
              <Text style={{ fontSize: 14 }}>🏥</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowMain} numberOfLines={1}>{item.data.name}</Text>
              <Text style={s.rowSub} numberOfLines={1}>{item.data.vicinity}</Text>
            </View>
          </TouchableOpacity>
        );

      case "prediction":
        return (
          <TouchableOpacity style={s.row} onPress={() => handleSelectPrediction(item.data)} activeOpacity={0.7}>
            <View style={[s.rowIco, s.icoGray]}>
              <Text style={{ fontSize: 14 }}>📍</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowMain} numberOfLines={1}>
                {item.data.structured_formatting?.main_text || item.data.description}
              </Text>
              {item.data.structured_formatting?.secondary_text ? (
                <Text style={s.rowSub} numberOfLines={1}>
                  {item.data.structured_formatting.secondary_text}
                </Text>
              ) : null}
            </View>
          </TouchableOpacity>
        );

      case "hospitals_loading":
        return (
          <View style={s.inlineLoad}>
            <ActivityIndicator size="small" color={COLORS.red} />
            <Text style={s.inlineLoadTxt}>Finding nearby hospitals…</Text>
          </View>
        );

      case "hospitals_empty":
        return <Text style={s.rowEmpty}>No hospitals found nearby</Text>;

      default:
        return null;
    }
  }

  return (
    <View style={s.root}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{title}</Text>
      </View>

      <View style={s.inputRow}>
        <Text style={s.searchIco}>🔍</Text>
        <TextInput
          style={s.input}
          placeholder={isPickup ? "Search hospital, area or address…" : "Search drop hospital or address…"}
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
            <Text style={s.clearBtn}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {phase === "empty" ? (
        <View style={s.emptyState}>
          <Text style={s.emptyIco}>🔍</Text>
          <Text style={s.emptyTitle}>No results found</Text>
          <Text style={s.emptySub}>Try a different name or address</Text>
        </View>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={item => item.id}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 24 }}
        />
      )}

      {isPickup && (
        <ContactSheet
          visible={contactSheetVisible}
          onContinue={handleContactContinue}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },

  header: {
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingTop: Platform.OS === "ios" ? 54 : 40,
    paddingHorizontal: 18, paddingBottom: 14,
    borderBottomWidth: 0.5, borderBottomColor: COLORS.border,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: COLORS.bg3,
    alignItems: "center", justifyContent: "center",
  },
  backArrow: { color: COLORS.text, fontSize: 20, fontWeight: "700" },
  headerTitle: { color: COLORS.text, fontSize: 17, fontWeight: "700" },

  inputRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: COLORS.bg2,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1.5, borderColor: COLORS.border,
    marginHorizontal: 18, marginTop: 14, marginBottom: 6,
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
  icoBlue: { backgroundColor: "#eff6ff" },
  icoGray: { backgroundColor: COLORS.bg3 },
  icoRed:  { backgroundColor: "#fee2e2" },

  rowMain:  { fontSize: 14, fontWeight: "600", color: COLORS.text },
  rowSub:   { fontSize: 12, color: COLORS.grayDim, marginTop: 2 },
  rowArrow: { fontSize: 20, color: COLORS.grayDim, marginLeft: 6 },
  rowEmpty: { fontSize: 12, color: COLORS.grayDim, paddingVertical: 10, paddingLeft: 4 },

  inlineLoad:    { flexDirection: "row", alignItems: "center", paddingVertical: 14 },
  inlineLoadTxt: { fontSize: 13, color: COLORS.grayDim, marginLeft: 10 },

  emptyState: { alignItems: "center", paddingVertical: 64 },
  emptyIco:   { fontSize: 36, marginBottom: 12 },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: COLORS.text, marginBottom: 6 },
  emptySub:   { fontSize: 13, color: COLORS.grayDim, textAlign: "center" },
});

// ─── "Who should the driver contact?" sheet styles ─────────────────────────────
const cst = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  kvWrap: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingHorizontal: 20, paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 40 : 24,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: COLORS.border, alignSelf: "center", marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: "800", color: COLORS.text, marginBottom: 4 },
  subtitle: { fontSize: 12.5, color: COLORS.grayDim, marginBottom: 18 },

  option: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1.5, borderColor: COLORS.border,
    borderRadius: 14, padding: 12, marginBottom: 10,
    backgroundColor: COLORS.bg2,
  },
  optionActive: { borderColor: COLORS.red, backgroundColor: "#fff0f1" },
  optionIco: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: COLORS.bg3, alignItems: "center", justifyContent: "center",
    marginRight: 12,
  },
  optionIcoActive: { backgroundColor: "#fee2e2" },
  optionLabel: { fontSize: 15, fontWeight: "700", color: COLORS.text },
  optionLabelActive: { color: COLORS.red },
  optionSub: { fontSize: 12, color: COLORS.grayDim, marginTop: 2 },

  radio: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: COLORS.border,
    alignItems: "center", justifyContent: "center",
  },
  radioActive: { borderColor: COLORS.red },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: COLORS.red },

  continueBtn: {
    alignItems: "center", justifyContent: "center",
    backgroundColor: COLORS.red, borderRadius: 14, paddingVertical: 16,
    marginTop: 8,
    shadowColor: COLORS.red, shadowOpacity: 0.35, shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  continueTxt: { fontSize: 15, fontWeight: "800", color: "#fff" },
});
