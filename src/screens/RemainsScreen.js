import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Switch, Alert,
} from "react-native";
import { COLORS } from "../theme";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const CAUSE_OPTIONS = [
  { id: "natural",   label: "🕊️ Natural causes" },
  { id: "cardiac",   label: "❤️ Cardiac arrest" },
  { id: "accident",  label: "🚑 Accident / trauma" },
  { id: "illness",   label: "🏥 Prolonged illness" },
  { id: "surgical",  label: "🩺 Post-surgical" },
  { id: "other",     label: "— Other" },
];

const GENDERS = ["M", "F", "O"];

export default function RemainsScreen({ navigation }) {
  const [deceasedName,  setDeceasedName]  = useState("");
  const [age,           setAge]           = useState("");
  const [gender,        setGender]        = useState("M");
  const [cause,         setCause]         = useState(null);
  const [pickupCity,    setPickupCity]    = useState("");
  const [dropCity,      setDropCity]      = useState("");
  const [embalming,     setEmbalming]     = useState(false);
  const [nocHelp,       setNocHelp]       = useState(false);
  const [contactName,   setContactName]   = useState("");
  const [contactPhone,  setContactPhone]  = useState("");

  const todayMidnight = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
  const [selectedDate, setSelectedDate] = useState(todayMidnight);
  const dateChips = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(todayMidnight);
    d.setDate(d.getDate() + i);
    return d;
  });

  function handleSubmit() {
    if (!deceasedName || !pickupCity || !dropCity) {
      Alert.alert("Missing details", "Please fill in deceased name, pickup city and drop city.");
      return;
    }
    if (!contactPhone) {
      Alert.alert("Missing details", "Please provide a contact phone number.");
      return;
    }
    Alert.alert(
      "Request submitted",
      "Our team will contact you within 30 minutes to confirm the arrangements.",
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
          <Text style={styles.headerTitle}>Remains Transport</Text>
          <Text style={styles.headerSub}>Respectful air transport of mortal remains</Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Banner */}
        <View style={styles.banner}>
          <Text style={styles.bannerIcon}>⚰️</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>Dignified air transport of mortal remains, domestic & international</Text>
            <Text style={styles.bannerBadge}>● 24×7 compassionate service</Text>
          </View>
        </View>

        {/* ── Deceased information ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardIcon}>👤</Text>
            <Text style={styles.cardTitle}>Deceased information</Text>
          </View>

          <Text style={styles.label}>Full name *</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter full name of the deceased"
            placeholderTextColor={COLORS.grayDim}
            value={deceasedName}
            onChangeText={setDeceasedName}
          />

          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.label}>Age</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 72"
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

          <Text style={styles.label}>Cause of death</Text>
          <View style={styles.chipGrid}>
            {CAUSE_OPTIONS.map(c => (
              <TouchableOpacity
                key={c.id}
                style={[styles.chip, cause === c.id && styles.chipActive]}
                onPress={() => setCause(c.id)}
              >
                <Text style={[styles.chipText, cause === c.id && styles.chipTextActive]}>
                  {c.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Transport details ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardIcon}>✈️</Text>
            <Text style={styles.cardTitle}>Transport details</Text>
          </View>

          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.label}>Pickup city *</Text>
              <TextInput
                style={styles.input}
                placeholder="From"
                placeholderTextColor={COLORS.grayDim}
                value={pickupCity}
                onChangeText={setPickupCity}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Drop city *</Text>
              <TextInput
                style={styles.input}
                placeholder="To"
                placeholderTextColor={COLORS.grayDim}
                value={dropCity}
                onChangeText={setDropCity}
              />
            </View>
          </View>

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

        {/* ── Additional services ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardIcon}>📋</Text>
            <Text style={styles.cardTitle}>Additional services</Text>
          </View>

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchLabel}>Embalming required</Text>
              <Text style={styles.switchDesc}>Professional preservation for long-distance transport</Text>
            </View>
            <Switch
              value={embalming}
              onValueChange={setEmbalming}
              trackColor={{ false: "rgba(255,255,255,0.1)", true: COLORS.red }}
              thumbColor={COLORS.white}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchLabel}>NOC / Documentation help</Text>
              <Text style={styles.switchDesc}>Assistance with No Objection Certificate and transit permits</Text>
            </View>
            <Switch
              value={nocHelp}
              onValueChange={setNocHelp}
              trackColor={{ false: "rgba(255,255,255,0.1)", true: COLORS.red }}
              thumbColor={COLORS.white}
            />
          </View>
        </View>

        {/* ── Contact information ── */}
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
        </View>

        {/* Pricing info */}
        <View style={styles.pricingBox}>
          <Text style={styles.pricingIcon}>ℹ️</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.pricingTitle}>Pricing information</Text>
            <Text style={styles.pricingText}>
              Cost depends on distance, embalming requirements, and documentation. Our team will confirm the quote within 30 minutes.
            </Text>
          </View>
        </View>

        {/* Submit */}
        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} activeOpacity={0.85}>
          <Text style={styles.submitBtnText}>⚰️  Request Remains Transport</Text>
        </TouchableOpacity>
        <Text style={styles.submitNote}>Our team will contact you within 30 minutes</Text>

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
  row: { flexDirection: "row", alignItems: "flex-start", gap: 6, flexWrap: "nowrap" },

  // Toggle buttons (gender)
  toggleBtn: { flex: 1, paddingVertical: 9, alignItems: "center", backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 0.5, borderColor: "rgba(255,255,255,0.1)", borderRadius: 8 },
  toggleBtnActive: { backgroundColor: COLORS.red, borderColor: COLORS.red },
  toggleBtnText: { color: COLORS.grayDim, fontSize: 12, fontWeight: "600" },
  toggleBtnTextActive: { color: COLORS.white, fontWeight: "700" },

  // Cause chips
  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.04)" },
  chipActive: { backgroundColor: "rgba(232,25,44,0.15)", borderColor: "rgba(232,25,44,0.5)" },
  chipText: { color: COLORS.grayDim, fontSize: 12 },
  chipTextActive: { color: COLORS.red, fontWeight: "600" },

  // Date chips
  dateChipScroll: { marginTop: 4, marginBottom: 4 },
  dateChip: { width: 48, height: 60, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 0.5, borderColor: "rgba(255,255,255,0.08)" },
  dateChipSel: { backgroundColor: COLORS.red, borderColor: COLORS.red },
  dateChipDay: { color: COLORS.grayDim, fontSize: 8, fontWeight: "700", letterSpacing: 0.3, marginBottom: 2 },
  dateChipNum: { color: COLORS.white, fontSize: 17, fontWeight: "800", lineHeight: 20 },
  dateChipMon: { color: COLORS.grayDim, fontSize: 8, marginTop: 2 },

  // Switch rows
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 },
  switchLabel: { color: COLORS.white, fontSize: 14, fontWeight: "600", marginBottom: 2 },
  switchDesc: { color: COLORS.grayDim, fontSize: 12, lineHeight: 17, paddingRight: 8 },
  divider: { height: 0.5, backgroundColor: "rgba(255,255,255,0.07)", marginVertical: 14 },

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
