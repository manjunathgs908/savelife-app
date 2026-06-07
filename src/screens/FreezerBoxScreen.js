import React, { useState, useRef, useEffect } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, TextInput,
  StyleSheet, Alert, ActivityIndicator, Modal, Animated,
} from "react-native";
import MapView, { PROVIDER_GOOGLE } from "react-native-maps";
import { COLORS } from "../theme";

const GOOGLE_MAPS_KEY = process.env.GOOGLE_MAPS_API_KEY || "AIzaSyDbfZSXgpZqZy3pzyt2Is0b1YWZQduy8dY";
const PROFILE_DEFAULTS = { name: "Manjunath", phone: "+91 90088 65545" };

const BOX_TYPES = [
  { id: "normal",   name: "Normal Box",        icon: "❄️", desc: "Basic freezer box for standard use" },
  { id: "standard", name: "Standard Box",      icon: "🧊", desc: "Enhanced insulation with digital monitoring" },
  { id: "vip",      name: "VIP / Digital Box", icon: "💎", desc: "Premium digital freezer with advanced features" },
];

const DURATIONS = [
  { id: "4-12", label: "4 – 12 Hours",       multiplier: 1, discount: 0.20, embalming: false, tag: "20% off" },
  { id: "24",   label: "24 Hours (1 Day)",   multiplier: 1, discount: 0,    embalming: false, tag: null },
  { id: "48",   label: "48 Hours (2 Days)",  multiplier: 2, discount: 0.30, embalming: true,  tag: "30% off" },
  { id: "72",   label: "72 Hours (3 Days)",  multiplier: 3, discount: 0.30, embalming: true,  tag: "30% off" },
  { id: "96",   label: "96 Hours (4 Days)",  multiplier: 4, discount: 0.30, embalming: true,  tag: "30% off" },
  { id: "120",  label: "120 Hours (5 Days)", multiplier: 5, discount: 0.30, embalming: true,  tag: "30% off" },
];

const FLOORS = [
  { id: "ground", label: "Ground Floor",    charge: 0    },
  { id: "1st",    label: "1st Floor",       charge: 600  },
  { id: "2nd",    label: "2nd Floor",       charge: 1000 },
  { id: "3rd",    label: "3rd Floor",       charge: 1200 },
  { id: "above",  label: "Above 3rd Floor", charge: 1500 },
];

const PRICING = {
  normal:   { normal: 2500, vip: 3000 },
  standard: { normal: 3500, vip: 4000 },
  vip:      { normal: 7000, vip: 9000 },
};

const DEFAULT_REGION = {
  latitude: 12.9716, longitude: 77.5946, latitudeDelta: 0.05, longitudeDelta: 0.05,
};

const DAY_NAMES   = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON_NAMES   = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MINUTE_OPTS = [0, 15, 30, 45];

function formatDateLabel(d) {
  return `${DAY_NAMES[d.getDay()]}, ${d.getDate()} ${MON_NAMES[d.getMonth()]}`;
}

function getNextAvailableTime() {
  const now = new Date();
  const h24 = now.getHours() + 1 >= 24 ? 0 : now.getHours() + 1;
  const h12 = h24 === 0 ? 12 : (h24 > 12 ? h24 - 12 : h24);
  return { h: h12, m: 0, ap: h24 >= 12 ? "PM" : "AM" };
}

function isTimePast12(h12, min, ap) {
  let h24 = h12;
  if (ap === "AM" && h12 === 12) h24 = 0;
  else if (ap === "PM" && h12 !== 12) h24 = h12 + 12;
  const check = new Date();
  check.setHours(h24, min, 0, 0);
  return check <= new Date();
}

const STEPS = ["boxtype", "datetime", "duration", "location", "floor"];

async function loadUserProfile() {
  try {
    const AsyncStorage = require("@react-native-async-storage/async-storage").default;
    const name  = await AsyncStorage.getItem("user_name");
    const phone = await AsyncStorage.getItem("user_phone");
    return { name: name || PROFILE_DEFAULTS.name, phone: phone || PROFILE_DEFAULTS.phone };
  } catch {
    return PROFILE_DEFAULTS;
  }
}

async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_KEY}`
    );
    const data = await res.json();
    if (data.results?.length) return data.results[0].formatted_address;
  } catch {}
  return null;
}

function computeBill(boxType, duration, areaVip, floor) {
  if (!boxType || !duration || !floor) return null;
  const rates = PRICING[boxType];
  const dur = DURATIONS.find(d => d.id === duration);
  const fl  = FLOORS.find(f => f.id === floor);
  const baseRate = areaVip ? rates.vip : rates.normal;
  const rentBeforeDiscount = baseRate * dur.multiplier;
  const discountAmt = Math.round(rentBeforeDiscount * dur.discount);
  const rentAfterDiscount = rentBeforeDiscount - discountAmt;
  const embalmingCharge = dur.embalming ? 2500 : 0;
  const helperCharge = fl.charge;
  const total = rentAfterDiscount + embalmingCharge + helperCharge;
  return {
    rentBeforeDiscount, discountPercent: dur.discount * 100,
    discountAmt, rentAfterDiscount, embalmingCharge, helperCharge, total,
  };
}

const BillRow = ({ label, value, green }) => (
  <View style={styles.billRow}>
    <Text style={styles.billLabel}>{label}</Text>
    <Text style={[styles.billValue, green && { color: COLORS.green }]}>{value}</Text>
  </View>
);

const OptCard = ({ icon, name, desc, selected, onPress }) => (
  <TouchableOpacity style={[styles.opt, selected && styles.optActive]} onPress={onPress}>
    {icon ? (
      <View style={styles.optIcon}><Text style={{ fontSize: 26 }}>{icon}</Text></View>
    ) : null}
    <View style={{ flex: 1 }}>
      <Text style={styles.optName}>{name}</Text>
      {desc ? <Text style={styles.optDesc}>{desc}</Text> : null}
    </View>
    <View style={[styles.radio, selected && styles.radioActive]}>
      {selected && <View style={styles.radioDot} />}
    </View>
  </TouchableOpacity>
);

export default function FreezerBoxScreen({ navigation }) {
  const [step, setStep] = useState(1);
  const cur = STEPS[step - 1];

  const [boxType, setBoxType]       = useState(null);
  const [selectedDate, setSelectedDate]   = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return d; });
  const [calMonthOffset, setCalMonthOffset] = useState(0);
  const [timeHour, setTimeHour]     = useState(null);
  const [timeMinute, setTimeMinute] = useState(null);
  const [timeAmPm, setTimeAmPm]     = useState(null);
  const [duration, setDuration]     = useState(null);

  const [markerCoord, setMarkerCoord]         = useState({ latitude: DEFAULT_REGION.latitude, longitude: DEFAULT_REGION.longitude });
  const [confirmedAddress, setConfirmedAddress] = useState(null);
  const [areaVip, setAreaVip]                 = useState(false);
  const [locationConfirmed, setLocationConfirmed] = useState(false);
  const [geocoding, setGeocoding]             = useState(false);

  const [floor, setFloor]           = useState(null);
  const [userProfile, setUserProfile] = useState(PROFILE_DEFAULTS);
  const [submitting, setSubmitting]  = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [bookingPhase, setBookingPhase] = useState("searching");

  const pulseAnim   = useRef(new Animated.Value(1)).current;
  const iconMoveAnim = useRef(new Animated.Value(0)).current;
  const dotPulseAnim = useRef(new Animated.Value(1)).current;

  const [searchQuery, setSearchQuery]   = useState("");
  const [suggestions, setSuggestions]   = useState([]);
  const [searching, setSearching]       = useState(false);

  const mapRef     = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => { loadUserProfile().then(setUserProfile); }, []);

  useEffect(() => {
    if (!showOverlay) return;
    if (bookingPhase === "searching") {
      pulseAnim.setValue(1);
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.35, duration: 650, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1,    duration: 650, useNativeDriver: true }),
        ])
      );
      anim.start();
      return () => anim.stop();
    }
  }, [showOverlay, bookingPhase]);

  useEffect(() => {
    if (!showOverlay || bookingPhase !== "confirmed") return;
    iconMoveAnim.setValue(0);
    dotPulseAnim.setValue(1);
    const move = Animated.loop(
      Animated.sequence([
        Animated.timing(iconMoveAnim, { toValue: 14,  duration: 500, useNativeDriver: true }),
        Animated.timing(iconMoveAnim, { toValue: -14, duration: 500, useNativeDriver: true }),
        Animated.timing(iconMoveAnim, { toValue: 0,   duration: 400, useNativeDriver: true }),
      ])
    );
    const dot = Animated.loop(
      Animated.sequence([
        Animated.timing(dotPulseAnim, { toValue: 0.25, duration: 550, useNativeDriver: true }),
        Animated.timing(dotPulseAnim, { toValue: 1,    duration: 550, useNativeDriver: true }),
      ])
    );
    move.start();
    dot.start();
    return () => { move.stop(); dot.stop(); };
  }, [showOverlay, bookingPhase]);

  useEffect(() => {
    if (!selectedDate) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (selectedDate.toDateString() === today.toDateString()) {
      const { h, m, ap } = getNextAvailableTime();
      setTimeHour(h);
      setTimeMinute(m);
      setTimeAmPm(ap);
    } else {
      setTimeHour(null);
      setTimeMinute(null);
      setTimeAmPm(null);
    }
  }, [selectedDate]);

  async function searchPlaces(text) {
    setSearchQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.length < 2) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `https://maps.googleapis.com/maps/api/place/autocomplete/json` +
          `?input=${encodeURIComponent(text)}&key=${GOOGLE_MAPS_KEY}&language=en&components=country:in`
        );
        const data = await res.json();
        setSuggestions(data.predictions || []);
      } catch {}
      setSearching(false);
    }, 350);
  }

  async function selectPlace(prediction) {
    setSuggestions([]);
    setSearchQuery(prediction.structured_formatting?.main_text || prediction.description);
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json` +
        `?place_id=${prediction.place_id}&fields=geometry&key=${GOOGLE_MAPS_KEY}`
      );
      const data = await res.json();
      if (data.result?.geometry) {
        const coord = {
          latitude: data.result.geometry.location.lat,
          longitude: data.result.geometry.location.lng,
        };
        setMarkerCoord(coord);
        mapRef.current?.animateToRegion({ ...coord, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 600);
        if (locationConfirmed) { setLocationConfirmed(false); setConfirmedAddress(null); }
      }
    } catch {}
  }

  const canNext =
    cur === "boxtype"   ? !!boxType :
    cur === "datetime"  ? !!selectedDate && timeHour !== null && timeMinute !== null && timeAmPm !== null :
    cur === "duration"  ? !!duration :
    cur === "location"  ? locationConfirmed :
    cur === "floor"     ? !!floor : false;

  function handleNext() {
    if (step < STEPS.length) {
      setStep(step + 1);
    } else {
      handleSubmit();
    }
  }

  function handleBack() {
    if (step > 1) setStep(step - 1);
    else navigation.goBack();
  }

  async function handleConfirmLocation() {
    setGeocoding(true);
    const address = await reverseGeocode(markerCoord.latitude, markerCoord.longitude);
    setGeocoding(false);
    if (!address) {
      Alert.alert("Error", "Could not resolve address. Check your connection and try again.");
      return;
    }
    setConfirmedAddress(address);
    setAreaVip(markerCoord.latitude > 12.9800);
    setLocationConfirmed(true);
  }

  function handleRegionChange(region) {
    setMarkerCoord({ latitude: region.latitude, longitude: region.longitude });
    if (locationConfirmed) {
      setLocationConfirmed(false);
      setConfirmedAddress(null);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setBookingPhase("searching");
    setShowOverlay(true);
    setSubmitting(false);
    setTimeout(() => setBookingPhase("confirmed"), 3000);
  }

  function handleCancelBooking() {
    setShowOverlay(false);
    setBookingPhase("searching");
    navigation.goBack();
  }

  const bill = computeBill(boxType, duration, areaVip, floor);

  const selectedBox = BOX_TYPES.find(b => b.id === boxType);
  const selectedDur = DURATIONS.find(d => d.id === duration);

  const todayMidnight = (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })();
  const isTodaySelected = !!selectedDate && selectedDate.toDateString() === todayMidnight.toDateString();
  const dateChips = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(todayMidnight);
    d.setDate(d.getDate() + i);
    return d;
  });

  return (
    <View style={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
          <Text style={{ color: COLORS.white, fontSize: 20 }}>←</Text>
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>Freezer Box</Text>
          <Text style={styles.stepLbl}>Step {step} of {STEPS.length}</Text>
        </View>
      </View>

      {/* Progress dots */}
      <View style={styles.dots}>
        {STEPS.map((_, i) => (
          <View key={i} style={[styles.dot, {
            backgroundColor: i < step ? COLORS.red : "rgba(255,255,255,0.12)",
            width: i === step - 1 ? 28 : 8,
          }]} />
        ))}
      </View>

      {/* Summary bar — visible from step 2 onward */}
      {step > 1 && selectedBox && (
        <View style={styles.fareBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fareLbl}>
              {selectedBox.name}
              {selectedDate ? `  ·  ${formatDateLabel(selectedDate)}` : ""}
              {selectedDur  ? `  ·  ${selectedDur.label}` : ""}
            </Text>
            {bill
              ? <Text style={styles.fareAmt}>₹{bill.total.toLocaleString()}</Text>
              : <Text style={styles.fareAmtDim}>Select all options to see total</Text>}
          </View>
          {bill && (
            <View style={styles.fareTag}><Text style={styles.fareTagText}>LIVE</Text></View>
          )}
        </View>
      )}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 18 }}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Step 1: Box Type ── */}
        {cur === "boxtype" && (
          <>
            <Text style={styles.q}>Select Box Type</Text>
            <Text style={styles.qHint}>Choose the freezer box that suits your needs</Text>
            {BOX_TYPES.map(box => (
              <OptCard key={box.id} icon={box.icon} name={box.name} desc={box.desc}
                selected={boxType === box.id} onPress={() => setBoxType(box.id)} />
            ))}
          </>
        )}

        {/* ── Step 2: Date & Time ── */}
        {cur === "datetime" && (
          <>
            <Text style={styles.q}>Date & Time</Text>

            {/* Date chips — horizontal scroll */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.dateChipScroll}
              contentContainerStyle={{ gap: 6, paddingHorizontal: 2, paddingBottom: 4 }}
            >
              {dateChips.map((d, i) => {
                const isSel   = selectedDate && d.toDateString() === selectedDate.toDateString();
                const isToday = d.toDateString() === todayMidnight.toDateString();
                return (
                  <TouchableOpacity
                    key={i}
                    style={[styles.dateChip, isSel && styles.dateChipSel]}
                    onPress={() => setSelectedDate(d)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.dateChipDay, isSel && { color: "rgba(255,255,255,0.8)" }]}>
                      {isToday ? "TODAY" : DAY_NAMES[d.getDay()].toUpperCase()}
                    </Text>
                    <Text style={[styles.dateChipNum, isSel && { color: COLORS.white }]}>
                      {d.getDate()}
                    </Text>
                    <Text style={[styles.dateChipMon, isSel && { color: "rgba(255,255,255,0.7)" }]}>
                      {MON_NAMES[d.getMonth()]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* ── Time picker ── */}
            <View style={styles.timeDivider} />

            {/* AM / PM toggle */}
            <Text style={styles.dtLabel}>AM / PM</Text>
            <View style={styles.ampmRow}>
              {["AM", "PM"].map(ap => {
                const isPast = isTodaySelected && isTimePast12(11, 45, ap);
                const isSel  = timeAmPm === ap;
                return (
                  <TouchableOpacity
                    key={ap}
                    style={[styles.ampmBtn, isSel && styles.ampmBtnSel, isPast && !isSel && styles.ampmBtnPast]}
                    onPress={() => {
                      if (isPast) { Alert.alert("", "Please select a future time"); return; }
                      setTimeAmPm(ap);
                      if (timeHour !== null && isTimePast12(timeHour, 45, ap)) setTimeHour(null);
                      if (timeHour !== null && timeMinute !== null && isTimePast12(timeHour, timeMinute, ap)) setTimeMinute(null);
                    }}
                    activeOpacity={isPast ? 1 : 0.75}
                  >
                    <Text style={[styles.ampmText, isSel && { color: COLORS.white }]}>{ap}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Hour grid 4×3 */}
            <Text style={styles.dtLabel}>Hour</Text>
            <View style={styles.hourGrid}>
              {[1,2,3,4,5,6,7,8,9,10,11,12].map(h => {
                const isSel  = timeHour === h;
                const isPast = isTodaySelected && timeAmPm !== null && isTimePast12(h, 45, timeAmPm);
                return (
                  <TouchableOpacity
                    key={h}
                    style={[styles.hourChip, isSel && styles.hourChipSel, isPast && !isSel && styles.hourChipPast]}
                    onPress={() => {
                      if (isPast) { Alert.alert("", "Please select a future time"); return; }
                      setTimeHour(h);
                      if (timeMinute !== null && timeAmPm !== null && isTimePast12(h, timeMinute, timeAmPm)) setTimeMinute(null);
                    }}
                    activeOpacity={isPast ? 1 : 0.75}
                  >
                    <Text style={[styles.hourChipText, isSel && styles.hourChipTextSel]}>{h}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Minute chips */}
            <Text style={styles.dtLabel}>Minute</Text>
            <View style={styles.minRow}>
              {MINUTE_OPTS.map(m => {
                const isSel  = timeMinute === m;
                const isPast = isTodaySelected && timeHour !== null && timeAmPm !== null && isTimePast12(timeHour, m, timeAmPm);
                return (
                  <TouchableOpacity
                    key={m}
                    style={[styles.minChip, isSel && styles.minChipSel, isPast && !isSel && styles.minChipPast]}
                    onPress={() => {
                      if (isPast) { Alert.alert("", "Please select a future time"); return; }
                      setTimeMinute(m);
                    }}
                    activeOpacity={isPast ? 1 : 0.75}
                  >
                    <Text style={[styles.minChipText, isSel && { color: COLORS.white, fontWeight: "800" }]}>
                      :{String(m).padStart(2, "0")}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Info message */}
            {selectedDate && (
              selectedDate.toDateString() === todayMidnight.toDateString() ? (
                <View style={styles.infoBoxGreen}>
                  <Text style={styles.infoBoxIcon}>⚡</Text>
                  <Text style={styles.infoBoxTextGreen}>Immediate service — team will arrive shortly</Text>
                </View>
              ) : (
                <View style={styles.infoBoxBlue}>
                  <Text style={styles.infoBoxIcon}>📅</Text>
                  <Text style={styles.infoBoxTextBlue}>Advance booking — our team will call you to confirm</Text>
                </View>
              )
            )}
          </>
        )}

        {/* ── Step 3: Duration ── */}
        {cur === "duration" && (
          <>
            <Text style={styles.q}>Select Duration</Text>
            <Text style={styles.qHint}>Longer durations include embalming service</Text>
            {DURATIONS.map(dur => (
              <OptCard key={dur.id} name={dur.label}
                desc={dur.tag
                  ? `${dur.tag}${dur.embalming ? "  ·  Embalming ₹2,500 included" : ""}`
                  : null}
                selected={duration === dur.id} onPress={() => setDuration(dur.id)} />
            ))}
          </>
        )}

        {/* ── Step 3: Map Location ── */}
        {cur === "location" && (
          <>
            <Text style={styles.q}>Select Location</Text>
            <Text style={styles.qHint}>Search your address or move the map to pin your exact delivery location.</Text>

            {/* Search bar */}
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
              {searching && <ActivityIndicator size="small" color={COLORS.red} style={{ marginRight: 4 }} />}
              {searchQuery.length > 0 && !searching && (
                <TouchableOpacity onPress={() => { setSearchQuery(""); setSuggestions([]); }}>
                  <Text style={styles.searchClear}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Autocomplete suggestions */}
            {suggestions.length > 0 && (
              <View style={styles.suggestionsBox}>
                {suggestions.map(item => (
                  <TouchableOpacity
                    key={item.place_id}
                    style={styles.suggRow}
                    onPress={() => selectPlace(item)}
                  >
                    <Text style={styles.suggIcon}>📍</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.suggMain} numberOfLines={1}>
                        {item.structured_formatting?.main_text || item.description}
                      </Text>
                      {item.structured_formatting?.secondary_text ? (
                        <Text style={styles.suggSub} numberOfLines={1}>
                          {item.structured_formatting.secondary_text}
                        </Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Map with fixed center pin */}
            <View style={styles.mapWrapper}>
              <MapView
                ref={mapRef}
                provider={PROVIDER_GOOGLE}
                style={styles.map}
                initialRegion={DEFAULT_REGION}
                onRegionChangeComplete={handleRegionChange}
              />
              {/* Fixed pin overlay — Uber/Ola style */}
              <View style={styles.fixedPinContainer} pointerEvents="none">
                <View style={styles.pinShadow} />
                <View style={styles.pinHead} />
                <View style={styles.pinTail} />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.confirmBtn, geocoding && { opacity: 0.6 }]}
              onPress={handleConfirmLocation}
              disabled={geocoding}
            >
              {geocoding
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.confirmBtnText}>📍 Confirm Location</Text>}
            </TouchableOpacity>

            {locationConfirmed && confirmedAddress && (
              <View style={styles.addressCard}>
                <View style={styles.addressRow}>
                  <Text style={styles.addressIcon}>✓</Text>
                  <Text style={styles.addressText} numberOfLines={3}>{confirmedAddress}</Text>
                </View>
              </View>
            )}
          </>
        )}

        {/* ── Step 4: Floor + User Card + Bill ── */}
        {cur === "floor" && (
          <>
            <Text style={styles.q}>Floor Selection</Text>
            <Text style={styles.qHint}>
              {boxType === "vip"
                ? "VIP Box includes elevator/ground level service only"
                : "Helper charges apply for upper floors"}
            </Text>

            {boxType === "vip" && (
              <View style={styles.vipFloorNote}>
                <Text style={styles.vipFloorNoteIcon}>💎</Text>
                <Text style={styles.vipFloorNoteText}>VIP Box includes elevator/ground level service only</Text>
              </View>
            )}

            {(boxType === "vip" ? FLOORS.filter(f => f.id === "ground") : FLOORS).map(fl => (
              <TouchableOpacity key={fl.id}
                style={[styles.opt, floor === fl.id && styles.optActive]}
                onPress={() => setFloor(fl.id)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.optName}>{fl.label}</Text>
                </View>
                <Text style={fl.charge === 0 ? styles.freeTag : styles.chargeTag}>
                  {fl.charge === 0 ? "Free" : `₹${fl.charge.toLocaleString()}`}
                </Text>
                <View style={[styles.radio, floor === fl.id && styles.radioActive]}>
                  {floor === fl.id && <View style={styles.radioDot} />}
                </View>
              </TouchableOpacity>
            ))}

            {/* Bill breakdown — appears after floor selected */}
            {bill && (
              <View style={styles.billCard}>
                <Text style={styles.billTitle}>Bill Breakdown</Text>
                <BillRow label="Base Rent" value={`₹${bill.rentBeforeDiscount.toLocaleString()}`} />
                {bill.discountAmt > 0 && (
                  <BillRow
                    label={`Discount (${bill.discountPercent}%)`}
                    value={`– ₹${bill.discountAmt.toLocaleString()}`}
                    green
                  />
                )}
                {bill.embalmingCharge > 0 && (
                  <BillRow label="Embalming Charge" value={`₹${bill.embalmingCharge.toLocaleString()}`} />
                )}
                {bill.helperCharge > 0 && (
                  <BillRow label="Helper Charge" value={`₹${bill.helperCharge.toLocaleString()}`} />
                )}
                <View style={styles.billDivider} />
                <View style={styles.billTotalRow}>
                  <Text style={styles.billTotalLabel}>TOTAL</Text>
                  <Text style={styles.billTotal}>₹{bill.total.toLocaleString()}</Text>
                </View>
              </View>
            )}
          </>
        )}

      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.btn, (!canNext || submitting) && { opacity: 0.4 }]}
          disabled={!canNext || submitting}
          onPress={handleNext}
        >
          {submitting
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>
                {cur === "floor"
                  ? bill
                    ? `Request Freezer Box  ·  ₹${bill.total.toLocaleString()}`
                    : "Request Freezer Box"
                  : "Next →"}
              </Text>}
        </TouchableOpacity>
      </View>

      {/* ── Booking overlay ── */}
      <Modal visible={showOverlay} animationType="fade" statusBarTranslucent transparent>
        <View style={styles.ovBg}>

          {bookingPhase === "searching" ? (
            /* ── Searching phase ── */
            <View style={styles.ovSearching}>
              <Animated.Text style={[styles.ovEmoji, { transform: [{ scale: pulseAnim }] }]}>
                ❄️
              </Animated.Text>
              <Text style={styles.ovSearchTitle}>Finding nearest freezer box team</Text>
              <Text style={styles.ovSearchSub}>Our team is being assigned  •  Please wait</Text>
              {confirmedAddress ? (
                <View style={styles.ovAddrRow}>
                  <Text style={styles.ovAddrIcon}>📍</Text>
                  <Text style={styles.ovAddrText} numberOfLines={2}>{confirmedAddress}</Text>
                </View>
              ) : null}
              <ActivityIndicator color={COLORS.red} size="small" style={{ marginTop: 28 }} />
            </View>

          ) : (
            /* ── Confirmed phase ── */
            <View style={styles.ovConfirmed}>

              {/* LIVE badge */}
              <View style={styles.ovLiveBadge}>
                <View style={styles.ovLiveDot} />
                <Text style={styles.ovLiveText}>LIVE</Text>
              </View>

              {/* Moving icon */}
              <Animated.Text style={[styles.ovEmoji, { transform: [{ translateX: iconMoveAnim }], marginTop: 32 }]}>
                ❄️
              </Animated.Text>

              {/* ETA row */}
              <View style={styles.ovEtaRow}>
                <View style={styles.ovEtaBox}>
                  <Text style={styles.ovEtaNum}>5</Text>
                  <Text style={styles.ovEtaUnit}>min</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 16 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Animated.View style={[styles.ovBlueDot, { opacity: dotPulseAnim }]} />
                    <Text style={styles.ovEtaStatus}>Team on the way</Text>
                  </View>
                  <Text style={styles.ovEtaSub}>Ravi Kumar is heading to your location</Text>
                </View>
              </View>

              {/* Team card */}
              <View style={styles.ovTeamCard}>
                <View style={styles.ovTeamAvatar}>
                  <Text style={{ fontSize: 24 }}>👤</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={styles.ovTeamName}>Ravi Kumar</Text>
                  <Text style={styles.ovTeamInfo}>Freezer Box  •  KA-01-AB-1234</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
                    <Text style={styles.ovTeamStar}>★</Text>
                    <Text style={styles.ovTeamRating}>4.9</Text>
                  </View>
                </View>
                <View style={styles.ovTeamBtns}>
                  <TouchableOpacity style={styles.ovCallBtn} activeOpacity={0.8}>
                    <Text style={{ fontSize: 18 }}>📞</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.ovMsgBtn} activeOpacity={0.8}>
                    <Text style={{ fontSize: 18 }}>💬</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Cancel */}
              <TouchableOpacity style={styles.ovCancelBtn} onPress={handleCancelBooking} activeOpacity={0.8}>
                <Text style={styles.ovCancelText}>Cancel Booking</Text>
              </TouchableOpacity>

            </View>
          )}

        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingTop: 50 },

  // Header
  header: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 18 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  title: { color: COLORS.white, fontSize: 20, fontWeight: "700" },
  stepLbl: { color: COLORS.grayDim, fontSize: 11, marginTop: 2 },

  // Progress dots
  dots: { flexDirection: "row", gap: 6, paddingHorizontal: 18, paddingVertical: 14, alignItems: "center" },
  dot: { height: 8, borderRadius: 4 },

  // Summary fare bar
  fareBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginHorizontal: 18, marginBottom: 8, padding: 14, backgroundColor: "rgba(232,25,44,0.1)", borderWidth: 1, borderColor: "rgba(232,25,44,0.3)", borderRadius: 14 },
  fareLbl: { color: COLORS.gray, fontSize: 11, marginBottom: 2 },
  fareAmt: { color: COLORS.white, fontSize: 22, fontWeight: "800" },
  fareAmtDim: { color: COLORS.grayDim, fontSize: 12 },
  fareTag: { backgroundColor: "rgba(232,25,44,0.2)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100 },
  fareTagText: { color: COLORS.red, fontSize: 10, fontWeight: "800", letterSpacing: 1 },

  // Step headings
  q: { color: COLORS.white, fontSize: 19, fontWeight: "700", marginBottom: 6 },
  qHint: { color: COLORS.grayDim, fontSize: 12, marginBottom: 16 },

  // Option card
  opt: { flexDirection: "row", alignItems: "center", gap: 14, padding: 15, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", marginBottom: 10 },
  optActive: { borderColor: "rgba(232,25,44,0.5)", backgroundColor: "rgba(232,25,44,0.08)" },
  optIcon: { width: 48, height: 48, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center" },
  optName: { color: COLORS.white, fontWeight: "600", fontSize: 15 },
  optDesc: { color: COLORS.grayDim, fontSize: 12, marginTop: 3 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: "rgba(255,255,255,0.3)", alignItems: "center", justifyContent: "center" },
  radioActive: { borderColor: COLORS.red },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: COLORS.red },
  freeTag: { color: COLORS.green, fontSize: 12, fontWeight: "700", marginRight: 8 },
  chargeTag: { color: COLORS.grayDim, fontSize: 12, fontWeight: "600", marginRight: 8 },
  vipFloorNote: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, marginBottom: 12, backgroundColor: "rgba(232,25,44,0.07)", borderWidth: 0.5, borderColor: "rgba(232,25,44,0.25)", borderRadius: 12 },
  vipFloorNoteIcon: { fontSize: 16 },
  vipFloorNoteText: { color: COLORS.grayDim, fontSize: 12, fontWeight: "500", flex: 1 },

  // Date & Time step — compact
  dateChipScroll: { marginBottom: 10 },
  dateChip: { width: 48, height: 60, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 0.5, borderColor: "rgba(255,255,255,0.08)" },
  dateChipSel: { backgroundColor: COLORS.red, borderColor: COLORS.red },
  dateChipDay: { color: COLORS.grayDim, fontSize: 8, fontWeight: "700", letterSpacing: 0.3, marginBottom: 2 },
  dateChipNum: { color: COLORS.white, fontSize: 17, fontWeight: "800", lineHeight: 20 },
  dateChipMon: { color: COLORS.grayDim, fontSize: 8, marginTop: 2 },
  timeDivider: { height: 0.5, backgroundColor: "rgba(255,255,255,0.08)", marginTop: 6, marginBottom: 16 },
  dtLabel: { color: COLORS.grayDim, fontSize: 10, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 },

  // AM/PM toggle
  ampmRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  ampmBtn: { flex: 1, height: 42, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 0.5, borderColor: "rgba(255,255,255,0.1)", borderRadius: 10 },
  ampmBtnSel: { backgroundColor: COLORS.red, borderColor: COLORS.red },
  ampmBtnPast: { opacity: 0.22 },
  ampmText: { color: COLORS.grayDim, fontSize: 14, fontWeight: "700", letterSpacing: 1.5 },

  // Hour grid 4×3
  hourGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 14 },
  hourChip: { width: "23%", height: 44, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 0.5, borderColor: "rgba(255,255,255,0.1)", borderRadius: 10 },
  hourChipSel: { backgroundColor: COLORS.red, borderColor: COLORS.red },
  hourChipPast: { opacity: 0.22 },
  hourChipText: { color: COLORS.white, fontSize: 16, fontWeight: "600" },
  hourChipTextSel: { color: COLORS.white, fontWeight: "800" },

  // Minute chips
  minRow: { flexDirection: "row", gap: 6, marginBottom: 10 },
  minChip: { flex: 1, height: 42, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 0.5, borderColor: "rgba(255,255,255,0.1)", borderRadius: 10 },
  minChipSel: { backgroundColor: COLORS.red, borderColor: COLORS.red },
  minChipPast: { opacity: 0.22 },
  minChipText: { color: COLORS.white, fontSize: 14, fontWeight: "600" },

  // Info boxes
  infoBoxGreen: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6, padding: 9, backgroundColor: "rgba(34,197,94,0.08)", borderWidth: 0.5, borderColor: "rgba(34,197,94,0.3)", borderRadius: 10 },
  infoBoxBlue: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6, padding: 9, backgroundColor: "rgba(59,130,246,0.08)", borderWidth: 0.5, borderColor: "rgba(59,130,246,0.3)", borderRadius: 10 },
  infoBoxIcon: { fontSize: 13 },
  infoBoxTextGreen: { color: COLORS.green, fontSize: 11, fontWeight: "600", flex: 1 },
  infoBoxTextBlue: { color: "#60a5fa", fontSize: 11, fontWeight: "600", flex: 1 },

  // Search bar
  searchBar: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 6 },
  searchIcon: { fontSize: 15 },
  searchInput: { flex: 1, color: COLORS.white, fontSize: 14 },
  searchClear: { color: COLORS.grayDim, fontSize: 13, paddingHorizontal: 4 },
  suggestionsBox: { backgroundColor: "rgba(13,16,24,0.98)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", borderRadius: 12, marginBottom: 10, overflow: "hidden" },
  suggRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" },
  suggIcon: { fontSize: 15 },
  suggMain: { color: COLORS.white, fontSize: 13, fontWeight: "500" },
  suggSub: { color: COLORS.grayDim, fontSize: 11, marginTop: 2 },

  // Map with fixed center pin
  mapWrapper: { height: 280, borderRadius: 14, overflow: "hidden", marginBottom: 12 },
  map: { ...StyleSheet.absoluteFillObject },
  fixedPinContainer: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  pinShadow: { width: 18, height: 5, borderRadius: 9, backgroundColor: "rgba(0,0,0,0.25)", marginTop: 30, marginBottom: -35 },
  pinHead: { width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.red, borderWidth: 2.5, borderColor: "#fff" },
  pinTail: { width: 3, height: 12, backgroundColor: COLORS.red, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  confirmBtn: { backgroundColor: COLORS.red, borderRadius: 12, padding: 14, alignItems: "center", marginBottom: 12 },
  confirmBtnText: { color: COLORS.white, fontSize: 14, fontWeight: "700" },
  addressCard: { backgroundColor: "rgba(0,0,0,0.4)", borderWidth: 0.5, borderColor: "rgba(255,255,255,0.1)", borderRadius: 12, padding: 14 },
  addressRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  addressIcon: { color: COLORS.green, fontSize: 16, fontWeight: "700", marginTop: 1 },
  addressText: { color: COLORS.white, fontSize: 12, flex: 1, lineHeight: 18 },

  // User card
  userCard: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 0.5, borderColor: "rgba(255,255,255,0.08)", borderRadius: 14, padding: 14, marginTop: 16, marginBottom: 14 },
  userAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.red, alignItems: "center", justifyContent: "center" },
  userAvatarText: { color: COLORS.white, fontSize: 18, fontWeight: "800" },
  userCardLabel: { color: COLORS.grayDim, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 },
  userCardName: { color: COLORS.white, fontSize: 14, fontWeight: "700" },
  userCardPhone: { color: COLORS.grayDim, fontSize: 12, marginTop: 1 },

  // Bill
  billCard: { backgroundColor: "rgba(7,20,34,0.95)", borderWidth: 0.5, borderColor: "rgba(232,25,44,0.3)", borderRadius: 16, padding: 18, marginBottom: 8 },
  billTitle: { color: COLORS.white, fontSize: 15, fontWeight: "700", marginBottom: 14 },
  billRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  billLabel: { color: COLORS.grayDim, fontSize: 13 },
  billValue: { color: COLORS.white, fontSize: 13, fontWeight: "600" },
  billDivider: { height: 0.5, backgroundColor: "rgba(255,255,255,0.1)", marginVertical: 10 },
  billTotalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  billTotalLabel: { color: COLORS.white, fontSize: 16, fontWeight: "700" },
  billTotal: { color: COLORS.red, fontSize: 24, fontWeight: "800" },

  // Footer
  footer: { padding: 18 },
  btn: { backgroundColor: COLORS.red, borderRadius: 12, paddingVertical: 16, alignItems: "center" },
  btnText: { color: COLORS.white, fontSize: 16, fontWeight: "700" },

  // Booking overlay
  ovBg: { flex: 1, backgroundColor: "rgba(5,6,8,0.97)", justifyContent: "center", alignItems: "center", paddingHorizontal: 24 },
  ovEmoji: { fontSize: 72, textAlign: "center" },

  // Searching
  ovSearching: { alignItems: "center", width: "100%" },
  ovSearchTitle: { color: COLORS.white, fontSize: 20, fontWeight: "700", textAlign: "center", marginTop: 28, lineHeight: 28 },
  ovSearchSub: { color: COLORS.grayDim, fontSize: 13, textAlign: "center", marginTop: 10, lineHeight: 20 },
  ovAddrRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 20, paddingHorizontal: 8 },
  ovAddrIcon: { fontSize: 14, marginTop: 1 },
  ovAddrText: { color: COLORS.red, fontSize: 13, fontWeight: "600", flex: 1, textAlign: "center" },

  // Confirmed
  ovConfirmed: { width: "100%", alignItems: "center" },
  ovLiveBadge: { position: "absolute", top: -60, right: 0, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: COLORS.red, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  ovLiveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.white },
  ovLiveText: { color: COLORS.white, fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
  ovEtaRow: { flexDirection: "row", alignItems: "center", width: "100%", marginTop: 28, padding: 18, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 0.5, borderColor: "rgba(255,255,255,0.08)", borderRadius: 16 },
  ovEtaBox: { width: 68, height: 68, borderRadius: 14, backgroundColor: COLORS.red, alignItems: "center", justifyContent: "center" },
  ovEtaNum: { color: COLORS.white, fontSize: 28, fontWeight: "900", lineHeight: 32 },
  ovEtaUnit: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: "600" },
  ovBlueDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#3b82f6" },
  ovEtaStatus: { color: COLORS.white, fontSize: 15, fontWeight: "700" },
  ovEtaSub: { color: COLORS.grayDim, fontSize: 12, marginTop: 4 },
  ovTeamCard: { flexDirection: "row", alignItems: "center", width: "100%", marginTop: 14, padding: 16, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 0.5, borderColor: "rgba(255,255,255,0.08)", borderRadius: 16 },
  ovTeamAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  ovTeamName: { color: COLORS.white, fontSize: 15, fontWeight: "700" },
  ovTeamInfo: { color: COLORS.grayDim, fontSize: 12, marginTop: 2 },
  ovTeamStar: { color: "#f59e0b", fontSize: 13 },
  ovTeamRating: { color: COLORS.white, fontSize: 13, fontWeight: "700" },
  ovTeamBtns: { gap: 10 },
  ovCallBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.red, alignItems: "center", justifyContent: "center" },
  ovMsgBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  ovCancelBtn: { marginTop: 28, paddingVertical: 14, paddingHorizontal: 40, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", borderRadius: 12 },
  ovCancelText: { color: COLORS.grayDim, fontSize: 14, fontWeight: "600" },
});
