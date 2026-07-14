import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, TextInput,
  StyleSheet, Alert, ActivityIndicator, Modal, Animated,
} from "react-native";
import { COLORS } from "../theme";
import storage from "../utils/storage";

const PROFILE_DEFAULTS = { name: "", phone: "" };

const BOX_NAMES = { normal: "Normal Box", standard: "Standard Box", vip: "VIP / Digital Box" };

const CANCEL_REASONS = [
  "No longer needed",
  "Found another service",
  "Wrong location selected",
  "Booked by mistake",
  "Other",
];

// Maps the local box id (set by FreezerBoxScreen's BOX_TYPES) to the boxId
// string stored in the MongoDB durations/floors collections.
const BOX_ID_MAP = { normal: "normal_box", standard: "standard_box", vip: "vip_digital_box" };

const CITY = "Bengaluru";

const DURATIONS_API = "https://api.savelife.health/api/freezer/durations";
const FLOORS_API     = "https://api.savelife.health/api/freezer/floors";

const TIME_SLOT_LABELS = {
  morning:   { label: "Morning",   sub: "8 AM to 12 PM" },
  afternoon: { label: "Afternoon", sub: "12 PM to 4 PM" },
  evening:   { label: "Evening",   sub: "4 PM to 8 PM" },
  night:     { label: "Night",     sub: "8 PM to 12 AM" },
};

function formatScheduledDate(isoString) {
  if (!isoString) return null;
  const date = new Date(isoString);
  return date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

function formatScheduledTime(isoString) {
  if (!isoString) return null;
  return new Date(isoString).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
}

function formatDeliveryLine(selectedDeliveryType, scheduledDate, scheduledTimeSlot) {
  console.log("[formatDeliveryLine] selectedDeliveryType:", selectedDeliveryType, "scheduledDate:", scheduledDate);
  // A non-null scheduledDate means the user confirmed a future date/time in
  // the schedule modal — trust that over selectedDeliveryType so a mismatched
  // or stale type string can never mask a real scheduled selection.
  if (selectedDeliveryType === "scheduled" || scheduledDate) {
    const dateLabel = formatScheduledDate(scheduledDate);
    // FreezerBoxScreen's modal captures an exact hour/minute, not a slot
    // bucket, so prefer the precise time pulled from scheduledDate itself.
    const timeLabel = formatScheduledTime(scheduledDate);
    if (dateLabel && timeLabel) return `Scheduled: ${dateLabel}, ${timeLabel}`;
    const slot = TIME_SLOT_LABELS[scheduledTimeSlot];
    if (dateLabel && slot) return `Scheduled: ${dateLabel} (${slot.label} - ${slot.sub})`;
    return "Scheduled delivery";
  }
  return "⚡ Delivery: Express (Today / Now)";
}

async function loadUserProfile() {
  try {
    const name  = await storage.getItem("user_name");
    const phone = await storage.getItem("user_phone");
    return { name: name || PROFILE_DEFAULTS.name, phone: phone || PROFILE_DEFAULTS.phone };
  } catch {
    return PROFILE_DEFAULTS;
  }
}

async function fetchDurations(city, boxId) {
  const res = await fetch(`${DURATIONS_API}?city=${encodeURIComponent(city)}&boxId=${encodeURIComponent(boxId)}`);
  if (!res.ok) throw new Error(`Durations request failed (${res.status})`);
  const data = await res.json();
  return data?.durations || [];
}

async function fetchFloors(city, boxId) {
  const res = await fetch(`${FLOORS_API}?city=${encodeURIComponent(city)}&boxId=${encodeURIComponent(boxId)}`);
  if (!res.ok) throw new Error(`Floors request failed (${res.status})`);
  const data = await res.json();
  return data?.floors || [];
}

const BillRow = ({ label, value, green }) => (
  <View style={styles.billRow}>
    <Text style={styles.billLabel}>{label}</Text>
    <Text style={[styles.billValue, green && { color: COLORS.green }]}>{value}</Text>
  </View>
);

export default function FreezerBoxBookingScreen({ navigation, route }) {
  const {
    selectedBox, markerCoord, confirmedAddress, resolvedCity,
    selectedDeliveryType = "express", scheduledDate = null, scheduledTimeSlot = null,
  } = route.params || {};

  // Captured directly from route.params on every navigation into this screen —
  // falls back to the local BOX_TYPES id only if the caller didn't pass one.
  const [selectedBoxId, setSelectedBoxId] = useState(
    route.params?.selectedBoxId || BOX_ID_MAP[selectedBox?.id] || selectedBox?.id || null
  );

  useEffect(() => {
    setSelectedBoxId(route.params?.selectedBoxId || BOX_ID_MAP[selectedBox?.id] || selectedBox?.id || null);
  }, [route.params?.selectedBoxId, selectedBox?.id]);

  const [durations, setDurations] = useState([]);
  const [durationsLoading, setDurationsLoading] = useState(true);
  const [durationsError, setDurationsError] = useState(null);

  const [floors, setFloors] = useState([]);
  const [floorsLoading, setFloorsLoading] = useState(true);
  const [floorsError, setFloorsError] = useState(null);

  const [durationId, setDurationId] = useState(null);
  const [floorId, setFloorId] = useState(null);
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [bookingPhase, setBookingPhase] = useState("searching");

  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancelReason, setCancelReason] = useState(null);

  const pulseAnim    = useRef(new Animated.Value(1)).current;
  const iconMoveAnim = useRef(new Animated.Value(0)).current;
  const dotPulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    loadUserProfile().then(p => { setCustomerName(p.name); setPhone(p.phone); });
  }, []);

  // Single combined fetch — both the durations and the floor-rule documents
  // for the active selectedBoxId are pulled from MongoDB together, in one
  // page lifecycle, so the two lists are always for the same box.
  function loadBoxData() {
    if (!selectedBoxId) return;
    setDurationsLoading(true);
    setFloorsLoading(true);
    setDurationsError(null);
    setFloorsError(null);
    Promise.all([fetchDurations(CITY, selectedBoxId), fetchFloors(CITY, selectedBoxId)])
      .then(([durs, fls]) => {
        setDurations(durs);
        setFloors(fls);
      })
      .catch(() => {
        setDurationsError("Could not load durations. Pull down to retry.");
        setFloorsError("Could not load floor options. Pull down to retry.");
      })
      .finally(() => {
        setDurationsLoading(false);
        setFloorsLoading(false);
      });
  }

  useEffect(() => {
    loadBoxData();
  }, [selectedBoxId]);

  useEffect(() => {
    if (!showOverlay || bookingPhase !== "searching") return;
    pulseAnim.setValue(1);
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.35, duration: 650, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 650, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
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

  const selectedDuration = durations.find(d => d.durationId === durationId) || null;
  const selectedFloor    = floors.find(f => f.floorId === floorId) || null;

  // Pricing is derived live from whichever duration + floor documents are
  // currently selected — no flat total or fixed discount is ever applied.
  // Embalming is bundled into the package at no extra client cost, so it
  // never adds to the live total — it's only ever shown as "Included".
  const bill = useMemo(() => {
    if (!selectedDuration || !selectedFloor) return null;
    const basePrice = selectedDuration.basePrice;
    const discountPercentage = selectedDuration.discountPercentage || 0;
    const discountAmt = Math.round(basePrice * (discountPercentage / 100));
    const finalPrice = basePrice - discountAmt;
    const embalmingIncluded = selectedDuration.embalmingIncluded === true;
    const helperCharge = selectedFloor.charge || 0;
    const total = (basePrice - discountAmt) + helperCharge;
    return { basePrice, discountPercentage, discountAmt, finalPrice, embalmingIncluded, helperCharge, total };
  }, [selectedDuration, selectedFloor]);

  const isPhoneValid = /^\d{10}$/.test(phone);
  const canSubmit = !!selectedDuration && !!selectedFloor;

  function handleBack() {
    navigation.goBack();
  }

  function openCancelModal() {
    setCancelReason(null);
    setCancelModalVisible(true);
  }

  function closeCancelModal() {
    setCancelModalVisible(false);
  }

  function handleConfirmCancel() {
    if (!cancelReason) return;
    setCancelModalVisible(false);
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate("Main");
    }
  }

  async function handleSubmit() {
    if (!canSubmit) {
      if (!isPhoneValid) Alert.alert("Invalid Number", "Please enter a valid 10-digit mobile number.");
      else if (!customerName.trim()) Alert.alert("Missing Name", "Please enter the customer name.");
      else Alert.alert("Incomplete", "Please select duration and floor.");
      return;
    }

    // Final order payload — carries the exact delivery window so the
    // backend can log whether this was an Express or Scheduled request.
    const orderPayload = {
      boxId: selectedBoxId,
      durationId: selectedDuration.durationId,
      floorId: selectedFloor.floorId,
      markerCoord,
      confirmedAddress,
      resolvedCity,
      customerName: customerName.trim(),
      phone,
      bill,
      selectedDeliveryType,
      scheduledDate,
      scheduledTimeSlot,
    };
    console.log("Freezer box order payload:", orderPayload);

    setSubmitting(true);
    setBookingPhase("searching");
    setShowOverlay(true);
    setSubmitting(false);
    setTimeout(() => setBookingPhase("confirmed"), 3000);
  }

  function handleCancelBooking() {
    setShowOverlay(false);
    setBookingPhase("searching");
    navigation.popToTop ? navigation.popToTop() : navigation.goBack();
  }

  if (!selectedBox || !selectedBoxId) {
    return (
      <View style={[styles.container, { alignItems: "center", justifyContent: "center" }]}>
        <Text style={{ color: COLORS.grayDim }}>Missing booking details. Please go back and try again.</Text>
        <TouchableOpacity style={[styles.btn, { marginTop: 18 }]} onPress={handleBack}>
          <Text style={styles.btnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={openCancelModal}>
          <Text style={{ color: COLORS.text, fontSize: 20 }}>←</Text>
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>Booking Details</Text>
          <Text style={styles.stepLbl}>Freezer Box · Checkout</Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 18 }} showsVerticalScrollIndicator={false}>

        {/* Summary card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Text style={{ fontSize: 28 }}>{selectedBox.icon}</Text>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.summaryName}>{selectedBox.name || BOX_NAMES[selectedBox.id]}</Text>
              {resolvedCity && (
                <Text style={styles.summaryRate}>{resolvedCity}</Text>
              )}
              <Text style={styles.summaryDelivery}>
                {formatDeliveryLine(selectedDeliveryType, scheduledDate, scheduledTimeSlot)}
              </Text>
            </View>
          </View>
          {confirmedAddress ? (
            <View style={styles.summaryAddrRow}>
              <Text style={styles.summaryAddrIcon}>📍</Text>
              <Text style={styles.summaryAddrText} numberOfLines={2}>{confirmedAddress}</Text>
            </View>
          ) : null}
        </View>

        {/* Duration — fetched live from the durations collection */}
        <Text style={styles.q}>Select Duration</Text>
        <Text style={styles.qHint}>Longer durations include embalming service</Text>

        {durationsLoading && <ActivityIndicator color={COLORS.red} style={{ marginVertical: 10 }} />}

        {durationsError && (
          <View style={styles.errorBox}>
            <Text style={styles.errorBoxText}>{durationsError}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={loadBoxData}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {!durationsLoading && !durationsError && durations.length === 0 && (
          <Text style={styles.qHint}>No durations available for this box right now.</Text>
        )}

        {durations.map(dur => {
          const discountAmt = Math.round(dur.basePrice * ((dur.discountPercentage || 0) / 100));
          const finalPrice = dur.basePrice - discountAmt;
          return (
            <TouchableOpacity key={dur.durationId}
              style={[styles.opt, durationId === dur.durationId && styles.optActive]}
              onPress={() => setDurationId(dur.durationId)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.optName}>{dur.label}</Text>
                <Text style={styles.optDesc}>
                  ₹{finalPrice.toLocaleString()}
                  {dur.discountPercentage > 0 ? `  ·  ${dur.discountPercentage}% off` : ""}
                  {dur.embalmingIncluded === true ? `  ·  Embalming Included` : ""}
                </Text>
              </View>
              <View style={[styles.radio, durationId === dur.durationId && styles.radioActive]}>
                {durationId === dur.durationId && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>
          );
        })}

        {/* Floor selector — fetched live from the floors collection; VIP boxes
            naturally only ever get the single "ground" document back */}
        <Text style={[styles.q, { marginTop: 8 }]}>Floor Selection</Text>
        <Text style={styles.qHint}>Helper charges vary by floor level</Text>

        {floorsLoading && <ActivityIndicator color={COLORS.red} style={{ marginVertical: 10 }} />}

        {floorsError && (
          <View style={styles.errorBox}>
            <Text style={styles.errorBoxText}>{floorsError}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={loadBoxData}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {!floorsLoading && !floorsError && floors.length === 0 && (
          <Text style={styles.qHint}>No floor options available for this box right now.</Text>
        )}

        {floors.map(fl => (
          <TouchableOpacity key={fl.floorId}
            style={[styles.opt, floorId === fl.floorId && styles.optActive]}
            onPress={() => setFloorId(fl.floorId)}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.optName}>{fl.label}</Text>
            </View>
            <Text style={fl.isFree ? styles.freeTag : styles.chargeTag}>
              {fl.isFree ? "Free" : `₹${fl.charge.toLocaleString()}`}
            </Text>
            <View style={[styles.radio, floorId === fl.floorId && styles.radioActive]}>
              {floorId === fl.floorId && <View style={styles.radioDot} />}
            </View>
          </TouchableOpacity>
        ))}

        {/* Bill breakdown — summed entirely from the fetched duration + floor docs */}
        {bill && (
          <View style={styles.billCard}>
            <Text style={styles.billTitle}>Bill Breakdown</Text>
            <BillRow label="Base Rent" value={`₹${bill.basePrice.toLocaleString()}`} />
            {bill.discountAmt > 0 && (
              <BillRow label={`Discount (${bill.discountPercentage}%)`} value={`– ₹${bill.discountAmt.toLocaleString()}`} green />
            )}
            {bill.embalmingIncluded && (
              <BillRow label="Embalming Charge" value="Included" green />
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

      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.btn, (!canSubmit || submitting) && { opacity: 0.4 }]}
          disabled={!canSubmit || submitting}
          onPress={handleSubmit}
        >
          {submitting
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>
                {bill ? `Confirm Booking  ·  ₹${bill.total.toLocaleString()}` : "Confirm Booking"}
              </Text>}
        </TouchableOpacity>
      </View>

      {/* Booking overlay */}
      <Modal visible={showOverlay} animationType="fade" statusBarTranslucent transparent>
        <View style={styles.ovBg}>

          {bookingPhase === "searching" ? (
            <View style={styles.ovSearching}>
              <Animated.Text style={[styles.ovEmoji, { transform: [{ scale: pulseAnim }] }]}>❄️</Animated.Text>
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
            <View style={styles.ovConfirmed}>
              <View style={styles.ovLiveBadge}>
                <View style={styles.ovLiveDot} />
                <Text style={styles.ovLiveText}>LIVE</Text>
              </View>

              <Animated.Text style={[styles.ovEmoji, { transform: [{ translateX: iconMoveAnim }], marginTop: 32 }]}>❄️</Animated.Text>

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

              <View style={styles.ovTeamCard}>
                <View style={styles.ovTeamAvatar}><Text style={{ fontSize: 24 }}>👤</Text></View>
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

              <TouchableOpacity style={styles.ovCancelBtn} onPress={handleCancelBooking} activeOpacity={0.8}>
                <Text style={styles.ovCancelText}>Cancel Booking</Text>
              </TouchableOpacity>
            </View>
          )}

        </View>
      </Modal>

      {/* Cancellation reason bottom sheet — triggered by the header back button */}
      <Modal
        visible={cancelModalVisible}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={closeCancelModal}
      >
        <View style={styles.cancelModalBackdrop}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeCancelModal} />

          <View style={styles.cancelModalSheet}>
            <View style={styles.cancelModalHandle} />

            <View style={styles.cancelModalHeaderRow}>
              <Text style={styles.cancelModalTitle}>Cancel Booking?</Text>
              <TouchableOpacity onPress={closeCancelModal}>
                <Text style={styles.cancelModalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.cancelModalSub}>Let us know why — this helps us improve</Text>

            {CANCEL_REASONS.map(reason => {
              const active = cancelReason === reason;
              return (
                <TouchableOpacity
                  key={reason}
                  style={[styles.cancelReasonRow, active && styles.cancelReasonRowActive]}
                  onPress={() => setCancelReason(reason)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.cancelReasonText, active && styles.cancelReasonTextActive]}>{reason}</Text>
                  <View style={[styles.cancelRadio, active && styles.cancelRadioActive]}>
                    {active && <View style={styles.cancelRadioDot} />}
                  </View>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity style={styles.cancelGoBackBtn} onPress={closeCancelModal} activeOpacity={0.75}>
              <Text style={styles.cancelGoBackText}>Go Back</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.cancelConfirmBtn, !cancelReason && { opacity: 0.4 }]}
              disabled={!cancelReason}
              onPress={handleConfirmCancel}
            >
              <Text style={styles.cancelConfirmText}>Cancel Booking</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingTop: 50 },

  header: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 18 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,0.06)", alignItems: "center", justifyContent: "center" },
  title: { color: COLORS.text, fontSize: 20, fontWeight: "700" },
  stepLbl: { color: COLORS.grayDim, fontSize: 11, marginTop: 2 },

  summaryCard: { backgroundColor: "rgba(232,25,44,0.06)", borderWidth: 1, borderColor: "rgba(232,25,44,0.25)", borderRadius: 16, padding: 16, marginBottom: 20 },
  summaryRow: { flexDirection: "row", alignItems: "center" },
  summaryName: { color: COLORS.text, fontSize: 16, fontWeight: "700" },
  summaryRate: { color: COLORS.grayDim, fontSize: 12, marginTop: 3 },
  summaryDelivery: { color: COLORS.red, fontSize: 12, fontWeight: "700", marginTop: 5 },
  summaryAddrRow: { flexDirection: "row", gap: 8, alignItems: "flex-start", marginTop: 12, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: "rgba(0,0,0,0.08)" },
  summaryAddrIcon: { fontSize: 13 },
  summaryAddrText: { color: COLORS.gray, fontSize: 12, flex: 1, lineHeight: 18 },

  q: { color: COLORS.text, fontSize: 17, fontWeight: "700", marginBottom: 6 },
  qHint: { color: COLORS.grayDim, fontSize: 12, marginBottom: 14 },

  opt: { flexDirection: "row", alignItems: "center", gap: 14, padding: 15, backgroundColor: "rgba(0,0,0,0.03)", borderRadius: 14, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)", marginBottom: 10 },
  optActive: { borderColor: "rgba(232,25,44,0.5)", backgroundColor: "rgba(232,25,44,0.08)" },
  optName: { color: COLORS.text, fontWeight: "600", fontSize: 15 },
  optDesc: { color: COLORS.grayDim, fontSize: 12, marginTop: 3 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: "rgba(0,0,0,0.3)", alignItems: "center", justifyContent: "center" },
  radioActive: { borderColor: COLORS.red },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: COLORS.red },
  freeTag: { color: COLORS.green, fontSize: 12, fontWeight: "700", marginRight: 8 },
  chargeTag: { color: COLORS.grayDim, fontSize: 12, fontWeight: "600", marginRight: 8 },

  errorBox: { backgroundColor: "rgba(232,25,44,0.06)", borderWidth: 0.5, borderColor: "rgba(232,25,44,0.3)", borderRadius: 12, padding: 14, marginBottom: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  errorBoxText: { color: COLORS.red, fontSize: 12, flex: 1 },
  retryBtn: { backgroundColor: COLORS.red, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  retryBtnText: { color: COLORS.white, fontSize: 12, fontWeight: "700" },

  fieldLabel: { color: COLORS.grayDim, fontSize: 11, letterSpacing: 0.5, marginBottom: 6, marginTop: 4 },
  input: { backgroundColor: "rgba(0,0,0,0.05)", borderWidth: 0.5, borderColor: "rgba(0,0,0,0.1)", borderRadius: 10, padding: 12, color: COLORS.text, fontSize: 14, marginBottom: 10 },
  errorText: { color: COLORS.red, fontSize: 11, marginTop: -4, marginBottom: 10 },

  billCard: { backgroundColor: "rgba(0,0,0,0.03)", borderWidth: 0.5, borderColor: "rgba(232,25,44,0.3)", borderRadius: 16, padding: 18, marginTop: 8, marginBottom: 8 },
  billTitle: { color: COLORS.text, fontSize: 15, fontWeight: "700", marginBottom: 14 },
  billRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  billLabel: { color: COLORS.grayDim, fontSize: 13 },
  billValue: { color: COLORS.text, fontSize: 13, fontWeight: "600" },
  billDivider: { height: 0.5, backgroundColor: "rgba(0,0,0,0.1)", marginVertical: 10 },
  billTotalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  billTotalLabel: { color: COLORS.text, fontSize: 16, fontWeight: "700" },
  billTotal: { color: COLORS.red, fontSize: 24, fontWeight: "800" },

  footer: { padding: 18 },
  btn: { backgroundColor: COLORS.red, borderRadius: 12, paddingVertical: 16, alignItems: "center" },
  btnText: { color: COLORS.white, fontSize: 16, fontWeight: "700" },

  ovBg: { flex: 1, backgroundColor: "rgba(5,6,8,0.97)", justifyContent: "center", alignItems: "center", paddingHorizontal: 24 },
  ovEmoji: { fontSize: 72, textAlign: "center" },

  ovSearching: { alignItems: "center", width: "100%" },
  ovSearchTitle: { color: COLORS.white, fontSize: 20, fontWeight: "700", textAlign: "center", marginTop: 28, lineHeight: 28 },
  ovSearchSub: { color: COLORS.grayDim, fontSize: 13, textAlign: "center", marginTop: 10, lineHeight: 20 },
  ovAddrRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 20, paddingHorizontal: 8 },
  ovAddrIcon: { fontSize: 14, marginTop: 1 },
  ovAddrText: { color: COLORS.red, fontSize: 13, fontWeight: "600", flex: 1, textAlign: "center" },

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

  // Cancellation reason modal — bottom sheet
  cancelModalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  cancelModalSheet: { backgroundColor: COLORS.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 28, maxHeight: "85%" },
  cancelModalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(0,0,0,0.15)", alignSelf: "center", marginBottom: 14 },
  cancelModalHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  cancelModalTitle: { color: COLORS.text, fontSize: 18, fontWeight: "700" },
  cancelModalClose: { color: COLORS.grayDim, fontSize: 16, padding: 4 },
  cancelModalSub: { color: COLORS.grayDim, fontSize: 12.5, marginBottom: 16 },

  cancelReasonRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 14, backgroundColor: "rgba(0,0,0,0.03)",
    borderRadius: 14, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)",
    marginBottom: 10,
  },
  cancelReasonRowActive: { borderColor: "rgba(232,25,44,0.5)", backgroundColor: "rgba(232,25,44,0.08)" },
  cancelReasonText: { color: COLORS.text, fontSize: 14, fontWeight: "500" },
  cancelReasonTextActive: { color: COLORS.text, fontWeight: "700" },
  cancelRadio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: "rgba(0,0,0,0.3)", alignItems: "center", justifyContent: "center" },
  cancelRadioActive: { borderColor: COLORS.red },
  cancelRadioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: COLORS.red },

  cancelGoBackBtn: { paddingVertical: 14, alignItems: "center", marginTop: 4 },
  cancelGoBackText: { color: COLORS.grayDim, fontSize: 14, fontWeight: "600" },

  cancelConfirmBtn: { backgroundColor: COLORS.red, borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 4 },
  cancelConfirmText: { color: COLORS.white, fontSize: 16, fontWeight: "700" },
});
