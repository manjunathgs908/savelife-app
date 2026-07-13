import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert, TextInput, ActivityIndicator,
} from "react-native";
import { COLORS } from "../theme";
import { calcFare, PRICING_API } from "../utils/pricingUtils";
import { getRouteInfo } from "../utils/routeUtils";

const PLACES_KEY = "AIzaSyB8wxgXxQxskgUZG868g_4Qdsezr07i9yA";

async function fetchPlaceDetails(place_id, fallbackLabel) {
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/place/details/json` +
    `?place_id=${place_id}&fields=geometry,formatted_address&key=${PLACES_KEY}`
  );
  const data = await res.json();
  if (!data.result?.geometry) throw new Error("no geometry");
  return {
    coord: {
      latitude:  data.result.geometry.location.lat,
      longitude: data.result.geometry.location.lng,
    },
    label: data.result.formatted_address || fallbackLabel,
  };
}

function fmtDateTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    weekday: "long", day: "numeric", month: "long",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function ConfirmBookingScreen({ navigation, route }) {
  const {
    pickupCoord, pickupLabel, dropCoord, dropLabel,
    dist, duration,
    scheduleType, scheduleDate,
    selectedType,
    selectedAmb,
    pricingList: passedPricing,
  } = route.params;

  const [pricingList, setPricingList] = useState(passedPricing || []);
  const [acEnabled, setAcEnabled] = useState(false);

  // Trip Type — chosen right here, this is the only place it's set
  const [tripType, setTripType] = useState("one_way"); // "one_way" | "round_trip"
  const [returnAddress, setReturnAddress] = useState("");
  const [returnCoord, setReturnCoord] = useState(pickupCoord || null);
  const [returnSameAsPickup, setReturnSameAsPickup] = useState(true);
  const [returnQuery,       setReturnQuery]       = useState("");
  const [returnPhase,       setReturnPhase]       = useState("idle"); // idle | loading | results | empty
  const [returnPredictions, setReturnPredictions] = useState([]);
  const returnDebRef = useRef(null);

  // Fare-relevant distance — the fixed one-way `dist` for "One Way", doubled
  // for a round trip back to the same pickup point, or one-way + the real
  // drop→return driving distance when a different return address is picked.
  const [effectiveDist, setEffectiveDist] = useState(dist);
  const [distLoading, setDistLoading] = useState(false);

  useEffect(() => {
    if (passedPricing?.length) return; // already received from AmbulanceSelectScreen
    fetch(PRICING_API)
      .then(r => r.json())
      .then(d => { if (d.success) setPricingList(d.pricing); })
      .catch(() => {});
  }, []);

  // Keep the return address (and its coordinate) mirrored to the pickup
  // address for as long as "Same as Pickup Address" stays checked.
  useEffect(() => {
    if (returnSameAsPickup) {
      setReturnAddress(pickupLabel);
      setReturnCoord(pickupCoord || null);
    }
  }, [returnSameAsPickup, pickupLabel, pickupCoord]);

  // Recomputes the fare-relevant distance whenever trip type or the return
  // point changes. Round trip to the same pickup point is just dist*2 — no
  // API call needed. A different return address needs the real drop→return
  // driving distance, fetched via the Directions API (same key as Places).
  useEffect(() => {
    if (tripType !== "round_trip") {
      setEffectiveDist(dist);
      return;
    }
    if (returnSameAsPickup) {
      setEffectiveDist(dist * 2);
      return;
    }
    if (!returnCoord || !dropCoord) {
      // Round trip chosen, but no specific return point picked yet —
      // dist*2 is a safe placeholder until one is.
      setEffectiveDist(dist * 2);
      return;
    }

    let active = true;
    setDistLoading(true);
    getRouteInfo(dropCoord, returnCoord)
      .then(result => {
        if (!active) return;
        // Only trust a real Google-routed distance for the return leg —
        // any failure (including getRouteInfo's own Haversine fallback)
        // falls back to the safe dist*2 estimate per spec.
        setEffectiveDist(result.source === "google" ? dist + result.distance : dist * 2);
      })
      .catch(() => {
        if (active) setEffectiveDist(dist * 2);
      })
      .finally(() => {
        if (active) setDistLoading(false);
      });

    return () => { active = false; };
  }, [tripType, returnSameAsPickup, returnCoord, dropCoord, dist]);

  function toggleReturnSameAsPickup() {
    setReturnSameAsPickup(prev => {
      const next = !prev;
      setReturnQuery("");
      setReturnPredictions([]);
      setReturnPhase("idle");
      if (!next) {
        setReturnAddress(""); // start the "different address" search empty
        setReturnCoord(null);
      }
      return next;
    });
  }

  function onChangeReturnQuery(text) {
    setReturnQuery(text);
    clearTimeout(returnDebRef.current);
    if (text.length < 2) { setReturnPredictions([]); setReturnPhase("idle"); return; }
    setReturnPhase("loading");
    returnDebRef.current = setTimeout(async () => {
      try {
        const bias = pickupCoord ? `&location=${pickupCoord.latitude},${pickupCoord.longitude}&radius=50000` : "";
        const res = await fetch(
          `https://maps.googleapis.com/maps/api/place/autocomplete/json` +
          `?input=${encodeURIComponent(text)}&key=${PLACES_KEY}&language=en&components=country:in${bias}`
        );
        const data = await res.json();
        const preds = data.predictions || [];
        setReturnPredictions(preds);
        setReturnPhase(preds.length ? "results" : "empty");
      } catch { setReturnPhase("empty"); }
    }, 350);
  }

  async function handleSelectReturnPrediction(pred) {
    try {
      const result = await fetchPlaceDetails(pred.place_id, pred.description);
      setReturnAddress(result.label);
      setReturnCoord(result.coord);
      setReturnQuery("");
      setReturnPredictions([]);
      setReturnPhase("idle");
    } catch {}
  }

  const amb = selectedAmb || { icon: "🚑", name: "Ambulance", desc: "" };

  // Uses effectiveDist (doubled / drop→return-adjusted for round trips) —
  // NOT the raw one-way `dist`, which stays fixed and is only used for
  // display in the Trip Route card and as the reported one-way leg distance.
  //
  // MongoDB's Pricing collection is the only source of truth here — if no
  // active doc with slabs exists for this vehicle type, `available` is
  // false and NOTHING is guessed. The fare section renders an unavailable
  // state and Confirm Booking is disabled until a real doc exists.
  const { total: baseFareTotal, available: fareAvailable } = calcFare(selectedType, effectiveDist, pricingList);

  // AC price: only offer the add-on if the Pricing doc actually defines
  // acPerKm — no flat guessed price when it doesn't.
  const pricingDoc = pricingList.find(p => p.serviceType?.toLowerCase() === selectedType && p.active !== false);
  const acAvailable = !!pricingDoc?.acPerKm;
  const acPrice = acAvailable ? Math.round(pricingDoc.acPerKm * effectiveDist) : null;
  const effectiveAcEnabled = acEnabled && acAvailable;

  const total = fareAvailable ? baseFareTotal + (effectiveAcEnabled ? acPrice : 0) : null;

  async function handleConfirm() {
    if (!fareAvailable) return; // safety net — button is disabled for this case too
    try {
      const response = await fetch("https://api.savelife.health/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pickupLabel,
          dropLabel,
          dist,
          effectiveDist,
          duration,
          selectedType,
          scheduleType,
          scheduleDate,
          tripType,
          returnAddress: tripType === "round_trip" ? returnAddress : null,
          acEnabled,
        }),
      });

     if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || `Request failed with status ${response.status}`);
      }
      const result = await response.json();
      navigation.navigate("Searching", {
        service: selectedType,
        tripId: result.trip._id,
        pickupCoord, pickupLabel, dropCoord, dropLabel,
        dist, duration, fare: total,
      });
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
            <Text style={styles.ambName}>{amb.name}</Text>
            <Text style={styles.ambDesc}>{amb.desc}</Text>
          </View>
        </View>

        {/* Pricing unavailable notice */}
        {!fareAvailable && (
          <View style={styles.unavailableBox}>
            <Text style={styles.unavailableIco}>⚠️</Text>
            <Text style={styles.unavailableTxt}>
              Pricing unavailable for this vehicle type. Booking can't be confirmed until it's added.
            </Text>
          </View>
        )}

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

        {/* Trip Type card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardIco}>🔁</Text>
            <Text style={styles.cardTitle}>Trip Type</Text>
          </View>

          <TouchableOpacity
            style={styles.tripOpt}
            onPress={() => setTripType("one_way")}
            activeOpacity={0.75}
          >
            <View style={[styles.radio, tripType === "one_way" && styles.radioActive]}>
              {tripType === "one_way" && <View style={styles.radioDot} />}
            </View>
            <Text style={styles.tripOptText}>➡️ One Way</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.tripOpt}
            onPress={() => setTripType("round_trip")}
            activeOpacity={0.75}
          >
            <View style={[styles.radio, tripType === "round_trip" && styles.radioActive]}>
              {tripType === "round_trip" && <View style={styles.radioDot} />}
            </View>
            <Text style={styles.tripOptText}>🔄 Round Trip (Up & Down)</Text>
          </TouchableOpacity>

          {tripType === "round_trip" && (
            <View style={styles.returnSection}>
              <TouchableOpacity
                style={styles.returnCheckboxRow}
                onPress={toggleReturnSameAsPickup}
                activeOpacity={0.75}
              >
                <View style={[styles.checkbox, returnSameAsPickup && styles.checkboxActive]}>
                  {returnSameAsPickup && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={styles.returnCheckboxLabel}>Same as Pickup Address</Text>
              </TouchableOpacity>

              {!returnSameAsPickup && (
                <>
                  <View style={styles.returnInputRow}>
                    <View style={styles.greenDot} />
                    <TextInput
                      style={styles.returnInput}
                      placeholder="Enter return address"
                      placeholderTextColor={COLORS.grayDim}
                      value={returnAddress ? returnAddress : returnQuery}
                      onChangeText={text => {
                        if (returnAddress) setReturnAddress("");
                        onChangeReturnQuery(text);
                      }}
                      returnKeyType="search"
                    />
                    {returnPhase === "loading" && <ActivityIndicator size="small" color={COLORS.red} />}
                  </View>

                  {returnPredictions.length > 0 && (
                    <View style={styles.returnSuggestionsBox}>
                      {returnPredictions.map(item => (
                        <TouchableOpacity
                          key={item.place_id}
                          style={styles.returnSuggRow}
                          onPress={() => handleSelectReturnPrediction(item)}
                        >
                          <Text style={styles.returnSuggIcon}>📍</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.returnSuggMain} numberOfLines={1}>
                              {item.structured_formatting?.main_text || item.description}
                            </Text>
                            {item.structured_formatting?.secondary_text ? (
                              <Text style={styles.returnSuggSub} numberOfLines={1}>
                                {item.structured_formatting.secondary_text}
                              </Text>
                            ) : null}
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </>
              )}
            </View>
          )}
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
              <Text style={styles.laterIco}>🕐</Text>
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
            style={[styles.addonRow, effectiveAcEnabled && styles.addonRowActive, !acAvailable && styles.addonRowDisabled]}
            onPress={() => acAvailable && setAcEnabled(v => !v)}
            activeOpacity={acAvailable ? 0.8 : 1}
            disabled={!acAvailable}
          >
            <Text style={styles.addonIco}>❄️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.addonName}>AC Ambulance</Text>
              {acAvailable ? (
                <Text style={styles.addonPrice}>+₹{acPrice.toLocaleString()}</Text>
              ) : (
                <Text style={styles.addonPriceUnavailable}>Unavailable</Text>
              )}
            </View>
            <View style={[styles.checkbox, effectiveAcEnabled && styles.checkboxActive]}>
              {effectiveAcEnabled && <Text style={styles.checkmark}>✓</Text>}
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
          {!fareAvailable ? (
            <Text style={styles.footerPriceUnavailable}>Unavailable</Text>
          ) : distLoading ? (
            <ActivityIndicator size="small" color={COLORS.red} style={{ marginTop: 4, alignSelf: "flex-start" }} />
          ) : (
            <Text style={styles.footerPrice}>₹{total.toLocaleString()}</Text>
          )}
        </View>
        <TouchableOpacity
          style={[styles.confirmBtn, !fareAvailable && styles.confirmBtnDisabled]}
          onPress={handleConfirm}
          activeOpacity={fareAvailable ? 0.85 : 1}
          disabled={!fareAvailable}
        >
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

  // Pricing-unavailable notice
  unavailableBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    backgroundColor: "rgba(245,158,11,0.1)",
    borderRadius: 12, padding: 12,
    borderWidth: 0.5, borderColor: "rgba(245,158,11,0.3)",
  },
  unavailableIco: { fontSize: 16 },
  unavailableTxt: { flex: 1, color: "#92400e", fontSize: 12.5, lineHeight: 17 },

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

  // Trip Type selector
  tripOpt: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9 },
  tripOptText: { color: COLORS.text, fontSize: 14, fontWeight: "500" },
  radio: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: "rgba(0,0,0,0.3)",
    alignItems: "center", justifyContent: "center",
  },
  radioActive: { borderColor: COLORS.red },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: COLORS.red },

  // Return address (round trip)
  returnSection: { marginTop: 4, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: "rgba(0,0,0,0.08)" },
  returnCheckboxRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  returnCheckboxLabel: { color: COLORS.text, fontSize: 13, fontWeight: "500" },
  returnInputRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "rgba(0,0,0,0.03)", borderRadius: 10,
    borderWidth: 1, borderColor: "rgba(0,0,0,0.08)",
    paddingHorizontal: 12, height: 44, marginTop: 8,
  },
  returnInput: { flex: 1, color: COLORS.text, fontSize: 13, fontWeight: "500" },
  returnSuggestionsBox: {
    backgroundColor: COLORS.white, borderRadius: 12, overflow: "hidden",
    marginTop: 8,
    borderWidth: 1, borderColor: "rgba(0,0,0,0.08)",
  },
  returnSuggRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 12, paddingVertical: 11,
    borderBottomWidth: 0.5, borderBottomColor: "rgba(0,0,0,0.08)",
  },
  returnSuggIcon: { fontSize: 13 },
  returnSuggMain: { color: COLORS.text, fontSize: 13, fontWeight: "500" },
  returnSuggSub: { color: COLORS.grayDim, fontSize: 11, marginTop: 2 },

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
  addonRowDisabled: { opacity: 0.5 },
  addonIco: { fontSize: 24 },
  addonName: { color: COLORS.text, fontSize: 14, fontWeight: "600" },
  addonPrice: { color: COLORS.grayDim, fontSize: 12, marginTop: 2 },
  addonPriceUnavailable: { color: COLORS.grayDim, fontSize: 12, marginTop: 2, fontStyle: "italic" },
  checkbox: {
    width: 24, height: 24, borderRadius: 7,
    borderWidth: 2, borderColor: "rgba(0,0,0,0.3)",
    alignItems: "center", justifyContent: "center",
  },
  checkboxActive: {
    backgroundColor: COLORS.red, borderColor: COLORS.red,
  },
  checkmark: { color: COLORS.white, fontSize: 13, fontWeight: "700" },

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
  footerPriceUnavailable: { color: COLORS.grayDim, fontSize: 15, fontWeight: "700", marginTop: 2, fontStyle: "italic" },
  confirmBtn: {
    flex: 2, flexDirection: "row",
    backgroundColor: COLORS.red, borderRadius: 14,
    paddingVertical: 15, alignItems: "center", justifyContent: "center", gap: 8,
  },
  confirmBtnDisabled: { backgroundColor: "rgba(0,0,0,0.15)" },
  confirmBtnIco: { fontSize: 20 },
  confirmBtnTxt: { color: COLORS.white, fontSize: 15, fontWeight: "700" },
});
