import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, Modal,
  StyleSheet, ActivityIndicator, TextInput, FlatList, Alert, Animated,
} from "react-native";
import MapView, { PROVIDER_GOOGLE } from "react-native-maps";
import * as Location from "expo-location";
import { COLORS } from "../theme";

const MAPS_KEY = "AIzaSyB8wxgXxQxskgUZG868g_4Qdsezr07i9yA";

// Default map center shown instantly on mount, before a standby location is picked.
const DEFAULT_REGION = { latitude: 12.9716, longitude: 77.5946, latitudeDelta: 0.05, longitudeDelta: 0.05 };

// Debounce before reverse-geocoding the fixed center pin — avoids hammering
// the Geocoding API on every intermediate frame while the map is being dragged.
const GEOCODE_DEBOUNCE_MS = 400;

async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${MAPS_KEY}`);
    const data = await res.json();
    if (data.results?.length) return data.results[0].formatted_address;
  } catch {}
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

function LocationSearchModal({ visible, onSelect, onClose, gpsCoord, gpsLabel }) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => { if (visible) { setQuery(""); setSuggestions([]); } }, [visible]);

  function handleChange(text) {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.length < 2) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(text)}&key=${MAPS_KEY}&language=en&components=country:in`);
        const data = await res.json();
        setSuggestions(data.predictions || []);
      } catch {}
      setSearching(false);
    }, 350);
  }

  async function selectPrediction(prediction) {
    try {
      const res = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${prediction.place_id}&fields=geometry,formatted_address&key=${MAPS_KEY}`);
      const data = await res.json();
      if (data.result?.geometry) {
        onSelect({ coord: { latitude: data.result.geometry.location.lat, longitude: data.result.geometry.location.lng }, label: data.result.formatted_address || prediction.description });
      }
    } catch {}
  }

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={srch.container}>
        <View style={srch.header}>
          <TouchableOpacity onPress={onClose} style={srch.closeBtn}><Text style={srch.closeText}>X</Text></TouchableOpacity>
          <Text style={srch.title}>Select Standby Location</Text>
        </View>
        <View style={srch.inputRow}>
          <TextInput style={srch.input} placeholder="Search venue, area or address..." placeholderTextColor={COLORS.grayDim} value={query} onChangeText={handleChange} autoFocus autoCorrect={false} />
          {query.length > 0 && <TouchableOpacity onPress={() => { setQuery(""); setSuggestions([]); }}><Text style={srch.clearBtn}>X</Text></TouchableOpacity>}
        </View>
        {gpsCoord && (
          <TouchableOpacity style={srch.gpsRow} onPress={() => onSelect({ coord: gpsCoord, label: gpsLabel || "Current Location" })}>
            <View style={{ flex: 1 }}>
              <Text style={srch.gpsTitle}>Use Current Location</Text>
              {gpsLabel ? <Text style={srch.gpsSub} numberOfLines={1}>{gpsLabel}</Text> : null}
            </View>
          </TouchableOpacity>
        )}
        {searching && <ActivityIndicator color={COLORS.red} style={{ marginTop: 20 }} />}
        <FlatList data={suggestions} keyExtractor={(item) => item.place_id} keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <TouchableOpacity style={srch.suggRow} onPress={() => selectPrediction(item)}>
              <View style={{ flex: 1 }}>
                <Text style={srch.suggMain} numberOfLines={1}>{item.structured_formatting?.main_text || item.description}</Text>
                {item.structured_formatting?.secondary_text ? <Text style={srch.suggSub} numberOfLines={1}>{item.structured_formatting.secondary_text}</Text> : null}
              </View>
            </TouchableOpacity>
          )}
        />
      </View>
    </Modal>
  );
}

const PURPOSES = ["Sports Event","Concert / Show","Corporate Event","Wedding / Function","Marathon / Run","School / College Event","Religious Event","Other"];
const AMBULANCE_TYPES = [
  { id: "BLS_VAN", name: "BLS Ambulance", tag: "Eeco - Basic Life Support", recommended: true },
  { id: "BLS_TEMPO", name: "BLS Ambulance", tag: "Tempo Traveller - Basic Life Support", recommended: false },
  { id: "ALS", name: "ALS Ambulance", tag: "Tempo Traveller - Advanced Life Support", recommended: false },
  { id: "ACLS", name: "ACLS Ambulance", tag: "Tempo Traveller - Advanced Cardiac Life Support", recommended: false },
];
const EQUIPMENTS = [
  { id: "oxygen", name: "Oxygen" },
  { id: "aed", name: "Defibrillator (AED)" },
  { id: "firstaid", name: "First Aid Kit" },
  { id: "stretcher", name: "Stretcher" },
];

// ─── Wheel picker — Date / Hour / Minute / AM-PM columns ──────────────────────
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const HOURS   = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MINUTES = [0, 30]; // clean half-hour slots only — :00 and :30
const PERIODS = ["AM", "PM"];

// Wheel picker geometry — 5 visible rows, selection always centered
const ITEM_HEIGHT   = 44;
// Fewer visible rows than FreezerBoxScreen's single-row modal (5) — this
// modal stacks two full wheel-row sections (start + end), so each wheel is
// shorter to keep everything, including Confirm, visible without a wrapping
// ScrollView (which would fight the wheels' own scroll gesture — see below).
const VISIBLE_COUNT  = 3;
const WHEEL_HEIGHT  = ITEM_HEIGHT * VISIBLE_COUNT;
const WHEEL_PADDING = (WHEEL_HEIGHT - ITEM_HEIGHT) / 2;

function todayMidnight() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function buildDateChips(length = 5) {
  const base = todayMidnight();
  return Array.from({ length }, (_, i) => {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    return d;
  });
}

// Rounds up to the next clean half-hour slot off the real system clock —
// e.g. 1:05 -> 1:30, 1:45 -> 2:00, 11:50 PM -> 12:00 AM (rolls into tomorrow).
function getNextHalfHourSlot() {
  const next = new Date();
  next.setSeconds(0, 0);
  if (next.getMinutes() < 30) {
    next.setMinutes(30);
  } else {
    next.setMinutes(0);
    next.setHours(next.getHours() + 1);
  }
  return next;
}

function isTimePast(h12, min, ap, date) {
  if (date.toDateString() !== todayMidnight().toDateString()) return false;
  let h24 = h12;
  if (ap === "AM" && h12 === 12) h24 = 0;
  else if (ap === "PM" && h12 !== 12) h24 = h12 + 12;
  const check = new Date();
  check.setHours(h24, min, 0, 0);
  return check <= new Date();
}

// Compact single-point label — "10 Jul 9AM" or "10 Jul 9:30AM" (minutes only
// shown when not on the hour), used to build the "start - end" button text.
function formatDurationPoint(date) {
  let h = date.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const mm = date.getMinutes();
  const minutePart = mm === 0 ? "" : `:${String(mm).padStart(2, "0")}`;
  return `${date.getDate()} ${MON_NAMES[date.getMonth()]} ${h}${minutePart}${ampm}`;
}

// One vertically-scrolling wheel column. Snaps to the nearest item on
// release and fades/scales neighbouring rows based on raw scroll offset,
// so it reads as a single continuous wheel rather than a button grid.
function WheelColumn({ data, initialIndex, onChangeIndex, renderLabel, isPastIndex }) {
  const scrollRef = useRef(null);
  const scrollY = useRef(new Animated.Value(initialIndex * ITEM_HEIGHT)).current;

  function handleMomentumEnd(e) {
    const y = e.nativeEvent.contentOffset.y;
    const idx = Math.max(0, Math.min(data.length - 1, Math.round(y / ITEM_HEIGHT)));
    scrollRef.current?.scrollTo({ y: idx * ITEM_HEIGHT, animated: true });
    onChangeIndex(idx);
  }

  return (
    <Animated.ScrollView
      ref={scrollRef}
      showsVerticalScrollIndicator={false}
      snapToInterval={ITEM_HEIGHT}
      decelerationRate="fast"
      style={{ height: WHEEL_HEIGHT }}
      contentContainerStyle={{ paddingVertical: WHEEL_PADDING }}
      contentOffset={{ x: 0, y: initialIndex * ITEM_HEIGHT }}
      onMomentumScrollEnd={handleMomentumEnd}
      onScroll={Animated.event(
        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
        { useNativeDriver: false }
      )}
      scrollEventThrottle={16}
    >
      {data.map((item, i) => {
        const inputRange = [
          (i - 2) * ITEM_HEIGHT, (i - 1) * ITEM_HEIGHT, i * ITEM_HEIGHT,
          (i + 1) * ITEM_HEIGHT, (i + 2) * ITEM_HEIGHT,
        ];
        const opacity = scrollY.interpolate({ inputRange, outputRange: [0.25, 0.55, 1, 0.55, 0.25], extrapolate: "clamp" });
        const scale   = scrollY.interpolate({ inputRange, outputRange: [0.85, 0.92, 1, 0.92, 0.85], extrapolate: "clamp" });
        const past = isPastIndex ? isPastIndex(i) : false;
        return (
          <View key={i} style={wp.wheelItem}>
            <Animated.Text
              style={[
                wp.wheelItemText,
                past && wp.wheelItemTextPast,
                !past && { opacity, transform: [{ scale }] },
              ]}
            >
              {renderLabel(item, i)}
            </Animated.Text>
          </View>
        );
      })}
    </Animated.ScrollView>
  );
}

export default function EventAmbulanceScreen({ navigation }) {
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  const [standbyCoord, setStandbyCoord] = useState(null);
  const [standbyLabel, setStandbyLabel] = useState("");
  const [gpsCoord, setGpsCoord] = useState(null);
  const [gpsLabel, setGpsLabel] = useState("");
  const [locatingGps, setLocatingGps] = useState(false);
  const mapRef = useRef(null);
  const geoDebounceRef = useRef(null);

  // Confirmed standby duration — both null until the Duration modal is confirmed
  const [eventStartDate, setEventStartDate] = useState(null);
  const [eventEndDate, setEventEndDate]     = useState(null);

  const [showDurationModal, setShowDurationModal] = useState(false);
  // Bumped each time the modal opens — used as a React `key` on the wheel
  // columns so they remount fresh at the right initial scroll position.
  const [modalToken, setModalToken] = useState(0);

  const [draftStartDate, setDraftStartDate]     = useState(todayMidnight());
  const [draftStartHour, setDraftStartHour]     = useState(null);
  const [draftStartMinute, setDraftStartMinute] = useState(null);
  const [draftStartPeriod, setDraftStartPeriod] = useState(null);

  const [draftEndDate, setDraftEndDate]     = useState(todayMidnight());
  const [draftEndHour, setDraftEndHour]     = useState(null);
  const [draftEndMinute, setDraftEndMinute] = useState(null);
  const [draftEndPeriod, setDraftEndPeriod] = useState(null);

  const [eventName, setEventName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [purposeModal, setPurposeModal] = useState(false);

  const [ambulanceType, setAmbulanceType] = useState("bls");
  const [staff, setStaff] = useState([]);
  const [equipments, setEquipments] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // Initial GPS fix on mount — feeds both the "Use Current Location" quick
  // option in the search modal and the fixed center pin's starting position.
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const coord = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setGpsCoord(coord);
        const label = await reverseGeocode(coord.latitude, coord.longitude);
        setGpsLabel(label);
        setStandbyCoord(coord);
        mapRef.current?.animateToRegion({ ...coord, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 600);
      } catch {
        const last = await Location.getLastKnownPositionAsync();
        if (last) {
          const coord = { latitude: last.coords.latitude, longitude: last.coords.longitude };
          setGpsCoord(coord);
          const label = await reverseGeocode(coord.latitude, coord.longitude);
          setGpsLabel(label);
          setStandbyCoord(coord);
          mapRef.current?.animateToRegion({ ...coord, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 600);
        }
      }
    })();
  }, []);

  // Silent auto reverse-geocode — fires whenever the fixed center pin settles
  // (initial GPS fix, manual drag, or the GPS button), same pattern as
  // FreezerBoxScreen's markerCoord effect.
  useEffect(() => {
    if (!standbyCoord) return;
    if (geoDebounceRef.current) clearTimeout(geoDebounceRef.current);
    geoDebounceRef.current = setTimeout(async () => {
      const label = await reverseGeocode(standbyCoord.latitude, standbyCoord.longitude);
      setStandbyLabel(label);
    }, GEOCODE_DEBOUNCE_MS);
    return () => clearTimeout(geoDebounceRef.current);
  }, [standbyCoord]);

  const toggleStaff = (id) => setStaff((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  const toggleEquip = (id) => setEquipments((e) => e.includes(id) ? e.filter((x) => x !== id) : [...e, id]);

  // Map dragged under the fixed center pin — update the pin's coordinate;
  // the effect above picks it up and resolves the address.
  function handleRegionChange(region) {
    setStandbyCoord({ latitude: region.latitude, longitude: region.longitude });
  }

  // Floating GPS button on the map — same behavior as FreezerBoxScreen's gpsBtn.
  async function goToCurrentLocation() {
    setLocatingGps(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coord = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      setStandbyCoord(coord);
      mapRef.current?.animateToRegion({ ...coord, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 600);
    } catch {
      // GPS unavailable — leave the existing pin as is
    } finally {
      setLocatingGps(false);
    }
  }

  // Seeds one draft (date/hour/minute/period) from a confirmed Date, or from
  // the next available half-hour slot if nothing was confirmed yet.
  function seedDraftFrom(confirmedDate, setD, setH, setM, setP) {
    const base = confirmedDate || getNextHalfHourSlot();
    const d = new Date(base);
    d.setHours(0, 0, 0, 0);
    let h = base.getHours();
    const ap = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    setD(d);
    setH(h);
    setM(base.getMinutes());
    setP(ap);
  }

  // Opens the slide-up Duration modal, seeding both the start and end drafts
  // from whatever was last confirmed (or the next available time slot).
  function openDurationModal() {
    seedDraftFrom(eventStartDate, setDraftStartDate, setDraftStartHour, setDraftStartMinute, setDraftStartPeriod);
    seedDraftFrom(eventEndDate, setDraftEndDate, setDraftEndHour, setDraftEndMinute, setDraftEndPeriod);
    setModalToken(t => t + 1);
    setShowDurationModal(true);
  }

  function handleConfirmDuration() {
    if (draftStartHour == null || draftStartMinute == null || !draftStartPeriod) {
      Alert.alert("", "Please select a start time.");
      return;
    }
    if (draftEndHour == null || draftEndMinute == null || !draftEndPeriod) {
      Alert.alert("", "Please select an end time.");
      return;
    }
    if (isTimePast(draftStartHour, draftStartMinute, draftStartPeriod, draftStartDate)) {
      Alert.alert("", "Please select a future start time.");
      return;
    }

    let startH24 = draftStartHour;
    if (draftStartPeriod === "AM" && draftStartHour === 12) startH24 = 0;
    else if (draftStartPeriod === "PM" && draftStartHour !== 12) startH24 = draftStartHour + 12;
    const finalStart = new Date(draftStartDate);
    finalStart.setHours(startH24, draftStartMinute, 0, 0);

    let endH24 = draftEndHour;
    if (draftEndPeriod === "AM" && draftEndHour === 12) endH24 = 0;
    else if (draftEndPeriod === "PM" && draftEndHour !== 12) endH24 = draftEndHour + 12;
    const finalEnd = new Date(draftEndDate);
    finalEnd.setHours(endH24, draftEndMinute, 0, 0);

    if (finalEnd <= finalStart) {
      Alert.alert("", "End date/time must be after the start date/time.");
      return;
    }

    setEventStartDate(finalStart);
    setEventEndDate(finalEnd);
    setShowDurationModal(false);
  }

  async function handleSubmit() {
    if (!eventName.trim()) return Alert.alert("Missing", "Please enter event name");
    if (!standbyCoord) return Alert.alert("Missing", "Please select standby location");
    if (!eventStartDate || !eventEndDate) return Alert.alert("Missing", "Please select event duration");
    setSubmitting(true);
    try {
      const payload = {
        eventName,
        purpose,
        standbyCoord,
        standbyLabel,
        eventStartDate,
        eventEndDate,
        ambulanceType,
        staff,
        equipments,
      };
      console.log("[EventAmbulanceScreen] submit payload:", payload);
      Alert.alert("Success!", "Event Ambulance request submitted!\nOur team will call you shortly.", [{ text: "OK", onPress: () => navigation.goBack() }]);
    } catch {
      Alert.alert("Error", "Request submission failed. Please try again.");
    }
    setSubmitting(false);
  }

  const startDateChips = buildDateChips(10); // today + next 10 days
  const endDateChips   = buildDateChips(30); // today + next 30 days (~1 month)

  const startDateIndex   = Math.max(0, startDateChips.findIndex(d => d.toDateString() === draftStartDate.toDateString()));
  const startHourIndex   = Math.max(0, HOURS.indexOf(draftStartHour));
  const startMinuteIndex = Math.max(0, MINUTES.indexOf(draftStartMinute));
  const startPeriodIndex = Math.max(0, PERIODS.indexOf(draftStartPeriod));

  const endDateIndex   = Math.max(0, endDateChips.findIndex(d => d.toDateString() === draftEndDate.toDateString()));
  const endHourIndex   = Math.max(0, HOURS.indexOf(draftEndHour));
  const endMinuteIndex = Math.max(0, MINUTES.indexOf(draftEndMinute));
  const endPeriodIndex = Math.max(0, PERIODS.indexOf(draftEndPeriod));

  const canConfirmDuration = draftStartHour != null && draftStartMinute != null && !!draftStartPeriod
    && draftEndHour != null && draftEndMinute != null && !!draftEndPeriod;

  const durationBtnLabel = eventStartDate && eventEndDate
    ? `${formatDurationPoint(eventStartDate)} - ${formatDurationPoint(eventEndDate)}`
    : "Duration";

  return (
    <View style={styles.container}>
      {/* Map — always visible, edge to edge, top 45%. Back button and title
          float on top as an absolute overlay, GPS button floats bottom-right —
          same pattern as FreezerBoxScreen. */}
      <View style={styles.mapWrapper}>
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_GOOGLE}
          initialRegion={standbyCoord
            ? { ...standbyCoord, latitudeDelta: 0.01, longitudeDelta: 0.01 }
            : DEFAULT_REGION}
          onRegionChangeComplete={handleRegionChange}
        />
        <View style={styles.fixedPinContainer} pointerEvents="none">
          <View style={styles.pinShadow} />
          <View style={styles.pinHead} />
          <View style={styles.pinTail} />
        </View>

        <TouchableOpacity style={styles.backBtnOverlay} onPress={() => navigation.goBack()}>
          <Text style={{ color: COLORS.text, fontSize: 20 }}>&#8592;</Text>
        </TouchableOpacity>
        <View style={styles.titleOverlay}>
          <Text style={styles.title}>Event Ambulance</Text>
          <Text style={styles.subtitle}>Ambulance on standby for events</Text>
        </View>

        <TouchableOpacity
          style={[styles.gpsBtn, locatingGps && { opacity: 0.6 }]}
          onPress={goToCurrentLocation}
          disabled={locatingGps}
        >
          {locatingGps
            ? <ActivityIndicator size="small" color={COLORS.red} />
            : <Text style={{ fontSize: 20 }}>🎯</Text>}
        </TouchableOpacity>
      </View>

      {/* Standby location search bar — directly below the map */}
      <View style={styles.locationBarWrap}>
        <TouchableOpacity style={styles.locationBar} onPress={() => setLocationModalVisible(true)}>
          <Text style={styles.locationBarIcon}>📍</Text>
          <Text style={styles.locationBarText} numberOfLines={1}>{standbyLabel || "Select standby location"}</Text>
          <Text style={styles.locationBarEdit}>Edit</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.scheduleInlineBtn} onPress={openDurationModal} activeOpacity={0.8}>
          <Text style={styles.scheduleInlineIcon}>🕐</Text>
          <Text style={styles.scheduleInlineText} numberOfLines={1}>{durationBtnLabel}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.heroBanner}>
          <Text style={styles.heroText}>Dedicated standby ambulance for your event</Text>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>24x7 Emergency Service</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Organization / Event Details</Text>
          <Text style={styles.fieldLabel}>Organization / Event Name</Text>
          <TextInput style={styles.input} placeholder="Ex: Bangalore Marathon 2025" placeholderTextColor={COLORS.grayDim} value={eventName} onChangeText={setEventName} />
          <Text style={styles.fieldLabel}>Purpose</Text>
          <TouchableOpacity style={[styles.selectBtn, purpose && styles.selectBtnActive]} onPress={() => setPurposeModal(true)}>
            <Text style={[styles.selectBtnText, purpose && { color: COLORS.text }]}>{purpose || "Select purpose"}</Text>
            <Text style={{ color: COLORS.grayDim }}>v</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ambulance and Medical Setup</Text>
          <Text style={styles.fieldLabel}>Ambulance Type</Text>
          {AMBULANCE_TYPES.map((type) => (
            <TouchableOpacity key={type.id} style={[styles.radioItem, ambulanceType === type.id && styles.radioItemActive]} onPress={() => setAmbulanceType(type.id)}>
              <View style={[styles.radioCircle, ambulanceType === type.id && styles.radioCircleActive]}>
                {ambulanceType === type.id && <View style={styles.radioDot} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.radioName}>{type.name}</Text>
                <Text style={styles.radioTag}>{type.tag}</Text>
              </View>
              {type.recommended && <View style={styles.recommendedBadge}><Text style={styles.recommendedText}>Recommended</Text></View>}
            </TouchableOpacity>
          ))}
          <Text style={[styles.fieldLabel, { marginTop: 8 }]}>Medical Staff Required</Text>
          <View style={styles.staffRow}>
            {["nurse", "doctor"].map((s) => (
              <TouchableOpacity key={s} style={[styles.staffBtn, staff.includes(s) && styles.staffBtnActive]} onPress={() => toggleStaff(s)}>
                <Text style={[styles.staffText, staff.includes(s) && { color: COLORS.red }]}>{s === "nurse" ? "Nurse" : "Doctor"}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[styles.fieldLabel, { marginTop: 8 }]}>Equipments</Text>
          <View style={styles.equipGrid}>
            {EQUIPMENTS.map((eq) => (
              <TouchableOpacity key={eq.id} style={[styles.equipItem, equipments.includes(eq.id) && styles.equipItemActive]} onPress={() => toggleEquip(eq.id)}>
                <View style={[styles.checkbox, equipments.includes(eq.id) && styles.checkboxActive]}>
                  {equipments.includes(eq.id) && <Text style={{ color: "#fff", fontSize: 11 }}>v</Text>}
                </View>
                <Text style={[styles.equipText, equipments.includes(eq.id) && { color: COLORS.white }]}>{eq.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.6 }]} onPress={handleSubmit} disabled={submitting}>
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Request Event Ambulance</Text>}
        </TouchableOpacity>
        <Text style={styles.submitNote}>Our medical team will call you for confirmation</Text>
      </ScrollView>

      <Modal visible={purposeModal} transparent animationType="slide" onRequestClose={() => setPurposeModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setPurposeModal(false)}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Select Purpose</Text>
            {PURPOSES.map((p) => (
              <TouchableOpacity key={p} style={[styles.modalItem, purpose === p && styles.modalItemActive]} onPress={() => { setPurpose(p); setPurposeModal(false); }}>
                <Text style={[styles.modalItemText, purpose === p && { color: COLORS.red }]}>{p}</Text>
                {purpose === p && <Text style={{ color: COLORS.red }}>v</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      <LocationSearchModal visible={locationModalVisible} gpsCoord={gpsCoord} gpsLabel={gpsLabel} onClose={() => setLocationModalVisible(false)}
        onSelect={({ coord, label }) => {
          setStandbyCoord(coord);
          setStandbyLabel(label);
          setLocationModalVisible(false);
          setTimeout(() => { mapRef.current?.animateToRegion({ ...coord, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 500); }, 300);
        }}
      />

      {/* Slide-up Duration modal — start + end date/time */}
      <Modal
        visible={showDurationModal}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={() => setShowDurationModal(false)}
      >
        <View style={wp.modalBackdrop}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowDurationModal(false)} />

          <View style={wp.modalSheet}>
            <View style={wp.modalHandle} />

            <View style={wp.modalHeaderRow}>
              <Text style={wp.modalTitle}>Select Duration</Text>
              <TouchableOpacity onPress={() => setShowDurationModal(false)}>
                <Text style={wp.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <View>
              <Text style={wp.sectionLabel}>START DATE & TIME</Text>
              <View style={wp.wheelHeaderRow}>
                <Text style={[wp.wheelHeaderText, { flex: 1.3 }]}>DATE</Text>
                <Text style={[wp.wheelHeaderText, { flex: 0.7 }]}>HOUR</Text>
                <Text style={[wp.wheelHeaderText, { flex: 0.8 }]}>MIN</Text>
                <Text style={[wp.wheelHeaderText, { flex: 0.7 }]}>AM/PM</Text>
              </View>
              <View style={wp.wheelRow}>
                <View style={wp.wheelHighlight} pointerEvents="none" />

                <View style={{ flex: 1.3 }}>
                  <WheelColumn
                    key={`start-date-${modalToken}`}
                    data={startDateChips}
                    initialIndex={startDateIndex}
                    onChangeIndex={i => setDraftStartDate(startDateChips[i])}
                    renderLabel={d => (d.toDateString() === todayMidnight().toDateString()
                      ? "Today"
                      : `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MON_NAMES[d.getMonth()]}`)}
                  />
                </View>

                <View style={{ flex: 0.7 }}>
                  <WheelColumn
                    key={`start-hour-${modalToken}`}
                    data={HOURS}
                    initialIndex={startHourIndex}
                    onChangeIndex={i => setDraftStartHour(HOURS[i])}
                    renderLabel={h => String(h)}
                    isPastIndex={i => draftStartPeriod != null && isTimePast(HOURS[i], 45, draftStartPeriod, draftStartDate)}
                  />
                </View>

                <View style={{ flex: 0.8 }}>
                  <WheelColumn
                    key={`start-minute-${modalToken}`}
                    data={MINUTES}
                    initialIndex={startMinuteIndex}
                    onChangeIndex={i => setDraftStartMinute(MINUTES[i])}
                    renderLabel={m => `:${String(m).padStart(2, "0")}`}
                    isPastIndex={i => draftStartHour != null && draftStartPeriod != null && isTimePast(draftStartHour, MINUTES[i], draftStartPeriod, draftStartDate)}
                  />
                </View>

                <View style={{ flex: 0.7 }}>
                  <WheelColumn
                    key={`start-period-${modalToken}`}
                    data={PERIODS}
                    initialIndex={startPeriodIndex}
                    onChangeIndex={i => setDraftStartPeriod(PERIODS[i])}
                    renderLabel={ap => ap}
                    isPastIndex={i => isTimePast(11, 45, PERIODS[i], draftStartDate)}
                  />
                </View>
              </View>

              <View style={wp.sectionDivider} />

              <Text style={wp.sectionLabel}>END DATE & TIME</Text>
              <View style={wp.wheelHeaderRow}>
                <Text style={[wp.wheelHeaderText, { flex: 1.3 }]}>DATE</Text>
                <Text style={[wp.wheelHeaderText, { flex: 0.7 }]}>HOUR</Text>
                <Text style={[wp.wheelHeaderText, { flex: 0.8 }]}>MIN</Text>
                <Text style={[wp.wheelHeaderText, { flex: 0.7 }]}>AM/PM</Text>
              </View>
              <View style={wp.wheelRow}>
                <View style={wp.wheelHighlight} pointerEvents="none" />

                <View style={{ flex: 1.3 }}>
                  <WheelColumn
                    key={`end-date-${modalToken}`}
                    data={endDateChips}
                    initialIndex={endDateIndex}
                    onChangeIndex={i => setDraftEndDate(endDateChips[i])}
                    renderLabel={d => (d.toDateString() === todayMidnight().toDateString()
                      ? "Today"
                      : `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MON_NAMES[d.getMonth()]}`)}
                  />
                </View>

                <View style={{ flex: 0.7 }}>
                  <WheelColumn
                    key={`end-hour-${modalToken}`}
                    data={HOURS}
                    initialIndex={endHourIndex}
                    onChangeIndex={i => setDraftEndHour(HOURS[i])}
                    renderLabel={h => String(h)}
                    isPastIndex={i => draftEndPeriod != null && isTimePast(HOURS[i], 45, draftEndPeriod, draftEndDate)}
                  />
                </View>

                <View style={{ flex: 0.8 }}>
                  <WheelColumn
                    key={`end-minute-${modalToken}`}
                    data={MINUTES}
                    initialIndex={endMinuteIndex}
                    onChangeIndex={i => setDraftEndMinute(MINUTES[i])}
                    renderLabel={m => `:${String(m).padStart(2, "0")}`}
                    isPastIndex={i => draftEndHour != null && draftEndPeriod != null && isTimePast(draftEndHour, MINUTES[i], draftEndPeriod, draftEndDate)}
                  />
                </View>

                <View style={{ flex: 0.7 }}>
                  <WheelColumn
                    key={`end-period-${modalToken}`}
                    data={PERIODS}
                    initialIndex={endPeriodIndex}
                    onChangeIndex={i => setDraftEndPeriod(PERIODS[i])}
                    renderLabel={ap => ap}
                    isPastIndex={i => isTimePast(11, 45, PERIODS[i], draftEndDate)}
                  />
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={[wp.confirmScheduleBtn, !canConfirmDuration && { opacity: 0.4 }]}
              disabled={!canConfirmDuration}
              onPress={handleConfirmDuration}
            >
              <Text style={wp.confirmScheduleBtnText}>Confirm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  // Map — top of the screen, edge to edge, always visible
  mapWrapper: { height: "45%" },
  map: { flex: 1 },

  // Header overlay — floats on top of the map
  backBtnOverlay: { position: "absolute", top: 50, left: 16, width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.white, alignItems: "center", justifyContent: "center", elevation: 4, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  titleOverlay: { position: "absolute", top: 50, left: 66, right: 16, backgroundColor: COLORS.white, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8, elevation: 4, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  title: { color: COLORS.text, fontSize: 18, fontWeight: "700" },
  subtitle: { color: COLORS.grayDim, fontSize: 12, marginTop: 2 },

  // Floating GPS button — bottom-right of the map, same as FreezerBoxScreen's gpsBtn
  gpsBtn: { position: "absolute", bottom: 16, right: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.white, alignItems: "center", justifyContent: "center", elevation: 5, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },

  // Fixed center pin — same drag-the-map-under-the-pin pattern as FreezerBoxScreen
  fixedPinContainer: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  pinShadow: { width: 18, height: 5, borderRadius: 9, backgroundColor: "rgba(0,0,0,0.25)", marginTop: 30, marginBottom: -35 },
  pinHead: { width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.red, borderWidth: 2.5, borderColor: "#fff" },
  pinTail: { width: 3, height: 12, backgroundColor: COLORS.red, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },

  // Standby location search bar — directly below the map
  locationBarWrap: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingTop: 14 },
  locationBar: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "rgba(0,0,0,0.05)", borderWidth: 0.5, borderColor: "rgba(0,0,0,0.1)", borderRadius: 12, paddingHorizontal: 14, height: 48 },
  locationBarIcon: { fontSize: 15 },
  locationBarText: { flex: 1, color: COLORS.text, fontSize: 14, fontWeight: "500" },
  locationBarEdit: { color: COLORS.grayDim, fontSize: 12 },

  // Inline Ola-style schedule button — same row as the location search bar
  scheduleInlineBtn: { width: 64, height: 48, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.05)", borderWidth: 0.5, borderColor: "rgba(0,0,0,0.1)", alignItems: "center", justifyContent: "center" },
  scheduleInlineIcon: { fontSize: 14 },
  scheduleInlineText: { color: COLORS.text, fontSize: 10, fontWeight: "700", marginTop: 2 },

  scroll: { padding: 16, paddingBottom: 40 },
  heroBanner: { backgroundColor: "rgba(232,25,44,0.08)", borderWidth: 0.5, borderColor: "rgba(232,25,44,0.25)", borderRadius: 14, padding: 14, marginBottom: 16 },
  heroText: { color: COLORS.gray, fontSize: 13, lineHeight: 18 },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.red },
  liveText: { fontSize: 11, color: COLORS.red, fontWeight: "600" },
  section: { backgroundColor: "rgba(0,0,0,0.03)", borderWidth: 0.5, borderColor: "rgba(0,0,0,0.08)", borderRadius: 16, padding: 16, marginBottom: 14 },
  sectionTitle: { color: COLORS.text, fontSize: 15, fontWeight: "700", marginBottom: 14 },
  fieldLabel: { color: COLORS.grayDim, fontSize: 11, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  input: { backgroundColor: "rgba(0,0,0,0.05)", borderWidth: 0.5, borderColor: "rgba(0,0,0,0.1)", borderRadius: 10, padding: 12, color: COLORS.text, fontSize: 14, marginBottom: 14 },
  selectBtn: { backgroundColor: "rgba(0,0,0,0.05)", borderWidth: 0.5, borderColor: "rgba(0,0,0,0.1)", borderRadius: 10, padding: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  selectBtnActive: { borderColor: "rgba(232,25,44,0.4)" },
  selectBtnText: { color: COLORS.grayDim, fontSize: 14, flex: 1, marginRight: 8 },
  radioItem: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, backgroundColor: "rgba(0,0,0,0.03)", borderWidth: 0.5, borderColor: "rgba(0,0,0,0.08)", borderRadius: 10, marginBottom: 8 },
  radioItemActive: { borderColor: "rgba(232,25,44,0.5)", backgroundColor: "rgba(232,25,44,0.08)" },
  radioCircle: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.grayDim, alignItems: "center", justifyContent: "center" },
  radioCircleActive: { borderColor: COLORS.red },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.red },
  radioName: { color: COLORS.text, fontSize: 13, fontWeight: "600" },
  radioTag: { color: COLORS.grayDim, fontSize: 11, marginTop: 2 },
  recommendedBadge: { backgroundColor: "rgba(232,25,44,0.15)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  recommendedText: { color: COLORS.red, fontSize: 10, fontWeight: "700" },
  staffRow: { flexDirection: "row", gap: 10, marginBottom: 4 },
  staffBtn: { flex: 1, backgroundColor: "rgba(0,0,0,0.03)", borderWidth: 0.5, borderColor: "rgba(0,0,0,0.08)", borderRadius: 10, padding: 12, alignItems: "center" },
  staffBtnActive: { borderColor: "rgba(232,25,44,0.5)", backgroundColor: "rgba(232,25,44,0.08)" },
  staffText: { color: COLORS.grayDim, fontSize: 13, fontWeight: "600" },
  equipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  equipItem: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(0,0,0,0.03)", borderWidth: 0.5, borderColor: "rgba(0,0,0,0.08)", borderRadius: 10, padding: 10, width: "48%" },
  equipItemActive: { borderColor: "rgba(232,25,44,0.5)", backgroundColor: "rgba(232,25,44,0.08)" },
  checkbox: { width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, borderColor: COLORS.grayDim, alignItems: "center", justifyContent: "center" },
  checkboxActive: { backgroundColor: COLORS.red, borderColor: COLORS.red },
  equipText: { color: COLORS.grayDim, fontSize: 11, flex: 1 },
  submitBtn: { backgroundColor: COLORS.red, borderRadius: 14, padding: 17, alignItems: "center", marginBottom: 10 },
  submitText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  submitNote: { textAlign: "center", color: COLORS.grayDim, fontSize: 11, marginBottom: 10 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: COLORS.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  modalTitle: { color: COLORS.text, fontSize: 16, fontWeight: "700", marginBottom: 16 },
  modalItem: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: "rgba(0,0,0,0.06)" },
  modalItemActive: {},
  modalItemText: { color: COLORS.gray, fontSize: 14 },
});

const srch = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingTop: 54 },
  header: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 18, paddingBottom: 16 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.06)", alignItems: "center", justifyContent: "center" },
  closeText: { color: COLORS.text, fontSize: 14, fontWeight: "700" },
  title: { color: COLORS.text, fontSize: 17, fontWeight: "700" },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 18, marginBottom: 8, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: "rgba(0,0,0,0.05)", borderWidth: 0.5, borderColor: "rgba(0,0,0,0.1)", borderRadius: 12 },
  input: { flex: 1, color: COLORS.text, fontSize: 15 },
  clearBtn: { color: COLORS.grayDim, fontSize: 14, paddingHorizontal: 4 },
  gpsRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: "rgba(0,0,0,0.07)" },
  gpsTitle: { color: COLORS.text, fontSize: 14, fontWeight: "600" },
  gpsSub: { color: COLORS.grayDim, fontSize: 12, marginTop: 2 },
  suggRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: "rgba(0,0,0,0.04)" },
  suggMain: { color: COLORS.text, fontSize: 14, fontWeight: "500" },
  suggSub: { color: COLORS.grayDim, fontSize: 12, marginTop: 2 },
});

// ─── Schedule modal styles — ported from FreezerBoxScreen's wheel picker ──────
const wp = StyleSheet.create({
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: COLORS.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 28, maxHeight: "85%" },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(0,0,0,0.15)", alignSelf: "center", marginBottom: 14 },
  modalHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  modalTitle: { color: COLORS.text, fontSize: 18, fontWeight: "700" },
  modalClose: { color: COLORS.grayDim, fontSize: 16, padding: 4 },

  sectionLabel: { color: COLORS.text, fontSize: 13, fontWeight: "700", marginBottom: 10 },
  sectionDivider: { height: 0.5, backgroundColor: "rgba(0,0,0,0.1)", marginVertical: 18 },

  wheelHeaderRow: { flexDirection: "row", marginBottom: 4 },
  wheelHeaderText: { color: COLORS.grayDim, fontSize: 10, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", textAlign: "center" },
  wheelRow: { flexDirection: "row", height: WHEEL_HEIGHT },
  wheelHighlight: { position: "absolute", top: WHEEL_PADDING, left: 0, right: 0, height: ITEM_HEIGHT, backgroundColor: "rgba(232,25,44,0.07)", borderTopWidth: 1, borderBottomWidth: 1, borderColor: "rgba(232,25,44,0.3)" },
  wheelItem: { height: ITEM_HEIGHT, alignItems: "center", justifyContent: "center" },
  wheelItemText: { color: COLORS.text, fontSize: 16, fontWeight: "700" },
  wheelItemTextPast: { color: COLORS.grayDim, opacity: 0.25 },

  confirmScheduleBtn: { backgroundColor: COLORS.red, borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 20 },
  confirmScheduleBtnText: { color: COLORS.white, fontSize: 16, fontWeight: "700" },
});



