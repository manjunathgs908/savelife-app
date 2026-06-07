import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  Switch,
  ActivityIndicator,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

// Google Maps API key — sourced from environment variable with a fallback for local dev
const GOOGLE_MAPS_KEY = process.env.GOOGLE_MAPS_API_KEY || 'AIzaSyDbfZSXgpZqZy3pzyt2Is0b1YWZQduy8dY';

// ---------------------------------------------------------------------------
// Data constants
// ---------------------------------------------------------------------------

const VIP_PINCODES = new Set([
  '560001','560003','560008','560011','560034','560037','560038','560041',
  '560048','560054','560055','560066','560069','560070','560080','560094',
  '560095','560102',
]);

const SLUM_PINCODES = new Set([
  '560021','560026','560030','560045','560051','560057','560058',
]);

// 24-hour base rates per box type and area classification
const PRICING_MATRIX = {
  Normal:   { normalArea: 2500, vipArea: 3000 },
  Standard: { normalArea: 3500, vipArea: 4000 },
  VIP:      { normalArea: 7000, vipArea: 9000 },
};

const EMBALMING_FEE = 2500;

const BOX_OPTIONS = [
  { id: 'Normal',   icon: '❄️', name: 'Normal Box',        desc: 'Basic freezer box for standard use' },
  { id: 'Standard', icon: '🧊', name: 'Standard Box',      desc: 'Enhanced insulation with digital monitoring' },
  { id: 'VIP',      icon: '💎', name: 'VIP / Digital Box', desc: 'Premium digital freezer with advanced features' },
];

const DURATION_OPTIONS = [
  { id: '4-12', label: '4 – 12 Hours',      tag: '20% discount',                              multiplier: 1, discountRate: 0.20, showEmbalming: false },
  { id: '24',   label: '24 Hours (1 Day)',   tag: 'Standard base rate',                        multiplier: 1, discountRate: 0,    showEmbalming: false },
  { id: '48',   label: '48 Hours (2 Days)',  tag: '30% discount · Embalming option available', multiplier: 2, discountRate: 0.30, showEmbalming: true  },
  { id: '72',   label: '72 Hours (3 Days)',  tag: '30% discount · Embalming option available', multiplier: 3, discountRate: 0.30, showEmbalming: true  },
  { id: '96',   label: '96 Hours (4 Days)',  tag: '30% discount · Embalming option available', multiplier: 4, discountRate: 0.30, showEmbalming: true  },
  { id: '120',  label: '120 Hours (5 Days)', tag: '30% discount · Embalming option available', multiplier: 5, discountRate: 0.30, showEmbalming: true  },
];

const FLOOR_OPTIONS = [
  { id: 'Ground',   label: 'Ground Floor',   helperCharge: 0    },
  { id: '1st',      label: '1st Floor',      helperCharge: 600  },
  { id: '2nd',      label: '2nd Floor',      helperCharge: 1000 },
  { id: '3rd',      label: '3rd Floor',      helperCharge: 1200 },
  { id: 'Above3rd', label: 'Above 3rd Floor',helperCharge: 1500 },
];

const BANGALORE_CENTER = {
  latitude: 12.9716,
  longitude: 77.5946,
  latitudeDelta: 0.0922,
  longitudeDelta: 0.0421,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FreezerBoxBookingScreen({ navigation }) {
  // Step 1
  const [boxType, setBoxType] = useState(null);
  // Step 2
  const [duration, setDuration] = useState(null);
  // Step 3 — map & geocoding
  const [markerCoord, setMarkerCoord] = useState({
    latitude: BANGALORE_CENTER.latitude,
    longitude: BANGALORE_CENTER.longitude,
  });
  const [geocoding, setGeocoding] = useState(false);
  const [locationConfirmed, setLocationConfirmed] = useState(false);
  const [isVipArea, setIsVipArea] = useState(false);
  const [resolvedAddress, setResolvedAddress] = useState('');
  // Step 4 — embalming toggle (only for multi-day durations)
  const [includeEmbalming, setIncludeEmbalming] = useState(true);
  // Step 4 — floor
  const [selectedFloor, setSelectedFloor] = useState('Ground');
  // Step 5 — customer details
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const mapRef = useRef(null);

  // ---------------------------------------------------------------------------
  // Google Maps reverse geocoding
  // ---------------------------------------------------------------------------

  async function reverseGeocode(latitude, longitude) {
    const url =
      `https://maps.googleapis.com/maps/api/geocode/json` +
      `?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_KEY}`;

    const response = await fetch(url);
    const data = await response.json();

    if (!data.results || data.results.length === 0) {
      return { address: null, pincode: null };
    }

    const firstResult = data.results[0];
    const formattedAddress = firstResult.formatted_address;

    const pincodeComponent = firstResult.address_components.find(component =>
      component.types.includes('postal_code')
    );
    const pincode = pincodeComponent ? pincodeComponent.long_name : null;

    return { address: formattedAddress, pincode };
  }

  async function handleConfirmLocation() {
    setGeocoding(true);
    try {
      const { address, pincode } = await reverseGeocode(
        markerCoord.latitude,
        markerCoord.longitude
      );

      if (!address) {
        Alert.alert(
          'Location Not Found',
          'Could not resolve an address for the selected pin. Try adjusting the marker position.'
        );
        return;
      }

      setResolvedAddress(address);

      // Classify area: VIP pincodes get premium rates; slum and unknown pincodes get normal rates
      const vip = pincode ? VIP_PINCODES.has(pincode) : false;
      setIsVipArea(vip);
      setLocationConfirmed(true);
    } catch (error) {
      console.error('Reverse geocoding failed:', error);
      Alert.alert('Network Error', 'Unable to fetch address. Check your connection and try again.');
    } finally {
      setGeocoding(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Dynamic price calculation
  // ---------------------------------------------------------------------------

  function calculateBill() {
    if (!boxType || !duration || !locationConfirmed) return null;

    const selectedDuration = DURATION_OPTIONS.find(d => d.id === duration);
    const baseRate = isVipArea
      ? PRICING_MATRIX[boxType].vipArea
      : PRICING_MATRIX[boxType].normalArea;

    const grossRent = baseRate * selectedDuration.multiplier;
    const discountAmount = Math.round(grossRent * selectedDuration.discountRate);
    const netRent = grossRent - discountAmount;

    const embalmingCharge =
      selectedDuration.showEmbalming && includeEmbalming ? EMBALMING_FEE : 0;

    const floorObj = FLOOR_OPTIONS.find(f => f.id === selectedFloor);
    const helperCharge = floorObj ? floorObj.helperCharge : 0;

    const total = netRent + embalmingCharge + helperCharge;

    return {
      grossRent,
      discountRate: selectedDuration.discountRate * 100,
      discountAmount,
      netRent,
      embalmingCharge,
      helperCharge,
      total,
    };
  }

  const bill = calculateBill();
  const selectedDurationObj = DURATION_OPTIONS.find(d => d.id === duration);

  // ---------------------------------------------------------------------------
  // Submission
  // ---------------------------------------------------------------------------

  async function handleSubmit() {
    if (!customerName.trim()) {
      return Alert.alert('Missing', 'Please enter the customer name.');
    }
    if (!phone.trim() || phone.length < 10) {
      return Alert.alert('Missing', 'Please enter a valid 10-digit phone number.');
    }

    setSubmitting(true);
    try {
      Alert.alert(
        'Request Submitted!',
        `Your freezer box booking is received.\nTotal: ₹${bill?.total?.toLocaleString()}`,
        [{ text: 'OK', onPress: () => navigation?.goBack() }]
      );
    } catch (error) {
      console.error('Submission failed:', error);
      Alert.alert('Error', 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation?.goBack()}>
          <Text style={styles.backArrow}>&#8592;</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Freezer Box</Text>
          <Text style={styles.headerSubtitle}>Home freezer box service</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Banner */}
        <View style={styles.bannerCard}>
          <Text style={styles.bannerText}>
            Professional freezer box service delivered to your doorstep
          </Text>
          <View style={styles.availabilityRow}>
            <View style={styles.availabilityDot} />
            <Text style={styles.availabilityText}>Available 24x7</Text>
          </View>
        </View>

        {/* ── STEP 1: Box Type ─────────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.stepRow}>
            <View style={styles.stepBadge}><Text style={styles.stepNumber}>1</Text></View>
            <Text style={styles.cardTitle}>Select Box Type</Text>
          </View>
          {BOX_OPTIONS.map(box => (
            <TouchableOpacity
              key={box.id}
              style={[styles.optionRow, boxType === box.id && styles.optionRowActive]}
              onPress={() => setBoxType(box.id)}
            >
              <Text style={styles.optionIcon}>{box.icon}</Text>
              <View style={styles.optionInfo}>
                <Text style={styles.optionName}>{box.name}</Text>
                <Text style={styles.optionDesc}>{box.desc}</Text>
              </View>
              <View style={[styles.radioOuter, boxType === box.id && styles.radioOuterActive]}>
                {boxType === box.id && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── STEP 2: Duration — unlocked after box type selected ───────── */}
        {boxType && (
          <View style={styles.card}>
            <View style={styles.stepRow}>
              <View style={styles.stepBadge}><Text style={styles.stepNumber}>2</Text></View>
              <Text style={styles.cardTitle}>Select Duration</Text>
            </View>
            {DURATION_OPTIONS.map(dur => (
              <TouchableOpacity
                key={dur.id}
                style={[styles.listRow, duration === dur.id && styles.listRowActive]}
                onPress={() => setDuration(dur.id)}
              >
                <View style={styles.listRowContent}>
                  <Text style={styles.listRowTitle}>{dur.label}</Text>
                  <Text style={styles.discountLabel}>{dur.tag}</Text>
                </View>
                <View style={[styles.radioOuter, duration === dur.id && styles.radioOuterActive]}>
                  {duration === dur.id && <View style={styles.radioDot} />}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── STEP 3: Map location — unlocked after duration selected ─────── */}
        {duration && (
          <View style={styles.card}>
            <View style={styles.stepRow}>
              <View style={styles.stepBadge}><Text style={styles.stepNumber}>3</Text></View>
              <Text style={styles.cardTitle}>Service Location</Text>
            </View>
            <Text style={styles.fieldHint}>
              Drag the map or move the pin to your delivery address, then tap Confirm.
            </Text>

            <View style={styles.mapContainer}>
              <MapView
                ref={mapRef}
                style={styles.map}
                provider={PROVIDER_GOOGLE}
                initialRegion={BANGALORE_CENTER}
                onRegionChangeComplete={region =>
                  setMarkerCoord({ latitude: region.latitude, longitude: region.longitude })
                }
              >
                <Marker
                  coordinate={markerCoord}
                  draggable
                  pinColor="#EF4444"
                  onDragEnd={e => setMarkerCoord(e.nativeEvent.coordinate)}
                />
              </MapView>
            </View>

            <TouchableOpacity
              style={[styles.confirmBtn, geocoding && styles.disabledBtn]}
              onPress={handleConfirmLocation}
              disabled={geocoding}
            >
              {geocoding
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.confirmBtnText}>
                    {locationConfirmed ? 'Re-confirm Location' : 'Confirm Location'}
                  </Text>
              }
            </TouchableOpacity>

            {locationConfirmed && (
              <View style={[styles.areaBadge, isVipArea ? styles.areaBadgeVip : styles.areaBadgeNormal]}>
                <Text style={styles.areaBadgeTitle}>
                  {isVipArea ? '💎 VIP Area — Premium rates apply' : '✓ Normal Area — Standard rates apply'}
                </Text>
                <Text style={styles.areaBadgeAddress} numberOfLines={2}>{resolvedAddress}</Text>
              </View>
            )}
          </View>
        )}

        {/* ── STEPS 4 & 5 — unlocked after location is confirmed ─────────── */}
        {locationConfirmed && (
          <>
            {/* Embalming toggle — only for multi-day durations */}
            {selectedDurationObj?.showEmbalming && (
              <View style={styles.card}>
                <View style={styles.embalmingRow}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={styles.cardTitle}>Embalming Service</Text>
                    <Text style={styles.fieldHint}>
                      Recommended preservation for multi-day rentals — ₹2,500 flat fee
                    </Text>
                  </View>
                  <Switch
                    trackColor={{ false: '#333', true: '#EF4444' }}
                    thumbColor={includeEmbalming ? '#FFF' : '#888'}
                    value={includeEmbalming}
                    onValueChange={setIncludeEmbalming}
                  />
                </View>
              </View>
            )}

            {/* STEP 4: Floor selection */}
            <View style={styles.card}>
              <View style={styles.stepRow}>
                <View style={styles.stepBadge}><Text style={styles.stepNumber}>4</Text></View>
                <Text style={styles.cardTitle}>Floor Selection</Text>
              </View>
              <Text style={styles.fieldHint}>Helper shifting charges vary by floor level</Text>
              {FLOOR_OPTIONS.map(f => (
                <TouchableOpacity
                  key={f.id}
                  style={[styles.listRow, selectedFloor === f.id && styles.listRowActive]}
                  onPress={() => setSelectedFloor(f.id)}
                >
                  <Text style={styles.listRowTitle}>{f.label}</Text>
                  <View style={styles.floorRight}>
                    <Text style={f.helperCharge === 0 ? styles.freeLabel : styles.chargeLabel}>
                      {f.helperCharge === 0 ? 'Free' : `₹${f.helperCharge.toLocaleString()}`}
                    </Text>
                    <View style={[styles.radioOuter, selectedFloor === f.id && styles.radioOuterActive]}>
                      {selectedFloor === f.id && <View style={styles.radioDot} />}
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            {/* STEP 5: Customer details */}
            <View style={styles.card}>
              <View style={styles.stepRow}>
                <View style={styles.stepBadge}><Text style={styles.stepNumber}>5</Text></View>
                <Text style={styles.cardTitle}>Delivery Details</Text>
              </View>

              <Text style={styles.fieldLabel}>RESOLVED ADDRESS</Text>
              <TextInput
                style={[styles.input, { color: '#666' }]}
                value={resolvedAddress}
                editable={false}
              />

              <Text style={styles.fieldLabel}>CUSTOMER NAME</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter full name"
                placeholderTextColor="#555"
                value={customerName}
                onChangeText={setCustomerName}
              />

              <Text style={styles.fieldLabel}>PHONE NUMBER</Text>
              <TextInput
                style={styles.input}
                placeholder="+91 Enter 10-digit phone number"
                placeholderTextColor="#555"
                keyboardType="phone-pad"
                maxLength={10}
                value={phone}
                onChangeText={setPhone}
              />
            </View>

            {/* Live bill breakdown — updates instantly as selections change */}
            {bill && (
              <View style={styles.billCard}>
                <Text style={styles.billTitle}>Live Bill Breakdown</Text>

                <View style={styles.billLine}>
                  <Text style={styles.billLabel}>Freezer Box Rent ({boxType})</Text>
                  <Text style={styles.billValue}>₹{bill.grossRent.toLocaleString()}</Text>
                </View>

                {bill.discountAmount > 0 && (
                  <View style={styles.billLine}>
                    <Text style={styles.billLabelGreen}>
                      Duration Discount ({bill.discountRate}%)
                    </Text>
                    <Text style={styles.billValueGreen}>
                      – ₹{bill.discountAmount.toLocaleString()}
                    </Text>
                  </View>
                )}

                {bill.embalmingCharge > 0 && (
                  <View style={styles.billLine}>
                    <Text style={styles.billLabel}>Embalming Charge</Text>
                    <Text style={styles.billValue}>₹{bill.embalmingCharge.toLocaleString()}</Text>
                  </View>
                )}

                {bill.helperCharge > 0 && (
                  <View style={styles.billLine}>
                    <Text style={styles.billLabel}>Helper Charge ({selectedFloor} floor)</Text>
                    <Text style={styles.billValue}>₹{bill.helperCharge.toLocaleString()}</Text>
                  </View>
                )}

                <View style={styles.billDivider} />

                <View style={styles.billLine}>
                  <Text style={styles.billTotalLabel}>TOTAL</Text>
                  <Text style={styles.billTotal}>₹{bill.total.toLocaleString()}</Text>
                </View>
              </View>
            )}

            {/* Submit */}
            <TouchableOpacity
              style={[styles.submitButton, submitting && styles.disabledBtn]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.submitText}>Request Freezer Box</Text>
              }
            </TouchableOpacity>
            <Text style={styles.submitNote}>Our team will call you to confirm the booking</Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0A0A0A' },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, paddingTop: 50, paddingBottom: 14, borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.07)' },
  backButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  backArrow: { color: '#fff', fontSize: 20 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  headerSubtitle: { color: 'rgba(255,255,255,0.35)', fontSize: 12, marginTop: 2 },

  // Scroll
  scrollContent: { padding: 16, paddingBottom: 50 },

  // Banner
  bannerCard: { backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 0.5, borderColor: 'rgba(239,68,68,0.25)', borderRadius: 14, padding: 14, marginBottom: 16 },
  bannerText: { color: '#ccc', fontSize: 13, lineHeight: 18 },
  availabilityRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  availabilityDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#EF4444' },
  availabilityText: { fontSize: 11, color: '#EF4444', fontWeight: '600' },

  // Card / section
  card: { backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 16, padding: 16, marginBottom: 14 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  stepBadge: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center' },
  stepNumber: { color: '#fff', fontSize: 12, fontWeight: '700' },
  cardTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Box type option rows
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: 'rgba(0,0,0,0.3)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 12, marginBottom: 10 },
  optionRowActive: { borderColor: 'rgba(239,68,68,0.5)', backgroundColor: 'rgba(239,68,68,0.08)' },
  optionIcon: { fontSize: 26 },
  optionInfo: { flex: 1 },
  optionName: { color: '#fff', fontSize: 14, fontWeight: '700' },
  optionDesc: { color: 'rgba(255,255,255,0.35)', fontSize: 12, marginTop: 2 },

  // Generic list rows (duration, floor)
  listRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, backgroundColor: 'rgba(0,0,0,0.3)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 10, marginBottom: 8 },
  listRowActive: { borderColor: 'rgba(239,68,68,0.5)', backgroundColor: 'rgba(239,68,68,0.08)' },
  listRowContent: { flex: 1 },
  listRowTitle: { color: '#fff', fontSize: 13, fontWeight: '600' },
  discountLabel: { color: '#22c55e', fontSize: 11, marginTop: 3 },

  // Radio button
  radioOuter: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: '#555', alignItems: 'center', justifyContent: 'center' },
  radioOuterActive: { borderColor: '#EF4444' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444' },

  // Map
  mapContainer: { height: 220, borderRadius: 12, overflow: 'hidden', marginBottom: 12, borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.1)' },
  map: { flex: 1 },

  // Confirm location button
  confirmBtn: { backgroundColor: '#EF4444', padding: 13, borderRadius: 10, alignItems: 'center', marginBottom: 10 },
  confirmBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  disabledBtn: { opacity: 0.6 },

  // Area badge (shown after geocoding)
  areaBadge: { borderRadius: 10, padding: 12, marginTop: 4 },
  areaBadgeVip: { backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 0.5, borderColor: 'rgba(239,68,68,0.4)' },
  areaBadgeNormal: { backgroundColor: 'rgba(34,197,94,0.1)', borderWidth: 0.5, borderColor: 'rgba(34,197,94,0.3)' },
  areaBadgeTitle: { color: '#fff', fontSize: 13, fontWeight: '700' },
  areaBadgeAddress: { color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 4 },

  // Embalming
  embalmingRow: { flexDirection: 'row', alignItems: 'center' },

  // Floor
  floorRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  freeLabel: { color: '#22c55e', fontSize: 12, fontWeight: '700' },
  chargeLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '600' },

  // Inputs
  fieldHint: { color: 'rgba(255,255,255,0.35)', fontSize: 12, marginBottom: 12, marginTop: -4 },
  fieldLabel: { color: 'rgba(255,255,255,0.35)', fontSize: 11, letterSpacing: 0.5, marginBottom: 6, marginTop: 4 },
  input: { backgroundColor: 'rgba(0,0,0,0.4)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: 12, color: '#fff', fontSize: 14, marginBottom: 14 },

  // Bill card
  billCard: { backgroundColor: 'rgba(7,20,34,0.95)', borderWidth: 0.5, borderColor: 'rgba(239,68,68,0.3)', borderRadius: 16, padding: 16, marginBottom: 16 },
  billTitle: { color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 14 },
  billLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  billLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
  billValue: { color: '#fff', fontSize: 13, fontWeight: '600' },
  billLabelGreen: { color: '#22c55e', fontSize: 13 },
  billValueGreen: { color: '#22c55e', fontSize: 13, fontWeight: '600' },
  billDivider: { height: 0.5, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: 10 },
  billTotalLabel: { color: '#fff', fontSize: 16, fontWeight: '700' },
  billTotal: { color: '#EF4444', fontSize: 22, fontWeight: '800' },

  // Submit
  submitButton: { backgroundColor: '#EF4444', borderRadius: 14, padding: 17, alignItems: 'center', marginBottom: 10 },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  submitNote: { textAlign: 'center', color: 'rgba(255,255,255,0.35)', fontSize: 11, marginBottom: 10 },
});
