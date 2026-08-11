import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Switch, Alert, ActivityIndicator, Modal, Animated,
} from "react-native";
import * as Location from "expo-location";
import { ensureLocationPermission } from "../utils/locationPermission";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { COLORS } from "../theme";
import { getRouteInfo } from "../utils/routeUtils";
import { calcFare, PRICING_API } from "../utils/pricingUtils";

const PLACES_KEY = "AIzaSyB8wxgXxQxskgUZG868g_4Qdsezr07i9yA";
const GEOCODE_API      = "https://maps.googleapis.com/maps/api/geocode/json";
const AUTOCOMPLETE_API = "https://maps.googleapis.com/maps/api/place/autocomplete/json";
const PLACE_DETAILS_API = "https://maps.googleapis.com/maps/api/place/details/json";
const SEARCH_DEBOUNCE_MS = 350;

// Default map center shown instantly on mount, before pickupCoord resolves.
const DEFAULT_REGION = { latitude: 12.9716, longitude: 77.5946, latitudeDelta: 0.1, longitudeDelta: 0.1 };

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const HOURS   = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MINUTES = [0, 30]; // clean half-hour slots only — :00 and :30
const PERIODS = ["AM", "PM"];

// Wheel picker geometry — 5 visible rows, selection always centered
const ITEM_HEIGHT   = 44;
const VISIBLE_COUNT  = 5;
const WHEEL_HEIGHT  = ITEM_HEIGHT * VISIBLE_COUNT;
const WHEEL_PADDING = (WHEEL_HEIGHT - ITEM_HEIGHT) / 2;

function todayMidnight() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function buildDateChips() {
  const base = todayMidnight();
  return Array.from({ length: 5 }, (_, i) => {
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

function formatScheduledLabel(date) {
  let h = date.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${date.getDate()} ${MON_NAMES[date.getMonth()]}, ${h}:${mm} ${ampm}`;
}

// Vehicle selection now lives inside the "location" step, directly under
// the route map, so it no longer needs its own step.
const STEPS = ["location", "preferences", "review"];

// typeId is matched (lower-case) against the `serviceType` field of each
// /api/pricing document by calcFare() — no price is hardcoded here.
const VEHICLE_TYPES = [
  { id: "basic",    typeId: "hearse_basic",    icon: "🚐", name: "Basic Hearse",    desc: "Simple hearse van, basic service" },
  { id: "standard", typeId: "hearse_standard", icon: "🌸", name: "Standard Hearse", desc: "Decorated hearse with flowers" },
  { id: "luxury",   typeId: "hearse_luxury",   icon: "👑", name: "Luxury Hearse",   desc: "Premium decorated hearse, full ceremony setup" },
];

const RELIGIONS = [
  { id: "hindu",     label: "🕉️ Hindu" },
  { id: "muslim",    label: "☪️ Muslim" },
  { id: "christian", label: "✝️ Christian" },
  { id: "sikh",      label: "☬ Sikh" },
  { id: "other",     label: "— Other" },
];

async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(`${GEOCODE_API}?latlng=${lat},${lng}&key=${PLACES_KEY}`);
    const data = await res.json();
    if (data.results?.length) {
      return { address: data.results[0].formatted_address };
    }
  } catch {}
  return { address: null };
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
          <View key={i} style={styles.wheelItem}>
            <Animated.Text
              style={[
                styles.wheelItemText,
                past && styles.wheelItemTextPast,
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

const SummaryRow = ({ label, value }) => (
  <View style={styles.sumRow}>
    <Text style={styles.sumLabel}>{label}</Text>
    <Text style={styles.sumValue}>{value}</Text>
  </View>
);

// One row inside the combined pickup/drop card — a colour-coded dot, the
// text input, and (while the user is typing) its own live autocomplete
// suggestions dropdown floating directly beneath it.
function LocationInputRow({ dotColor, placeholder, value, suggestions, onChangeText, onSelectSuggestion }) {
  return (
    <View>
      <View style={styles.addressRow}>
        <View style={[styles.locationDot, { backgroundColor: dotColor }]} />
        <TextInput
          style={styles.searchInput}
          placeholder={placeholder}
          placeholderTextColor={COLORS.grayDim}
          value={value}
          onChangeText={onChangeText}
        />
      </View>
      {suggestions.length > 0 && (
        <View style={styles.suggestionsBox}>
          {suggestions.map(item => (
            <TouchableOpacity
              key={item.place_id}
              style={styles.suggRow}
              onPress={() => onSelectSuggestion(item)}
            >
              <Text style={styles.suggIcon}>📍</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.suggMain} numberOfLines={1}>
                  {item.structured_formatting?.main_text || item.description}
                </Text>
                {item.structured_formatting?.secondary_text ? (
                  <Text style={styles.suggSub} numberOfLines={1}>{item.structured_formatting.secondary_text}</Text>
                ) : null}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

export default function AntimYatraScreen({ navigation }) {
  const [step, setStep] = useState(1);
  const cur = STEPS[step - 1];

  // ── Step 1: pickup / drop locations ──────────────────────────────────
  const [pickupLoc,   setPickupLoc]   = useState("");
  const [pickupCoord, setPickupCoord] = useState(null);
  const [pickupSuggestions, setPickupSuggestions] = useState([]);
  const [locatingGps, setLocatingGps] = useState(false);

  const [dropLoc,   setDropLoc]   = useState("");
  const [dropCoord, setDropCoord] = useState(null);
  const [dropSuggestions, setDropSuggestions] = useState([]);

  const pickupDebounceRef = useRef(null);
  const dropDebounceRef   = useRef(null);
  const mapRef = useRef(null);

  // Confirmed delivery timing — "now" until the schedule modal is confirmed
  const [deliveryMode, setDeliveryMode] = useState("now"); // "now" | "scheduled"
  const [scheduledAt, setScheduledAt]   = useState(null);  // Date, only set once confirmed

  // Draft state, live only while the schedule modal is open
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  // Bumped each time the modal opens — used as a React `key` on the wheel
  // columns so they remount fresh at the right initial scroll position.
  const [modalToken, setModalToken] = useState(0);
  const [draftDate, setDraftDate]     = useState(todayMidnight());
  const [draftHour, setDraftHour]     = useState(null);
  const [draftMinute, setDraftMinute] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  // Tracks whether the "Now" card is the active choice *inside the modal* —
  // separate from the confirmed deliveryMode so it can untick live as soon
  // as the user starts touching the date/hour/minute/period pickers below.
  const [draftIsNow, setDraftIsNow] = useState(true);

  // ── Live distance + database pricing ─────────────────────────────────
  const [distanceKm, setDistanceKm] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [pricingList, setPricingList] = useState([]);
  const [pricingLoading, setPricingLoading] = useState(true);

  // Step 2
  const [vehicle, setVehicle] = useState(null);

  // Step 3
  const [religion,      setReligion]      = useState(null);
  const [flowerDecor,   setFlowerDecor]   = useState(false);
  const [priestArrange, setPriestArrange] = useState(false);
  const [iceBox,        setIceBox]        = useState(false);

  const selectedVehicle  = VEHICLE_TYPES.find(v => v.id === vehicle) || null;
  const selectedReligion = RELIGIONS.find(r => r.id === religion);

  // 1. Auto-fill pickup location on mount
  useEffect(() => {
    (async () => {
      setLocatingGps(true);
      try {
        const granted = await ensureLocationPermission();
        if (!granted) return;
        let loc;
        try {
          loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        } catch {
          loc = await Location.getLastKnownPositionAsync();
        }
        if (!loc) return;
        const coord = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        const { address } = await reverseGeocode(coord.latitude, coord.longitude);
        setPickupCoord(coord);
        if (address) setPickupLoc(address);
      } catch {
        // GPS/geocoding unavailable — the pickup field stays empty for manual search
      } finally {
        setLocatingGps(false);
      }
    })();
  }, []);

  // Live database pricing — fetched once, matched per vehicle type by calcFare()
  useEffect(() => {
    setPricingLoading(true);
    fetch(PRICING_API)
      .then(res => res.json())
      .then(data => setPricingList(data?.pricing || []))
      .catch(() => setPricingList([]))
      .finally(() => setPricingLoading(false));
  }, []);

  // 3. Distance recalculated live the moment both pickup and drop are set
  useEffect(() => {
    if (!pickupCoord || !dropCoord) {
      setDistanceKm(null);
      return;
    }
    setRouteLoading(true);
    getRouteInfo(pickupCoord, dropCoord)
      .then(info => setDistanceKm(info.distance))
      .catch(() => setDistanceKm(null))
      .finally(() => setRouteLoading(false));
  }, [pickupCoord, dropCoord]);

  // Auto-fit the map to both pins the moment they're both available
  useEffect(() => {
    if (!pickupCoord || !dropCoord) return;
    mapRef.current?.fitToCoordinates([pickupCoord, dropCoord], {
      edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
      animated: true,
    });
  }, [pickupCoord, dropCoord]);

  // Live per-vehicle price — null until distance + pricing are both ready,
  // or if no matching /api/pricing document exists for that vehicle yet.
  function livePriceFor(typeId) {
    if (!typeId || distanceKm == null || pricingLoading) return null;
    const { total } = calcFare(typeId, distanceKm, pricingList);
    return total > 0 ? total : null;
  }

  function handleLocationChange(text, target) {
    if (target === "pickup") { setPickupLoc(text); setPickupCoord(null); }
    else { setDropLoc(text); setDropCoord(null); }

    const debounceRef   = target === "pickup" ? pickupDebounceRef : dropDebounceRef;
    const setSuggestions = target === "pickup" ? setPickupSuggestions : setDropSuggestions;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 3) { setSuggestions([]); return; }

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `${AUTOCOMPLETE_API}?input=${encodeURIComponent(text)}&key=${PLACES_KEY}&language=en&components=country:in`
        );
        const data = await res.json();
        setSuggestions(data.predictions || []);
      } catch {
        setSuggestions([]);
      }
    }, SEARCH_DEBOUNCE_MS);
  }

  async function handleSelectSuggestion(prediction, target) {
    const label = prediction.structured_formatting?.main_text || prediction.description;
    if (target === "pickup") { setPickupLoc(label); setPickupSuggestions([]); }
    else { setDropLoc(label); setDropSuggestions([]); }

    try {
      const res = await fetch(`${PLACE_DETAILS_API}?place_id=${prediction.place_id}&fields=geometry&key=${PLACES_KEY}`);
      const data = await res.json();
      if (data.result?.geometry) {
        const coord = {
          latitude: data.result.geometry.location.lat,
          longitude: data.result.geometry.location.lng,
        };
        if (target === "pickup") setPickupCoord(coord);
        else setDropCoord(coord);
      }
    } catch {}
  }

  async function useCurrentLocationForPickup() {
    setLocatingGps(true);
    try {
      const granted = await ensureLocationPermission();
      if (!granted) {
        Alert.alert("Permission needed", "Enable location access to auto-fill the pickup address.");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coord = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      const { address } = await reverseGeocode(coord.latitude, coord.longitude);
      setPickupCoord(coord);
      if (address) setPickupLoc(address);
      mapRef.current?.animateToRegion({ ...coord, latitudeDelta: 0.02, longitudeDelta: 0.02 }, 600);
    } catch {
      Alert.alert("Location unavailable", "Could not fetch your current location. Please search for the address instead.");
    } finally {
      setLocatingGps(false);
    }
  }

  // Opens the slide-up schedule modal, seeding the draft from whatever was
  // last confirmed (or the next available time slot if nothing was picked yet)
  function openScheduleModal() {
    if (scheduledAt) {
      const d = new Date(scheduledAt);
      d.setHours(0, 0, 0, 0);
      let h = scheduledAt.getHours();
      const ap = h >= 12 ? "PM" : "AM";
      h = h % 12 || 12;
      setDraftDate(d);
      setDraftHour(h);
      setDraftMinute(scheduledAt.getMinutes());
      setSelectedPeriod(ap);
    } else {
      const next = getNextHalfHourSlot();
      const d = new Date(next);
      d.setHours(0, 0, 0, 0);
      let h = next.getHours();
      const ap = h >= 12 ? "PM" : "AM";
      h = h % 12 || 12;
      setDraftDate(d);
      setDraftHour(h);
      setDraftMinute(next.getMinutes());
      setSelectedPeriod(ap);
    }
    setDraftIsNow(deliveryMode === "now");
    setModalToken(t => t + 1);
    setShowScheduleModal(true);
  }

  function handleQuickNow() {
    setDraftIsNow(true);
    setDeliveryMode("now");
    setScheduledAt(null);
    setShowScheduleModal(false);
  }

  function selectDraftDate(d) {
    setDraftDate(d);
    setDraftIsNow(false);
  }

  function selectDraftHour(h) {
    setDraftHour(h);
    setDraftIsNow(false);
  }

  function selectDraftMinute(m) {
    setDraftMinute(m);
    setDraftIsNow(false);
  }

  function selectDraftPeriod(ap) {
    setSelectedPeriod(ap);
    setDraftIsNow(false);
  }

  function handleConfirmSchedule() {
    if (draftIsNow) {
      handleQuickNow();
      return;
    }
    if (draftHour == null || draftMinute == null || !selectedPeriod) {
      Alert.alert("", "Please select a time.");
      return;
    }
    if (isTimePast(draftHour, draftMinute, selectedPeriod, draftDate)) {
      Alert.alert("", "Please select a future time.");
      return;
    }
    let h24 = draftHour;
    if (selectedPeriod === "AM" && draftHour === 12) h24 = 0;
    else if (selectedPeriod === "PM" && draftHour !== 12) h24 = draftHour + 12;
    const finalDateTime = new Date(draftDate);
    finalDateTime.setHours(h24, draftMinute, 0, 0);
    setScheduledAt(finalDateTime);
    setDeliveryMode("scheduled");
    setShowScheduleModal(false);
  }

  const canNext =
    cur === "location"    ? pickupLoc.trim().length > 0 && dropLoc.trim().length > 0 && !!pickupCoord && !!dropCoord
                             && !!vehicle && livePriceFor(selectedVehicle?.typeId) != null :
    cur === "preferences" ? !!religion :
    cur === "review"      ? true : false;

  function handleNext() {
    if (step < STEPS.length) setStep(step + 1);
    else handleSubmit();
  }

  function handleBack() {
    if (step > 1) setStep(step - 1);
    else navigation?.goBack();
  }

  function handleSubmit() {
    Alert.alert(
      "Request submitted",
      "Our team will contact you within 30 minutes to confirm the arrangements.",
      [{ text: "OK", onPress: () => navigation?.goBack() }]
    );
  }

  const selectedVehiclePrice = livePriceFor(selectedVehicle?.typeId);

  const scheduleBtnLabel = deliveryMode === "scheduled" && scheduledAt
    ? formatScheduledLabel(scheduledAt)
    : "Now";
  const dateChips   = buildDateChips();
  const dateIndex   = Math.max(0, dateChips.findIndex(d => d.toDateString() === draftDate.toDateString()));
  const hourIndex   = Math.max(0, HOURS.indexOf(draftHour));
  const minuteIndex = Math.max(0, MINUTES.indexOf(draftMinute));
  const periodIndex = Math.max(0, PERIODS.indexOf(selectedPeriod));
  const canConfirmSchedule = draftHour != null && draftMinute != null && !!selectedPeriod;

  return (
    <View style={styles.container}>

      {/* Map — very first thing on screen, edge to edge, location step
          only. Renders instantly on the Bengaluru default region, then
          auto-fits to both pins once they're resolved. Back button and
          title float on top of it as an absolute-positioned overlay. */}
      {cur === "location" && (
        <View style={styles.mapWrapper}>
          <MapView
            ref={mapRef}
            provider={PROVIDER_GOOGLE}
            style={styles.map}
            initialRegion={DEFAULT_REGION}
          >
            {pickupCoord && <Marker coordinate={pickupCoord} title="Pickup" description={pickupLoc} pinColor={COLORS.green} />}
            {dropCoord && <Marker coordinate={dropCoord} title="Drop" description={dropLoc} pinColor={COLORS.red} />}
          </MapView>
          {(pickupCoord && dropCoord) && (
            <View style={styles.mapDistBadge}>
              {routeLoading
                ? <ActivityIndicator size="small" color={COLORS.red} />
                : <Text style={styles.mapDistBadgeText}>{distanceKm != null ? `${distanceKm.toFixed(1)} km` : ""}</Text>}
            </View>
          )}

          <TouchableOpacity style={styles.backBtnOverlay} onPress={handleBack}>
            <Text style={{ color: COLORS.text, fontSize: 20 }}>←</Text>
          </TouchableOpacity>
          <View style={styles.titleOverlay}>
            <Text style={styles.title}>Antim Yatra</Text>
            <Text style={styles.stepLbl}>Step {step} of {STEPS.length}</Text>
          </View>

          <TouchableOpacity
            style={[styles.gpsBtn, locatingGps && { opacity: 0.6 }]}
            onPress={useCurrentLocationForPickup}
            disabled={locatingGps}
          >
            {locatingGps
              ? <ActivityIndicator size="small" color={COLORS.red} />
              : <Text style={{ fontSize: 20 }}>🎯</Text>}
          </TouchableOpacity>
        </View>
      )}

      {/* Header — normal flow, shown on steps that have no map */}
      {cur !== "location" && (
        <View style={[styles.header, { paddingTop: 50 }]}>
          <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
            <Text style={{ color: COLORS.text, fontSize: 20 }}>←</Text>
          </TouchableOpacity>
          <View>
            <Text style={styles.title}>Antim Yatra</Text>
            <Text style={styles.stepLbl}>Step {step} of {STEPS.length}</Text>
          </View>
        </View>
      )}

      {/* Summary bar — step 2 onward, live price */}
      {step > 1 && selectedVehicle && (
        <View style={styles.fareBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fareLbl}>
              {selectedVehicle.name}
              {`  ·  ${scheduleBtnLabel}`}
              {distanceKm != null ? `  ·  ${distanceKm.toFixed(1)} km` : ""}
            </Text>
            <Text style={styles.fareAmt}>
              {selectedVehiclePrice != null ? `₹${selectedVehiclePrice.toLocaleString("en-IN")}` : "—"}
            </Text>
          </View>
          <View style={styles.fareTag}><Text style={styles.fareTagText}>LIVE</Text></View>
        </View>
      )}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 18 }}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Step 1: Location ── */}
        {cur === "location" && (
          <>
            {/* Pickup + drop, one combined card, directly below the map —
                same layout as DestinationScreen's input row: card on the
                left, Now/Schedule pill at the same row level on the right. */}
            <View style={styles.locationCardRow}>
              <View style={styles.locationCard}>
                <LocationInputRow
                  dotColor="#22c55e"
                  placeholder="Home / hospital address"
                  value={pickupLoc}
                  suggestions={pickupSuggestions}
                  onChangeText={t => handleLocationChange(t, "pickup")}
                  onSelectSuggestion={p => handleSelectSuggestion(p, "pickup")}
                />

                <View style={styles.locationDivider} />

                <LocationInputRow
                  dotColor={COLORS.red}
                  placeholder="Cremation ground / burial ground"
                  value={dropLoc}
                  suggestions={dropSuggestions}
                  onChangeText={t => handleLocationChange(t, "drop")}
                  onSelectSuggestion={p => handleSelectSuggestion(p, "drop")}
                />
              </View>

              <TouchableOpacity style={styles.nowBtn} onPress={openScheduleModal} activeOpacity={0.85}>
                <Text style={styles.nowBtnIco}>🕐</Text>
                <Text style={styles.nowBtnTxt} numberOfLines={1}>{scheduleBtnLabel}</Text>
              </TouchableOpacity>
            </View>

            {/* Vehicle cards — always shown */}
            <Text style={[styles.q, { fontSize: 16, marginTop: 14 }]}>Select Vehicle</Text>
            <Text style={styles.qHint}>Choose the hearse that fits your requirements</Text>

            {VEHICLE_TYPES.map(v => {
              const price = livePriceFor(v.typeId);
              const disabled = !routeLoading && !pricingLoading && price == null;
              return (
                <TouchableOpacity
                  key={v.id}
                  style={[styles.opt, vehicle === v.id && styles.optActive, disabled && { opacity: 0.4 }]}
                  onPress={() => !disabled && setVehicle(v.id)}
                  disabled={disabled}
                  activeOpacity={0.75}
                >
                  <View style={styles.optIcon}>
                    <Text style={{ fontSize: 26 }}>{v.icon}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.optName}>{v.name}</Text>
                    <Text style={styles.optDesc}>{v.desc}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 8 }}>
                    {(routeLoading || pricingLoading)
                      ? <ActivityIndicator size="small" color={COLORS.red} />
                      : (
                        <Text style={[styles.optPrice, vehicle === v.id && styles.optPriceActive]}>
                          {price != null ? `₹${price.toLocaleString("en-IN")}` : "Pricing unavailable"}
                        </Text>
                      )}
                    <View style={[styles.radio, vehicle === v.id && styles.radioActive]}>
                      {vehicle === v.id && <View style={styles.radioDot} />}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {/* ── Step 2: Religion & Additional Services ── */}
        {cur === "preferences" && (
          <>
            <Text style={styles.q}>Religion & Services</Text>
            <Text style={styles.qHint}>Select religion for ceremony arrangement and any additional services</Text>

            <Text style={styles.sectionTitle}>Religion *</Text>
            <View style={styles.chipGrid}>
              {RELIGIONS.map(r => (
                <TouchableOpacity
                  key={r.id}
                  style={[styles.chip, religion === r.id && styles.chipActive]}
                  onPress={() => setReligion(r.id)}
                >
                  <Text style={[styles.chipText, religion === r.id && styles.chipTextActive]}>
                    {r.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Additional services</Text>

            <View style={styles.serviceCard}>
              <View style={styles.switchRow}>
                <Text style={styles.switchIcon}>🌸</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchLabel}>Flower decoration</Text>
                  <Text style={styles.switchDesc}>Floral arrangement on the hearse</Text>
                </View>
                <Switch
                  value={flowerDecor}
                  onValueChange={setFlowerDecor}
                  trackColor={{ false: "rgba(0,0,0,0.1)", true: COLORS.red }}
                  thumbColor={COLORS.white}
                />
              </View>

              <View style={styles.divider} />

              <View style={styles.switchRow}>
                <Text style={styles.switchIcon}>🙏</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchLabel}>Priest arrangement</Text>
                  <Text style={styles.switchDesc}>Qualified priest for last rites ceremony</Text>
                </View>
                <Switch
                  value={priestArrange}
                  onValueChange={setPriestArrange}
                  trackColor={{ false: "rgba(0,0,0,0.1)", true: COLORS.red }}
                  thumbColor={COLORS.white}
                />
              </View>

              <View style={styles.divider} />

              <View style={styles.switchRow}>
                <Text style={styles.switchIcon}>❄️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchLabel}>Ice box</Text>
                  <Text style={styles.switchDesc}>Preservation during transport</Text>
                </View>
                <Switch
                  value={iceBox}
                  onValueChange={setIceBox}
                  trackColor={{ false: "rgba(0,0,0,0.1)", true: COLORS.red }}
                  thumbColor={COLORS.white}
                />
              </View>
            </View>
          </>
        )}

        {/* ── Step 3: Review & Submit ── */}
        {cur === "review" && (
          <>
            <Text style={styles.q}>Review & Confirm</Text>
            <Text style={styles.qHint}>Please review your booking details before submitting</Text>

            {/* Route summary */}
            <View style={styles.reviewCard}>
              <View style={styles.reviewCardHeader}>
                <Text style={styles.reviewCardIcon}>🗺️</Text>
                <Text style={styles.reviewCardTitle}>Route & Date</Text>
              </View>
              <SummaryRow label="Pickup" value={pickupLoc} />
              <SummaryRow label="Drop"   value={dropLoc} />
              <SummaryRow label="Distance" value={distanceKm != null ? `${distanceKm.toFixed(1)} km` : "—"} />
              <SummaryRow label="Schedule" value={scheduleBtnLabel} />
            </View>

            {/* Vehicle summary */}
            <View style={styles.reviewCard}>
              <View style={styles.reviewCardHeader}>
                <Text style={styles.reviewCardIcon}>{selectedVehicle?.icon}</Text>
                <Text style={styles.reviewCardTitle}>Vehicle</Text>
              </View>
              <SummaryRow label="Type"    value={selectedVehicle?.name ?? "—"} />
              <SummaryRow label="Details" value={selectedVehicle?.desc ?? "—"} />
            </View>

            {/* Preferences summary */}
            <View style={styles.reviewCard}>
              <View style={styles.reviewCardHeader}>
                <Text style={styles.reviewCardIcon}>🕉️</Text>
                <Text style={styles.reviewCardTitle}>Preferences</Text>
              </View>
              <SummaryRow label="Religion" value={selectedReligion?.label ?? "—"} />
              <SummaryRow
                label="Add-ons"
                value={
                  [flowerDecor && "Flower decoration", priestArrange && "Priest arrangement", iceBox && "Ice box"]
                    .filter(Boolean).join(", ") || "None"
                }
              />
            </View>

            {/* Price card — fully live, no hardcoded rate */}
            <View style={styles.priceCard}>
              <Text style={styles.priceCardTitle}>💰  Estimated price</Text>
              <View style={styles.priceRow}>
                <Text style={styles.priceRowLabel}>{selectedVehicle?.name}</Text>
                <Text style={styles.priceRowValue}>
                  {selectedVehiclePrice != null ? `₹${selectedVehiclePrice.toLocaleString("en-IN")}` : "—"}
                </Text>
              </View>
              {(flowerDecor || priestArrange || iceBox) && (
                <View style={styles.priceRow}>
                  <Text style={styles.priceRowLabel}>Additional services</Text>
                  <Text style={styles.priceRowValue}>As applicable</Text>
                </View>
              )}
              <View style={styles.priceDivider} />
              <View style={styles.priceRow}>
                <Text style={styles.priceTotalLabel}>Base total</Text>
                <Text style={styles.priceTotalValue}>
                  {selectedVehiclePrice != null ? `₹${selectedVehiclePrice.toLocaleString("en-IN")}` : "—"}
                </Text>
              </View>
              <Text style={styles.priceNote}>Final quote confirmed by our team within 30 minutes.</Text>
            </View>
          </>
        )}

        <View style={{ height: 16 }} />
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.btn, !canNext && { opacity: 0.4 }]}
          disabled={!canNext}
          onPress={handleNext}
        >
          <Text style={styles.btnText}>
            {cur === "review"
              ? "🕉️  Request Antim Yatra Service"
              : "Next →"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Slide-up schedule modal */}
      <Modal
        visible={showScheduleModal}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={() => setShowScheduleModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowScheduleModal(false)} />

          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />

            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Schedule Antim Yatra</Text>
              <TouchableOpacity onPress={() => setShowScheduleModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.nowQuickBtn, !draftIsNow && styles.nowQuickBtnInactive]}
              onPress={handleQuickNow}
              activeOpacity={0.8}
            >
              <Text style={styles.nowQuickIcon}>⚡</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.nowQuickTitle}>Now</Text>
                <Text style={styles.nowQuickSub}>Get the hearse as soon as possible</Text>
              </View>
              {draftIsNow && <Text style={styles.nowQuickCheck}>✓</Text>}
            </TouchableOpacity>

            <View style={styles.wheelHeaderRow}>
              <Text style={[styles.wheelHeaderText, { flex: 1.3 }]}>DATE</Text>
              <Text style={[styles.wheelHeaderText, { flex: 0.7 }]}>HOUR</Text>
              <Text style={[styles.wheelHeaderText, { flex: 0.8 }]}>MIN</Text>
              <Text style={[styles.wheelHeaderText, { flex: 0.7 }]}>AM/PM</Text>
            </View>

            <View style={styles.wheelRow}>
              <View style={styles.wheelHighlight} pointerEvents="none" />

              <View style={{ flex: 1.3 }}>
                <WheelColumn
                  key={`date-${modalToken}`}
                  data={dateChips}
                  initialIndex={dateIndex}
                  onChangeIndex={i => selectDraftDate(dateChips[i])}
                  renderLabel={d => (d.toDateString() === todayMidnight().toDateString()
                    ? "Today"
                    : `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MON_NAMES[d.getMonth()]}`)}
                />
              </View>

              <View style={{ flex: 0.7 }}>
                <WheelColumn
                  key={`hour-${modalToken}`}
                  data={HOURS}
                  initialIndex={hourIndex}
                  onChangeIndex={i => selectDraftHour(HOURS[i])}
                  renderLabel={h => String(h)}
                  isPastIndex={i => selectedPeriod != null && isTimePast(HOURS[i], 45, selectedPeriod, draftDate)}
                />
              </View>

              <View style={{ flex: 0.8 }}>
                <WheelColumn
                  key={`minute-${modalToken}`}
                  data={MINUTES}
                  initialIndex={minuteIndex}
                  onChangeIndex={i => selectDraftMinute(MINUTES[i])}
                  renderLabel={m => `:${String(m).padStart(2, "0")}`}
                  isPastIndex={i => draftHour != null && selectedPeriod != null && isTimePast(draftHour, MINUTES[i], selectedPeriod, draftDate)}
                />
              </View>

              <View style={{ flex: 0.7 }}>
                <WheelColumn
                  key={`period-${modalToken}`}
                  data={PERIODS}
                  initialIndex={periodIndex}
                  onChangeIndex={i => selectDraftPeriod(PERIODS[i])}
                  renderLabel={ap => ap}
                  isPastIndex={i => isTimePast(11, 45, PERIODS[i], draftDate)}
                />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.confirmScheduleBtn, !canConfirmSchedule && { opacity: 0.4 }]}
              disabled={!canConfirmSchedule}
              onPress={handleConfirmSchedule}
            >
              <Text style={styles.confirmScheduleBtnText}>Confirm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  // Header
  header: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 18 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,0.06)", alignItems: "center", justifyContent: "center" },
  title: { color: COLORS.text, fontSize: 20, fontWeight: "700" },
  stepLbl: { color: COLORS.grayDim, fontSize: 11, marginTop: 2 },

  // Header overlay — floats on top of the map on the location step
  backBtnOverlay: { position: "absolute", top: 50, left: 16, width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.white, alignItems: "center", justifyContent: "center", elevation: 4, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  titleOverlay: { position: "absolute", top: 50, left: 66, right: 16, backgroundColor: COLORS.white, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8, elevation: 4, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },

  // Summary fare bar
  fareBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginHorizontal: 18, marginBottom: 8, padding: 14, backgroundColor: "rgba(232,25,44,0.1)", borderWidth: 1, borderColor: "rgba(232,25,44,0.3)", borderRadius: 14 },
  fareLbl: { color: COLORS.gray, fontSize: 11, marginBottom: 2 },
  fareAmt: { color: COLORS.text, fontSize: 22, fontWeight: "800" },
  fareTag: { backgroundColor: "rgba(232,25,44,0.2)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100 },
  fareTagText: { color: COLORS.red, fontSize: 10, fontWeight: "800", letterSpacing: 1 },

  // Step headings
  q: { color: COLORS.text, fontSize: 19, fontWeight: "700", marginBottom: 6 },
  qHint: { color: COLORS.grayDim, fontSize: 12, marginBottom: 16 },

  // Pickup + drop combined card — one rounded box with both fields
  // stacked inside and a divider between them, "Now"/Schedule pill sitting
  // to its right at the same row level. Same layout as DestinationScreen.
  locationCardRow: { flexDirection: "row", gap: 10, marginBottom: 6 },
  locationCard: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.05)",
    borderRadius: 16, borderWidth: 1, borderColor: "rgba(0,0,0,0.1)",
    paddingHorizontal: 14,
  },
  locationDivider: { height: 0.5, backgroundColor: "rgba(0,0,0,0.1)" },
  addressRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13 },
  locationDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  searchInput: { flex: 1, color: COLORS.text, fontSize: 13 },

  nowBtn: {
    width: 60, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.05)", borderRadius: 16,
    borderWidth: 1, borderColor: "rgba(0,0,0,0.1)",
  },
  nowBtnIco: { fontSize: 18, marginBottom: 2 },
  nowBtnTxt: { fontSize: 10, fontWeight: "700", color: COLORS.text },

  suggestionsBox: { backgroundColor: COLORS.white, borderRadius: 12, overflow: "hidden", elevation: 4, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, marginTop: 4 },
  suggRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.05)" },
  suggIcon: { fontSize: 14 },
  suggMain: { color: COLORS.text, fontSize: 13, fontWeight: "500" },
  suggSub: { color: COLORS.grayDim, fontSize: 11, marginTop: 2 },

  // Live route map — top half of the screen, edge to edge, no padding
  mapWrapper: { height: "45%" },
  map: { flex: 1 },
  mapDistBadge: { position: "absolute", bottom: 10, right: 10, backgroundColor: COLORS.white, borderRadius: 100, paddingHorizontal: 10, paddingVertical: 5, elevation: 3, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  mapDistBadgeText: { color: COLORS.text, fontSize: 11, fontWeight: "700" },
  gpsBtn: { position: "absolute", bottom: 16, right: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.white, alignItems: "center", justifyContent: "center", elevation: 5, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },

  // Vehicle option cards
  opt: { flexDirection: "row", alignItems: "center", gap: 14, padding: 15, backgroundColor: "rgba(0,0,0,0.03)", borderRadius: 14, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)", marginBottom: 10 },
  optActive: { borderColor: "rgba(232,25,44,0.5)", backgroundColor: "rgba(232,25,44,0.08)" },
  optIcon: { width: 48, height: 48, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.05)", alignItems: "center", justifyContent: "center" },
  optName: { color: COLORS.text, fontWeight: "600", fontSize: 15 },
  optDesc: { color: COLORS.grayDim, fontSize: 12, marginTop: 3 },
  optPrice: { color: COLORS.grayDim, fontSize: 15, fontWeight: "700" },
  optPriceActive: { color: COLORS.red },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: "rgba(0,0,0,0.3)", alignItems: "center", justifyContent: "center" },
  radioActive: { borderColor: COLORS.red },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: COLORS.red },

  // Religion chips
  sectionTitle: { color: COLORS.grayDim, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 },
  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, borderWidth: 0.5, borderColor: "rgba(0,0,0,0.1)", backgroundColor: "rgba(0,0,0,0.03)" },
  chipActive: { backgroundColor: "rgba(232,25,44,0.15)", borderColor: "rgba(232,25,44,0.5)" },
  chipText: { color: COLORS.grayDim, fontSize: 13 },
  chipTextActive: { color: COLORS.red, fontWeight: "600" },

  // Additional services card
  serviceCard: { backgroundColor: "rgba(0,0,0,0.03)", borderWidth: 0.5, borderColor: "rgba(0,0,0,0.08)", borderRadius: 14, padding: 16 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 },
  switchIcon: { fontSize: 20 },
  switchLabel: { color: COLORS.text, fontSize: 14, fontWeight: "600", marginBottom: 2 },
  switchDesc: { color: COLORS.grayDim, fontSize: 12, lineHeight: 17, paddingRight: 8 },
  divider: { height: 0.5, backgroundColor: "rgba(0,0,0,0.07)", marginVertical: 14 },

  // Review cards
  reviewCard: { backgroundColor: "rgba(0,0,0,0.03)", borderWidth: 0.5, borderColor: "rgba(0,0,0,0.08)", borderRadius: 14, padding: 16, marginBottom: 10 },
  reviewCardHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  reviewCardIcon: { fontSize: 18 },
  reviewCardTitle: { color: COLORS.text, fontSize: 14, fontWeight: "600" },
  sumRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
  sumLabel: { color: COLORS.grayDim, fontSize: 12, flex: 0.35 },
  sumValue: { color: COLORS.text, fontSize: 12, fontWeight: "500", flex: 0.65, textAlign: "right" },

  // Price card
  priceCard: { backgroundColor: "rgba(0,0,0,0.03)", borderWidth: 0.5, borderColor: "rgba(232,25,44,0.3)", borderRadius: 16, padding: 18, marginBottom: 8 },
  priceCardTitle: { color: "#2563eb", fontSize: 13, fontWeight: "700", marginBottom: 14 },
  priceRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  priceRowLabel: { color: COLORS.grayDim, fontSize: 13 },
  priceRowValue: { color: COLORS.text, fontSize: 13, fontWeight: "600" },
  priceDivider: { height: 0.5, backgroundColor: "rgba(0,0,0,0.1)", marginVertical: 10 },
  priceTotalLabel: { color: COLORS.text, fontSize: 16, fontWeight: "700" },
  priceTotalValue: { color: COLORS.red, fontSize: 24, fontWeight: "800" },
  priceNote: { color: "#3b82f6", fontSize: 11, lineHeight: 17, marginTop: 10 },

  // Footer
  footer: { padding: 18 },
  btn: { backgroundColor: COLORS.red, borderRadius: 12, paddingVertical: 16, alignItems: "center" },
  btnText: { color: COLORS.white, fontSize: 16, fontWeight: "700" },

  // Schedule modal
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: COLORS.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 28, maxHeight: "85%" },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(0,0,0,0.15)", alignSelf: "center", marginBottom: 14 },
  modalHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  modalTitle: { color: COLORS.text, fontSize: 18, fontWeight: "700" },
  modalClose: { color: COLORS.grayDim, fontSize: 16, padding: 4 },

  nowQuickBtn: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: "rgba(232,25,44,0.06)", borderWidth: 1, borderColor: "rgba(232,25,44,0.25)", borderRadius: 14, marginBottom: 18 },
  nowQuickBtnInactive: { backgroundColor: "rgba(0,0,0,0.03)", borderColor: "rgba(0,0,0,0.08)" },
  nowQuickIcon: { fontSize: 20 },
  nowQuickTitle: { color: COLORS.text, fontSize: 14, fontWeight: "700" },
  nowQuickSub: { color: COLORS.grayDim, fontSize: 11, marginTop: 2 },
  nowQuickCheck: { color: COLORS.red, fontSize: 16, fontWeight: "800" },

  // Wheel picker — Date / Hour / Minute / AM-PM columns
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
