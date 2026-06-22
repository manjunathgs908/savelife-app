import React, { useState, useRef, useEffect } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, TextInput, StyleSheet, ActivityIndicator, Modal, Alert, Animated,
} from "react-native";
import MapView, { PROVIDER_GOOGLE } from "react-native-maps";
import * as Location from "expo-location";
import { COLORS } from "../theme";

// Unrestricted key — for HTTP API calls (Places, Geocoding)
const PLACES_KEY = "AIzaSyB8wxgXxQxskgUZG868g_4Qdsezr07i9yA";

const BOX_TYPES = [
  { id: "normal",   icon: "❄️", name: "Normal Box",        desc: "Basic freezer box for standard use" },
  { id: "standard", icon: "🧊", name: "Standard Box",      desc: "Enhanced insulation with digital monitoring" },
  { id: "vip",      icon: "💎", name: "VIP / Digital Box", desc: "Premium digital freezer with advanced features" },
];

// Maps the local box id above to the boxId string stored in the MongoDB
// durations/floors collections — kept in sync with the same map in
// FreezerBoxBookingScreen.js.
const BOX_ID_MAP = { normal: "normal_box", standard: "standard_box", vip: "vip_digital_box" };

const DEFAULT_REGION = {
  latitude: 12.9716, longitude: 77.5946, latitudeDelta: 0.05, longitudeDelta: 0.05,
};

const GEOCODE_DEBOUNCE_MS = 400;
const SEARCH_DEBOUNCE_MS = 350;

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

async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${PLACES_KEY}`
    );
    const data = await res.json();
    if (data.results?.length) {
      const result = data.results[0];
      const cityComponent = result.address_components.find(
        c => c.types.includes("locality") || c.types.includes("administrative_area_level_2")
      );
      const pincodeComponent = result.address_components.find(c => c.types.includes("postal_code"));
      return {
        address: result.formatted_address,
        city: cityComponent ? cityComponent.long_name : null,
        pincode: pincodeComponent ? pincodeComponent.long_name : null,
      };
    }
  } catch {}
  return { address: null, city: null, pincode: null };
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

export default function FreezerBoxScreen({ navigation }) {
  const [selectedBox, setSelectedBox] = useState(null);

  const [markerCoord, setMarkerCoord] = useState({ latitude: DEFAULT_REGION.latitude, longitude: DEFAULT_REGION.longitude });
  const [confirmedAddress, setConfirmedAddress] = useState(null);
  const [resolvedCity, setResolvedCity] = useState(null);
  const [resolvedPincode, setResolvedPincode] = useState(null);
  const [locationConfirmed, setLocationConfirmed] = useState(false);
  const [geocoding, setGeocoding] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions]   = useState([]);
  const [searching, setSearching]       = useState(false);
  const [locatingGps, setLocatingGps]   = useState(false);

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
  const [selectedPeriod, setSelectedPeriod]     = useState(null);
  // Tracks whether the "Now" card is the active choice *inside the modal* —
  // separate from the confirmed deliveryMode so it can untick live as soon
  // as the user starts touching the date/hour/minute/period pickers below.
  const [draftIsNow, setDraftIsNow] = useState(true);

  const mapRef = useRef(null);
  const geoDebounceRef    = useRef(null);
  const searchDebounceRef = useRef(null);

  // Fetches a fresh GPS fix, recenters the map, and moves the pin there —
  // moving the pin in turn triggers the silent reverse-geocode effect below.
  async function goToCurrentLocation() {
    setLocatingGps(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const coord = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setMarkerCoord(coord);
        mapRef.current?.animateToRegion({ ...coord, latitudeDelta: 0.02, longitudeDelta: 0.02 }, 600);
      } catch {
        const last = await Location.getLastKnownPositionAsync();
        if (last) {
          const coord = { latitude: last.coords.latitude, longitude: last.coords.longitude };
          setMarkerCoord(coord);
          mapRef.current?.animateToRegion({ ...coord, latitudeDelta: 0.02, longitudeDelta: 0.02 }, 600);
        }
      }
    } finally {
      setLocatingGps(false);
    }
  }

  // Initial GPS fix on mount
  useEffect(() => {
    goToCurrentLocation();
  }, []);

  // Silent auto reverse-geocode — fires whenever the center pin settles
  // (initial GPS fix, manual drag, or a search selection).
  useEffect(() => {
    if (geoDebounceRef.current) clearTimeout(geoDebounceRef.current);
    geoDebounceRef.current = setTimeout(async () => {
      setGeocoding(true);
      const { address, city, pincode } = await reverseGeocode(markerCoord.latitude, markerCoord.longitude);
      setGeocoding(false);
      if (address) {
        setConfirmedAddress(address);
        setResolvedCity(city);
        setResolvedPincode(pincode);
        setLocationConfirmed(true);
      } else {
        setLocationConfirmed(false);
      }
    }, GEOCODE_DEBOUNCE_MS);
    return () => clearTimeout(geoDebounceRef.current);
  }, [markerCoord]);

  // Keep the search box pre-filled with whatever address the pin resolves to
  useEffect(() => {
    if (confirmedAddress) setSearchQuery(confirmedAddress);
  }, [confirmedAddress]);

  function handleRegionChange(region) {
    setMarkerCoord({ latitude: region.latitude, longitude: region.longitude });
  }

  async function searchPlaces(text) {
    setSearchQuery(text);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (text.length < 2) { setSuggestions([]); return; }
    searchDebounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `https://maps.googleapis.com/maps/api/place/autocomplete/json` +
          `?input=${encodeURIComponent(text)}&key=${PLACES_KEY}&language=en&components=country:in`
        );
        const data = await res.json();
        setSuggestions(data.predictions || []);
      } catch {}
      setSearching(false);
    }, SEARCH_DEBOUNCE_MS);
  }

  async function selectPlace(prediction) {
    setSuggestions([]);
    setSearchQuery(prediction.structured_formatting?.main_text || prediction.description);
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json` +
        `?place_id=${prediction.place_id}&fields=geometry&key=${PLACES_KEY}`
      );
      const data = await res.json();
      if (data.result?.geometry) {
        const coord = {
          latitude: data.result.geometry.location.lat,
          longitude: data.result.geometry.location.lng,
        };
        setMarkerCoord(coord);
        mapRef.current?.animateToRegion({ ...coord, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 600);
      }
    } catch {}
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

  function handleProceed() {
    navigation.navigate("FreezerBoxBooking", {
      selectedBox,
      selectedBoxId: BOX_ID_MAP[selectedBox?.id] || selectedBox?.id,
      markerCoord,
      confirmedAddress,
      resolvedCity,
      selectedDeliveryType: deliveryMode,
      scheduledDate: deliveryMode === "scheduled" && scheduledAt ? scheduledAt.toISOString() : null,
    });
  }

  const canProceed = locationConfirmed && !!selectedBox;
  const scheduleBtnLabel = deliveryMode === "scheduled" && scheduledAt
    ? formatScheduledLabel(scheduledAt)
    : "Now";
  const dateChips = buildDateChips();
  const dateIndex   = Math.max(0, dateChips.findIndex(d => d.toDateString() === draftDate.toDateString()));
  const hourIndex   = Math.max(0, HOURS.indexOf(draftHour));
  const minuteIndex = Math.max(0, MINUTES.indexOf(draftMinute));
  const periodIndex = Math.max(0, PERIODS.indexOf(selectedPeriod));
  const canConfirmSchedule = draftHour != null && draftMinute != null && !!selectedPeriod;

  return (
    <View style={styles.container}>

      {/* Map — pure, uninterrupted view, top ~52% */}
      <View style={styles.mapWrapper}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          initialRegion={DEFAULT_REGION}
          onRegionChangeComplete={handleRegionChange}
        />
        <View style={styles.fixedPinContainer} pointerEvents="none">
          <View style={styles.pinShadow} />
          <View style={styles.pinHead} />
          <View style={styles.pinTail} />
        </View>

        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={{ color: COLORS.text, fontSize: 20 }}>←</Text>
        </TouchableOpacity>

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

      {/* Address search bar + inline schedule button — pre-filled from the resolved pin location */}
      <View style={styles.addressBarWrap}>
        <View style={styles.addressRow}>
          <View style={styles.searchBar}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search address, area or landmark..."
              placeholderTextColor={COLORS.grayDim}
              value={searchQuery}
              onChangeText={searchPlaces}
              autoCorrect={false}
            />
            {(geocoding || searching) && <ActivityIndicator size="small" color={COLORS.red} />}
            {searchQuery.length > 0 && !geocoding && !searching && (
              <TouchableOpacity onPress={() => { setSearchQuery(""); setSuggestions([]); }}>
                <Text style={styles.searchClear}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity style={styles.scheduleInlineBtn} onPress={openScheduleModal} activeOpacity={0.8}>
            <Text style={styles.scheduleInlineIcon}>🕒</Text>
            <Text style={styles.scheduleInlineText} numberOfLines={1}>{scheduleBtnLabel}</Text>
          </TouchableOpacity>
        </View>

        {/* Autocomplete suggestions */}
        {suggestions.length > 0 && (
          <View style={styles.suggestionsBox}>
            {suggestions.map(item => (
              <TouchableOpacity key={item.place_id} style={styles.suggRow} onPress={() => selectPlace(item)}>
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

      {/* Box type selection */}
      <View style={styles.bottomSheet}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <Text style={styles.q}>Select Box Type</Text>
          <Text style={styles.qHint}>Rates and floor charges are confirmed on the next step</Text>

          {BOX_TYPES.map(box => (
            <TouchableOpacity
              key={box.id}
              style={[styles.opt, selectedBox?.id === box.id && styles.optActive]}
              onPress={() => setSelectedBox(box)}
            >
              <View style={styles.optIcon}><Text style={{ fontSize: 26 }}>{box.icon}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.optName}>{box.name}</Text>
                <Text style={styles.optDesc}>{box.desc}</Text>
              </View>
              <View style={[styles.radio, selectedBox?.id === box.id && styles.radioActive]}>
                {selectedBox?.id === box.id && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.btn, !canProceed && { opacity: 0.4 }]}
          disabled={!canProceed}
          onPress={handleProceed}
        >
          <Text style={styles.btnText}>Proceed to Booking Details →</Text>
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
              <Text style={styles.modalTitle}>Schedule Freezer Box</Text>
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
                <Text style={styles.nowQuickSub}>Get the freezer box as soon as possible</Text>
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

  // Map
  mapWrapper: { height: "52%" },
  map: { ...StyleSheet.absoluteFillObject },
  fixedPinContainer: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  pinShadow: { width: 18, height: 5, borderRadius: 9, backgroundColor: "rgba(0,0,0,0.25)", marginTop: 30, marginBottom: -35 },
  pinHead: { width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.red, borderWidth: 2.5, borderColor: "#fff" },
  pinTail: { width: 3, height: 12, backgroundColor: COLORS.red, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },

  // Back button — floating top-left, on the map only
  backBtn: { position: "absolute", top: 50, left: 16, width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.white, alignItems: "center", justifyContent: "center", elevation: 4, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },

  // Live-location button — floating bottom-right, on the map only
  gpsBtn: { position: "absolute", bottom: 16, right: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.white, alignItems: "center", justifyContent: "center", elevation: 5, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },

  // Address search bar — static flow, directly below the map
  addressBarWrap: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 4, zIndex: 10 },
  addressRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  searchBar: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(0,0,0,0.05)", borderWidth: 1, borderColor: "rgba(0,0,0,0.1)", borderRadius: 14, paddingHorizontal: 14, height: 46 },
  searchIcon: { fontSize: 14 },
  searchInput: { flex: 1, color: COLORS.text, fontSize: 13 },
  searchClear: { color: COLORS.grayDim, fontSize: 13, paddingHorizontal: 4 },

  // Inline Ola-style schedule button — right of the search bar
  scheduleInlineBtn: { width: 64, height: 46, borderRadius: 14, backgroundColor: "rgba(0,0,0,0.05)", borderWidth: 1, borderColor: "rgba(0,0,0,0.1)", alignItems: "center", justifyContent: "center" },
  scheduleInlineIcon: { fontSize: 14 },
  scheduleInlineText: { color: COLORS.text, fontSize: 10, fontWeight: "700", marginTop: 2 },

  // Suggestions dropdown — overlays the box list below it
  suggestionsBox: { position: "absolute", top: 60, left: 18, right: 18, backgroundColor: COLORS.white, borderRadius: 12, overflow: "hidden", elevation: 6, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
  suggRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.05)" },
  suggIcon: { fontSize: 15 },
  suggMain: { color: COLORS.text, fontSize: 13, fontWeight: "500" },
  suggSub: { color: COLORS.grayDim, fontSize: 11, marginTop: 2 },

  // Bottom sheet
  bottomSheet: { flex: 1, paddingHorizontal: 18, paddingTop: 14 },
  q: { color: COLORS.text, fontSize: 19, fontWeight: "700", marginBottom: 6 },
  qHint: { color: COLORS.grayDim, fontSize: 12, marginBottom: 14 },

  opt: { flexDirection: "row", alignItems: "center", gap: 12, padding: 15, backgroundColor: "rgba(0,0,0,0.03)", borderRadius: 14, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)", marginBottom: 10 },
  optActive: { borderColor: "rgba(232,25,44,0.5)", backgroundColor: "rgba(232,25,44,0.08)" },
  optIcon: { width: 48, height: 48, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.05)", alignItems: "center", justifyContent: "center" },
  optName: { color: COLORS.text, fontWeight: "600", fontSize: 15 },
  optDesc: { color: COLORS.grayDim, fontSize: 12, marginTop: 3 },
  optRate: { color: COLORS.text, fontSize: 13, fontWeight: "700", marginRight: 4 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: "rgba(0,0,0,0.3)", alignItems: "center", justifyContent: "center" },
  radioActive: { borderColor: COLORS.red },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: COLORS.red },

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
