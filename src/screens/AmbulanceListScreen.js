import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, TouchableOpacity, FlatList, ScrollView,
  StyleSheet, ActivityIndicator, Modal, Platform,
} from "react-native";
import { COLORS } from "../theme";
import { calcFare, PRICING_API } from "../utils/pricingUtils";
import { AMBULANCE_TYPES, AMB_RATES } from "../utils/ambulanceCatalog";

const PLACES_KEY = "AIzaSyB8wxgXxQxskgUZG868g_4Qdsezr07i9yA";

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

function fmtDate(d) {
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}
function fmtTime(d) {
  const h = d.getHours(), m = d.getMinutes();
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}
function fmtScheduleBadge(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit",
  });
}

// ─── "When do you need it?" bottom sheet — Now vs Schedule ───────────────────
function ScheduleTypeSheet({ visible, onClose, onPickNow, onPickSchedule }) {
  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <TouchableOpacity style={bsh.overlay} activeOpacity={1} onPress={onClose} />
      <View style={bsh.kvWrap} pointerEvents="box-none">
        <View style={bsh.sheet}>
          <View style={bsh.handle} />
          <Text style={bsh.title}>When do you need the ambulance?</Text>
          <Text style={bsh.subtitle}>Choose now or schedule for later</Text>

          <TouchableOpacity style={bsh.row} onPress={onPickNow} activeOpacity={0.75}>
            <View style={[bsh.ico, { backgroundColor: "rgba(34,197,94,0.12)" }]}>
              <Text style={{ fontSize: 18 }}>🟢</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={bsh.rowLabel}>Now</Text>
              <Text style={bsh.rowSub}>Get an ambulance right away</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={bsh.row} onPress={onPickSchedule} activeOpacity={0.75}>
            <View style={[bsh.ico, { backgroundColor: "rgba(232,25,44,0.12)" }]}>
              <Text style={{ fontSize: 18 }}>🕐</Text>
            </View>
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

// ─── Schedule date & time bottom sheet ─────────────────────────────────────────
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

// ─── Pure-JS date / time picker ───────────────────────────────────────────────
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
  for (let h = 6; h < 24; h++)
    for (let m = 0; m < 60; m += 30)
      slots.push({ h, m });
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
    const ti = TIME_SLOTS.findIndex(s => s.h === value.getHours() && s.m === value.getMinutes());
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
            <TouchableOpacity style={pk.closeBtn} onPress={onClose}>
              <Text style={pk.closeX}>✕</Text>
            </TouchableOpacity>
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
                  : `Confirm — ${fmt12(TIME_SLOTS[selTime]?.h, TIME_SLOTS[selTime]?.m)}`
                }
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main screen — Now/Schedule + ambulance list with calculated prices ───────
export default function AmbulanceListScreen({ navigation, route }) {
  const { pickupCoord, pickupLabel, dropCoord, dropLabel, patientType } = route.params;

  const [dist, setDist]         = useState(null);
  const [duration, setDuration] = useState(null);
  const [routeLoading, setRouteLoading] = useState(true);

  const [scheduleType, setScheduleType] = useState("now");
  const [scheduleDate, setScheduleDate] = useState(new Date());
  const [pickerMode, setPickerMode]     = useState(null);

  const [scheduleTypeVisible,   setScheduleTypeVisible]   = useState(false);
  const [scheduleDetailVisible, setScheduleDetailVisible] = useState(false);

  const [pricingList,     setPricingList]     = useState([]);
  const [selectedAmbType, setSelectedAmbType] = useState("bls");

  useEffect(() => {
    fetch(PRICING_API)
      .then(r => r.json())
      .then(d => { if (d.success) setPricingList(d.pricing); })
      .catch(() => {}); // silent fallback to local AMB_RATES
  }, []);

  // Distance/duration via Directions API with a straight-line Haversine fallback.
  useEffect(() => {
    if (!pickupCoord || !dropCoord) { setRouteLoading(false); return; }

    function haversineFallback() {
      const R = 6371;
      const dLat = ((dropCoord.latitude  - pickupCoord.latitude)  * Math.PI) / 180;
      const dLng = ((dropCoord.longitude - pickupCoord.longitude) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((pickupCoord.latitude * Math.PI) / 180) *
        Math.cos((dropCoord.latitude   * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
      const km = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      setDist(parseFloat(km.toFixed(1)));
      setDuration(Math.round((km / 30) * 3600)); // assume 30 km/h
    }

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
          decodePolyline(d.routes[0].overview_polyline.points); // computed for parity, unused without a map
          setDist(leg.distance.value / 1000);
          setDuration(leg.duration.value);
        } else {
          haversineFallback();
        }
      } catch (err) {
        console.warn("[AmbulanceListScreen] route fetch error:", err?.message ?? err);
        haversineFallback();
      } finally {
        setRouteLoading(false);
      }
    })();
  }, []);

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

  // Same param shape AmbulanceSelectScreen.handleNext always sent to ConfirmBooking.
  function handleConfirmType() {
    navigation.navigate("ConfirmBooking", {
      pickupLabel,
      dropLabel,
      dist: dist ?? 5,
      duration: duration ?? 1200,
      scheduleType,
      scheduleDate: scheduleType === "later" ? scheduleDate.toISOString() : null,
      patientType,
      selectedType: selectedAmbType,
      selectedAmb: AMBULANCE_TYPES.find(a => a.id === selectedAmbType),
      pricingList,
    });
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Choose Ambulance</Text>
          <Text style={styles.headerSub}>Select type for your trip</Text>
        </View>
      </View>

      {/* Route summary + Now/Schedule button */}
      <View style={styles.routeRow}>
        <View style={styles.routeBar}>
          <View style={styles.routeEndpoint}>
            <View style={styles.greenDotSm} />
            <Text style={styles.routeAddr} numberOfLines={1}>{pickupLabel}</Text>
          </View>
          <View style={styles.routeMid}>
            <View style={styles.routeLine} />
            <View style={styles.routeDistPill}>
              {routeLoading ? (
                <ActivityIndicator size="small" color={COLORS.red} />
              ) : (
                <Text style={styles.routeDistTxt}>
                  {dist?.toFixed(1)} km · ~{Math.round((duration ?? 0) / 60)} min
                </Text>
              )}
            </View>
            <View style={styles.routeLine} />
          </View>
          <View style={styles.routeEndpoint}>
            <View style={styles.redDotSm} />
            <Text style={styles.routeAddr} numberOfLines={1}>{dropLabel}</Text>
          </View>

          {scheduleType === "later" && (
            <View style={styles.schedBadge}>
              <Text style={styles.schedBadgeTxt}>🕐  {fmtScheduleBadge(scheduleDate.toISOString())}</Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={styles.nowBtn}
          onPress={() => setScheduleTypeVisible(true)}
          activeOpacity={0.85}
        >
          <Text style={styles.nowBtnIco}>{scheduleType === "later" ? "🕐" : "🟢"}</Text>
          <Text style={styles.nowBtnTxt}>{scheduleType === "later" ? "Sched." : "Now"}</Text>
        </TouchableOpacity>
      </View>

      {/* Ambulance type list */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.listHeading}>ALL AMBULANCE TYPES</Text>

        {AMBULANCE_TYPES.map(amb => {
          const info     = AMB_RATES[amb.id];
          const est      = calcFare(amb.id, dist ?? 0, pricingList, AMB_RATES).total;
          const isActive = selectedAmbType === amb.id;

          return (
            <TouchableOpacity
              key={amb.id}
              style={[styles.card, isActive && styles.cardActive]}
              onPress={() => setSelectedAmbType(amb.id)}
              activeOpacity={0.8}
            >
              {info.badge ? (
                <View style={[styles.badge, { backgroundColor: info.color + "22", borderColor: info.color + "66" }]}>
                  <Text style={[styles.badgeTxt, { color: info.color }]}>{info.badge}</Text>
                </View>
              ) : null}

              <View style={styles.cardMain}>
                <View style={[styles.iconBox, isActive && { backgroundColor: COLORS.red + "22" }]}>
                  <Text style={{ fontSize: 28 }}>{amb.icon}</Text>
                </View>

                <View style={styles.cardInfo}>
                  <Text style={styles.ambName}>{amb.name}</Text>
                  <Text style={styles.ambDesc}>{amb.desc}</Text>
                  <View style={styles.metaRow}>
                    <Text style={styles.metaChip}>⏱ ~{info.eta} min away</Text>
                    {info.km ? <Text style={styles.metaChip}>₹{info.km}/km</Text> : <Text style={styles.metaChip}>Slab pricing</Text>}
                    {info.base > 0 && <Text style={styles.metaChip}>+₹{info.base} base</Text>}
                  </View>
                </View>

                <View style={styles.priceCol}>
                  <Text style={[styles.priceTotal, isActive && { color: COLORS.red }]}>
                    ₹{est.toLocaleString()}
                  </Text>
                  <Text style={styles.priceEst}>est.</Text>
                  <View style={[styles.radio, isActive && styles.radioActive]}>
                    {isActive && <View style={styles.radioDot} />}
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.footerLeft}>
          <Text style={styles.footerLabel}>Selected · {AMBULANCE_TYPES.find(a => a.id === selectedAmbType)?.name}</Text>
          <Text style={styles.footerPrice}>₹{calcFare(selectedAmbType, dist ?? 0, pricingList, AMB_RATES).total.toLocaleString()} est.</Text>
        </View>
        <TouchableOpacity style={styles.nextBtn} onPress={handleConfirmType} activeOpacity={0.85}>
          <Text style={styles.nextBtnTxt}>Confirm Type  →</Text>
        </TouchableOpacity>
      </View>

      {/* "Now" vs "Schedule Ambulance" */}
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

      {/* Pure-JS date/time picker */}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingTop: 50 },

  // Header
  header: {
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingHorizontal: 18, paddingBottom: 14,
    borderBottomWidth: 0.5, borderBottomColor: "rgba(0,0,0,0.07)",
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.06)",
    alignItems: "center", justifyContent: "center",
  },
  backArrow: { color: COLORS.text, fontSize: 20 },
  headerTitle: { color: COLORS.text, fontSize: 17, fontWeight: "700" },
  headerSub: { color: COLORS.grayDim, fontSize: 12, marginTop: 1 },

  // Route summary + Now button
  routeRow: { flexDirection: "row", gap: 8, marginHorizontal: 18, marginVertical: 12, alignItems: "flex-start" },
  routeBar: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.04)",
    borderRadius: 14, borderWidth: 0.5, borderColor: "rgba(0,0,0,0.08)",
    paddingHorizontal: 14, paddingVertical: 12, gap: 8,
  },
  routeEndpoint: { flexDirection: "row", alignItems: "center", gap: 10 },
  greenDotSm: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.green },
  redDotSm:   { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.red },
  routeAddr: { flex: 1, color: COLORS.text, fontSize: 12, fontWeight: "500" },
  routeMid: { flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 4 },
  routeLine: { flex: 1, height: 0.5, backgroundColor: "rgba(0,0,0,0.15)" },
  routeDistPill: {
    backgroundColor: "rgba(0,0,0,0.08)",
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100,
    minWidth: 90, alignItems: "center",
  },
  routeDistTxt: { color: COLORS.grayDim, fontSize: 11, fontWeight: "600" },
  schedBadge: {
    backgroundColor: "rgba(232,25,44,0.12)",
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
    alignSelf: "flex-start",
    borderWidth: 0.5, borderColor: "rgba(232,25,44,0.3)",
  },
  schedBadgeTxt: { color: COLORS.red, fontSize: 12, fontWeight: "600" },

  nowBtn: {
    width: 62,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.04)",
    borderRadius: 14, paddingVertical: 16,
    borderWidth: 0.5, borderColor: "rgba(0,0,0,0.08)",
  },
  nowBtnIco: { fontSize: 18, marginBottom: 4 },
  nowBtnTxt: { color: COLORS.text, fontSize: 10, fontWeight: "700" },

  // List
  listContent: { paddingHorizontal: 18, paddingBottom: 0 },
  listHeading: {
    color: COLORS.grayDim, fontSize: 11, fontWeight: "700",
    letterSpacing: 1.2, marginBottom: 12,
  },

  // Card
  card: {
    backgroundColor: "rgba(0,0,0,0.04)",
    borderRadius: 16, borderWidth: 0.5, borderColor: "rgba(0,0,0,0.08)",
    marginBottom: 10, padding: 14, overflow: "hidden",
  },
  cardActive: {
    backgroundColor: "rgba(232,25,44,0.07)",
    borderColor: "rgba(232,25,44,0.45)",
  },
  badge: {
    alignSelf: "flex-start",
    borderRadius: 6, borderWidth: 0.5,
    paddingHorizontal: 8, paddingVertical: 3,
    marginBottom: 10,
  },
  badgeTxt: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  cardMain: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconBox: {
    width: 54, height: 54, borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.05)",
    alignItems: "center", justifyContent: "center",
  },
  cardInfo: { flex: 1 },
  ambName: { color: COLORS.text, fontSize: 15, fontWeight: "700" },
  ambDesc: { color: COLORS.grayDim, fontSize: 12, marginTop: 2 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 7 },
  metaChip: {
    color: COLORS.grayDim, fontSize: 10,
    backgroundColor: "rgba(0,0,0,0.06)",
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
  },
  priceCol: { alignItems: "flex-end", gap: 4 },
  priceTotal: { color: COLORS.text, fontSize: 16, fontWeight: "800" },
  priceEst: { color: COLORS.grayDim, fontSize: 10 },
  radio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: "rgba(0,0,0,0.3)",
    alignItems: "center", justifyContent: "center",
    marginTop: 4,
  },
  radioActive: { borderColor: COLORS.red },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.red },

  // Footer
  footer: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 18, paddingVertical: 14,
    borderTopWidth: 0.5, borderTopColor: "rgba(0,0,0,0.08)",
    backgroundColor: COLORS.bg, gap: 14,
  },
  footerLeft: { flex: 1 },
  footerLabel: { color: COLORS.grayDim, fontSize: 11, fontWeight: "600" },
  footerPrice: { color: COLORS.text, fontSize: 20, fontWeight: "800", marginTop: 2 },
  nextBtn: {
    backgroundColor: COLORS.red,
    borderRadius: 12, paddingVertical: 14, paddingHorizontal: 20,
  },
  nextBtnTxt: { color: COLORS.white, fontSize: 14, fontWeight: "700" },
});

// ─── Patient / schedule bottom-sheet shell styles ──────────────────────────────
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

  continueBtn: {
    alignItems: "center", justifyContent: "center",
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

// ─── Date/time picker styles ──────────────────────────────────────────────────
const pk = StyleSheet.create({
  overlay: {
    flex: 1, justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    backgroundColor: COLORS.bg2,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingBottom: Platform.OS === "ios" ? 36 : 22,
    maxHeight: "75%",
  },
  handle: {
    width: 36, height: 4,
    backgroundColor: "rgba(0,0,0,0.12)",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 10, marginBottom: 6,
  },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 18, paddingVertical: 12,
    borderBottomWidth: 0.5, borderBottomColor: COLORS.border,
  },
  title: { flex: 1, color: COLORS.text, fontSize: 16, fontWeight: "700" },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.06)",
    alignItems: "center", justifyContent: "center",
  },
  closeX: { color: COLORS.grayDim, fontSize: 14, fontWeight: "700" },
  list: { flex: 1 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingHorizontal: 18, height: ITEM_H,
    borderBottomWidth: 0.5, borderBottomColor: "rgba(0,0,0,0.05)",
  },
  rowActive: { backgroundColor: "rgba(232,25,44,0.07)" },
  dot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  dotActive: { backgroundColor: COLORS.red },
  rowMain: { color: COLORS.text, fontSize: 15, fontWeight: "500" },
  rowMainActive: { color: COLORS.text, fontWeight: "700" },
  rowSub: { color: COLORS.grayDim, fontSize: 12, marginTop: 2 },
  check: { color: COLORS.red, fontSize: 18, fontWeight: "700" },
  footer: {
    paddingHorizontal: 18, paddingTop: 12,
    borderTopWidth: 0.5, borderTopColor: COLORS.border,
  },
  confirmBtn: {
    backgroundColor: COLORS.red, borderRadius: 14,
    paddingVertical: 15, alignItems: "center",
  },
  confirmTxt: { color: COLORS.white, fontSize: 15, fontWeight: "700" },
});
