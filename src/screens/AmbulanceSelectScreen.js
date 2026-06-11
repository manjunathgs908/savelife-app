import React, { useState, useEffect } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
} from "react-native";
import { COLORS, getBookingConfig } from "../theme";
import { calcFare, PRICING_API } from "../utils/pricingUtils";

const _bls = getBookingConfig("bls");
const _adv = getBookingConfig("als");

const AMBULANCE_TYPES = [
  { id: "bls",        icon: "🚑",  name: "BLS Ambulance",           desc: "Basic Life Support • Maruti Eeco" },
  { id: "bls_tempo",  icon: "🚐",  name: "BLS Ambulance",           desc: "Basic Life Support • Tempo Traveller" },
  { id: "als_tempo",  icon: "🚐",  name: "ALS Ambulance",           desc: "Advanced Life Support • Tempo Traveller" },
  { id: "acls_tempo", icon: "🚐",  name: "ACLS Ambulance",          desc: "Advanced Cardiac Life Support • Tempo Traveller" },
  { id: "nicu_tempo", icon: "🚐",  name: "NICU Ambulance",          desc: "Newborn Intensive Care Transport • Tempo Traveller" },
  { id: "body_tempo", icon: "🚐",  name: "Body Shifting Ambulance",      desc: "Dead Body Transport • Tempo Traveller" },
  { id: "body_mini",  icon: "🚑",  name: "Body Shifting Mini Ambulance", desc: "Dead Body Transport • Maruti Eeco" },
];

const AMB_RATES = {
  bls:        { km: _bls.vehicles[0].rate, base: 0,    eta: "8",  badge: "MOST POPULAR",  color: "#22c55e" },
  bls_tempo:  {                             eta: "10", badge: "BLS",            color: "#22c55e" },
  als_tempo:  { km: _adv.vehicles[0].rate, base: 500,  eta: "12", badge: "ADVANCED",       color: "#3b82f6" },
  acls_tempo: { km: 30,                    base: 1000, eta: "12", badge: "CARDIAC",         color: COLORS.red },
  nicu_tempo: { km: 25,                    base: 600,  eta: "15", badge: "NEONATAL",        color: "#f59e0b" },
  body_tempo: { km: 18,                    base: 350,  eta: "20", badge: "DIGNIFIED",       color: "#8b5cf6" },
  body_mini:  { km: 18,                    base: 350,  eta: "18", badge: "DIGNIFIED",       color: "#8b5cf6" },
};

const AMB_FEATURES = {
  als_tempo: [
    "Oxygen Support",
    "Cardiac Monitor",
    "Suction Machine",
    "Infusion Pump (2)",
    "Ventilator",
    "BiPAP",
    "CPAP",
    "Trained Paramedic",
  ],
};

function fmtDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function AmbulanceSelectScreen({ navigation, route }) {
  const { pickupLabel, dropLabel, dist, duration, scheduleType, scheduleDate } = route.params;
  const [selected, setSelected] = useState("bls");
  const [pricingList, setPricingList] = useState([]);

  useEffect(() => {
    fetch(PRICING_API)
      .then(r => r.json())
      .then(d => { if (d.success) setPricingList(d.pricing); })
      .catch(() => {}); // silent fallback to local AMB_RATES
  }, []);

  const r = AMB_RATES[selected];
  const estTotal = calcFare(selected, dist, pricingList, AMB_RATES).total;

  function handleNext() {
    navigation.navigate("ConfirmBooking", {
      ...route.params,
      selectedType: selected,
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

      {/* Route summary bar */}
      <View style={styles.routeBar}>
        <View style={styles.routeEndpoint}>
          <View style={styles.greenDotSm} />
          <Text style={styles.routeAddr} numberOfLines={1}>{pickupLabel}</Text>
        </View>
        <View style={styles.routeMid}>
          <View style={styles.routeLine} />
          <View style={styles.routeDistPill}>
            <Text style={styles.routeDistTxt}>
              {dist.toFixed(1)} km · ~{Math.round(duration / 60)} min
            </Text>
          </View>
          <View style={styles.routeLine} />
        </View>
        <View style={styles.routeEndpoint}>
          <View style={styles.redDotSm} />
          <Text style={styles.routeAddr} numberOfLines={1}>{dropLabel}</Text>
        </View>

        {scheduleType === "later" && scheduleDate && (
          <View style={styles.schedBadge}>
            <Text style={styles.schedBadgeTxt}>🕐  {fmtDate(scheduleDate)}</Text>
          </View>
        )}
      </View>

      {/* Ambulance type list */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.listHeading}>ALL AMBULANCE TYPES</Text>

        {AMBULANCE_TYPES.map(amb => {
          const info = AMB_RATES[amb.id];
          const est = calcFare(amb.id, dist, pricingList, AMB_RATES).total;
          const isActive = selected === amb.id;

          return (
            <React.Fragment key={amb.id}>
              <TouchableOpacity
                style={[styles.card, isActive && styles.cardActive]}
                onPress={() => setSelected(amb.id)}
                activeOpacity={0.8}
              >
                {/* Badge */}
                {info.badge ? (
                  <View style={[styles.badge, { backgroundColor: info.color + "22", borderColor: info.color + "66" }]}>
                    <Text style={[styles.badgeTxt, { color: info.color }]}>{info.badge}</Text>
                  </View>
                ) : null}

                <View style={styles.cardMain}>
                  {/* Icon */}
                  <View style={[styles.iconBox, isActive && { backgroundColor: COLORS.red + "22" }]}>
                    <Text style={{ fontSize: 28 }}>{amb.icon}</Text>
                  </View>

                  {/* Info */}
                  <View style={styles.cardInfo}>
                    <Text style={styles.ambName}>{amb.name}</Text>
                    <Text style={styles.ambDesc}>{amb.desc}</Text>
                    <View style={styles.metaRow}>
                      <Text style={styles.metaChip}>⏱ ~{info.eta} min away</Text>
                      {info.km ? <Text style={styles.metaChip}>₹{info.km}/km</Text> : <Text style={styles.metaChip}>Slab pricing</Text>}
                      {info.base > 0 && <Text style={styles.metaChip}>+₹{info.base} base</Text>}
                    </View>
                  </View>

                  {/* Price + radio */}
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

              {/* Equipment list — visible immediately below card when selected */}
              {isActive && AMB_FEATURES[amb.id] && (
                <View style={styles.featuresBox}>
                  <Text style={styles.featuresTitle}>Included Equipment</Text>
                  {AMB_FEATURES[amb.id].map(f => (
                    <View key={f} style={styles.featureRow}>
                      <Text style={styles.featureCheck}>✓</Text>
                      <Text style={styles.featureTxt}>{f}</Text>
                    </View>
                  ))}
                </View>
              )}
            </React.Fragment>
          );
        })}

        {/* Pricing note */}
        <View style={styles.noteBox}>
          <Text style={styles.noteIco}>ℹ️</Text>
          <Text style={styles.noteTxt}>
            {calcFare(selected, dist, pricingList, AMB_RATES).base === 0
              ? `Estimated fare uses slab pricing for ${dist.toFixed(1)} km. Final amount confirmed after booking.`
              : `Estimated fare = base charge + ₹${r.km}/km × ${dist.toFixed(1)} km. Final amount confirmed after booking.`
            }
          </Text>
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.footerLeft}>
          <Text style={styles.footerLabel}>Selected · {AMBULANCE_TYPES.find(a => a.id === selected)?.name}</Text>
          <Text style={styles.footerPrice}>₹{estTotal.toLocaleString()} est.</Text>
        </View>
        <TouchableOpacity style={styles.nextBtn} onPress={handleNext} activeOpacity={0.85}>
          <Text style={styles.nextBtnTxt}>Confirm Type  →</Text>
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
    borderBottomWidth: 0.5, borderBottomColor: "rgba(255,255,255,0.07)",
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center", justifyContent: "center",
  },
  backArrow: { color: COLORS.white, fontSize: 20 },
  headerTitle: { color: COLORS.white, fontSize: 17, fontWeight: "700" },
  headerSub: { color: COLORS.grayDim, fontSize: 12, marginTop: 1 },

  // Route bar
  routeBar: {
    marginHorizontal: 18, marginVertical: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 14, paddingVertical: 12, gap: 8,
  },
  routeEndpoint: { flexDirection: "row", alignItems: "center", gap: 10 },
  greenDotSm: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: COLORS.green,
  },
  redDotSm: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: COLORS.red,
  },
  routeAddr: { flex: 1, color: COLORS.white, fontSize: 12, fontWeight: "500" },
  routeMid: { flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 4 },
  routeLine: { flex: 1, height: 0.5, backgroundColor: "rgba(255,255,255,0.15)" },
  routeDistPill: {
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100,
  },
  routeDistTxt: { color: COLORS.grayDim, fontSize: 11, fontWeight: "600" },
  schedBadge: {
    backgroundColor: "rgba(232,25,44,0.12)",
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
    alignSelf: "flex-start",
    borderWidth: 0.5, borderColor: "rgba(232,25,44,0.3)",
  },
  schedBadgeTxt: { color: COLORS.red, fontSize: 12, fontWeight: "600" },

  // List
  listContent: { paddingHorizontal: 18, paddingBottom: 0 },
  listHeading: {
    color: COLORS.grayDim, fontSize: 11, fontWeight: "700",
    letterSpacing: 1.2, marginBottom: 12,
  },

  // Card
  card: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 16, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.08)",
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
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center", justifyContent: "center",
  },
  cardInfo: { flex: 1 },
  ambName: { color: COLORS.white, fontSize: 15, fontWeight: "700" },
  ambDesc: { color: COLORS.grayDim, fontSize: 12, marginTop: 2 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 7 },
  metaChip: {
    color: COLORS.grayDim, fontSize: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
  },
  priceCol: { alignItems: "flex-end", gap: 4 },
  priceTotal: { color: COLORS.white, fontSize: 16, fontWeight: "800" },
  priceEst: { color: COLORS.grayDim, fontSize: 10 },
  radio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: "rgba(255,255,255,0.3)",
    alignItems: "center", justifyContent: "center",
    marginTop: 4,
  },
  radioActive: { borderColor: COLORS.red },
  radioDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: COLORS.red,
  },

  // Features panel
  featuresBox: {
    backgroundColor: "rgba(34,197,94,0.06)",
    borderRadius: 14, borderWidth: 0.5, borderColor: "rgba(34,197,94,0.2)",
    padding: 14, marginBottom: 10,
  },
  featuresTitle: {
    color: COLORS.green, fontSize: 11, fontWeight: "700",
    letterSpacing: 0.8, marginBottom: 10,
  },
  featureRow: {
    flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4,
  },
  featureCheck: { color: COLORS.green, fontSize: 13, fontWeight: "700", width: 16 },
  featureTxt: { color: COLORS.white, fontSize: 13 },

  // Pricing note
  noteBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: "rgba(59,130,246,0.07)",
    borderRadius: 12, padding: 12, marginTop: 4,
    borderWidth: 0.5, borderColor: "rgba(59,130,246,0.2)",
  },
  noteIco: { fontSize: 16, marginTop: 1 },
  noteTxt: { flex: 1, color: "rgba(147,197,253,0.8)", fontSize: 12, lineHeight: 17 },

  // Footer
  footer: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 18, paddingVertical: 14,
    borderTopWidth: 0.5, borderTopColor: "rgba(255,255,255,0.08)",
    backgroundColor: COLORS.bg, gap: 14,
  },
  footerLeft: { flex: 1 },
  footerLabel: { color: COLORS.grayDim, fontSize: 11, fontWeight: "600" },
  footerPrice: { color: COLORS.white, fontSize: 20, fontWeight: "800", marginTop: 2 },
  nextBtn: {
    backgroundColor: COLORS.red,
    borderRadius: 12, paddingVertical: 14, paddingHorizontal: 20,
  },
  nextBtnTxt: { color: COLORS.white, fontSize: 14, fontWeight: "700" },
});
