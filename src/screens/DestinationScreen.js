import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View, Text, TouchableOpacity, TextInput, FlatList,
  StyleSheet, Platform, ActivityIndicator, Modal,
} from "react-native";
import * as Location from "expo-location";
import * as Contacts from "expo-contacts";
import { COLORS } from "../theme";
import storage from "../utils/storage";
import {
  getRouteInfo,
  haversineDistanceKm,
  estimateRouteDurationSeconds,
} from "../utils/routeUtils";

const PLACES_KEY = "AIzaSyB8wxgXxQxskgUZG868g_4Qdsezr07i9yA";

const DEST_RECENT_KEY = "@savelife_dest_recents";
const PICKUP_RECENT_KEY = "@savelife_pickup_recents";
const FAV_HOME_KEY = "@savelife_fav_home";
const FAV_WORK_KEY = "@savelife_fav_work";

async function reverseGeocode(lat, lng) {
  try {
    // result_type biases Google toward the most precise (rooftop/street-level)
    // match first, so results[0] is the full address — building/house number,
    // street, sub-locality, locality — not a generic area name. The driver
    // needs this level of detail to find the exact pickup point.
    const res  = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${PLACES_KEY}`
    );
    const data = await res.json();
    if (data.results?.length) {
      return data.results[0].formatted_address;
    }
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

async function pickDeviceContact() {
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

function fmtDate(d) {
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}
function fmtTime(d) {
  const h = d.getHours(), m = d.getMinutes();
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

// ─── "Who needs this ambulance?" — patient details, shown before editing pickup
const PATIENT_OPTIONS = [
  { id: "myself",  icon: "🧍", label: "Myself",                sub: "The patient is at this location" },
  { id: "contact", icon: "👥", label: "Choose Another Contact", sub: "Someone else will be reached by the driver" },
];

function PatientDetailsSheet({ visible, onSkip, onContinue }) {
  const [selection, setSelection] = useState({ type: "myself", name: null, phone: null });

  useEffect(() => {
    if (visible) setSelection({ type: "myself", name: null, phone: null });
  }, [visible]);

  async function handleChooseContact() {
    const picked = await pickDeviceContact();
    if (picked) setSelection({ type: "contact", name: picked.name, phone: picked.phone });
  }

  const isContact = selection.type === "contact";

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onSkip}>
      <TouchableOpacity style={bsh.overlay} activeOpacity={1} onPress={onSkip} />
      <View style={bsh.kvWrap} pointerEvents="box-none">
        <View style={bsh.sheet}>
          <View style={bsh.handle} />
          <Text style={bsh.title}>Who needs this ambulance?</Text>
          <Text style={bsh.subtitle}>This helps the care team prepare before arrival</Text>

          {PATIENT_OPTIONS.map(opt => {
            const active = opt.id === "myself" ? !isContact : isContact;
            return (
              <TouchableOpacity
                key={opt.id}
                style={[bsh.option, active && bsh.optionActive]}
                onPress={opt.id === "myself"
                  ? () => setSelection({ type: "myself", name: null, phone: null })
                  : handleChooseContact}
                activeOpacity={0.75}
              >
                <View style={[bsh.optionIco, active && bsh.optionIcoActive]}>
                  <Text style={{ fontSize: 20 }}>{opt.icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[bsh.optionLabel, active && bsh.optionLabelActive]}>{opt.label}</Text>
                  <Text style={bsh.optionSub} numberOfLines={1}>
                    {opt.id === "contact" && isContact
                      ? `${selection.name}${selection.phone ? " · " + selection.phone : ""}`
                      : opt.sub}
                  </Text>
                </View>
                <View style={[bsh.radio, active && bsh.radioActive]}>
                  {active && <View style={bsh.radioDot} />}
                </View>
              </TouchableOpacity>
            );
          })}

          <View style={bsh.footerRow}>
            <TouchableOpacity style={bsh.skipBtn} onPress={onSkip} activeOpacity={0.7}>
              <Text style={bsh.skipTxt}>Skip</Text>
            </TouchableOpacity>
            <TouchableOpacity style={bsh.continueBtn} onPress={() => onContinue(selection)} activeOpacity={0.85}>
              <Text style={bsh.continueTxt}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Pickup-location editor — GPS + autocomplete + recents ───────────────────
function PickupEditSheet({ visible, anchorCoord, onClose, onSelect }) {
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState("idle");
  const [predictions, setPredictions] = useState([]);
  const [gpsCoord, setGpsCoord] = useState(null);
  const [gpsLabel, setGpsLabel] = useState("Getting location…");
  const [gpsLoading, setGpsLoading] = useState(true);
  const [recents, setRecents] = useState([]);
  const debRef = useRef(null);

  useEffect(() => {
    if (!visible) return;
    setQuery(""); setPredictions([]); setPhase("idle");
    loadRecents();
    resolveGPS();
  }, [visible]);

  async function loadRecents() {
    try {
      const raw = await storage.getItem(PICKUP_RECENT_KEY);
      setRecents(raw ? JSON.parse(raw) : []);
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
        const bias = anchorCoord ? `&location=${anchorCoord.latitude},${anchorCoord.longitude}&radius=50000` : "";
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
    try {
      const raw = await storage.getItem(PICKUP_RECENT_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      const next = [item, ...arr.filter(r => r.place_id !== item.place_id)].slice(0, 6);
      await storage.setItem(PICKUP_RECENT_KEY, JSON.stringify(next));
    } catch {}
  }

  async function handleSelectPrediction(pred) {
    try {
      const result = await fetchPlaceDetails(pred.place_id, pred.description);
      await pushToRecents({ place_id: pred.place_id, label: result.label, coord: result.coord });
      onSelect(result);
    } catch {}
  }

  async function handleSelectRecent(r) {
    if (r.coord) onSelect({ coord: r.coord, label: r.label });
  }

  const listData = useMemo(() => {
    if (phase === "results") return predictions.map(p => ({ id: p.place_id, type: "prediction", data: p }));
    const rows = [{ id: "__cur", type: "current" }];
    if (recents.length > 0) {
      rows.push({ id: "__rec_hdr", type: "hdr", title: "🕐 Recent Pickup Locations" });
      recents.forEach((r, i) => rows.push({ id: `rec_${i}`, type: "recent", data: r }));
    }
    return rows;
  }, [phase, predictions, recents]);

  function renderItem({ item }) {
    if (item.type === "hdr") return <Text style={s.sectionHdr}>{item.title}</Text>;
    if (item.type === "current") {
      return (
        <TouchableOpacity
          style={s.row}
          onPress={() => gpsCoord && onSelect({ coord: gpsCoord, label: gpsLabel })}
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
    }
    if (item.type === "recent") {
      return (
        <TouchableOpacity style={s.row} onPress={() => handleSelectRecent(item.data)} activeOpacity={0.7}>
          <View style={[s.rowIco, s.icoGray]}><Text style={{ fontSize: 14 }}>🕐</Text></View>
          <Text style={s.rowMain} numberOfLines={1}>{item.data.label}</Text>
        </TouchableOpacity>
      );
    }
    if (item.type === "prediction") {
      return (
        <TouchableOpacity style={s.row} onPress={() => handleSelectPrediction(item.data)} activeOpacity={0.7}>
          <View style={[s.rowIco, s.icoGray]}><Text style={{ fontSize: 14 }}>📍</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={s.rowMain} numberOfLines={1}>
              {item.data.structured_formatting?.main_text || item.data.description}
            </Text>
          </View>
        </TouchableOpacity>
      );
    }
    return null;
  }

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <TouchableOpacity style={bsh.overlay} activeOpacity={1} onPress={onClose} />
      <View style={bsh.kvWrap} pointerEvents="box-none">
        <View style={s.editSheet}>
          <View style={bsh.handle} />
          <View style={s.editHeaderRow}>
            <TouchableOpacity style={s.editBackBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={s.editBackArrow}>←</Text>
            </TouchableOpacity>
            <Text style={s.editTitle}>Edit Pickup Location</Text>
          </View>
          <View style={s.editInputRow}>
            <Text style={s.searchIco}>🔍</Text>
            <TextInput
              style={s.editInput}
              placeholder="Search address or landmark…"
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
          ) : (
            <FlatList
              data={listData}
              keyExtractor={item => item.id}
              keyboardShouldPersistTaps="handled"
              renderItem={renderItem}
              style={{ maxHeight: 320 }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── "When is this needed?" — Now vs Schedule Ambulance ───────────────────────
function ScheduleTypeSheet({ visible, onClose, onPickNow, onPickSchedule }) {
  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <TouchableOpacity style={bsh.overlay} activeOpacity={1} onPress={onClose} />
      <View style={bsh.kvWrap} pointerEvents="box-none">
        <View style={bsh.sheet}>
          <View style={bsh.handle} />
          <Text style={bsh.title}>When is this ambulance needed?</Text>
          <Text style={bsh.subtitle}>Choose now or schedule for later</Text>

          <TouchableOpacity style={bsh.row} onPress={onPickNow} activeOpacity={0.75}>
            <View style={[bsh.ico, { backgroundColor: "rgba(34,197,94,0.12)" }]}><Text style={{ fontSize: 18 }}>🟢</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={bsh.rowLabel}>Now</Text>
              <Text style={bsh.rowSub}>Dispatch an ambulance right away</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={bsh.row} onPress={onPickSchedule} activeOpacity={0.75}>
            <View style={[bsh.ico, { backgroundColor: "rgba(232,25,44,0.12)" }]}><Text style={{ fontSize: 18 }}>🕐</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={bsh.rowLabel}>Schedule Ambulance</Text>
              <Text style={bsh.rowSub}>Book for a later date & time</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function ScheduleDetailSheet({ visible, date, onClose, onPickDate, onPickTime, onConfirm }) {
  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <TouchableOpacity style={bsh.overlay} activeOpacity={1} onPress={onClose} />
      <View style={bsh.kvWrap} pointerEvents="box-none">
        <View style={bsh.sheet}>
          <View style={bsh.handle} />
          <Text style={bsh.title}>Schedule Ambulance</Text>
          <Text style={bsh.subtitle}>Choose a date and time for pickup</Text>

          <View style={bsh.chipRow}>
            <TouchableOpacity style={bsh.chip} onPress={onPickDate} activeOpacity={0.75}>
              <Text style={bsh.chipIco}>📅</Text>
              <Text style={bsh.chipTxt}>{fmtDate(date)}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={bsh.chip} onPress={onPickTime} activeOpacity={0.75}>
              <Text style={bsh.chipIco}>🕐</Text>
              <Text style={bsh.chipTxt}>{fmtTime(date)}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={bsh.continueBtn} onPress={onConfirm} activeOpacity={0.85}>
            <Text style={bsh.continueTxt}>Confirm Schedule</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Pure-JS date / time wheel picker ─────────────────────────────────────────
const DAYS_S = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONS_S = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const ITEM_H = 58;

function buildDateList() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return d;
  });
}

const TIME_SLOTS = (() => {
  const slots = [];
  for (let h = 6; h < 24; h++) for (let m = 0; m < 60; m += 30) slots.push({ h, m });
  return slots;
})();

function fmt12(h, m) {
  const ap = h < 12 ? "AM" : "PM";
  return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${ap}`;
}

function DateTimePickerModal({ visible, mode, value, onConfirm, onClose }) {
  const DATE_LIST = buildDateList();
  const [selDate, setSelDate] = useState(0);
  const [selTime, setSelTime] = useState(0);

  useEffect(() => {
    if (!visible) return;
    const v = new Date(value);
    v.setHours(0, 0, 0, 0);
    const di = DATE_LIST.findIndex(d => d.toDateString() === v.toDateString());
    setSelDate(di >= 0 ? di : 0);
    const ti = TIME_SLOTS.findIndex(t => t.h === value.getHours() && t.m === value.getMinutes());
    setSelTime(ti >= 0 ? ti : 0);
  }, [visible]);

  function confirm() {
    if (mode === "date") {
      const d = DATE_LIST[selDate];
      const next = new Date(value);
      next.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
      onConfirm(next);
    } else {
      const { h, m } = TIME_SLOTS[selTime];
      const next = new Date(value);
      next.setHours(h, m, 0, 0);
      onConfirm(next);
    }
  }

  const isDate = mode === "date";
  const data   = isDate ? DATE_LIST : TIME_SLOTS;
  const selIdx = isDate ? selDate : selTime;

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={pk.overlay}>
        <View style={pk.sheet}>
          <View style={pk.handle} />
          <View style={pk.header}>
            <Text style={pk.title}>{isDate ? "📅  Select Date" : "🕐  Select Time"}</Text>
            <TouchableOpacity style={pk.closeBtn} onPress={onClose}><Text style={pk.closeX}>✕</Text></TouchableOpacity>
          </View>
          <FlatList
            data={data}
            keyExtractor={(_, i) => String(i)}
            style={pk.list}
            showsVerticalScrollIndicator={false}
            initialScrollIndex={selIdx}
            getItemLayout={(_, i) => ({ length: ITEM_H, offset: ITEM_H * i, index: i })}
            renderItem={({ item, index }) => {
              const active = index === selIdx;
              let main, sub;
              if (isDate) {
                main = index === 0 ? "Today" : index === 1 ? "Tomorrow" : DAYS_S[item.getDay()];
                sub  = `${item.getDate()} ${MONS_S[item.getMonth()]}`;
              } else {
                main = fmt12(item.h, item.m);
                sub  = null;
              }
              return (
                <TouchableOpacity
                  style={[pk.row, active && pk.rowActive]}
                  onPress={() => isDate ? setSelDate(index) : setSelTime(index)}
                  activeOpacity={0.7}
                >
                  <View style={[pk.dot, active && pk.dotActive]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[pk.rowMain, active && pk.rowMainActive]}>{main}</Text>
                    {sub ? <Text style={[pk.rowSub, active && { color: COLORS.red }]}>{sub}</Text> : null}
                  </View>
                  {active && <Text style={pk.check}>✓</Text>}
                </TouchableOpacity>
              );
            }}
          />
          <View style={pk.footer}>
            <TouchableOpacity style={pk.confirmBtn} onPress={confirm} activeOpacity={0.85}>
              <Text style={pk.confirmTxt}>
                {isDate
                  ? `Confirm — ${selDate === 0 ? "Today" : selDate === 1 ? "Tomorrow" : `${DAYS_S[DATE_LIST[selDate]?.getDay()]}, ${DATE_LIST[selDate]?.getDate()} ${MONS_S[DATE_LIST[selDate]?.getMonth()]}`}`
                  : `Confirm — ${fmt12(TIME_SLOTS[selTime]?.h, TIME_SLOTS[selTime]?.m)}`}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function DestinationScreen({ navigation, route }) {
  const [pickupCoord, setPickupCoord] = useState(route?.params?.gpsCoord ?? null);
  const [pickupLabel, setPickupLabel] = useState(route?.params?.gpsLabel ?? "Finding your location…");
  const [gpsLoading,  setGpsLoading]  = useState(!route?.params?.gpsCoord);

  const [destCoord, setDestCoord] = useState(null);
  const [destLabel, setDestLabel] = useState("");

  const [query,       setQuery]       = useState("");
  const [phase,       setPhase]       = useState("idle"); // idle | loading | results | empty
  const [predictions, setPredictions] = useState([]);

  const [hospitals,    setHospitals]    = useState([]);
  const [hospsLoading, setHospsLoading] = useState(false);
  const [recents,      setRecents]      = useState([]);
  const [favourites,   setFavourites]   = useState({ home: null, work: null });
  const [settingFav,   setSettingFav]   = useState(null); // "home" | "work" | null

  const [patientSheetVisible, setPatientSheetVisible] = useState(false);
  const [pickupEditVisible,   setPickupEditVisible]   = useState(false);
  const [patientType,  setPatientType]  = useState(null);
  const [contactName,  setContactName]  = useState(null);
  const [contactPhone, setContactPhone] = useState(null);

  const [scheduleTypeVisible,   setScheduleTypeVisible]   = useState(false);
  const [scheduleDetailVisible, setScheduleDetailVisible] = useState(false);
  const [scheduleType, setScheduleType] = useState("now");
  const [scheduleDate, setScheduleDate] = useState(new Date());
  const [pickerMode,   setPickerMode]   = useState(null);

  const [dist, setDist]                 = useState(null);
  const [duration, setDuration]         = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);

  const debRef = useRef(null);

  // ── GPS resolution + full-address lookup for the Pickup field ─────────────
  useEffect(() => {
    loadFavourites();
    loadRecents();

    if (pickupCoord) {
      // Home already resolved a coordinate, but only with its own short
      // header-style label — re-resolve here to get the FULL address
      // (building/street/sub-locality) the driver actually needs.
      setGpsLoading(true);
      reverseGeocode(pickupCoord.latitude, pickupCoord.longitude)
        .then(setPickupLabel)
        .finally(() => setGpsLoading(false));
      setHospsLoading(true);
      fetchNearbyHospitals(pickupCoord).then(setHospitals).finally(() => setHospsLoading(false));
      return;
    }

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") { setPickupLabel("Location permission denied"); setGpsLoading(false); return; }
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const coord = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setPickupCoord(coord);
        setPickupLabel(await reverseGeocode(coord.latitude, coord.longitude));
        setHospsLoading(true);
        fetchNearbyHospitals(coord).then(setHospitals).finally(() => setHospsLoading(false));
      } catch {
        setPickupLabel("Unable to get location");
      } finally {
        setGpsLoading(false);
      }
    })();
  }, []);

  async function loadRecents() {
    try {
      const raw = await storage.getItem(DEST_RECENT_KEY);
      setRecents(raw ? JSON.parse(raw) : []);
    } catch {}
  }

  async function loadFavourites() {
    try {
      const [h, w] = await Promise.all([storage.getItem(FAV_HOME_KEY), storage.getItem(FAV_WORK_KEY)]);
      setFavourites({
        home: h ? JSON.parse(h) : null,
        work: w ? JSON.parse(w) : null,
      });
    } catch {}
  }

  // ── Route preview once destination is chosen ──────────────────────────────
  useEffect(() => {
    if (!pickupCoord || !destCoord) { setDist(null); setDuration(null); return; }

    let active = true;
    const fallbackDist = haversineDistanceKm(pickupCoord, destCoord);
    const fallbackTime = estimateRouteDurationSeconds(fallbackDist);
    setDist(fallbackDist);
    setDuration(fallbackTime);
    setRouteLoading(true);

    getRouteInfo(pickupCoord, destCoord)
      .then(route => {
        if (!active) return;
        setDist(route.distance);
        setDuration(route.duration);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setRouteLoading(false);
      });

    return () => { active = false; };
  }, [pickupCoord, destCoord]);

  // ── Destination search ─────────────────────────────────────────────────────
  function onChangeQuery(text) {
    setQuery(text);
    clearTimeout(debRef.current);
    if (text.length < 2) { setPredictions([]); setPhase("idle"); return; }
    setPhase("loading");
    debRef.current = setTimeout(async () => {
      try {
        const bias = pickupCoord ? `&location=${pickupCoord.latitude},${pickupCoord.longitude}&radius=50000` : "";
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
    try {
      const raw = await storage.getItem(DEST_RECENT_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      const next = [item, ...arr.filter(r => r.place_id !== item.place_id)].slice(0, 5);
      await storage.setItem(DEST_RECENT_KEY, JSON.stringify(next));
      setRecents(next);
    } catch {}
  }

  function selectDestination(coord, label) {
    if (settingFav) {
      const key = settingFav === "home" ? FAV_HOME_KEY : FAV_WORK_KEY;
      const value = { coord, label };
      storage.setItem(key, JSON.stringify(value)).catch(() => {});
      setFavourites(prev => ({ ...prev, [settingFav]: value }));
      setSettingFav(null);
    }
    setDestCoord(coord);
    setDestLabel(label);
    setQuery("");
    setPredictions([]);
    setPhase("idle");
  }

  async function handleSelectPrediction(pred) {
    try {
      const result = await fetchPlaceDetails(pred.place_id, pred.description);
      await pushToRecents({ place_id: pred.place_id, label: result.label, sublabel: pred.structured_formatting?.secondary_text || "", coord: result.coord });
      selectDestination(result.coord, result.label);
    } catch {}
  }

  async function handleSelectHospital(h) {
    await pushToRecents({ place_id: h.place_id, label: h.name, sublabel: h.vicinity, coord: h.coord });
    selectDestination(h.coord, `${h.name}${h.vicinity ? ", " + h.vicinity : ""}`);
  }

  function handleSelectRecent(r) {
    if (r.coord) selectDestination(r.coord, r.label);
  }

  function handleFavouriteTap(key) {
    const fav = favourites[key];
    if (fav) {
      selectDestination(fav.coord, fav.label);
    } else {
      setSettingFav(key);
    }
  }

  // ── Pickup edit flow ────────────────────────────────────────────────────────
  function handlePickupTap() {
    setPatientSheetVisible(true);
  }

  function handlePatientSkip() {
    setPatientSheetVisible(false);
    setPickupEditVisible(true);
  }

  function handlePatientContinue(selection) {
    setPatientType(selection.type);
    setContactName(selection.name);
    setContactPhone(selection.phone);
    setPatientSheetVisible(false);
    setPickupEditVisible(true);
  }

  function handlePickupSelect({ coord, label }) {
    setPickupCoord(coord);
    setPickupLabel(label);
    setPickupEditVisible(false);
    setHospsLoading(true);
    fetchNearbyHospitals(coord).then(setHospitals).finally(() => setHospsLoading(false));
  }

  // ── Now / Schedule ─────────────────────────────────────────────────────────
  function handlePickNow() {
    setScheduleType("now");
    setScheduleTypeVisible(false);
  }
  function handlePickSchedule() {
    setScheduleTypeVisible(false);
    setScheduleDetailVisible(true);
  }
  function handleConfirmSchedule() {
    setScheduleType("later");
    setScheduleDetailVisible(false);
  }

  // ── Proceed to ambulance type selection — exact contract AmbulanceSelectScreen expects
  function handleFindAmbulance() {
    navigation.navigate("AmbulanceSelect", {
      pickupLabel,
      dropLabel: destLabel,
      dist: dist ?? 5,
      duration: duration ?? 1200,
      scheduleType,
      scheduleDate: scheduleType === "later" ? scheduleDate.toISOString() : null,
      patientType,
      contactName,
      contactPhone,
    });
  }

  // ── Idle-state list (favourites / recents / hospitals) ────────────────────
  const idleListData = useMemo(() => {
    const rows = [];
    rows.push({ id: "__fav_hdr", type: "hdr", title: "⭐ Favourites" });
    rows.push({ id: "__fav_home", type: "favourite", key: "home", icon: "🏠", label: "Home", data: favourites.home });
    rows.push({ id: "__fav_work", type: "favourite", key: "work", icon: "💼", label: "Work", data: favourites.work });

    if (recents.length > 0) {
      rows.push({ id: "__rec_hdr", type: "hdr", title: "🕐 Recent Searches" });
      recents.forEach((r, i) => rows.push({ id: `rec_${i}`, type: "recent", data: r }));
    }

    rows.push({ id: "__hosp_hdr", type: "hdr", title: "🏥 Nearby Hospitals" });
    if (hospsLoading) rows.push({ id: "__hosp_loading", type: "hosp_loading" });
    else if (hospitals.length === 0) rows.push({ id: "__hosp_none", type: "hosp_empty" });
    else hospitals.forEach(h => rows.push({ id: `hosp_${h.place_id}`, type: "hospital", data: h }));

    return rows;
  }, [favourites, recents, hospitals, hospsLoading]);

  function renderIdleItem({ item }) {
    switch (item.type) {
      case "hdr":
        return <Text style={s.sectionHdr}>{item.title}</Text>;
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
    <View style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Ambulance Request Details</Text>
      </View>

      {/* Pickup + Destination input rows, with Now/Schedule button */}
      <View style={s.inputCardRow}>
        <View style={s.inputCard}>
          <TouchableOpacity style={[s.inputRow, s.pickupRow]} onPress={handlePickupTap} activeOpacity={0.7}>
            <View style={[s.dotGreen, s.dotTopAligned]} />
            {gpsLoading ? (
              <ActivityIndicator size="small" color={COLORS.red} />
            ) : (
              <Text style={s.inputTxt}>{pickupLabel}</Text>
            )}
          </TouchableOpacity>

          <View style={s.inputDivider} />

          <View style={s.inputRow}>
            <View style={s.dotRed} />
            <TextInput
              style={s.destInput}
              placeholder="Enter Hospital Name or Destination"
              placeholderTextColor={COLORS.grayDim}
              value={destCoord ? destLabel : query}
              onChangeText={text => { if (destCoord) { setDestCoord(null); setDestLabel(""); } onChangeQuery(text); }}
              returnKeyType="search"
            />
            {phase === "loading" && <ActivityIndicator size="small" color={COLORS.red} />}
          </View>
        </View>

        <TouchableOpacity style={s.nowBtn} onPress={() => setScheduleTypeVisible(true)} activeOpacity={0.85}>
          <Text style={s.nowBtnIco}>{scheduleType === "later" ? "🕐" : "🟢"}</Text>
          <Text style={s.nowBtnTxt}>{scheduleType === "later" ? "Sched." : "Now"}</Text>
        </TouchableOpacity>
      </View>

      {/* Route card once destination is chosen */}
      {destCoord && (
        <View style={s.routeCard}>
          <Text style={s.routeDistTxt}>
            {routeLoading ? "Calculating route…" : `${dist?.toFixed(1)} km · ~${Math.round((duration ?? 0) / 60)} min`}
          </Text>
        </View>
      )}

      {/* Body: predictions while typing, otherwise favourites / recents / hospitals */}
      {phase === "empty" ? (
        <View style={s.emptyState}>
          <Text style={s.emptyIco}>🔍</Text>
          <Text style={s.emptyTitle}>No results found</Text>
          <Text style={s.emptySub}>Try a different hospital name or address</Text>
        </View>
      ) : phase === "results" ? (
        <FlatList
          data={predictions}
          keyExtractor={item => item.place_id}
          keyboardShouldPersistTaps="handled"
          renderItem={renderPredictionItem}
          contentContainerStyle={s.listContent}
        />
      ) : (
        <FlatList
          data={idleListData}
          keyExtractor={item => item.id}
          keyboardShouldPersistTaps="handled"
          renderItem={renderIdleItem}
          contentContainerStyle={s.listContent}
        />
      )}

      {/* Final CTA once destination + route are known */}
      {destCoord && (
        <View style={s.footer}>
          <TouchableOpacity style={s.findAmbBtn} onPress={handleFindAmbulance} activeOpacity={0.85}>
            <Text style={s.findAmbTxt}>Find Ambulance  →</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* "Who needs this ambulance?" — shown before editing pickup */}
      <PatientDetailsSheet
        visible={patientSheetVisible}
        onSkip={handlePatientSkip}
        onContinue={handlePatientContinue}
      />

      {/* Pickup editor */}
      <PickupEditSheet
        visible={pickupEditVisible}
        anchorCoord={pickupCoord}
        onClose={() => setPickupEditVisible(false)}
        onSelect={handlePickupSelect}
      />

      {/* Now vs Schedule */}
      <ScheduleTypeSheet
        visible={scheduleTypeVisible}
        onClose={() => setScheduleTypeVisible(false)}
        onPickNow={handlePickNow}
        onPickSchedule={handlePickSchedule}
      />

      {/* Schedule date & time */}
      <ScheduleDetailSheet
        visible={scheduleDetailVisible}
        date={scheduleDate}
        onClose={() => setScheduleDetailVisible(false)}
        onPickDate={() => setPickerMode("date")}
        onPickTime={() => setPickerMode("time")}
        onConfirm={handleConfirmSchedule}
      />

      {/* Pure-JS date/time wheel picker */}
      <DateTimePickerModal
        visible={pickerMode != null}
        mode={pickerMode || "date"}
        value={scheduleDate}
        onConfirm={d => { setScheduleDate(d); setPickerMode(null); }}
        onClose={() => setPickerMode(null)}
      />
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

  inputCardRow: { flexDirection: "row", gap: 10, paddingHorizontal: 16, marginTop: 14 },
  inputCard: {
    flex: 1,
    backgroundColor: COLORS.bg2,
    borderRadius: 16, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14,
  },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13 },
  // Pickup shows a full multi-line address — align the dot to the first
  // line instead of the vertical center of the whole wrapped block.
  pickupRow: { alignItems: "flex-start" },
  inputDivider: { height: 0.5, backgroundColor: COLORS.border },
  dotGreen: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#22c55e", flexShrink: 0 },
  dotRed:   { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.red, flexShrink: 0 },
  dotTopAligned: { marginTop: 5 },
  // No numberOfLines/maxWidth clamp — the full address must never be cut off.
  inputTxt: { flex: 1, color: COLORS.text, fontSize: 14, fontWeight: "600", lineHeight: 19 },
  destInput: { flex: 1, color: COLORS.text, fontSize: 14, fontWeight: "600" },

  nowBtn: {
    width: 60, alignItems: "center", justifyContent: "center",
    backgroundColor: COLORS.bg2, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border,
  },
  nowBtnIco: { fontSize: 18, marginBottom: 2 },
  nowBtnTxt: { fontSize: 10, fontWeight: "700", color: COLORS.text },

  routeCard: {
    marginHorizontal: 16, marginTop: 10,
    backgroundColor: "#fff0f1", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: "rgba(232,25,44,0.2)",
  },
  routeDistTxt: { color: COLORS.red, fontSize: 12.5, fontWeight: "700" },

  listContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },
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

  emptyState: { alignItems: "center", paddingVertical: 64 },
  emptyIco:   { fontSize: 36, marginBottom: 12 },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: COLORS.text, marginBottom: 6 },
  emptySub:   { fontSize: 13, color: COLORS.grayDim, textAlign: "center" },

  footer: {
    paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 0.5, borderTopColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  findAmbBtn: {
    backgroundColor: COLORS.red, borderRadius: 14, paddingVertical: 16,
    alignItems: "center",
    shadowColor: COLORS.red, shadowOpacity: 0.38, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  findAmbTxt: { color: "#fff", fontSize: 16, fontWeight: "800" },

  // ── Pickup-edit sheet (full list, taller than the generic bsh.sheet) ───────
  editSheet: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingTop: 10, paddingHorizontal: 16,
    paddingBottom: Platform.OS === "ios" ? 42 : 24,
    maxHeight: "85%",
  },
  editHeaderRow: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  editBackBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: COLORS.bg3, alignItems: "center", justifyContent: "center",
    marginRight: 10,
  },
  editBackArrow: { fontSize: 20, color: COLORS.text, lineHeight: 22 },
  editTitle: { fontSize: 17, fontWeight: "700", color: COLORS.text },
  editInputRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: COLORS.bg2, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1.5, borderColor: COLORS.border,
    marginBottom: 10,
  },
  editInput: { flex: 1, fontSize: 15, color: COLORS.text },
  searchIco: { fontSize: 16, marginRight: 8, opacity: 0.5 },
});

// ─── Shared bottom-sheet shell styles (patient / schedule sheets) ─────────────
const bsh = StyleSheet.create({
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

  row: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1.5, borderColor: COLORS.border,
    borderRadius: 14, padding: 14, marginBottom: 10,
    backgroundColor: COLORS.bg2,
  },
  ico: {
    width: 42, height: 42, borderRadius: 12,
    alignItems: "center", justifyContent: "center", marginRight: 12,
  },
  rowLabel: { fontSize: 15, fontWeight: "700", color: COLORS.text },
  rowSub: { fontSize: 12, color: COLORS.grayDim, marginTop: 2 },

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

  footerRow: { flexDirection: "row", gap: 12, marginTop: 8 },
  skipBtn: {
    flex: 1, alignItems: "center", justifyContent: "center",
    borderRadius: 14, paddingVertical: 15,
    borderWidth: 1.5, borderColor: COLORS.border,
  },
  skipTxt: { fontSize: 15, fontWeight: "700", color: COLORS.gray },
  continueBtn: {
    flex: 1.4, alignItems: "center", justifyContent: "center",
    backgroundColor: COLORS.red, borderRadius: 14, paddingVertical: 15,
    shadowColor: COLORS.red, shadowOpacity: 0.35, shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  continueTxt: { fontSize: 15, fontWeight: "800", color: "#fff" },

  chipRow: { flexDirection: "row", gap: 10, marginBottom: 18 },
  chip: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: COLORS.bg2, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border,
    paddingVertical: 12, paddingHorizontal: 14,
  },
  chipIco: { fontSize: 16 },
  chipTxt: { fontSize: 13, fontWeight: "700", color: COLORS.text },
});

// ─── Date/time wheel picker styles ─────────────────────────────────────────────
const pk = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: {
    backgroundColor: COLORS.bg2,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingBottom: Platform.OS === "ios" ? 36 : 22,
    maxHeight: "75%",
  },
  handle: {
    width: 36, height: 4, backgroundColor: "rgba(0,0,0,0.12)",
    borderRadius: 2, alignSelf: "center", marginTop: 10, marginBottom: 6,
  },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 18, paddingVertical: 12,
    borderBottomWidth: 0.5, borderBottomColor: COLORS.border,
  },
  title: { flex: 1, color: COLORS.text, fontSize: 16, fontWeight: "700" },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.06)", alignItems: "center", justifyContent: "center",
  },
  closeX: { color: COLORS.grayDim, fontSize: 14, fontWeight: "700" },
  list: { flex: 1 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingHorizontal: 18, height: ITEM_H,
    borderBottomWidth: 0.5, borderBottomColor: "rgba(0,0,0,0.05)",
  },
  rowActive: { backgroundColor: "rgba(232,25,44,0.07)" },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "rgba(0,0,0,0.15)" },
  dotActive: { backgroundColor: COLORS.red },
  rowMain: { color: COLORS.text, fontSize: 15, fontWeight: "500" },
  rowMainActive: { color: COLORS.text, fontWeight: "700" },
  rowSub: { color: COLORS.grayDim, fontSize: 12, marginTop: 2 },
  check: { color: COLORS.red, fontSize: 18, fontWeight: "700" },
  footer: { paddingHorizontal: 18, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: COLORS.border },
  confirmBtn: { backgroundColor: COLORS.red, borderRadius: 14, paddingVertical: 15, alignItems: "center" },
  confirmTxt: { color: COLORS.white, fontSize: 15, fontWeight: "700" },
});
