import React, { useState, useEffect } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert,
} from "react-native";
import { COLORS, getBookingConfig } from "../theme";
import { calcFare, PRICING_API } from "../utils/pricingUtils";

const _bls = getBookingConfig("bls");
const _adv = getBookingConfig("als");

const AMB_RATES = {
  bls:        { km: _bls.vehicles[0].rate, base: 0,    label: "Basic Life Support" },
  bls_tempo:  {                            base: 0,    label: "Basic Life Support • Tempo Traveller" },
  als:        { km: _adv.vehicles[0].rate, base: 500,  label: "Advanced Life Support" },
  als_tempo:  { km: _adv.vehicles[0].rate, base: 500,  label: "Advanced Life Support • Tempo Traveller" },
  acls_tempo: { km: 30,                    base: 1000, label: "Advanced Cardiac Life Support • Tempo Traveller" },
  icu:        { km: _adv.vehicles[1].rate, base: 800,  label: "Mobile Intensive Care" },
  nicu_tempo: { km: 25,                    base: 600,  label: "Newborn Intensive Care Transport • Tempo Traveller" },
  neo:        { km: 25,                    base: 600,  label: "Neonatal Transport" },
  card:       { km: 30,                    base: 1000, label: "Cardiac Emergency" },
  deadbody:   { km: 18,                    base: 350,  label: "Dignified Transport Service" },
  mort:       { km: 18,                    base: 350,  label: "Mortuary / Remains" },
};

function fmtDateTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    weekday: "long", day: "numeric", month: "long",
    hour: "2-digit", minute: "2-digit",
  });
}

function FareRow({ label, value, bold }) {
  return (
    <View style={styles.fareRow}>
      <Text style={[styles.fareLabel, bold && { color: COLORS.text, fontWeight: "700", fontSize: 15 }]}>
        {label}
      </Text>
      <Text style={[styles.fareValue, bold && { color: COLORS.red, fontWeight: "800", fontSize: 16 }]}>
        {value}
      </Text>
    </View>
  );
}

export default function ConfirmBookingScreen({ navigation, route }) {
  const {
    pickupLabel, dropLabel,
    dist, duration,
    scheduleType, scheduleDate,
    selectedType,
    selectedAmb,
    pricingList: passedPricing,
  } = route.params;

  const [pricingList, setPricingList] = useState(passedPricing || []);
  const [acEnabled, setAcEnabled] = useState(false);

  useEffect(() => {
    if (passedPricing?.length) return; // already received from AmbulanceSelectScreen
    fetch(PRICING_API)
      .then(r => r.json())
      .then(d => { if (d.success) setPricingList(d.pricing); })
      .catch(() => {});
  }, []);

  const amb = selectedAmb || { icon: "🚑", name: "Ambulance", desc: "" };
  const info = AMB_RATES[selectedType] || AMB_RATES.bls;

  const { distFare, base, total: baseFareTotal } = calcFare(selectedType, dist, pricingList, AMB_RATES);

  // AC price: use per-km from API doc if available, else flat fallback
  const pricingDoc = pricingList.find(p => p.serviceType?.toLowerCase() === selectedType && p.active !== false);
  const acPrice = pricingDoc?.acPerKm ? Math.round(pricingDoc.acPerKm * dist) : 200;

  const total = baseFareTotal + (acEnabled ? acPrice : 0);

  async function handleConfirm() {
    try {
      const response = await fetch("https://api.savelife.health/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pickupLabel,
          dropLabel,
          dist,
          duration,
          selectedType,
          scheduleType,
          scheduleDate,
          acEnabled,
          totalFare: total,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || `Request failed with status ${response.status}`);
      }

      navigation.navigate("Searching", { service: selectedType });
    } catch (error) {
      Alert.alert("Booking Failed", error.message || "Something went wrong. Please try again.");
    }
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Confirm Booking</Text>
          <Text style={styles.headerSub}>Review before confirming</Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Ambulance type banner */}
        <View style={styles.ambBanner}>
          <View style={styles.ambIconBox}>
            <Text style={{ fontSize: 36 }}>{amb.icon}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.ambName}>{amb.name} Ambulance</Text>
            <Text style={styles.ambDesc}>{info.label}</Text>
          </View>
        </View>

        {/* Route card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardIco}>🗺️</Text>
            <Text style={styles.cardTitle}>Trip Route</Text>
            <View style={styles.distBadge}>
              <Text style={styles.distBadgeTxt}>
                {dist.toFixed(1)} km · ~{Math.round(duration / 60)} min
              </Text>
            </View>
          </View>

          {/* Pickup */}
          <View style={styles.routeRow}>
            <View style={styles.routeIconCol}>
              <View style={styles.greenDot} />
              <View style={styles.routeConnector} />
            </View>
            <View style={styles.routeText}>
              <Text style={styles.routeRowLabel}>PICKUP</Text>
              <Text style={styles.routeAddr}>{pickupLabel}</Text>
            </View>
          </View>

          {/* Drop */}
          <View style={styles.routeRow}>
            <View style={styles.routeIconCol}>
              <View style={styles.redDot} />
            </View>
            <View style={styles.routeText}>
              <Text style={styles.routeRowLabel}>DROP</Text>
              <Text style={styles.routeAddr}>{dropLabel}</Text>
            </View>
          </View>
        </View>

        {/* Schedule card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardIco}>🕐</Text>
            <Text style={styles.cardTitle}>Schedule</Text>
          </View>

          {scheduleType === "now" ? (
            <View style={styles.nowBadge}>
              <View style={styles.nowDot} />
              <Text style={styles.nowTxt}>Immediate dispatch — Now</Text>
            </View>
          ) : (
            <View style={styles.laterBadge}>
              <Text style={styles.laterIco}>📅</Text>
              <View>
                <Text style={styles.laterLabel}>Scheduled for</Text>
                <Text style={styles.laterDate}>{fmtDateTime(scheduleDate)}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Add-ons */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardIco}>➕</Text>
            <Text style={styles.cardTitle}>Add-ons</Text>
            <Text style={styles.optionalTag}>Optional</Text>
          </View>

          <TouchableOpacity
            style={[styles.addonRow, acEnabled && styles.addonRowActive]}
            onPress={() => setAcEnabled(v => !v)}
            activeOpacity={0.8}
          >
            <Text style={styles.addonIco}>❄️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.addonName}>AC Ambulance</Text>
              <Text style={styles.addonPrice}>+₹{acPrice.toLocaleString()}</Text>
            </View>
            <View style={[styles.checkbox, acEnabled && styles.checkboxActive]}>
              {acEnabled && <Text style={styles.checkmark}>✓</Text>}
            </View>
          </TouchableOpacity>

        </View>

        {/* Safety note */}
        <View style={styles.safetyBox}>
          <Text style={styles.safetyIco}>🛡️</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.safetyTitle}>Safe & verified</Text>
            <Text style={styles.safetyTxt}>
              All SaveLife ambulances are GPS-tracked, staffed by certified paramedics, and monitored 24×7.
            </Text>
          </View>
        </View>

        <View style={{ height: 16 }} />
      </ScrollView>

      {/* Confirm footer */}
      <View style={styles.footer}>
        <View style={styles.footerPriceCol}>
          <Text style={styles.footerPriceLabel}>Est. fare</Text>
          <Text style={styles.footerPrice}>₹{total.toLocaleString()}</Text>
        </View>
        <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm} activeOpacity={0.85}>
          <Text style={styles.confirmBtnIco}>🚑</Text>
          <Text style={styles.confirmBtnTxt}>Confirm Booking</Text>
        </TouchableOpacity>
      </View>
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

  scrollContent: { padding: 18, gap: 12 },

  // Ambulance banner
  ambBanner: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: "rgba(232,25,44,0.1)",
    borderRadius: 16, borderWidth: 0.5, borderColor: "rgba(232,25,44,0.3)",
    padding: 16,
  },
  ambIconBox: {
    width: 60, height: 60, borderRadius: 16,
    backgroundColor: "rgba(232,25,44,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  ambName: { color: COLORS.text, fontSize: 16, fontWeight: "700" },
  ambDesc: { color: COLORS.grayDim, fontSize: 12, marginTop: 3 },
  ambRate: {
    backgroundColor: COLORS.red, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  ambRateTxt: { color: COLORS.white, fontSize: 12, fontWeight: "700" },

  // Card
  card: {
    backgroundColor: "rgba(0,0,0,0.04)",
    borderRadius: 16, borderWidth: 0.5, borderColor: "rgba(0,0,0,0.08)",
    padding: 16,
  },
  cardHeader: {
    flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14,
  },
  cardIco: { fontSize: 18 },
  cardTitle: { flex: 1, color: COLORS.text, fontSize: 15, fontWeight: "600" },
  distBadge: {
    backgroundColor: "rgba(0,0,0,0.08)",
    borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4,
  },
  distBadgeTxt: { color: COLORS.grayDim, fontSize: 11, fontWeight: "600" },

  // Route rows
  routeRow: { flexDirection: "row", gap: 14 },
  routeIconCol: { alignItems: "center", width: 12, paddingTop: 4 },
  greenDot: {
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: COLORS.green,
    borderWidth: 2, borderColor: "rgba(34,197,94,0.3)",
  },
  redDot: {
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: COLORS.red,
    borderWidth: 2, borderColor: "rgba(232,25,44,0.3)",
  },
  routeConnector: {
    flex: 1, width: 2,
    backgroundColor: "rgba(0,0,0,0.1)",
    marginVertical: 3, marginBottom: 6,
    minHeight: 20,
  },
  routeText: { flex: 1, paddingBottom: 14 },
  routeRowLabel: {
    color: COLORS.grayDim, fontSize: 10, fontWeight: "700",
    letterSpacing: 0.5, marginBottom: 3,
  },
  routeAddr: { color: COLORS.text, fontSize: 13, fontWeight: "500", lineHeight: 18 },

  // Schedule badges
  nowBadge: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "rgba(34,197,94,0.1)",
    borderRadius: 10, padding: 12,
    borderWidth: 0.5, borderColor: "rgba(34,197,94,0.25)",
  },
  nowDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: COLORS.green,
  },
  nowTxt: { color: COLORS.green, fontSize: 14, fontWeight: "600" },
  laterBadge: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "rgba(232,25,44,0.07)",
    borderRadius: 10, padding: 12,
    borderWidth: 0.5, borderColor: "rgba(232,25,44,0.2)",
  },
  laterIco: { fontSize: 24 },
  laterLabel: { color: COLORS.grayDim, fontSize: 11, fontWeight: "600", marginBottom: 3 },
  laterDate: { color: COLORS.text, fontSize: 13, fontWeight: "600" },

  // Add-ons
  optionalTag: {
    color: COLORS.grayDim, fontSize: 11, fontWeight: "600",
    backgroundColor: "rgba(0,0,0,0.06)",
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  addonRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 12, borderRadius: 12, marginBottom: 8,
    backgroundColor: "rgba(0,0,0,0.03)",
    borderWidth: 1, borderColor: "rgba(0,0,0,0.07)",
  },
  addonRowActive: {
    backgroundColor: "rgba(232,25,44,0.08)",
    borderColor: "rgba(232,25,44,0.4)",
  },
  addonIco: { fontSize: 24 },
  addonName: { color: COLORS.text, fontSize: 14, fontWeight: "600" },
  addonPrice: { color: COLORS.grayDim, fontSize: 12, marginTop: 2 },
  checkbox: {
    width: 24, height: 24, borderRadius: 7,
    borderWidth: 2, borderColor: "rgba(0,0,0,0.3)",
    alignItems: "center", justifyContent: "center",
  },
  checkboxActive: {
    backgroundColor: COLORS.red, borderColor: COLORS.red,
  },
  checkmark: { color: COLORS.white, fontSize: 13, fontWeight: "700" },

  // Fare
  fareRow: {
    flexDirection: "row", justifyContent: "space-between",
    paddingVertical: 8,
  },
  fareLabel: { color: COLORS.grayDim, fontSize: 13 },
  fareValue: { color: COLORS.gray, fontSize: 13, fontWeight: "600" },
  fareDivider: {
    height: 0.5,
    backgroundColor: "rgba(0,0,0,0.08)",
    marginVertical: 6,
  },
  fareNote: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    marginTop: 10, padding: 10,
    backgroundColor: "rgba(0,0,0,0.04)", borderRadius: 10,
  },
  fareNoteIco: { fontSize: 14, marginTop: 1 },
  fareNoteTxt: { flex: 1, color: COLORS.grayDim, fontSize: 11, lineHeight: 16 },

  // Safety
  safetyBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    backgroundColor: "rgba(34,197,94,0.07)",
    borderRadius: 14, padding: 14,
    borderWidth: 0.5, borderColor: "rgba(34,197,94,0.2)",
  },
  safetyIco: { fontSize: 20, marginTop: 1 },
  safetyTitle: { color: COLORS.green, fontSize: 13, fontWeight: "700", marginBottom: 3 },
  safetyTxt: { color: "rgba(34,197,94,0.75)", fontSize: 12, lineHeight: 17 },

  // Footer
  footer: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 18, paddingVertical: 14,
    borderTopWidth: 0.5, borderTopColor: "rgba(0,0,0,0.08)",
    backgroundColor: COLORS.bg, gap: 14,
  },
  footerPriceCol: { flex: 1 },
  footerPriceLabel: { color: COLORS.grayDim, fontSize: 11, fontWeight: "600" },
  footerPrice: { color: COLORS.text, fontSize: 22, fontWeight: "800", marginTop: 2 },
  confirmBtn: {
    flex: 2, flexDirection: "row",
    backgroundColor: COLORS.red, borderRadius: 14,
    paddingVertical: 15, alignItems: "center", justifyContent: "center", gap: 8,
  },
  confirmBtnIco: { fontSize: 20 },
  confirmBtnTxt: { color: COLORS.white, fontSize: 15, fontWeight: "700" },
});
