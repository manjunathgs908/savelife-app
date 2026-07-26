import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Modal, Animated, Alert,
} from "react-native";
import { COLORS } from "../theme";
import { calcFare, PRICING_API } from "../utils/pricingUtils";
import { AMBULANCE_TYPES, AMB_RATES } from "../utils/ambulanceCatalog";
import { getRouteInfo } from "../utils/routeUtils";

const PLACES_KEY = "AIzaSyB8wxgXxQxskgUZG868g_4Qdsezr07i9yA";

function fmtScheduleBadge(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit",
  });
}

// ─── Wheel picker — Date / Hour / Minute / AM-PM columns ──────────────────────
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

// ─── Main screen — Now/Schedule + ambulance list with calculated prices ───────
export default function AmbulanceListScreen({ navigation, route }) {
  const {
    pickupCoord, pickupLabel, dropCoord, dropLabel, patientType, contactName, contactPhone,
    scheduleType: initialScheduleType = "now",
    scheduleDate: initialScheduleDate = null,
  } = route.params;

  const [dist, setDist]         = useState(null);
  const [duration, setDuration] = useState(null);
  const [routeLoading, setRouteLoading] = useState(true);
  // MONEY RULE: true only when the real Directions call failed outright —
  // never a reason to fall back to straight-line distance for a billable
  // fare. Fares/Confirm are blocked until this clears.
  const [routeError, setRouteError] = useState(false);
  const [routeRetryNonce, setRouteRetryNonce] = useState(0);

  const [scheduleType, setScheduleType] = useState(initialScheduleType);
  const [scheduleDate, setScheduleDate] = useState(
    initialScheduleType === "later" && initialScheduleDate ? new Date(initialScheduleDate) : new Date()
  );

  const [showScheduleModal, setShowScheduleModal] = useState(false);
  // Bumped each time the modal opens — used as a React `key` on the wheel
  // columns so they remount fresh at the right initial scroll position.
  const [modalToken, setModalToken] = useState(0);
  const [draftDate, setDraftDate]     = useState(todayMidnight());
  const [draftHour, setDraftHour]     = useState(null);
  const [draftMinute, setDraftMinute] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  // Tracks whether the "Now" card is the active choice *inside the modal* —
  // separate from the confirmed scheduleType so it can untick live as soon
  // as the user starts touching the date/hour/minute/period pickers below.
  const [draftIsNow, setDraftIsNow] = useState(true);

  const [pricingList,     setPricingList]     = useState([]);
  const [selectedAmbType, setSelectedAmbType] = useState("bls");

  useEffect(() => {
    fetch(PRICING_API)
      .then(r => r.json())
      .then(d => { if (d.success) setPricingList(d.pricing); })
      .catch(() => {});
  }, []);

  // Distance/duration via Directions API. MONEY RULE: on failure, do NOT
  // fall back to straight-line (Haversine) distance — clear dist/duration
  // and surface routeError so fares aren't shown and Confirm is blocked.
  useEffect(() => {
    if (!pickupCoord || !dropCoord) { setRouteLoading(false); return; }

    let active = true;
    setRouteLoading(true);
    setRouteError(false);

    getRouteInfo(pickupCoord, dropCoord)
      .then(route => {
        if (!active) return;
        if (route) {
          setDist(route.distance);
          setDuration(route.duration);
          setRouteError(false);
        } else {
          setDist(null);
          setDuration(null);
          setRouteError(true);
        }
      })
      .catch(err => {
        console.warn("[AmbulanceListScreen] route fetch error:", err?.message ?? err);
        if (active) { setDist(null); setDuration(null); setRouteError(true); }
      })
      .finally(() => {
        if (active) setRouteLoading(false);
      });

    return () => { active = false; };
  }, [pickupCoord, dropCoord, routeRetryNonce]);

  // True once a real, verified road distance is available — every fare
  // display and the Confirm button below gate on this, never on a
  // placeholder/unverified dist.
  const distReady = dist != null && !routeError;
  const fareFor = (typeId) => (distReady ? calcFare(typeId, dist, pricingList) : { available: false });

  // Opens the slide-up schedule modal, seeding the draft from whatever was
  // last confirmed (or the next available time slot if nothing was picked yet)
  function openScheduleModal() {
    if (scheduleType === "later" && scheduleDate) {
      const d = new Date(scheduleDate);
      d.setHours(0, 0, 0, 0);
      let h = scheduleDate.getHours();
      const ap = h >= 12 ? "PM" : "AM";
      h = h % 12 || 12;
      setDraftDate(d);
      setDraftHour(h);
      setDraftMinute(scheduleDate.getMinutes());
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
    setDraftIsNow(scheduleType === "now");
    setModalToken(t => t + 1);
    setShowScheduleModal(true);
  }

  function handleQuickNow() {
    setDraftIsNow(true);
    setScheduleType("now");
    setScheduleDate(null);
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
    setScheduleDate(finalDateTime);
    setScheduleType("later");
    setShowScheduleModal(false);
  }

  // Same param shape AmbulanceSelectScreen.handleNext always sent to ConfirmBooking.
  function handleConfirmType() {
    if (!distReady) return; // defense-in-depth — Next is disabled for this case too
    navigation.navigate("ConfirmBooking", {
      pickupCoord,
      pickupLabel,
      dropCoord,
      dropLabel,
      dist,
      duration,
      scheduleType,
      scheduleDate: scheduleType === "later" ? scheduleDate.toISOString() : null,
      patientType,
      contactName,
      contactPhone,
      selectedType: selectedAmbType,
      selectedAmb: AMBULANCE_TYPES.find(a => a.id === selectedAmbType),
      pricingList,
    });
  }

  const dateChips = buildDateChips();
  const dateIndex   = Math.max(0, dateChips.findIndex(d => d.toDateString() === draftDate.toDateString()));
  const hourIndex   = Math.max(0, HOURS.indexOf(draftHour));
  const minuteIndex = Math.max(0, MINUTES.indexOf(draftMinute));
  const periodIndex = Math.max(0, PERIODS.indexOf(selectedPeriod));
  const canConfirmSchedule = draftHour != null && draftMinute != null && !!selectedPeriod;
  const scheduleBtnLabel = scheduleType === "later" && scheduleDate
    ? formatScheduledLabel(scheduleDate)
    : "Now";

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

          {scheduleType === "later" && (
            <View style={styles.schedBadge}>
              <Text style={styles.schedBadgeTxt}>🕐  {fmtScheduleBadge(scheduleDate.toISOString())}</Text>
            </View>
          )}

          <View style={styles.routeMid}>
            <View style={styles.routeLine} />
            <TouchableOpacity
              style={styles.routeDistPill}
              onPress={() => routeError && setRouteRetryNonce(n => n + 1)}
              activeOpacity={routeError ? 0.7 : 1}
              disabled={!routeError}
            >
              {routeLoading ? (
                <ActivityIndicator size="small" color={COLORS.red} />
              ) : routeError ? (
                <Text style={styles.routeDistErrorTxt}>Distance unavailable · Retry</Text>
              ) : (
                <Text style={styles.routeDistTxt}>
                  {dist.toFixed(1)} km · ~{Math.round((duration ?? 0) / 60)} min
                </Text>
              )}
            </TouchableOpacity>
            <View style={styles.routeLine} />
          </View>

          <View style={styles.routeEndpoint}>
            <View style={styles.redDotSm} />
            <Text style={styles.routeAddr} numberOfLines={1}>{dropLabel}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.nowBtn}
          onPress={openScheduleModal}
          activeOpacity={0.85}
        >
          <Text style={styles.nowBtnIco}>🕐</Text>
          <Text style={styles.nowBtnTxt} numberOfLines={1}>{scheduleBtnLabel}</Text>
        </TouchableOpacity>
      </View>

      {!routeLoading && routeError && (
        <View style={styles.routeErrorBanner}>
          <Text style={styles.routeErrorIco}>⚠️</Text>
          <Text style={styles.routeErrorTxt}>
            Couldn't calculate route distance. Fares can't be shown until it's verified.
          </Text>
          <TouchableOpacity onPress={() => setRouteRetryNonce(n => n + 1)}>
            <Text style={styles.routeErrorRetry}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Ambulance type list */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.listHeading}>ALL AMBULANCE TYPES</Text>

        {AMBULANCE_TYPES.filter(amb => amb.id !== "body_mini" && amb.id !== "body_tempo").map(amb => {
          const info          = AMB_RATES[amb.id];
          const fareResult    = fareFor(amb.id);
          const priceAvailable = fareResult.available;
          const est           = priceAvailable ? fareResult.total : null;
          const isActive      = selectedAmbType === amb.id;

          return (
            <TouchableOpacity
              key={amb.id}
              style={[styles.card, isActive && styles.cardActive, !priceAvailable && styles.cardDisabled]}
              onPress={() => priceAvailable && setSelectedAmbType(amb.id)}
              activeOpacity={priceAvailable ? 0.8 : 1}
              disabled={!priceAvailable}
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
                </View>

                <View style={styles.priceCol}>
                  {priceAvailable ? (
                    <>
                      <Text style={[styles.priceTotal, isActive && { color: COLORS.red }]}>
                        ₹{est.toLocaleString()}
                      </Text>
                      <Text style={styles.priceEst}>est.</Text>
                    </>
                  ) : (
                    <Text style={styles.priceUnavailable}>Unavailable</Text>
                  )}
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
          {(() => {
            const selectedFare = fareFor(selectedAmbType);
            return selectedFare.available ? (
              <Text style={styles.footerPrice}>₹{selectedFare.total.toLocaleString()} est.</Text>
            ) : (
              <Text style={styles.footerPriceUnavailable}>
                {routeError ? "Distance unavailable" : "Pricing unavailable"}
              </Text>
            );
          })()}
        </View>
        <TouchableOpacity
          style={[styles.nextBtn, !fareFor(selectedAmbType).available && styles.nextBtnDisabled]}
          onPress={handleConfirmType}
          activeOpacity={0.85}
          disabled={!fareFor(selectedAmbType).available}
        >
          <Text style={styles.nextBtnTxt}>Confirm Type  →</Text>
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
        <View style={wp.modalBackdrop}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowScheduleModal(false)} />

          <View style={wp.modalSheet}>
            <View style={wp.modalHandle} />

            <View style={wp.modalHeaderRow}>
              <Text style={wp.modalTitle}>Schedule Ambulance</Text>
              <TouchableOpacity onPress={() => setShowScheduleModal(false)}>
                <Text style={wp.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[wp.nowQuickBtn, !draftIsNow && wp.nowQuickBtnInactive]}
              onPress={handleQuickNow}
              activeOpacity={0.8}
            >
              <Text style={wp.nowQuickIcon}>⚡</Text>
              <View style={{ flex: 1 }}>
                <Text style={wp.nowQuickTitle}>Now</Text>
                <Text style={wp.nowQuickSub}>Get an ambulance right away</Text>
              </View>
              {draftIsNow && <Text style={wp.nowQuickCheck}>✓</Text>}
            </TouchableOpacity>

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
              style={[wp.confirmScheduleBtn, !canConfirmSchedule && { opacity: 0.4 }]}
              disabled={!canConfirmSchedule}
              onPress={handleConfirmSchedule}
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
  routeDistErrorTxt: { color: COLORS.red, fontSize: 10, fontWeight: "700" },
  routeErrorBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 18, marginBottom: 10, padding: 10,
    backgroundColor: "rgba(232,25,44,0.08)", borderRadius: 12,
    borderWidth: 0.5, borderColor: "rgba(232,25,44,0.3)",
  },
  routeErrorIco: { fontSize: 14 },
  routeErrorTxt: { flex: 1, color: COLORS.red, fontSize: 11.5, lineHeight: 15 },
  routeErrorRetry: { color: COLORS.red, fontSize: 12, fontWeight: "700", textDecorationLine: "underline" },
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
  cardDisabled: { opacity: 0.45 },
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
  priceCol: { alignItems: "flex-end", gap: 4 },
  priceTotal: { color: COLORS.text, fontSize: 16, fontWeight: "800" },
  priceEst: { color: COLORS.grayDim, fontSize: 10 },
  priceUnavailable: { color: COLORS.grayDim, fontSize: 12, fontStyle: "italic" },
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
  footerPriceUnavailable: { color: COLORS.grayDim, fontSize: 14, fontWeight: "700", fontStyle: "italic", marginTop: 4 },
  nextBtn: {
    backgroundColor: COLORS.red,
    borderRadius: 12, paddingVertical: 14, paddingHorizontal: 20,
  },
  nextBtnDisabled: { backgroundColor: "rgba(0,0,0,0.15)" },
  nextBtnTxt: { color: COLORS.white, fontSize: 14, fontWeight: "700" },
});

// ─── Schedule modal styles — ported from FreezerBoxScreen's wheel picker ──────
const wp = StyleSheet.create({
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
