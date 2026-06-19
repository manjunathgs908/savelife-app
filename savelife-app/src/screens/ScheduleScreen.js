import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Switch, Alert, FlatList, ActivityIndicator, Modal, Platform,
} from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { COLORS } from "../theme";
import { calcFare, PRICING_API } from "../utils/pricingUtils";
import LocationPickerModal, { PICKUP_RECENT_KEY, DEST_RECENT_KEY } from "../components/LocationPickerModal";

const PLACES_KEY = "AIzaSyB8wxgXxQxskgUZG868g_4Qdsezr07i9yA";

const STEPS = ["trip", "ambulance"];

const TRIP_TYPES = ["One Way", "Round Trip"];
const PURPOSES = [
  { id: "dialysis", label: "💉 Dialysis" },
  { id: "chemo",    label: "🧪 Chemotherapy" },
  { id: "physio",   label: "🦾 Physiotherapy" },
  { id: "checkup",  label: "🩺 Regular Checkup" },
  { id: "other",    label: "— Other" },
];
const AMBULANCE_TYPES = [
  { id: "bls_van",   icon: "🚐", name: "BLS — Maruti Van",      tag: "Basic Life Support",            desc: "Ideal for regular checkups & small clinics" },
  { id: "bls_tempo", icon: "🚌", name: "BLS — Tempo Traveller", tag: "Basic Life Support",            desc: "Larger capacity for patient comfort" },
  { id: "als",       icon: "🏥", name: "ALS",                   tag: "Advanced Life Support",         desc: "For dialysis, chemotherapy patients" },
  { id: "acls",      icon: "❤️", name: "ACLS",                  tag: "Advanced Cardiac Life Support", desc: "Premium support for high-risk patients" },
];

// This screen's catalog ids don't map 1:1 to MongoDB serviceType values —
// the Maruti-Van variant is plain "BLS", and ALS/ACLS only exist as the
// Tempo Traveller variant in the pricing collection.
const SCHEDULE_SERVICE_TYPE = {
  bls_van:   "bls",
  bls_tempo: "bls_tempo",
  als:       "als_tempo",
  acls:      "acls_tempo",
};

const DAYS_S = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONS_S = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
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

function fmtDateOnly(d) {
  if (!d) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dd = new Date(d); dd.setHours(0, 0, 0, 0);
  const diffDays = Math.round((dd - today) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  return `${DAYS_S[d.getDay()]}, ${d.getDate()} ${MONS_S[d.getMonth()]}`;
}

function fmtTimeOnly(d) {
  if (!d) return null;
  return fmt12(d.getHours(), d.getMinutes());
}

function decodePolyline(encoded) {
  const pts = [];
  let i = 0, lat = 0, lng = 0;
  while (i < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = result = 0;
    do { b = encoded.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    pts.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return pts;
}

// ─── Pure-JS date/time wheel picker (ported from DestinationScreen.js) ───────
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

export default function ScheduleScreen({ navigation }) {
  const [step, setStep] = useState(1);
  const cur = STEPS[step - 1];

  // ── Step 1: Trip Details ──
  const [pickupQuery, setPickupQuery] = useState("");
  const [pickupCoord, setPickupCoord] = useState(null);
  const [pickupPickerVisible, setPickupPickerVisible] = useState(false);

  const [dropQuery, setDropQuery] = useState("");
  const [dropCoord, setDropCoord] = useState(null);
  const [dropPickerVisible, setDropPickerVisible] = useState(false);

  const [routeCoords,   setRouteCoords]   = useState([]);
  const [durationText,  setDurationText]  = useState(null);
  const mapRef = useRef(null);

  const [tripType,   setTripType]   = useState("One Way");
  const [returnTime, setReturnTime] = useState("");
  const [purpose,    setPurpose]    = useState(null);

  const [scheduleDate, setScheduleDate] = useState(new Date());
  const [dateChosen, setDateChosen] = useState(false);
  const [timeChosen, setTimeChosen] = useState(false);
  const [pickerMode, setPickerMode] = useState(null);

  // ── Step 2: Ambulance & Patient + Confirm ──
  const [ambulance,   setAmbulance]   = useState(null);
  const [patientName, setPatientName] = useState("");
  const [patientAge,  setPatientAge]  = useState("");
  const [condition,   setCondition]   = useState("");
  const [wheelchair,  setWheelchair]  = useState(false);
  const [stretcher,   setStretcher]   = useState(false);

  const [pricingList, setPricingList] = useState([]);
  const [dist,        setDist]        = useState(null);
  const [distLoading, setDistLoading] = useState(false);

  const selectedAmb     = AMBULANCE_TYPES.find(a => a.id === ambulance);
  const selectedPurpose = PURPOSES.find(p => p.id === purpose);

  // ── Live pricing fetch, once ──
  useEffect(() => {
    fetch(PRICING_API)
      .then(r => r.json())
      .then(d => { if (d.success) setPricingList(d.pricing); })
      .catch(() => {});
  }, []);

  // ── Distance between pickup & drop once both are set ──
  useEffect(() => {
    if (!pickupCoord || !dropCoord) { setDist(null); setDurationText(null); setRouteCoords([]); return; }

    function haversineFallback() {
      const R = 6371;
      const dLat = ((dropCoord.latitude  - pickupCoord.latitude)  * Math.PI) / 180;
      const dLng = ((dropCoord.longitude - pickupCoord.longitude) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((pickupCoord.latitude * Math.PI) / 180) *
        Math.cos((dropCoord.latitude   * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
      const km = 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      setDist(parseFloat(km.toFixed(1)));
      setDurationText(`${Math.round((km / 30) * 60)} min`);
      setRouteCoords([pickupCoord, dropCoord]); // straight-line fallback
    }

    setDistLoading(true);
    (async () => {
      try {
        const url =
          `https://maps.googleapis.com/maps/api/directions/json` +
          `?origin=${pickupCoord.latitude},${pickupCoord.longitude}` +
          `&destination=${dropCoord.latitude},${dropCoord.longitude}` +
          `&key=${PLACES_KEY}`;
        const r = await fetch(url);
        const d = await r.json();
        if (d.routes?.length) {
          const leg = d.routes[0].legs[0];
          setDist(leg.distance.value / 1000);
          setDurationText(leg.duration.text || `${Math.round(leg.duration.value / 60)} min`);
          setRouteCoords(decodePolyline(d.routes[0].overview_polyline.points));
        } else {
          haversineFallback();
        }
      } catch {
        haversineFallback();
      } finally {
        setDistLoading(false);
      }
    })();
  }, [pickupCoord, dropCoord]);

  // ── Fit the map to show both pickup and drop once the route is known ──────
  useEffect(() => {
    if (!pickupCoord || !dropCoord) return;
    const t = setTimeout(() => {
      mapRef.current?.fitToCoordinates([pickupCoord, dropCoord], {
        edgePadding: { top: 30, right: 30, bottom: 30, left: 30 },
        animated: true,
      });
    }, 300);
    return () => clearTimeout(t);
  }, [pickupCoord, dropCoord]);

  function handlePickupSelect({ coord, label }) {
    setPickupCoord(coord);
    setPickupQuery(label);
    setPickupPickerVisible(false);
  }

  function handleDropSelect({ coord, label }) {
    setDropCoord(coord);
    setDropQuery(label);
    setDropPickerVisible(false);
  }

  const fare = ambulance
    ? calcFare(SCHEDULE_SERVICE_TYPE[ambulance] || ambulance, dist ?? 0, pricingList, {})
    : { total: 0 };

  const canNext =
    cur === "trip"      ? !!pickupCoord && !!dropCoord && dateChosen && timeChosen && !!purpose :
    cur === "ambulance" ? !!ambulance && patientName.trim().length > 0 : false;

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
      "Schedule confirmed!",
      `Estimated fare ₹${fare.total.toLocaleString()}. Our team will call you shortly to confirm pickup details.`,
      [{ text: "OK", onPress: () => navigation?.goBack() }]
    );
  }

  return (
    <View style={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
          <Text style={{ color: COLORS.text, fontSize: 20 }}>←</Text>
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>Schedule Ambulance</Text>
          <Text style={styles.stepLbl}>Step {step} of {STEPS.length}</Text>
        </View>
      </View>

      {/* Progress dots */}
      <View style={styles.dots}>
        {STEPS.map((_, i) => (
          <View key={i} style={[styles.dot, {
            backgroundColor: i < step ? COLORS.red : "rgba(0,0,0,0.12)",
            width: i === step - 1 ? 28 : 8,
          }]} />
        ))}
      </View>

      {/* Summary bar — step 2 */}
      {step > 1 && (
        <View style={styles.fareBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fareLbl} numberOfLines={1}>
              {pickupQuery}  →  {dropQuery}
            </Text>
            <Text style={styles.fareAmt} numberOfLines={1}>
              {dateChosen && timeChosen ? `${fmtDateOnly(scheduleDate)} · ${fmtTimeOnly(scheduleDate)}` : "—"}
            </Text>
          </View>
          {purpose && (
            <View style={styles.fareTag}>
              <Text style={styles.fareTagText}>
                {selectedPurpose?.label.split(" ").slice(1).join(" ").toUpperCase()}
              </Text>
            </View>
          )}
        </View>
      )}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 18 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── Step 1: Trip Details ── */}
        {cur === "trip" && (
          <>
            <Text style={styles.q}>Trip Details</Text>
            <Text style={styles.qHint}>Enter pickup, drop location, date & purpose</Text>

            <Text style={styles.fieldLabel}>Pickup location *</Text>
            <TouchableOpacity style={styles.input} onPress={() => setPickupPickerVisible(true)} activeOpacity={0.7}>
              <Text
                style={[styles.inputTxt, !pickupQuery && { color: COLORS.grayDim }]}
                numberOfLines={1}
              >
                {pickupQuery || "Search address or landmark"}
              </Text>
            </TouchableOpacity>

            <Text style={styles.fieldLabel}>Drop location *</Text>
            <TouchableOpacity style={styles.input} onPress={() => setDropPickerVisible(true)} activeOpacity={0.7}>
              <Text
                style={[styles.inputTxt, !dropQuery && { color: COLORS.grayDim }]}
                numberOfLines={1}
              >
                {dropQuery || "e.g. Hospital name & address"}
              </Text>
            </TouchableOpacity>

            {pickupCoord && dropCoord && (
              <>
                <MapView
                  ref={mapRef}
                  provider={PROVIDER_GOOGLE}
                  style={styles.map}
                  initialRegion={{
                    latitude: pickupCoord.latitude,
                    longitude: pickupCoord.longitude,
                    latitudeDelta: 0.06,
                    longitudeDelta: 0.06,
                  }}
                  showsMyLocationButton={false}
                  showsCompass={false}
                  toolbarEnabled={false}
                >
                  <Marker coordinate={pickupCoord} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
                    <View style={styles.pickupMarker} />
                  </Marker>
                  <Marker coordinate={dropCoord} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
                    <View style={styles.dropMarker} />
                  </Marker>
                  {routeCoords.length > 0 && (
                    <Polyline
                      coordinates={routeCoords}
                      strokeColor={COLORS.red}
                      strokeWidth={4}
                      lineCap="round"
                      lineJoin="round"
                    />
                  )}
                </MapView>

                <View style={styles.routeInfoCard}>
                  <View style={styles.routeEndpoint}>
                    <View style={styles.greenDotSm} />
                    <Text style={styles.routeAddr} numberOfLines={1}>{pickupQuery}</Text>
                  </View>
                  <View style={styles.routeMid}>
                    <View style={styles.routeLine} />
                    <View style={styles.routeDistPill}>
                      {distLoading ? (
                        <ActivityIndicator size="small" color={COLORS.red} />
                      ) : (
                        <Text style={styles.routeDistTxt}>
                          {dist?.toFixed(1)} km{durationText ? ` · ~${durationText}` : ""}
                        </Text>
                      )}
                    </View>
                    <View style={styles.routeLine} />
                  </View>
                  <View style={styles.routeEndpoint}>
                    <View style={styles.redDotSm} />
                    <Text style={styles.routeAddr} numberOfLines={1}>{dropQuery}</Text>
                  </View>
                </View>
              </>
            )}

            <Text style={styles.fieldLabel}>Trip type</Text>
            <View style={styles.pillRow}>
              {TRIP_TYPES.map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.pill, tripType === t && styles.pillActive]}
                  onPress={() => setTripType(t)}
                >
                  <Text style={[styles.pillText, tripType === t && styles.pillTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {tripType === "Round Trip" && (
              <>
                <Text style={styles.fieldLabel}>Return time (approx.)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 2:00 PM, after 2 hours..."
                  placeholderTextColor={COLORS.grayDim}
                  value={returnTime}
                  onChangeText={setReturnTime}
                />
              </>
            )}

            <Text style={styles.fieldLabel}>Date & time *</Text>
            <View style={styles.dateTimeRow}>
              <TouchableOpacity style={styles.dateTimeBtn} onPress={() => setPickerMode("date")}>
                <Text style={styles.dateTimeIcon}>📅</Text>
                <Text style={styles.dateTimeText}>
                  {dateChosen ? fmtDateOnly(scheduleDate) : "Select date"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.dateTimeBtn} onPress={() => setPickerMode("time")}>
                <Text style={styles.dateTimeIcon}>🕐</Text>
                <Text style={styles.dateTimeText}>
                  {timeChosen ? fmtTimeOnly(scheduleDate) : "Select time"}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>Purpose *</Text>
            <View style={styles.chipGrid}>
              {PURPOSES.map(p => (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.chip, purpose === p.id && styles.chipActive]}
                  onPress={() => setPurpose(p.id)}
                >
                  <Text style={[styles.chipText, purpose === p.id && styles.chipTextActive]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* ── Step 2: Ambulance & Patient + Confirm ── */}
        {cur === "ambulance" && (
          <>
            <Text style={styles.q}>Ambulance & Patient</Text>
            <Text style={styles.qHint}>Select ambulance type, enter patient details and confirm</Text>

            <Text style={styles.sectionLabel}>Ambulance type *</Text>
            {AMBULANCE_TYPES.map(a => (
              <TouchableOpacity key={a.id}
                style={[styles.opt, ambulance === a.id && styles.optActive]}
                onPress={() => setAmbulance(a.id)} activeOpacity={0.75}
              >
                <View style={styles.optIcon}>
                  <Text style={{ fontSize: 24 }}>{a.icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.optName}>{a.name}</Text>
                  <Text style={[styles.optTag, ambulance === a.id && styles.optTagActive]}>{a.tag}</Text>
                  <Text style={styles.optDesc}>{a.desc}</Text>
                </View>
                <View style={[styles.radio, ambulance === a.id && styles.radioActive]}>
                  {ambulance === a.id && <View style={styles.radioDot} />}
                </View>
              </TouchableOpacity>
            ))}

            <View style={styles.timeDivider} />

            <Text style={styles.fieldLabel}>Patient name *</Text>
            <TextInput style={styles.input} placeholder="Full name of the patient"
              placeholderTextColor={COLORS.grayDim} value={patientName} onChangeText={setPatientName} />

            <Text style={styles.fieldLabel}>Patient age</Text>
            <TextInput style={styles.input} placeholder="e.g. 65"
              placeholderTextColor={COLORS.grayDim} keyboardType="numeric"
              value={patientAge} onChangeText={setPatientAge} />

            <Text style={styles.fieldLabel}>Medical condition (optional)</Text>
            <TextInput style={[styles.input, styles.inputMulti]}
              placeholder="e.g. End-stage renal disease, undergoing dialysis..."
              placeholderTextColor={COLORS.grayDim} multiline numberOfLines={3}
              value={condition} onChangeText={setCondition} textAlignVertical="top" />

            <View style={styles.serviceCard}>
              <View style={styles.switchRow}>
                <Text style={styles.switchIcon}>♿</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchLabel}>Wheelchair required</Text>
                  <Text style={styles.switchDesc}>Ambulance will carry a wheelchair</Text>
                </View>
                <Switch value={wheelchair} onValueChange={setWheelchair}
                  trackColor={{ false: "rgba(0,0,0,0.1)", true: COLORS.red }}
                  thumbColor={COLORS.white} />
              </View>
              <View style={styles.divider} />
              <View style={styles.switchRow}>
                <Text style={styles.switchIcon}>🛏️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchLabel}>Stretcher required</Text>
                  <Text style={styles.switchDesc}>Patient requires stretcher support</Text>
                </View>
                <Switch value={stretcher} onValueChange={setStretcher}
                  trackColor={{ false: "rgba(0,0,0,0.1)", true: COLORS.red }}
                  thumbColor={COLORS.white} />
              </View>
            </View>

            <View style={styles.priceBox}>
              <View style={styles.priceBoxRow}>
                <Text style={styles.priceBoxLabel}>Estimated Fare</Text>
                {!ambulance ? (
                  <Text style={styles.priceBoxAmountMuted}>—</Text>
                ) : distLoading ? (
                  <ActivityIndicator size="small" color={COLORS.red} />
                ) : (
                  <Text style={styles.priceBoxAmount}>₹{fare.total.toLocaleString()}</Text>
                )}
              </View>
              <Text style={styles.priceBoxHint}>
                {!ambulance
                  ? "Select an ambulance type to see live pricing"
                  : dist != null
                    ? `For ${dist.toFixed(1)} km · ${selectedAmb?.name}`
                    : "Calculating distance…"}
              </Text>
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
            {cur === "ambulance" ? "📅  Schedule Ambulance" : "Next →"}
          </Text>
        </TouchableOpacity>
        {cur === "ambulance" && (
          <Text style={styles.submitNote}>Our team will call you to confirm pickup details</Text>
        )}
      </View>

      {/* Pure-JS date/time wheel picker */}
      <DateTimePickerModal
        visible={pickerMode != null}
        mode={pickerMode || "date"}
        value={scheduleDate}
        onConfirm={d => {
          setScheduleDate(d);
          if (pickerMode === "date") setDateChosen(true);
          if (pickerMode === "time") setTimeChosen(true);
          setPickerMode(null);
        }}
        onClose={() => setPickerMode(null)}
      />

      {/* Pickup location picker — GPS + autocomplete + recents + favourites + hospitals */}
      <LocationPickerModal
        visible={pickupPickerVisible}
        title="Pickup Location"
        placeholder="Search address or landmark…"
        recentsKey={PICKUP_RECENT_KEY}
        biasCoord={dropCoord}
        showCurrentLocation
        showFavourites
        showHospitals
        onClose={() => setPickupPickerVisible(false)}
        onSelect={handlePickupSelect}
      />

      {/* Drop location picker — same feature set as Pickup */}
      <LocationPickerModal
        visible={dropPickerVisible}
        title="Drop Location"
        placeholder="e.g. Hospital name & address"
        recentsKey={DEST_RECENT_KEY}
        biasCoord={pickupCoord}
        hospitalAnchorCoord={pickupCoord}
        showCurrentLocation
        showFavourites
        showHospitals
        onClose={() => setDropPickerVisible(false)}
        onSelect={handleDropSelect}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingTop: 50 },

  // Header
  header: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 18 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,0.06)", alignItems: "center", justifyContent: "center" },
  title: { color: COLORS.text, fontSize: 20, fontWeight: "700" },
  stepLbl: { color: COLORS.grayDim, fontSize: 11, marginTop: 2 },

  // Progress dots
  dots: { flexDirection: "row", gap: 6, paddingHorizontal: 18, paddingVertical: 14, alignItems: "center" },
  dot: { height: 8, borderRadius: 4 },

  // Summary bar
  fareBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginHorizontal: 18, marginBottom: 8, padding: 14, backgroundColor: "rgba(232,25,44,0.1)", borderWidth: 1, borderColor: "rgba(232,25,44,0.3)", borderRadius: 14 },
  fareLbl: { color: COLORS.gray, fontSize: 11, marginBottom: 2 },
  fareAmt: { color: COLORS.text, fontSize: 14, fontWeight: "700" },
  fareTag: { backgroundColor: "rgba(232,25,44,0.2)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100 },
  fareTagText: { color: COLORS.red, fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },

  // Step headings
  q: { color: COLORS.text, fontSize: 19, fontWeight: "700", marginBottom: 6 },
  qHint: { color: COLORS.grayDim, fontSize: 12, marginBottom: 16 },

  // Fields
  fieldLabel: { color: COLORS.grayDim, fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, marginTop: 10 },
  input: { backgroundColor: "rgba(0,0,0,0.05)", borderWidth: 0.5, borderColor: "rgba(0,0,0,0.1)", borderRadius: 10, padding: 11, fontSize: 13, color: COLORS.text, marginBottom: 4 },
  inputTxt: { fontSize: 13, color: COLORS.text },
  inputMulti: { height: 80, textAlignVertical: "top" },

  // Route preview map (ported from DestinationScreen.js, compact for a form screen)
  map: { width: "100%", height: 170, borderRadius: 14, marginTop: 4, marginBottom: 10 },
  pickupMarker: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: COLORS.green, borderWidth: 3, borderColor: "#fff",
  },
  dropMarker: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: COLORS.red, borderWidth: 3, borderColor: "#fff",
  },
  routeInfoCard: {
    backgroundColor: COLORS.bg2, borderRadius: 14, borderWidth: 0.5, borderColor: COLORS.border,
    padding: 12, gap: 8, marginBottom: 14,
  },
  routeEndpoint: { flexDirection: "row", alignItems: "center", gap: 10 },
  greenDotSm: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.green },
  redDotSm:   { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.red },
  routeAddr: { flex: 1, color: COLORS.text, fontSize: 12, fontWeight: "500" },
  routeMid: { flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 4 },
  routeLine: { flex: 1, height: 0.5, backgroundColor: COLORS.border },
  routeDistPill: {
    backgroundColor: COLORS.bg3,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100,
    minWidth: 80, alignItems: "center",
  },
  routeDistTxt: { color: COLORS.grayDim, fontSize: 11, fontWeight: "600" },

  // Purpose / org chips
  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 10, borderWidth: 0.5, borderColor: "rgba(0,0,0,0.1)", backgroundColor: "rgba(0,0,0,0.03)" },
  chipActive: { backgroundColor: "rgba(232,25,44,0.15)", borderColor: "rgba(232,25,44,0.5)" },
  chipText: { color: COLORS.grayDim, fontSize: 13 },
  chipTextActive: { color: COLORS.red, fontWeight: "600" },

  // Trip-type pills
  sectionLabel: { color: COLORS.grayDim, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10, marginTop: 16 },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 0.5, borderColor: "rgba(0,0,0,0.1)", backgroundColor: "rgba(0,0,0,0.03)" },
  pillActive: { backgroundColor: COLORS.red, borderColor: COLORS.red },
  pillText: { color: COLORS.grayDim, fontSize: 13 },
  pillTextActive: { color: COLORS.white, fontWeight: "700" },

  // Date & time row
  dateTimeRow: { flexDirection: "row", gap: 8 },
  dateTimeBtn: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(0,0,0,0.05)", borderWidth: 0.5, borderColor: "rgba(0,0,0,0.1)", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 13 },
  dateTimeIcon: { fontSize: 16 },
  dateTimeText: { color: COLORS.text, fontSize: 13, fontWeight: "600" },

  // Ambulance option cards
  timeDivider: { height: 0.5, backgroundColor: "rgba(0,0,0,0.08)", marginVertical: 16 },
  opt: { flexDirection: "row", alignItems: "center", gap: 14, padding: 15, backgroundColor: "rgba(0,0,0,0.03)", borderRadius: 14, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)", marginBottom: 10 },
  optActive: { borderColor: "rgba(232,25,44,0.5)", backgroundColor: "rgba(232,25,44,0.08)" },
  optIcon: { width: 48, height: 48, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.06)", alignItems: "center", justifyContent: "center" },
  optName: { color: COLORS.text, fontWeight: "700", fontSize: 14, marginBottom: 2 },
  optTag: { color: COLORS.grayDim, fontSize: 11, fontWeight: "600", marginBottom: 3 },
  optTagActive: { color: COLORS.red },
  optDesc: { color: COLORS.grayDim, fontSize: 11, lineHeight: 16 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: COLORS.border, alignItems: "center", justifyContent: "center" },
  radioActive: { borderColor: COLORS.red },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: COLORS.red },

  // Patient switches
  serviceCard: { backgroundColor: "rgba(0,0,0,0.03)", borderWidth: 0.5, borderColor: "rgba(0,0,0,0.08)", borderRadius: 14, padding: 16, marginTop: 8 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 },
  switchIcon: { fontSize: 20 },
  switchLabel: { color: COLORS.text, fontSize: 14, fontWeight: "600", marginBottom: 2 },
  switchDesc: { color: COLORS.grayDim, fontSize: 12, lineHeight: 17, paddingRight: 8 },
  divider: { height: 0.5, backgroundColor: "rgba(0,0,0,0.07)", marginVertical: 14 },

  // Live price summary box
  priceBox: { backgroundColor: "rgba(34,197,94,0.07)", borderWidth: 0.5, borderColor: "rgba(34,197,94,0.25)", borderRadius: 14, padding: 16, marginTop: 16 },
  priceBoxRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  priceBoxLabel: { color: COLORS.text, fontSize: 14, fontWeight: "700" },
  priceBoxAmount: { color: "#16a34a", fontSize: 20, fontWeight: "800" },
  priceBoxAmountMuted: { color: COLORS.grayDim, fontSize: 20, fontWeight: "800" },
  priceBoxHint: { color: COLORS.grayDim, fontSize: 12 },

  // Footer
  footer: { padding: 18 },
  btn: { backgroundColor: COLORS.red, borderRadius: 12, paddingVertical: 16, alignItems: "center" },
  btnText: { color: COLORS.white, fontSize: 16, fontWeight: "700" },
  submitNote: { color: COLORS.grayDim, fontSize: 12, textAlign: "center", marginTop: 10 },
});

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
