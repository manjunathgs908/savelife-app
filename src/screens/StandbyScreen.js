import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert,
} from "react-native";
import { COLORS } from "../theme";

const STEPS = ["org", "ambulance", "contract", "review"];

const ORG_TYPES = [
  { id: "hospital",     label: "🏥 Hospital" },
  { id: "corporate",    label: "🏢 Corporate" },
  { id: "school",       label: "🏫 School / College" },
  { id: "construction", label: "🏗️ Construction Site" },
  { id: "government",   label: "🏛️ Government" },
  { id: "other",        label: "— Other" },
];

const AMBULANCE_TYPES = [
  {
    id: "bls_van",
    icon: "🚐",
    name: "BLS — Maruti Van",
    tag: "Basic Life Support",
    desc: "Ideal for small offices & schools",
  },
  {
    id: "bls_tempo",
    icon: "🚌",
    name: "BLS — Tempo Traveller",
    tag: "Basic Life Support",
    desc: "Larger capacity, suitable for mid-size orgs",
  },
  {
    id: "als_tempo",
    icon: "🏥",
    name: "ALS — Tempo Traveller",
    tag: "Advanced Life Support",
    desc: "Ideal for hospitals & construction sites",
  },
  {
    id: "acls_tempo",
    icon: "❤️",
    name: "ACLS — Tempo Traveller",
    tag: "Advanced Cardiac Life Support",
    desc: "Premium medical support for critical environments",
  },
];

const DURATIONS = ["1 Month", "3 Months", "6 Months", "12 Months"];
const HOURS     = ["8 Hours/day", "12 Hours/day", "24 Hours/day"];
const AMB_COUNTS = ["1", "2", "3", "4", "5+"];

const SummaryRow = ({ label, value }) => (
  <View style={styles.sumRow}>
    <Text style={styles.sumLabel}>{label}</Text>
    <Text style={styles.sumValue}>{value}</Text>
  </View>
);

export default function StandbyScreen({ navigation }) {
  const [step, setStep] = useState(1);
  const cur = STEPS[step - 1];

  // Step 1 — org details
  const [orgName,     setOrgName]     = useState("");
  const [orgType,     setOrgType]     = useState(null);
  const [contactName, setContactName] = useState("");
  const [phone,       setPhone]       = useState("");
  const [address,     setAddress]     = useState("");

  // Step 2 — ambulance type
  const [ambulance, setAmbulance] = useState(null);

  // Step 3 — contract
  const [duration,  setDuration]  = useState(null);
  const [hours,     setHours]     = useState(null);
  const [ambCount,  setAmbCount]  = useState(null);

  const selectedAmb = AMBULANCE_TYPES.find(a => a.id === ambulance);

  const canNext =
    cur === "org"       ? orgName.trim().length > 0 && !!orgType && contactName.trim().length > 0 && phone.trim().length > 0 && address.trim().length > 0 :
    cur === "ambulance" ? !!ambulance :
    cur === "contract"  ? !!duration && !!hours && !!ambCount :
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
      "Request submitted!",
      "Our team will contact you within 24 hours with a customized quotation.",
      [{ text: "OK", onPress: () => navigation?.goBack() }]
    );
  }

  return (
    <View style={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
          <Text style={{ color: COLORS.white, fontSize: 20 }}>←</Text>
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>Standby Ambulance</Text>
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

      {/* Summary bar — step 2+ */}
      {step > 1 && orgName.length > 0 && (
        <View style={styles.fareBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fareLbl}>{orgName}</Text>
            <Text style={styles.fareAmt}>
              {selectedAmb ? selectedAmb.name : "Select ambulance type"}
            </Text>
          </View>
          {orgType && (
            <View style={styles.fareTag}>
              <Text style={styles.fareTagText}>
                {ORG_TYPES.find(o => o.id === orgType)?.label.split(" ").slice(1).join(" ").toUpperCase()}
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

        {/* ── Step 1: Organization Details ── */}
        {cur === "org" && (
          <>
            <Text style={styles.q}>Organization Details</Text>
            <Text style={styles.qHint}>Tell us about your organization so we can tailor the service</Text>

            <Text style={styles.fieldLabel}>Organization name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Apollo Hospitals, Tata Motors..."
              placeholderTextColor={COLORS.grayDim}
              value={orgName}
              onChangeText={setOrgName}
            />

            <Text style={styles.fieldLabel}>Organization type *</Text>
            <View style={styles.chipGrid}>
              {ORG_TYPES.map(o => (
                <TouchableOpacity
                  key={o.id}
                  style={[styles.chip, orgType === o.id && styles.chipActive]}
                  onPress={() => setOrgType(o.id)}
                >
                  <Text style={[styles.chipText, orgType === o.id && styles.chipTextActive]}>
                    {o.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Contact person name *</Text>
            <TextInput
              style={styles.input}
              placeholder="Name of the contact person"
              placeholderTextColor={COLORS.grayDim}
              value={contactName}
              onChangeText={setContactName}
            />

            <Text style={styles.fieldLabel}>Phone number *</Text>
            <TextInput
              style={styles.input}
              placeholder="+91 00000 00000"
              placeholderTextColor={COLORS.grayDim}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />

            <Text style={styles.fieldLabel}>Location / Address *</Text>
            <TextInput
              style={[styles.input, styles.inputMulti]}
              placeholder="Full address of the deployment location"
              placeholderTextColor={COLORS.grayDim}
              value={address}
              onChangeText={setAddress}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </>
        )}

        {/* ── Step 2: Ambulance Type ── */}
        {cur === "ambulance" && (
          <>
            <Text style={styles.q}>Ambulance Type</Text>
            <Text style={styles.qHint}>Select the ambulance best suited for your organization</Text>

            {AMBULANCE_TYPES.map(a => (
              <TouchableOpacity
                key={a.id}
                style={[styles.opt, ambulance === a.id && styles.optActive]}
                onPress={() => setAmbulance(a.id)}
                activeOpacity={0.75}
              >
                <View style={styles.optIcon}>
                  <Text style={{ fontSize: 26 }}>{a.icon}</Text>
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
          </>
        )}

        {/* ── Step 3: Contract Duration ── */}
        {cur === "contract" && (
          <>
            <Text style={styles.q}>Contract Details</Text>
            <Text style={styles.qHint}>Select contract duration, working hours and number of ambulances</Text>

            <Text style={styles.sectionLabel}>Contract duration *</Text>
            <View style={styles.pillRow}>
              {DURATIONS.map(d => (
                <TouchableOpacity
                  key={d}
                  style={[styles.pill, duration === d && styles.pillActive]}
                  onPress={() => setDuration(d)}
                >
                  <Text style={[styles.pillText, duration === d && styles.pillTextActive]}>{d}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionLabel}>Working hours *</Text>
            <View style={styles.pillRow}>
              {HOURS.map(h => (
                <TouchableOpacity
                  key={h}
                  style={[styles.pill, hours === h && styles.pillActive]}
                  onPress={() => setHours(h)}
                >
                  <Text style={[styles.pillText, hours === h && styles.pillTextActive]}>{h}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionLabel}>Number of ambulances needed *</Text>
            <View style={styles.pillRow}>
              {AMB_COUNTS.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[styles.countPill, ambCount === c && styles.pillActive]}
                  onPress={() => setAmbCount(c)}
                >
                  <Text style={[styles.pillText, ambCount === c && styles.pillTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {duration && hours && ambCount && (
              <View style={styles.selectionSummary}>
                <Text style={styles.selectionSummaryText}>
                  {ambCount} × {selectedAmb?.name ?? "ambulance"} · {hours} · {duration}
                </Text>
              </View>
            )}
          </>
        )}

        {/* ── Step 4: Review & Submit ── */}
        {cur === "review" && (
          <>
            <Text style={styles.q}>Review & Confirm</Text>
            <Text style={styles.qHint}>Check your details before submitting the request</Text>

            {/* Org summary */}
            <View style={styles.reviewCard}>
              <View style={styles.reviewCardHeader}>
                <Text style={styles.reviewCardIcon}>🏢</Text>
                <Text style={styles.reviewCardTitle}>Organization</Text>
              </View>
              <SummaryRow label="Name"    value={orgName} />
              <SummaryRow label="Type"    value={ORG_TYPES.find(o => o.id === orgType)?.label ?? "—"} />
              <SummaryRow label="Contact" value={contactName} />
              <SummaryRow label="Phone"   value={phone} />
              <SummaryRow label="Address" value={address} />
            </View>

            {/* Ambulance summary */}
            <View style={styles.reviewCard}>
              <View style={styles.reviewCardHeader}>
                <Text style={styles.reviewCardIcon}>{selectedAmb?.icon ?? "🚑"}</Text>
                <Text style={styles.reviewCardTitle}>Ambulance</Text>
              </View>
              <SummaryRow label="Type"    value={selectedAmb?.name ?? "—"} />
              <SummaryRow label="Support" value={selectedAmb?.tag  ?? "—"} />
            </View>

            {/* Contract summary */}
            <View style={styles.reviewCard}>
              <View style={styles.reviewCardHeader}>
                <Text style={styles.reviewCardIcon}>📋</Text>
                <Text style={styles.reviewCardTitle}>Contract</Text>
              </View>
              <SummaryRow label="Duration"     value={duration  ?? "—"} />
              <SummaryRow label="Hours"        value={hours     ?? "—"} />
              <SummaryRow label="Ambulances"   value={ambCount  ?? "—"} />
            </View>

            {/* Pricing info */}
            <View style={styles.pricingBox}>
              <Text style={styles.pricingIcon}>ℹ️</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.pricingTitle}>Pricing information</Text>
                <Text style={styles.pricingText}>
                  Monthly rental price depends on ambulance type, working hours, and contract duration. Our team will share a customized quotation within 24 hours.
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
            {cur === "review" ? "🚑  Request Standby Ambulance" : "Next →"}
          </Text>
        </TouchableOpacity>
        {cur === "review" && (
          <Text style={styles.submitNote}>Our team will contact you within 24 hours</Text>
        )}
      </View>

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

  // Summary bar
  fareBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginHorizontal: 18, marginBottom: 8, padding: 14, backgroundColor: "rgba(232,25,44,0.1)", borderWidth: 1, borderColor: "rgba(232,25,44,0.3)", borderRadius: 14 },
  fareLbl: { color: COLORS.gray, fontSize: 11, marginBottom: 2 },
  fareAmt: { color: COLORS.white, fontSize: 15, fontWeight: "700" },
  fareTag: { backgroundColor: "rgba(232,25,44,0.2)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100 },
  fareTagText: { color: COLORS.red, fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },

  // Step headings
  q: { color: COLORS.white, fontSize: 19, fontWeight: "700", marginBottom: 6 },
  qHint: { color: COLORS.grayDim, fontSize: 12, marginBottom: 16 },

  // Form fields
  fieldLabel: { color: COLORS.grayDim, fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, marginTop: 10 },
  input: { backgroundColor: "rgba(0,0,0,0.4)", borderWidth: 0.5, borderColor: "rgba(255,255,255,0.1)", borderRadius: 10, padding: 11, fontSize: 13, color: COLORS.white, marginBottom: 4 },
  inputMulti: { height: 80, textAlignVertical: "top" },

  // Org type chips
  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  chip: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 10, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.04)" },
  chipActive: { backgroundColor: "rgba(232,25,44,0.15)", borderColor: "rgba(232,25,44,0.5)" },
  chipText: { color: COLORS.grayDim, fontSize: 13 },
  chipTextActive: { color: COLORS.red, fontWeight: "600" },

  // Ambulance option cards
  opt: { flexDirection: "row", alignItems: "center", gap: 14, padding: 15, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", marginBottom: 10 },
  optActive: { borderColor: "rgba(232,25,44,0.5)", backgroundColor: "rgba(232,25,44,0.08)" },
  optIcon: { width: 48, height: 48, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center" },
  optName: { color: COLORS.white, fontWeight: "700", fontSize: 14, marginBottom: 2 },
  optTag: { color: COLORS.grayDim, fontSize: 11, fontWeight: "600", marginBottom: 3 },
  optTagActive: { color: COLORS.red },
  optDesc: { color: COLORS.grayDim, fontSize: 11, lineHeight: 16 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: "rgba(255,255,255,0.3)", alignItems: "center", justifyContent: "center" },
  radioActive: { borderColor: COLORS.red },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: COLORS.red },

  // Contract pills
  sectionLabel: { color: COLORS.grayDim, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10, marginTop: 16 },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.04)" },
  pillActive: { backgroundColor: COLORS.red, borderColor: COLORS.red },
  pillText: { color: COLORS.grayDim, fontSize: 13 },
  pillTextActive: { color: COLORS.white, fontWeight: "700" },
  countPill: { width: 56, alignItems: "center", paddingVertical: 10, borderRadius: 10, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.04)" },
  selectionSummary: { marginTop: 16, padding: 12, backgroundColor: "rgba(232,25,44,0.08)", borderWidth: 0.5, borderColor: "rgba(232,25,44,0.3)", borderRadius: 10 },
  selectionSummaryText: { color: COLORS.red, fontSize: 13, fontWeight: "600", textAlign: "center" },

  // Review cards
  reviewCard: { backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 0.5, borderColor: "rgba(255,255,255,0.08)", borderRadius: 14, padding: 16, marginBottom: 10 },
  reviewCardHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  reviewCardIcon: { fontSize: 18 },
  reviewCardTitle: { color: COLORS.white, fontSize: 14, fontWeight: "600" },
  sumRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
  sumLabel: { color: COLORS.grayDim, fontSize: 12, flex: 0.32 },
  sumValue: { color: COLORS.white, fontSize: 12, fontWeight: "500", flex: 0.68, textAlign: "right" },

  // Pricing info
  pricingBox: { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: "rgba(59,130,246,0.07)", borderWidth: 0.5, borderColor: "rgba(59,130,246,0.25)", borderRadius: 12, padding: 14 },
  pricingIcon: { fontSize: 18, marginTop: 1 },
  pricingTitle: { color: "#93c5fd", fontSize: 13, fontWeight: "600", marginBottom: 3 },
  pricingText: { color: "rgba(147,197,253,0.8)", fontSize: 12, lineHeight: 18 },

  // Footer
  footer: { padding: 18 },
  btn: { backgroundColor: COLORS.red, borderRadius: 12, paddingVertical: 16, alignItems: "center" },
  btnText: { color: COLORS.white, fontSize: 16, fontWeight: "700" },
  submitNote: { color: COLORS.grayDim, fontSize: 12, textAlign: "center", marginTop: 10 },
});
