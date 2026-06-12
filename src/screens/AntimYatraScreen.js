import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Switch, Alert,
} from "react-native";
import { COLORS } from "../theme";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const STEPS = ["location", "vehicle", "preferences", "review"];

const VEHICLE_TYPES = [
  { id: "basic",    icon: "🚐", name: "Basic Hearse",    desc: "Simple hearse van, basic service",                   price: 2500 },
  { id: "standard", icon: "🌸", name: "Standard Hearse", desc: "Decorated hearse with flowers",                      price: 4500 },
  { id: "luxury",   icon: "👑", name: "Luxury Hearse",   desc: "Premium decorated hearse, full ceremony setup",       price: 8000 },
];

const RELIGIONS = [
  { id: "hindu",     label: "🕉️ Hindu" },
  { id: "muslim",    label: "☪️ Muslim" },
  { id: "christian", label: "✝️ Christian" },
  { id: "sikh",      label: "☬ Sikh" },
  { id: "other",     label: "— Other" },
];

const SummaryRow = ({ label, value }) => (
  <View style={styles.sumRow}>
    <Text style={styles.sumLabel}>{label}</Text>
    <Text style={styles.sumValue}>{value}</Text>
  </View>
);

export default function AntimYatraScreen({ navigation }) {
  const [step, setStep] = useState(1);
  const cur = STEPS[step - 1];

  // Step 1
  const [pickupLoc, setPickupLoc] = useState("");
  const [dropLoc,   setDropLoc]   = useState("");
  const todayMidnight = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
  const [selectedDate, setSelectedDate] = useState(todayMidnight);
  const dateChips = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(todayMidnight);
    d.setDate(d.getDate() + i);
    return d;
  });

  // Step 2
  const [vehicle, setVehicle] = useState(null);

  // Step 3
  const [religion,      setReligion]      = useState(null);
  const [flowerDecor,   setFlowerDecor]   = useState(false);
  const [priestArrange, setPriestArrange] = useState(false);
  const [iceBox,        setIceBox]        = useState(false);

  const selectedVehicle = VEHICLE_TYPES.find(v => v.id === vehicle);
  const selectedReligion = RELIGIONS.find(r => r.id === religion);

  function formatDate(d) {
    return `${DAY_NAMES[d.getDay()]}, ${d.getDate()} ${MON_NAMES[d.getMonth()]}`;
  }

  const canNext =
    cur === "location"    ? pickupLoc.trim().length > 0 && dropLoc.trim().length > 0 :
    cur === "vehicle"     ? !!vehicle :
    cur === "preferences" ? !!religion :
    cur === "review"      ? true : false;

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
      "Request submitted",
      "Our team will contact you within 30 minutes to confirm the arrangements.",
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
          <Text style={styles.title}>Antim Yatra</Text>
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

      {/* Summary bar — step 2 onward */}
      {step > 1 && selectedVehicle && (
        <View style={styles.fareBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fareLbl}>
              {selectedVehicle.name}
              {selectedDate ? `  ·  ${formatDate(selectedDate)}` : ""}
            </Text>
            <Text style={styles.fareAmt}>₹{selectedVehicle.price.toLocaleString("en-IN")}</Text>
          </View>
          <View style={styles.fareTag}><Text style={styles.fareTagText}>BASE</Text></View>
        </View>
      )}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 18 }}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Step 1: Location & Date ── */}
        {cur === "location" && (
          <>
            <Text style={styles.q}>Pickup & Drop</Text>
            <Text style={styles.qHint}>Enter the pickup and drop locations for the journey</Text>

            <Text style={styles.fieldLabel}>Pickup location *</Text>
            <TextInput
              style={styles.input}
              placeholder="Home / hospital address"
              placeholderTextColor={COLORS.grayDim}
              value={pickupLoc}
              onChangeText={setPickupLoc}
            />

            <Text style={styles.fieldLabel}>Drop location *</Text>
            <TextInput
              style={styles.input}
              placeholder="Cremation ground / burial ground"
              placeholderTextColor={COLORS.grayDim}
              value={dropLoc}
              onChangeText={setDropLoc}
            />

            <Text style={styles.fieldLabel}>Date</Text>
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
          </>
        )}

        {/* ── Step 2: Vehicle Type ── */}
        {cur === "vehicle" && (
          <>
            <Text style={styles.q}>Select Vehicle</Text>
            <Text style={styles.qHint}>Choose the hearse that fits your requirements</Text>

            {VEHICLE_TYPES.map(v => (
              <TouchableOpacity
                key={v.id}
                style={[styles.opt, vehicle === v.id && styles.optActive]}
                onPress={() => setVehicle(v.id)}
                activeOpacity={0.75}
              >
                <View style={styles.optIcon}>
                  <Text style={{ fontSize: 26 }}>{v.icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.optName}>{v.name}</Text>
                  <Text style={styles.optDesc}>{v.desc}</Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 8 }}>
                  <Text style={[styles.optPrice, vehicle === v.id && styles.optPriceActive]}>
                    ₹{v.price.toLocaleString("en-IN")}
                  </Text>
                  <View style={[styles.radio, vehicle === v.id && styles.radioActive]}>
                    {vehicle === v.id && <View style={styles.radioDot} />}
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}

        {/* ── Step 3: Religion & Additional Services ── */}
        {cur === "preferences" && (
          <>
            <Text style={styles.q}>Religion & Services</Text>
            <Text style={styles.qHint}>Select religion for ceremony arrangement and any additional services</Text>

            <Text style={styles.sectionTitle}>Religion *</Text>
            <View style={styles.chipGrid}>
              {RELIGIONS.map(r => (
                <TouchableOpacity
                  key={r.id}
                  style={[styles.chip, religion === r.id && styles.chipActive]}
                  onPress={() => setReligion(r.id)}
                >
                  <Text style={[styles.chipText, religion === r.id && styles.chipTextActive]}>
                    {r.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Additional services</Text>

            <View style={styles.serviceCard}>
              <View style={styles.switchRow}>
                <Text style={styles.switchIcon}>🌸</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchLabel}>Flower decoration</Text>
                  <Text style={styles.switchDesc}>Floral arrangement on the hearse</Text>
                </View>
                <Switch
                  value={flowerDecor}
                  onValueChange={setFlowerDecor}
                  trackColor={{ false: "rgba(0,0,0,0.1)", true: COLORS.red }}
                  thumbColor={COLORS.white}
                />
              </View>

              <View style={styles.divider} />

              <View style={styles.switchRow}>
                <Text style={styles.switchIcon}>🙏</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchLabel}>Priest arrangement</Text>
                  <Text style={styles.switchDesc}>Qualified priest for last rites ceremony</Text>
                </View>
                <Switch
                  value={priestArrange}
                  onValueChange={setPriestArrange}
                  trackColor={{ false: "rgba(0,0,0,0.1)", true: COLORS.red }}
                  thumbColor={COLORS.white}
                />
              </View>

              <View style={styles.divider} />

              <View style={styles.switchRow}>
                <Text style={styles.switchIcon}>❄️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchLabel}>Ice box</Text>
                  <Text style={styles.switchDesc}>Preservation during transport</Text>
                </View>
                <Switch
                  value={iceBox}
                  onValueChange={setIceBox}
                  trackColor={{ false: "rgba(0,0,0,0.1)", true: COLORS.red }}
                  thumbColor={COLORS.white}
                />
              </View>
            </View>
          </>
        )}

        {/* ── Step 4: Review & Submit ── */}
        {cur === "review" && (
          <>
            <Text style={styles.q}>Review & Confirm</Text>
            <Text style={styles.qHint}>Please review your booking details before submitting</Text>

            {/* Route summary */}
            <View style={styles.reviewCard}>
              <View style={styles.reviewCardHeader}>
                <Text style={styles.reviewCardIcon}>🗺️</Text>
                <Text style={styles.reviewCardTitle}>Route & Date</Text>
              </View>
              <SummaryRow label="Pickup" value={pickupLoc} />
              <SummaryRow label="Drop"   value={dropLoc} />
              <SummaryRow label="Date"   value={formatDate(selectedDate)} />
            </View>

            {/* Vehicle summary */}
            <View style={styles.reviewCard}>
              <View style={styles.reviewCardHeader}>
                <Text style={styles.reviewCardIcon}>{selectedVehicle?.icon}</Text>
                <Text style={styles.reviewCardTitle}>Vehicle</Text>
              </View>
              <SummaryRow label="Type"    value={selectedVehicle?.name ?? "—"} />
              <SummaryRow label="Details" value={selectedVehicle?.desc ?? "—"} />
            </View>

            {/* Preferences summary */}
            <View style={styles.reviewCard}>
              <View style={styles.reviewCardHeader}>
                <Text style={styles.reviewCardIcon}>🕉️</Text>
                <Text style={styles.reviewCardTitle}>Preferences</Text>
              </View>
              <SummaryRow label="Religion" value={selectedReligion?.label ?? "—"} />
              <SummaryRow
                label="Add-ons"
                value={
                  [flowerDecor && "Flower decoration", priestArrange && "Priest arrangement", iceBox && "Ice box"]
                    .filter(Boolean).join(", ") || "None"
                }
              />
            </View>

            {/* Price card */}
            <View style={styles.priceCard}>
              <Text style={styles.priceCardTitle}>💰  Estimated price</Text>
              <View style={styles.priceRow}>
                <Text style={styles.priceRowLabel}>{selectedVehicle?.name}</Text>
                <Text style={styles.priceRowValue}>₹{selectedVehicle?.price.toLocaleString("en-IN")}</Text>
              </View>
              {(flowerDecor || priestArrange || iceBox) && (
                <View style={styles.priceRow}>
                  <Text style={styles.priceRowLabel}>Additional services</Text>
                  <Text style={styles.priceRowValue}>As applicable</Text>
                </View>
              )}
              <View style={styles.priceDivider} />
              <View style={styles.priceRow}>
                <Text style={styles.priceTotalLabel}>Base total</Text>
                <Text style={styles.priceTotalValue}>₹{selectedVehicle?.price.toLocaleString("en-IN")}</Text>
              </View>
              <Text style={styles.priceNote}>Final quote confirmed by our team within 30 minutes.</Text>
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
            {cur === "review"
              ? "🕉️  Request Antim Yatra Service"
              : "Next →"}
          </Text>
        </TouchableOpacity>
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

  // Summary fare bar
  fareBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginHorizontal: 18, marginBottom: 8, padding: 14, backgroundColor: "rgba(232,25,44,0.1)", borderWidth: 1, borderColor: "rgba(232,25,44,0.3)", borderRadius: 14 },
  fareLbl: { color: COLORS.gray, fontSize: 11, marginBottom: 2 },
  fareAmt: { color: COLORS.text, fontSize: 22, fontWeight: "800" },
  fareTag: { backgroundColor: "rgba(232,25,44,0.2)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100 },
  fareTagText: { color: COLORS.red, fontSize: 10, fontWeight: "800", letterSpacing: 1 },

  // Step headings
  q: { color: COLORS.text, fontSize: 19, fontWeight: "700", marginBottom: 6 },
  qHint: { color: COLORS.grayDim, fontSize: 12, marginBottom: 16 },

  // Form fields
  fieldLabel: { color: COLORS.grayDim, fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, marginTop: 10 },
  input: { backgroundColor: "rgba(0,0,0,0.05)", borderWidth: 0.5, borderColor: "rgba(0,0,0,0.1)", borderRadius: 10, padding: 11, fontSize: 13, color: COLORS.text, marginBottom: 4 },

  // Date chips
  dateChipScroll: { marginTop: 4, marginBottom: 4 },
  dateChip: { width: 48, height: 60, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.04)", borderWidth: 0.5, borderColor: "rgba(0,0,0,0.08)" },
  dateChipSel: { backgroundColor: COLORS.red, borderColor: COLORS.red },
  dateChipDay: { color: COLORS.grayDim, fontSize: 8, fontWeight: "700", letterSpacing: 0.3, marginBottom: 2 },
  dateChipNum: { color: COLORS.text, fontSize: 17, fontWeight: "800", lineHeight: 20 },
  dateChipMon: { color: COLORS.grayDim, fontSize: 8, marginTop: 2 },

  // Vehicle option cards
  opt: { flexDirection: "row", alignItems: "center", gap: 14, padding: 15, backgroundColor: "rgba(0,0,0,0.03)", borderRadius: 14, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)", marginBottom: 10 },
  optActive: { borderColor: "rgba(232,25,44,0.5)", backgroundColor: "rgba(232,25,44,0.08)" },
  optIcon: { width: 48, height: 48, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.05)", alignItems: "center", justifyContent: "center" },
  optName: { color: COLORS.text, fontWeight: "600", fontSize: 15 },
  optDesc: { color: COLORS.grayDim, fontSize: 12, marginTop: 3 },
  optPrice: { color: COLORS.grayDim, fontSize: 15, fontWeight: "700" },
  optPriceActive: { color: COLORS.red },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: "rgba(0,0,0,0.3)", alignItems: "center", justifyContent: "center" },
  radioActive: { borderColor: COLORS.red },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: COLORS.red },

  // Religion chips
  sectionTitle: { color: COLORS.grayDim, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 },
  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, borderWidth: 0.5, borderColor: "rgba(0,0,0,0.1)", backgroundColor: "rgba(0,0,0,0.03)" },
  chipActive: { backgroundColor: "rgba(232,25,44,0.15)", borderColor: "rgba(232,25,44,0.5)" },
  chipText: { color: COLORS.grayDim, fontSize: 13 },
  chipTextActive: { color: COLORS.red, fontWeight: "600" },

  // Additional services card
  serviceCard: { backgroundColor: "rgba(0,0,0,0.03)", borderWidth: 0.5, borderColor: "rgba(0,0,0,0.08)", borderRadius: 14, padding: 16 },
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
  sumLabel: { color: COLORS.grayDim, fontSize: 12, flex: 0.35 },
  sumValue: { color: COLORS.text, fontSize: 12, fontWeight: "500", flex: 0.65, textAlign: "right" },

  // Price card
  priceCard: { backgroundColor: "rgba(0,0,0,0.03)", borderWidth: 0.5, borderColor: "rgba(232,25,44,0.3)", borderRadius: 16, padding: 18, marginBottom: 8 },
  priceCardTitle: { color: "#2563eb", fontSize: 13, fontWeight: "700", marginBottom: 14 },
  priceRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  priceRowLabel: { color: COLORS.grayDim, fontSize: 13 },
  priceRowValue: { color: COLORS.text, fontSize: 13, fontWeight: "600" },
  priceDivider: { height: 0.5, backgroundColor: "rgba(0,0,0,0.1)", marginVertical: 10 },
  priceTotalLabel: { color: COLORS.text, fontSize: 16, fontWeight: "700" },
  priceTotalValue: { color: COLORS.red, fontSize: 24, fontWeight: "800" },
  priceNote: { color: "#3b82f6", fontSize: 11, lineHeight: 17, marginTop: 10 },

  // Footer
  footer: { padding: 18 },
  btn: { backgroundColor: COLORS.red, borderRadius: 12, paddingVertical: 16, alignItems: "center" },
  btnText: { color: COLORS.white, fontSize: 16, fontWeight: "700" },
});
