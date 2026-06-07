import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert,
} from "react-native";
import { COLORS } from "../theme";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const MEDICAL_CONDITIONS = [
  { id: "cardiac",     label: "❤️ Cardiac emergency" },
  { id: "respiratory", label: "🫁 Respiratory distress" },
  { id: "stroke",      label: "🧠 Stroke / neurological" },
  { id: "trauma",      label: "🚑 Trauma / accident" },
  { id: "surgery",     label: "🏥 Post-surgery transfer" },
  { id: "other",       label: "— Other" },
];

const FLIGHT_TYPES = [
  { id: "charter",    label: "✈️ Charter Aircraft", desc: "Fixed-wing for long distances" },
  { id: "helicopter", label: "🚁 Helicopter",        desc: "Rapid short-range response" },
  { id: "icu_jet",    label: "🛩️ ICU Jet",           desc: "Full ICU setup on board" },
  { id: "fixed_wing", label: "🛫 Fixed Wing",         desc: "Standard medical aircraft" },
];

const EQUIPMENT_OPTIONS = [
  { id: "ventilator",    label: "🫁 Ventilator" },
  { id: "defibrillator", label: "⚡ Defibrillator" },
  { id: "oxygen",        label: "💨 Oxygen supply" },
  { id: "iv_drip",       label: "💉 IV / Drip setup" },
  { id: "stretcher",     label: "🛏️ Stretcher" },
  { id: "incubator",     label: "🍼 Incubator" },
  { id: "monitor",       label: "📟 Cardiac monitor" },
  { id: "suction",       label: "🩺 Suction unit" },
];

const STAFF_OPTIONS = [
  { id: "doctor",    label: "👨‍⚕️ Doctor" },
  { id: "nurse",     label: "👩‍⚕️ Nurse" },
  { id: "paramedic", label: "🩺 Paramedic" },
  { id: "caretaker", label: "🤝 Caretaker" },
];

const GENDERS = ["M", "F", "O"];

export default function AirAmbulanceScreen({ navigation }) {
  const [patientName,     setPatientName]     = useState("");
  const [age,             setAge]             = useState("");
  const [gender,          setGender]          = useState("M");
  const [conditions,      setConditions]      = useState([]);
  const [flightType,      setFlightType]      = useState("charter");
  const [isInternational, setIsInternational] = useState(false);
  const [pickupAirport,   setPickupAirport]   = useState("");
  const [dropAirport,     setDropAirport]     = useState("");
  const [equipment,       setEquipment]       = useState([]);
  const [staff,           setStaff]           = useState([]);
  const [contactName,     setContactName]     = useState("");
  const [contactPhone,    setContactPhone]    = useState("");
  const [note,            setNote]            = useState("");

  const todayMidnight = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
  const [selectedDate, setSelectedDate] = useState(todayMidnight);
  const dateChips = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(todayMidnight);
    d.setDate(d.getDate() + i);
    return d;
  });

  const toggleCondition = (id) =>
    setConditions(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);

  const toggleEquipment = (id) =>
    setEquipment(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]);

  const toggleStaff = (id) =>
    setStaff(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);

  function handleSubmit() {
    if (!patientName || !pickupAirport || !dropAirport) {
      Alert.alert("Missing details", "Please fill in patient name, origin and destination.");
      return;
    }
    if (!contactPhone) {
      Alert.alert("Missing details", "Please provide a contact phone number.");
      return;
    }
    Alert.alert(
      "Request submitted!",
      "Our air ambulance team will call you within 15 minutes.",
      [{ text: "OK", onPress: () => navigation?.goBack() }]
    );
  }

  return (
    <View style={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation?.goBack()}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Air Ambulance</Text>
          <Text style={styles.headerSub}>Rapid medical air transport, domestic & international</Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Banner */}
        <View style={styles.banner}>
          <Text style={styles.bannerIcon}>✈️</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>Critical care air transport with full medical support</Text>
            <Text style={styles.bannerBadge}>● 24×7 emergency air service</Text>
          </View>
        </View>

        {/* ── Patient information ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardIcon}>👤</Text>
            <Text style={styles.cardTitle}>Patient information</Text>
          </View>

          <Text style={styles.label}>Full name *</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter patient's full name"
            placeholderTextColor={COLORS.grayDim}
            value={patientName}
            onChangeText={setPatientName}
          />

          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.label}>Age</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 45"
                placeholderTextColor={COLORS.grayDim}
                keyboardType="numeric"
                value={age}
                onChangeText={setAge}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Gender</Text>
              <View style={styles.row}>
                {GENDERS.map(g => (
                  <TouchableOpacity
                    key={g}
                    style={[styles.toggleBtn, gender === g && styles.toggleBtnActive]}
                    onPress={() => setGender(g)}
                  >
                    <Text style={[styles.toggleBtnText, gender === g && styles.toggleBtnTextActive]}>{g}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          <Text style={styles.label}>Medical condition</Text>
          <View style={styles.chipGrid}>
            {MEDICAL_CONDITIONS.map(c => (
              <TouchableOpacity
                key={c.id}
                style={[styles.conditionChip, conditions.includes(c.id) && styles.conditionChipActive]}
                onPress={() => toggleCondition(c.id)}
              >
                <Text style={[styles.conditionChipText, conditions.includes(c.id) && styles.conditionChipTextActive]}>
                  {c.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Flight details ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardIcon}>🛩️</Text>
            <Text style={styles.cardTitle}>Flight details</Text>
          </View>

          {/* Domestic / International toggle */}
          <Text style={styles.label}>Flight category</Text>
          <View style={styles.domIntlRow}>
            <TouchableOpacity
              style={[styles.domIntlBtn, !isInternational && styles.domIntlBtnActive]}
              onPress={() => setIsInternational(false)}
            >
              <Text style={[styles.domIntlBtnText, !isInternational && styles.domIntlBtnTextActive]}>
                🇮🇳  Domestic
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.domIntlBtn, isInternational && styles.domIntlBtnActive]}
              onPress={() => setIsInternational(true)}
            >
              <Text style={[styles.domIntlBtnText, isInternational && styles.domIntlBtnTextActive]}>
                🌐  International
              </Text>
            </TouchableOpacity>
          </View>

          {/* Aircraft type cards */}
          <Text style={styles.label}>Aircraft type</Text>
          <View style={styles.flightTypeGrid}>
            {FLIGHT_TYPES.map(ft => (
              <TouchableOpacity
                key={ft.id}
                style={[styles.flightTypeCard, flightType === ft.id && styles.flightTypeCardActive]}
                onPress={() => setFlightType(ft.id)}
                activeOpacity={0.75}
              >
                <Text style={styles.flightTypeLabel}>{ft.label}</Text>
                <Text style={[styles.flightTypeDesc, flightType === ft.id && styles.flightTypeDescActive]}>
                  {ft.desc}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Route */}
          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.label}>{isInternational ? "Origin airport / city *" : "Origin city / airport *"}</Text>
              <TextInput
                style={styles.input}
                placeholder="From"
                placeholderTextColor={COLORS.grayDim}
                value={pickupAirport}
                onChangeText={setPickupAirport}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{isInternational ? "Dest. airport / city *" : "Dest. city / airport *"}</Text>
              <TextInput
                style={styles.input}
                placeholder="To"
                placeholderTextColor={COLORS.grayDim}
                value={dropAirport}
                onChangeText={setDropAirport}
              />
            </View>
          </View>

          {/* Travel date */}
          <Text style={styles.label}>Travel date</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.dateChipScroll}
            contentContainerStyle={{ gap: 6, paddingHorizontal: 2 }}
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
        </View>

        {/* ── Medical equipment ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardIcon}>🏥</Text>
            <Text style={styles.cardTitle}>Medical equipment required</Text>
          </View>
          <View style={styles.chipGrid}>
            {EQUIPMENT_OPTIONS.map(e => (
              <TouchableOpacity
                key={e.id}
                style={[styles.conditionChip, equipment.includes(e.id) && styles.conditionChipActive]}
                onPress={() => toggleEquipment(e.id)}
              >
                <Text style={[styles.conditionChipText, equipment.includes(e.id) && styles.conditionChipTextActive]}>
                  {e.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Medical staff ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardIcon}>🩺</Text>
            <Text style={styles.cardTitle}>Medical staff required</Text>
          </View>
          <View style={styles.staffGrid}>
            {STAFF_OPTIONS.map(s => (
              <TouchableOpacity
                key={s.id}
                style={[styles.staffBtn, staff.includes(s.id) && styles.staffBtnActive]}
                onPress={() => toggleStaff(s.id)}
              >
                <Text style={[styles.staffBtnText, staff.includes(s.id) && styles.staffBtnTextActive]}>
                  {s.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Contact form ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardIcon}>📞</Text>
            <Text style={styles.cardTitle}>Contact information</Text>
          </View>

          <Text style={styles.label}>Contact person name</Text>
          <TextInput
            style={styles.input}
            placeholder="Name of the person to call"
            placeholderTextColor={COLORS.grayDim}
            value={contactName}
            onChangeText={setContactName}
          />

          <Text style={styles.label}>Phone number *</Text>
          <TextInput
            style={styles.input}
            placeholder="+91 00000 00000"
            placeholderTextColor={COLORS.grayDim}
            keyboardType="phone-pad"
            value={contactPhone}
            onChangeText={setContactPhone}
          />

          <Text style={styles.label}>Special instructions / notes</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            placeholder="e.g. Patient requires ICU on board, oxygen support, visa assistance needed..."
            placeholderTextColor={COLORS.grayDim}
            multiline
            numberOfLines={4}
            value={note}
            onChangeText={setNote}
            textAlignVertical="top"
          />
        </View>

        {/* Pricing info */}
        <View style={styles.pricingBox}>
          <Text style={styles.pricingIcon}>ℹ️</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.pricingTitle}>Pricing information</Text>
            <Text style={styles.pricingText}>
              {isInternational
                ? "International flights: cost depends on aircraft, distance, equipment & staff. Additional documentation may be required. Our team will confirm the quote within 15 minutes."
                : "Cost depends on aircraft type, distance, equipment & staff required. Our team will confirm the quote within 15 minutes."}
            </Text>
          </View>
        </View>

        {/* Submit */}
        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} activeOpacity={0.85}>
          <Text style={styles.submitBtnText}>✈️  Request Air Ambulance</Text>
        </TouchableOpacity>
        <Text style={styles.submitNote}>Our air ambulance team will contact you within 15 minutes</Text>

        <View style={{ height: 36 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingTop: 50 },

  // Header
  header: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 18, paddingBottom: 14, borderBottomWidth: 0.5, borderBottomColor: "rgba(255,255,255,0.07)" },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 10 },
  backArrow: { color: COLORS.white, fontSize: 20 },
  headerTitle: { color: COLORS.white, fontSize: 17, fontWeight: "700" },
  headerSub: { color: COLORS.grayDim, fontSize: 12, marginTop: 1 },

  scrollContent: { padding: 18, gap: 12 },

  // Banner
  banner: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: "rgba(232,25,44,0.12)", borderWidth: 0.5, borderColor: "rgba(232,25,44,0.3)", borderRadius: 14, padding: 16, marginBottom: 4 },
  bannerIcon: { fontSize: 30 },
  bannerTitle: { color: COLORS.white, fontSize: 13, fontWeight: "600", lineHeight: 19, flexShrink: 1 },
  bannerBadge: { color: COLORS.red, fontSize: 12, fontWeight: "600", marginTop: 4 },

  // Card
  card: { backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 0.5, borderColor: "rgba(255,255,255,0.08)", borderRadius: 14, padding: 16 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  cardIcon: { fontSize: 18 },
  cardTitle: { color: COLORS.white, fontSize: 15, fontWeight: "600" },

  // Form fields
  label: { color: COLORS.grayDim, fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, marginTop: 10 },
  input: { backgroundColor: "rgba(0,0,0,0.4)", borderWidth: 0.5, borderColor: "rgba(255,255,255,0.1)", borderRadius: 10, padding: 11, fontSize: 13, color: COLORS.white },
  textarea: { height: 88, textAlignVertical: "top" },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 6, flexWrap: "nowrap" },

  // Toggle buttons (gender)
  toggleBtn: { flex: 1, paddingVertical: 9, alignItems: "center", backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 0.5, borderColor: "rgba(255,255,255,0.1)", borderRadius: 8 },
  toggleBtnActive: { backgroundColor: COLORS.red, borderColor: COLORS.red },
  toggleBtnText: { color: COLORS.grayDim, fontSize: 12, fontWeight: "600" },
  toggleBtnTextActive: { color: COLORS.white, fontWeight: "700" },

  // Domestic / International toggle
  domIntlRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  domIntlBtn: { flex: 1, paddingVertical: 11, alignItems: "center", borderRadius: 10, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.04)" },
  domIntlBtnActive: { backgroundColor: COLORS.red, borderColor: COLORS.red },
  domIntlBtnText: { color: COLORS.grayDim, fontSize: 13, fontWeight: "600" },
  domIntlBtnTextActive: { color: COLORS.white, fontWeight: "700" },

  // Flight type cards (2-column grid)
  flightTypeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  flightTypeCard: { width: "47%", padding: 12, borderRadius: 10, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.04)" },
  flightTypeCardActive: { backgroundColor: "rgba(232,25,44,0.15)", borderColor: "rgba(232,25,44,0.5)" },
  flightTypeLabel: { color: COLORS.white, fontSize: 13, fontWeight: "600", marginBottom: 3 },
  flightTypeDesc: { color: COLORS.grayDim, fontSize: 11, lineHeight: 15 },
  flightTypeDescActive: { color: "rgba(232,25,44,0.85)" },

  // Condition / equipment chips
  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  conditionChip: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.04)" },
  conditionChipActive: { backgroundColor: "rgba(232,25,44,0.15)", borderColor: "rgba(232,25,44,0.5)" },
  conditionChipText: { color: COLORS.grayDim, fontSize: 12 },
  conditionChipTextActive: { color: COLORS.red, fontWeight: "600" },

  // Date chips
  dateChipScroll: { marginTop: 4, marginBottom: 4 },
  dateChip: { width: 48, height: 60, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 0.5, borderColor: "rgba(255,255,255,0.08)" },
  dateChipSel: { backgroundColor: COLORS.red, borderColor: COLORS.red },
  dateChipDay: { color: COLORS.grayDim, fontSize: 8, fontWeight: "700", letterSpacing: 0.3, marginBottom: 2 },
  dateChipNum: { color: COLORS.white, fontSize: 17, fontWeight: "800", lineHeight: 20 },
  dateChipMon: { color: COLORS.grayDim, fontSize: 8, marginTop: 2 },

  // Staff buttons
  staffGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  staffBtn: { paddingHorizontal: 14, paddingVertical: 10, alignItems: "center", backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 0.5, borderColor: "rgba(255,255,255,0.1)", borderRadius: 10 },
  staffBtnActive: { backgroundColor: "rgba(232,25,44,0.15)", borderColor: "rgba(232,25,44,0.5)" },
  staffBtnText: { color: COLORS.grayDim, fontSize: 12 },
  staffBtnTextActive: { color: COLORS.red, fontWeight: "600" },

  // Pricing
  pricingBox: { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: "rgba(59,130,246,0.07)", borderWidth: 0.5, borderColor: "rgba(59,130,246,0.25)", borderRadius: 12, padding: 14 },
  pricingIcon: { fontSize: 18, marginTop: 1 },
  pricingTitle: { color: "#93c5fd", fontSize: 13, fontWeight: "600", marginBottom: 3 },
  pricingText: { color: "rgba(147,197,253,0.8)", fontSize: 12, lineHeight: 18 },

  // Submit
  submitBtn: { backgroundColor: COLORS.red, borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 4 },
  submitBtnText: { color: COLORS.white, fontSize: 15, fontWeight: "700" },
  submitNote: { color: COLORS.grayDim, fontSize: 12, textAlign: "center", marginTop: 10 },
});
