import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Switch, Alert,
} from "react-native";
import { COLORS } from "../theme";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const STEPS = ["trip", "schedule", "ambulance", "review"];

const TRIP_TYPES  = ["One Way", "Round Trip"];
const PURPOSES    = [
  { id: "dialysis",    label: "💉 Dialysis" },
  { id: "chemo",       label: "🧪 Chemotherapy" },
  { id: "physio",      label: "🦾 Physiotherapy" },
  { id: "checkup",     label: "🩺 Regular Checkup" },
  { id: "other",       label: "— Other" },
];
const FREQUENCIES = ["Daily", "Weekly", "Monthly", "Custom"];
const WEEK_DAYS   = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const NUM_MONTHS  = ["1", "2", "3", "6", "12"];
const AMBULANCE_TYPES = [
  { id: "bls_van",   icon: "🚐", name: "BLS — Maruti Van",       tag: "Basic Life Support",            desc: "Ideal for regular checkups & small clinics" },
  { id: "bls_tempo", icon: "🚌", name: "BLS — Tempo Traveller",  tag: "Basic Life Support",            desc: "Larger capacity for patient comfort" },
  { id: "als",       icon: "🏥", name: "ALS",                    tag: "Advanced Life Support",         desc: "For dialysis, chemotherapy patients" },
  { id: "acls",      icon: "❤️", name: "ACLS",                   tag: "Advanced Cardiac Life Support", desc: "Premium support for high-risk patients" },
];

const SummaryRow = ({ label, value }) => (
  <View style={styles.sumRow}>
    <Text style={styles.sumLabel}>{label}</Text>
    <Text style={styles.sumValue}>{value}</Text>
  </View>
);

function makeDateChips(fromDate, count = 5) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(fromDate);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function formatDate(d) {
  return `${DAY_NAMES[d.getDay()]}, ${d.getDate()} ${MON_NAMES[d.getMonth()]}`;
}

export default function ScheduleScreen({ navigation }) {
  const [step, setStep] = useState(1);
  const cur = STEPS[step - 1];

  // ── Step 1: Trip Details ──
  const [pickupLoc,   setPickupLoc]   = useState("");
  const [dropLoc,     setDropLoc]     = useState("");
  const [tripType,    setTripType]    = useState("One Way");
  const [returnTime,  setReturnTime]  = useState("");
  const [purpose,     setPurpose]     = useState(null);

  // ── Step 2: Schedule ──
  const [frequency,   setFrequency]   = useState(null);
  const todayMid = (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })();
  const [startDate,   setStartDate]   = useState(todayMid);
  const [endDateText, setEndDateText] = useState("");
  const [weekDays,    setWeekDays]    = useState([]);
  const [dayOfMonth,  setDayOfMonth]  = useState(null);
  const [numMonths,   setNumMonths]   = useState(null);
  const [timeAmPm,    setTimeAmPm]    = useState(null);
  const [timeHour,    setTimeHour]    = useState(null);
  const startChips = makeDateChips(todayMid, 5);

  // ── Step 3: Ambulance & Patient ──
  const [ambulance,    setAmbulance]    = useState(null);
  const [patientName,  setPatientName]  = useState("");
  const [patientAge,   setPatientAge]   = useState("");
  const [condition,    setCondition]    = useState("");
  const [wheelchair,   setWheelchair]   = useState(false);
  const [stretcher,    setStretcher]    = useState(false);

  const selectedAmb     = AMBULANCE_TYPES.find(a => a.id === ambulance);
  const selectedPurpose = PURPOSES.find(p => p.id === purpose);

  function toggleWeekDay(d) {
    setWeekDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  }

  const freqReady =
    !frequency ? false :
    frequency === "Weekly"  ? weekDays.length > 0 :
    frequency === "Monthly" ? !!dayOfMonth && !!numMonths :
    true;

  const canNext =
    cur === "trip"      ? pickupLoc.trim().length > 0 && dropLoc.trim().length > 0 && !!purpose :
    cur === "schedule"  ? freqReady && !!timeHour && !!timeAmPm :
    cur === "ambulance" ? !!ambulance && patientName.trim().length > 0 :
    cur === "review"    ? true : false;

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
      "Our team will call you to confirm the schedule and pricing.",
      [{ text: "OK", onPress: () => navigation?.goBack() }]
    );
  }

  function scheduleText() {
    if (!frequency) return "—";
    if (frequency === "Daily")   return `Daily · from ${formatDate(startDate)}${endDateText ? ` to ${endDateText}` : ""}`;
    if (frequency === "Weekly")  return `Weekly · ${weekDays.join(", ")} · from ${formatDate(startDate)}`;
    if (frequency === "Monthly") return `Monthly · Day ${dayOfMonth} · for ${numMonths} month(s)`;
    if (frequency === "Custom")  return `Custom · from ${formatDate(startDate)}${endDateText ? ` to ${endDateText}` : ""}`;
    return "—";
  }

  function timeText() {
    if (!timeHour || !timeAmPm) return "—";
    return `${timeHour}:00 ${timeAmPm}`;
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

      {/* Summary bar — step 2+ */}
      {step > 1 && (
        <View style={styles.fareBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fareLbl}>
              {pickupLoc}  →  {dropLoc}
            </Text>
            <Text style={styles.fareAmt} numberOfLines={1}>
              {frequency ? `${frequency}  ·  ${timeText()}` : "Set schedule in next step"}
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
      >

        {/* ── Step 1: Trip Details ── */}
        {cur === "trip" && (
          <>
            <Text style={styles.q}>Trip Details</Text>
            <Text style={styles.qHint}>Enter pickup, drop location and trip purpose</Text>

            <Text style={styles.fieldLabel}>Pickup location *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Home address"
              placeholderTextColor={COLORS.grayDim}
              value={pickupLoc}
              onChangeText={setPickupLoc}
            />

            <Text style={styles.fieldLabel}>Drop location *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Hospital name & address"
              placeholderTextColor={COLORS.grayDim}
              value={dropLoc}
              onChangeText={setDropLoc}
            />

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

        {/* ── Step 2: Schedule Frequency ── */}
        {cur === "schedule" && (
          <>
            <Text style={styles.q}>Schedule Frequency</Text>
            <Text style={styles.qHint}>How often do you need the ambulance?</Text>

            <Text style={styles.sectionLabel}>Frequency *</Text>
            <View style={styles.pillRow}>
              {FREQUENCIES.map(f => (
                <TouchableOpacity
                  key={f}
                  style={[styles.pill, frequency === f && styles.pillActive]}
                  onPress={() => setFrequency(f)}
                >
                  <Text style={[styles.pillText, frequency === f && styles.pillTextActive]}>{f}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* ── Daily ── */}
            {frequency === "Daily" && (
              <>
                <Text style={styles.sectionLabel}>Start date</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}
                  style={styles.dateChipScroll}
                  contentContainerStyle={{ gap: 6, paddingHorizontal: 2, paddingBottom: 4 }}
                >
                  {startChips.map((d, i) => {
                    const isSel = startDate && d.toDateString() === startDate.toDateString();
                    return (
                      <TouchableOpacity key={i} style={[styles.dateChip, isSel && styles.dateChipSel]}
                        onPress={() => setStartDate(d)} activeOpacity={0.75}>
                        <Text style={[styles.dateChipDay, isSel && { color: "rgba(255,255,255,0.8)" }]}>
                          {d.toDateString() === todayMid.toDateString() ? "TODAY" : DAY_NAMES[d.getDay()].toUpperCase()}
                        </Text>
                        <Text style={[styles.dateChipNum, isSel && { color: COLORS.white }]}>{d.getDate()}</Text>
                        <Text style={[styles.dateChipMon, isSel && { color: "rgba(255,255,255,0.7)" }]}>{MON_NAMES[d.getMonth()]}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                <Text style={styles.sectionLabel}>End date</Text>
                <TextInput style={styles.input} placeholder="e.g. 31 Dec 2025 or 3 months"
                  placeholderTextColor={COLORS.grayDim} value={endDateText} onChangeText={setEndDateText} />
              </>
            )}

            {/* ── Weekly ── */}
            {frequency === "Weekly" && (
              <>
                <Text style={styles.sectionLabel}>Days of week * (multi-select)</Text>
                <View style={styles.pillRow}>
                  {WEEK_DAYS.map(d => (
                    <TouchableOpacity key={d}
                      style={[styles.dayPill, weekDays.includes(d) && styles.pillActive]}
                      onPress={() => toggleWeekDay(d)}
                    >
                      <Text style={[styles.pillText, weekDays.includes(d) && styles.pillTextActive]}>{d}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.sectionLabel}>Start date</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}
                  style={styles.dateChipScroll}
                  contentContainerStyle={{ gap: 6, paddingHorizontal: 2, paddingBottom: 4 }}
                >
                  {startChips.map((d, i) => {
                    const isSel = startDate && d.toDateString() === startDate.toDateString();
                    return (
                      <TouchableOpacity key={i} style={[styles.dateChip, isSel && styles.dateChipSel]}
                        onPress={() => setStartDate(d)} activeOpacity={0.75}>
                        <Text style={[styles.dateChipDay, isSel && { color: "rgba(255,255,255,0.8)" }]}>
                          {d.toDateString() === todayMid.toDateString() ? "TODAY" : DAY_NAMES[d.getDay()].toUpperCase()}
                        </Text>
                        <Text style={[styles.dateChipNum, isSel && { color: COLORS.white }]}>{d.getDate()}</Text>
                        <Text style={[styles.dateChipMon, isSel && { color: "rgba(255,255,255,0.7)" }]}>{MON_NAMES[d.getMonth()]}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                <Text style={styles.sectionLabel}>End date</Text>
                <TextInput style={styles.input} placeholder="e.g. 31 Dec 2025 or ongoing"
                  placeholderTextColor={COLORS.grayDim} value={endDateText} onChangeText={setEndDateText} />
              </>
            )}

            {/* ── Monthly ── */}
            {frequency === "Monthly" && (
              <>
                <Text style={styles.sectionLabel}>Date of month *</Text>
                <View style={styles.monthGrid}>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map(n => (
                    <TouchableOpacity key={n}
                      style={[styles.monthDayChip, dayOfMonth === n && styles.pillActive]}
                      onPress={() => setDayOfMonth(n)}
                    >
                      <Text style={[styles.monthDayText, dayOfMonth === n && styles.pillTextActive]}>
                        {n}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.sectionLabel}>Number of months *</Text>
                <View style={styles.pillRow}>
                  {NUM_MONTHS.map(n => (
                    <TouchableOpacity key={n}
                      style={[styles.pill, numMonths === n && styles.pillActive]}
                      onPress={() => setNumMonths(n)}
                    >
                      <Text style={[styles.pillText, numMonths === n && styles.pillTextActive]}>
                        {n} {n === "1" ? "Month" : "Months"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* ── Custom ── */}
            {frequency === "Custom" && (
              <>
                <Text style={styles.sectionLabel}>Start date</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}
                  style={styles.dateChipScroll}
                  contentContainerStyle={{ gap: 6, paddingHorizontal: 2, paddingBottom: 4 }}
                >
                  {startChips.map((d, i) => {
                    const isSel = startDate && d.toDateString() === startDate.toDateString();
                    return (
                      <TouchableOpacity key={i} style={[styles.dateChip, isSel && styles.dateChipSel]}
                        onPress={() => setStartDate(d)} activeOpacity={0.75}>
                        <Text style={[styles.dateChipDay, isSel && { color: "rgba(255,255,255,0.8)" }]}>
                          {d.toDateString() === todayMid.toDateString() ? "TODAY" : DAY_NAMES[d.getDay()].toUpperCase()}
                        </Text>
                        <Text style={[styles.dateChipNum, isSel && { color: COLORS.white }]}>{d.getDate()}</Text>
                        <Text style={[styles.dateChipMon, isSel && { color: "rgba(255,255,255,0.7)" }]}>{MON_NAMES[d.getMonth()]}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                <Text style={styles.sectionLabel}>End date / duration</Text>
                <TextInput style={styles.input} placeholder="e.g. 31 Dec 2025 or specify dates"
                  placeholderTextColor={COLORS.grayDim} value={endDateText} onChangeText={setEndDateText} />
              </>
            )}

            {/* ── Preferred Time (all frequencies) ── */}
            {!!frequency && (
              <>
                <View style={styles.timeDivider} />
                <Text style={styles.sectionLabel}>Preferred time *</Text>
                <View style={styles.ampmRow}>
                  {["AM", "PM"].map(ap => (
                    <TouchableOpacity key={ap}
                      style={[styles.ampmBtn, timeAmPm === ap && styles.ampmBtnSel]}
                      onPress={() => { setTimeAmPm(ap); if (timeHour) setTimeHour(null); }}
                    >
                      <Text style={[styles.ampmText, timeAmPm === ap && { color: COLORS.white }]}>{ap}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.sectionLabel}>Hour</Text>
                <View style={styles.hourGrid}>
                  {[1,2,3,4,5,6,7,8,9,10,11,12].map(h => (
                    <TouchableOpacity key={h}
                      style={[styles.hourChip, timeHour === h && styles.hourChipSel]}
                      onPress={() => setTimeHour(h)}
                    >
                      <Text style={[styles.hourChipText, timeHour === h && { color: COLORS.white, fontWeight: "800" }]}>{h}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {timeHour && timeAmPm && (
                  <View style={styles.timeConfirm}>
                    <Text style={styles.timeConfirmText}>🕐  {timeHour}:00 {timeAmPm} selected</Text>
                  </View>
                )}
              </>
            )}
          </>
        )}

        {/* ── Step 3: Ambulance & Patient ── */}
        {cur === "ambulance" && (
          <>
            <Text style={styles.q}>Ambulance & Patient</Text>
            <Text style={styles.qHint}>Select ambulance type and enter patient details</Text>

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
          </>
        )}

        {/* ── Step 4: Review & Submit ── */}
        {cur === "review" && (
          <>
            <Text style={styles.q}>Review & Confirm</Text>
            <Text style={styles.qHint}>Check your schedule before submitting</Text>

            <View style={styles.reviewCard}>
              <View style={styles.reviewCardHeader}>
                <Text style={styles.reviewCardIcon}>🗺️</Text>
                <Text style={styles.reviewCardTitle}>Trip Details</Text>
              </View>
              <SummaryRow label="Pickup"  value={pickupLoc} />
              <SummaryRow label="Drop"    value={dropLoc} />
              <SummaryRow label="Type"    value={tripType} />
              {tripType === "Round Trip" && returnTime.length > 0 &&
                <SummaryRow label="Return" value={returnTime} />}
              <SummaryRow label="Purpose" value={selectedPurpose?.label ?? "—"} />
            </View>

            <View style={styles.reviewCard}>
              <View style={styles.reviewCardHeader}>
                <Text style={styles.reviewCardIcon}>📅</Text>
                <Text style={styles.reviewCardTitle}>Schedule</Text>
              </View>
              <SummaryRow label="Frequency" value={scheduleText()} />
              <SummaryRow label="Time"      value={timeText()} />
            </View>

            <View style={styles.reviewCard}>
              <View style={styles.reviewCardHeader}>
                <Text style={styles.reviewCardIcon}>{selectedAmb?.icon ?? "🚑"}</Text>
                <Text style={styles.reviewCardTitle}>Ambulance & Patient</Text>
              </View>
              <SummaryRow label="Ambulance" value={selectedAmb?.name ?? "—"} />
              <SummaryRow label="Support"   value={selectedAmb?.tag  ?? "—"} />
              <SummaryRow label="Patient"   value={patientName} />
              {patientAge.length > 0 && <SummaryRow label="Age" value={patientAge} />}
              {condition.length > 0  && <SummaryRow label="Condition" value={condition} />}
              <SummaryRow label="Add-ons"
                value={[wheelchair && "Wheelchair", stretcher && "Stretcher"].filter(Boolean).join(", ") || "None"} />
            </View>

            <View style={styles.pricingBox}>
              <Text style={styles.pricingIcon}>ℹ️</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.pricingTitle}>Pricing information</Text>
                <Text style={styles.pricingText}>
                  Scheduled ambulance pricing depends on frequency, distance and ambulance type. Our team will confirm the rate after reviewing your schedule.
                </Text>
              </View>
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
            {cur === "review" ? "📅  Schedule Ambulance" : "Next →"}
          </Text>
        </TouchableOpacity>
        {cur === "review" && (
          <Text style={styles.submitNote}>Our team will call you to confirm the schedule</Text>
        )}
      </View>
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
  inputMulti: { height: 80, textAlignVertical: "top" },

  // Purpose / org chips
  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 10, borderWidth: 0.5, borderColor: "rgba(0,0,0,0.1)", backgroundColor: "rgba(0,0,0,0.03)" },
  chipActive: { backgroundColor: "rgba(232,25,44,0.15)", borderColor: "rgba(232,25,44,0.5)" },
  chipText: { color: COLORS.grayDim, fontSize: 13 },
  chipTextActive: { color: COLORS.red, fontWeight: "600" },

  // Frequency / trip pills
  sectionLabel: { color: COLORS.grayDim, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10, marginTop: 16 },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 0.5, borderColor: "rgba(0,0,0,0.1)", backgroundColor: "rgba(0,0,0,0.03)" },
  pillActive: { backgroundColor: COLORS.red, borderColor: COLORS.red },
  pillText: { color: COLORS.grayDim, fontSize: 13 },
  pillTextActive: { color: COLORS.white, fontWeight: "700" },

  // Weekday pills (square compact)
  dayPill: { width: 44, alignItems: "center", paddingVertical: 9, borderRadius: 10, borderWidth: 0.5, borderColor: "rgba(0,0,0,0.1)", backgroundColor: "rgba(0,0,0,0.03)" },

  // Month day grid
  monthGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 4 },
  monthDayChip: { width: 40, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 8, borderWidth: 0.5, borderColor: "rgba(0,0,0,0.1)", backgroundColor: "rgba(0,0,0,0.03)" },
  monthDayText: { color: COLORS.grayDim, fontSize: 13 },

  // Date chips
  dateChipScroll: { marginTop: 2, marginBottom: 2 },
  dateChip: { width: 48, height: 60, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.04)", borderWidth: 0.5, borderColor: "rgba(0,0,0,0.08)" },
  dateChipSel: { backgroundColor: COLORS.red, borderColor: COLORS.red },
  dateChipDay: { color: COLORS.grayDim, fontSize: 8, fontWeight: "700", letterSpacing: 0.3, marginBottom: 2 },
  dateChipNum: { color: COLORS.text, fontSize: 17, fontWeight: "800", lineHeight: 20 },
  dateChipMon: { color: COLORS.grayDim, fontSize: 8, marginTop: 2 },

  // Time picker
  timeDivider: { height: 0.5, backgroundColor: "rgba(0,0,0,0.08)", marginVertical: 16 },
  ampmRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
  ampmBtn: { flex: 1, height: 42, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.04)", borderWidth: 0.5, borderColor: "rgba(0,0,0,0.1)", borderRadius: 10 },
  ampmBtnSel: { backgroundColor: COLORS.red, borderColor: COLORS.red },
  ampmText: { color: COLORS.grayDim, fontSize: 14, fontWeight: "700", letterSpacing: 1.5 },
  hourGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  hourChip: { width: "23%", height: 44, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.04)", borderWidth: 0.5, borderColor: "rgba(0,0,0,0.1)", borderRadius: 10 },
  hourChipSel: { backgroundColor: COLORS.red, borderColor: COLORS.red },
  hourChipText: { color: COLORS.text, fontSize: 16, fontWeight: "600" },
  timeConfirm: { padding: 10, backgroundColor: "rgba(232,25,44,0.08)", borderWidth: 0.5, borderColor: "rgba(232,25,44,0.3)", borderRadius: 10, alignItems: "center" },
  timeConfirmText: { color: COLORS.red, fontSize: 13, fontWeight: "700" },

  // Ambulance option cards
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

  // Review cards
  reviewCard: { backgroundColor: "rgba(0,0,0,0.03)", borderWidth: 0.5, borderColor: "rgba(0,0,0,0.08)", borderRadius: 14, padding: 16, marginBottom: 10 },
  reviewCardHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  reviewCardIcon: { fontSize: 18 },
  reviewCardTitle: { color: COLORS.text, fontSize: 14, fontWeight: "600" },
  sumRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
  sumLabel: { color: COLORS.grayDim, fontSize: 12, flex: 0.32 },
  sumValue: { color: COLORS.text, fontSize: 12, fontWeight: "500", flex: 0.68, textAlign: "right" },

  // Pricing info
  pricingBox: { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: "rgba(59,130,246,0.07)", borderWidth: 0.5, borderColor: "rgba(59,130,246,0.25)", borderRadius: 12, padding: 14 },
  pricingIcon: { fontSize: 18, marginTop: 1 },
  pricingTitle: { color: "#2563eb", fontSize: 13, fontWeight: "600", marginBottom: 3 },
  pricingText: { color: "#3b82f6", fontSize: 12, lineHeight: 18 },

  // Footer
  footer: { padding: 18 },
  btn: { backgroundColor: COLORS.red, borderRadius: 12, paddingVertical: 16, alignItems: "center" },
  btnText: { color: COLORS.white, fontSize: 16, fontWeight: "700" },
  submitNote: { color: COLORS.grayDim, fontSize: 12, textAlign: "center", marginTop: 10 },
});
