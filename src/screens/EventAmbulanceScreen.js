import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, Modal,
  StyleSheet, ActivityIndicator, TextInput, FlatList, Alert,
} from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import * as Location from "expo-location";
import { COLORS } from "../theme";

const MAPS_KEY = "AIzaSyDbfZSXgpZqZy3pzyt2Is0b1YWZQduy8dY";

async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${MAPS_KEY}`);
    const data = await res.json();
    if (data.results?.length) return data.results[0].formatted_address;
  } catch {}
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

function LocationSearchModal({ visible, onSelect, onClose, gpsCoord, gpsLabel }) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => { if (visible) { setQuery(""); setSuggestions([]); } }, [visible]);

  function handleChange(text) {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.length < 2) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(text)}&key=${MAPS_KEY}&language=en&components=country:in`);
        const data = await res.json();
        setSuggestions(data.predictions || []);
      } catch {}
      setSearching(false);
    }, 350);
  }

  async function selectPrediction(prediction) {
    try {
      const res = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${prediction.place_id}&fields=geometry,formatted_address&key=${MAPS_KEY}`);
      const data = await res.json();
      if (data.result?.geometry) {
        onSelect({ coord: { latitude: data.result.geometry.location.lat, longitude: data.result.geometry.location.lng }, label: data.result.formatted_address || prediction.description });
      }
    } catch {}
  }

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={srch.container}>
        <View style={srch.header}>
          <TouchableOpacity onPress={onClose} style={srch.closeBtn}><Text style={srch.closeText}>X</Text></TouchableOpacity>
          <Text style={srch.title}>Select Standby Location</Text>
        </View>
        <View style={srch.inputRow}>
          <TextInput style={srch.input} placeholder="Search venue, area or address..." placeholderTextColor={COLORS.grayDim} value={query} onChangeText={handleChange} autoFocus autoCorrect={false} />
          {query.length > 0 && <TouchableOpacity onPress={() => { setQuery(""); setSuggestions([]); }}><Text style={srch.clearBtn}>X</Text></TouchableOpacity>}
        </View>
        {gpsCoord && (
          <TouchableOpacity style={srch.gpsRow} onPress={() => onSelect({ coord: gpsCoord, label: gpsLabel || "Current Location" })}>
            <View style={{ flex: 1 }}>
              <Text style={srch.gpsTitle}>Use Current Location</Text>
              {gpsLabel ? <Text style={srch.gpsSub} numberOfLines={1}>{gpsLabel}</Text> : null}
            </View>
          </TouchableOpacity>
        )}
        {searching && <ActivityIndicator color={COLORS.red} style={{ marginTop: 20 }} />}
        <FlatList data={suggestions} keyExtractor={(item) => item.place_id} keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <TouchableOpacity style={srch.suggRow} onPress={() => selectPrediction(item)}>
              <View style={{ flex: 1 }}>
                <Text style={srch.suggMain} numberOfLines={1}>{item.structured_formatting?.main_text || item.description}</Text>
                {item.structured_formatting?.secondary_text ? <Text style={srch.suggSub} numberOfLines={1}>{item.structured_formatting.secondary_text}</Text> : null}
              </View>
            </TouchableOpacity>
          )}
        />
      </View>
    </Modal>
  );
}

const PURPOSES = ["Sports Event","Concert / Show","Corporate Event","Wedding / Function","Marathon / Run","School / College Event","Religious Event","Other"];
const AMBULANCE_TYPES = [
  { id: "bls", name: "BLS Ambulance", tag: "Basic Life Support", recommended: true },
  { id: "als", name: "ALS Ambulance", tag: "Advanced Life Support", recommended: false },
  { id: "icu", name: "ICU Ambulance", tag: "Critical Care Unit", recommended: false },
];
const EQUIPMENTS = [
  { id: "oxygen", name: "Oxygen" },
  { id: "aed", name: "Defibrillator (AED)" },
  { id: "firstaid", name: "First Aid Kit" },
  { id: "stretcher", name: "Stretcher" },
];

export default function EventAmbulanceScreen({ navigation }) {
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  const [standbyCoord, setStandbyCoord] = useState(null);
  const [standbyLabel, setStandbyLabel] = useState("");
  const [gpsCoord, setGpsCoord] = useState(null);
  const [gpsLabel, setGpsLabel] = useState("");
  const mapRef = useRef(null);
  const [eventName, setEventName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [purposeModal, setPurposeModal] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  
  const [ambulanceType, setAmbulanceType] = useState("bls");
  const [staff, setStaff] = useState([]);
  const [equipments, setEquipments] = useState([]);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [altPhone, setAltPhone] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const coord = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setGpsCoord(coord);
        const label = await reverseGeocode(coord.latitude, coord.longitude);
        setGpsLabel(label);
      } catch {
        const last = await Location.getLastKnownPositionAsync();
        if (last) {
          const coord = { latitude: last.coords.latitude, longitude: last.coords.longitude };
          setGpsCoord(coord);
          const label = await reverseGeocode(coord.latitude, coord.longitude);
          setGpsLabel(label);
        }
      }
    })();
  }, []);

  const toggleStaff = (id) => setStaff((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  const toggleEquip = (id) => setEquipments((e) => e.includes(id) ? e.filter((x) => x !== id) : [...e, id]);

  async function handleMapTap(e) {
    const coord = e.nativeEvent.coordinate;
    const label = await reverseGeocode(coord.latitude, coord.longitude);
    setStandbyCoord(coord);
    setStandbyLabel(label);
  }

  async function handleMarkerDrag(coord) {
    const label = await reverseGeocode(coord.latitude, coord.longitude);
    setStandbyCoord(coord);
    setStandbyLabel(label);
  }

  async function handleSubmit() {
    if (!eventName.trim()) return Alert.alert("Missing", "Event name enter maadi");
    if (!standbyCoord) return Alert.alert("Missing", "Standby location select maadi");
    if (!contactPhone.trim()) return Alert.alert("Missing", "Contact phone number enter maadi");
    setSubmitting(true);
    try {
      Alert.alert("Success!", "Event Ambulance request submitted!\nOur team will call you shortly.", [{ text: "OK", onPress: () => navigation.goBack() }]);
    } catch {
      Alert.alert("Error", "Request submit aagalilla. Try again.");
    }
    setSubmitting(false);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
          <Text style={{ color: COLORS.white, fontSize: 20 }}>&#8592;</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Event Ambulance</Text>
          <Text style={styles.subtitle}>Ambulance on standby for events</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.heroBanner}>
          <Text style={styles.heroText}>Dedicated standby ambulance for your event</Text>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>24x7 Emergency Service</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Organization / Event Details</Text>
          <Text style={styles.fieldLabel}>Organization / Event Name</Text>
          <TextInput style={styles.input} placeholder="Ex: Bangalore Marathon 2025" placeholderTextColor={COLORS.grayDim} value={eventName} onChangeText={setEventName} />
          <Text style={styles.fieldLabel}>Purpose</Text>
          <TouchableOpacity style={[styles.selectBtn, purpose && styles.selectBtnActive]} onPress={() => setPurposeModal(true)}>
            <Text style={[styles.selectBtnText, purpose && { color: COLORS.white }]}>{purpose || "Select purpose"}</Text>
            <Text style={{ color: COLORS.grayDim }}>v</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Location and Duration</Text>
          <Text style={styles.fieldLabel}>Standby Location</Text>
          <TouchableOpacity style={[styles.selectBtn, standbyCoord && styles.selectBtnActive]} onPress={() => setLocationModalVisible(true)}>
            <Text style={[styles.selectBtnText, standbyCoord && { color: COLORS.red }]} numberOfLines={1}>{standbyLabel || "Select location"}</Text>
            <Text style={{ color: COLORS.grayDim }}>edit</Text>
          </TouchableOpacity>
          {standbyCoord ? (
            <View style={styles.mapContainer}>
              <MapView ref={mapRef} style={styles.map} provider={PROVIDER_GOOGLE}
                initialRegion={{ latitude: standbyCoord.latitude, longitude: standbyCoord.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
                onPress={handleMapTap}>
                <Marker coordinate={standbyCoord} draggable pinColor={COLORS.red} onDragEnd={(e) => handleMarkerDrag(e.nativeEvent.coordinate)} />
              </MapView>
              <View style={styles.mapHint}><View style={styles.mapHintBubble}><Text style={styles.mapHintText}>Drag pin to adjust location</Text></View></View>
            </View>
          ) : (
            <View style={styles.mapPlaceholder}><Text style={styles.mapPlaceholderText}>Tap Select location to pick on map</Text></View>
          )}
          <View style={styles.dateRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Start Date</Text>
              <TextInput style={styles.input} placeholder="dd/mm/yyyy" placeholderTextColor={COLORS.grayDim} value={startDate} onChangeText={setStartDate} />
            </View>
            <View style={{ width: 10 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>End Date</Text>
              <TextInput style={styles.input} placeholder="dd/mm/yyyy" placeholderTextColor={COLORS.grayDim} value={endDate} onChangeText={setEndDate} />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ambulance and Medical Setup</Text>
          <Text style={styles.fieldLabel}>Ambulance Type</Text>
          {AMBULANCE_TYPES.map((type) => (
            <TouchableOpacity key={type.id} style={[styles.radioItem, ambulanceType === type.id && styles.radioItemActive]} onPress={() => setAmbulanceType(type.id)}>
              <View style={[styles.radioCircle, ambulanceType === type.id && styles.radioCircleActive]}>
                {ambulanceType === type.id && <View style={styles.radioDot} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.radioName}>{type.name}</Text>
                <Text style={styles.radioTag}>{type.tag}</Text>
              </View>
              {type.recommended && <View style={styles.recommendedBadge}><Text style={styles.recommendedText}>Recommended</Text></View>}
            </TouchableOpacity>
          ))}
          <Text style={[styles.fieldLabel, { marginTop: 8 }]}>Medical Staff Required</Text>
          <View style={styles.staffRow}>
            {["nurse", "doctor"].map((s) => (
              <TouchableOpacity key={s} style={[styles.staffBtn, staff.includes(s) && styles.staffBtnActive]} onPress={() => toggleStaff(s)}>
                <Text style={[styles.staffText, staff.includes(s) && { color: COLORS.red }]}>{s === "nurse" ? "Nurse" : "Doctor"}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[styles.fieldLabel, { marginTop: 8 }]}>Equipments</Text>
          <View style={styles.equipGrid}>
            {EQUIPMENTS.map((eq) => (
              <TouchableOpacity key={eq.id} style={[styles.equipItem, equipments.includes(eq.id) && styles.equipItemActive]} onPress={() => toggleEquip(eq.id)}>
                <View style={[styles.checkbox, equipments.includes(eq.id) && styles.checkboxActive]}>
                  {equipments.includes(eq.id) && <Text style={{ color: "#fff", fontSize: 11 }}>v</Text>}
                </View>
                <Text style={[styles.equipText, equipments.includes(eq.id) && { color: COLORS.white }]}>{eq.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contact and Coordination</Text>
          <Text style={styles.fieldLabel}>Contact Person Name</Text>
          <TextInput style={styles.input} placeholder="Enter contact person full name" placeholderTextColor={COLORS.grayDim} value={contactName} onChangeText={setContactName} />
          <Text style={styles.fieldLabel}>Phone Number</Text>
          <TextInput style={styles.input} placeholder="+91 Enter phone number" placeholderTextColor={COLORS.grayDim} keyboardType="phone-pad" value={contactPhone} onChangeText={setContactPhone} />
          <Text style={styles.fieldLabel}>Alternate Phone Number</Text>
          <TextInput style={styles.input} placeholder="+91 Enter alternate number" placeholderTextColor={COLORS.grayDim} keyboardType="phone-pad" value={altPhone} onChangeText={setAltPhone} />
          <Text style={styles.fieldLabel}>Note</Text>
          <TextInput style={[styles.input, { height: 80, textAlignVertical: "top" }]} placeholder="Any allergies, special medical needs, or instructions..." placeholderTextColor={COLORS.grayDim} multiline value={note} onChangeText={setNote} />
        </View>

        <View style={styles.pricingBox}>
          <Text style={styles.pricingTitle}>Pricing and Quote Information</Text>
          <Text style={styles.pricingBody}>Standby ambulance charges depend on duration, ambulance type and medical staff. Our team will share a customized quotation after confirmation.</Text>
        </View>

        <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.6 }]} onPress={handleSubmit} disabled={submitting}>
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Request Event Ambulance</Text>}
        </TouchableOpacity>
        <Text style={styles.submitNote}>Our medical team will call you for confirmation</Text>
      </ScrollView>

      <Modal visible={purposeModal} transparent animationType="slide" onRequestClose={() => setPurposeModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setPurposeModal(false)}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Select Purpose</Text>
            {PURPOSES.map((p) => (
              <TouchableOpacity key={p} style={[styles.modalItem, purpose === p && styles.modalItemActive]} onPress={() => { setPurpose(p); setPurposeModal(false); }}>
                <Text style={[styles.modalItemText, purpose === p && { color: COLORS.red }]}>{p}</Text>
                {purpose === p && <Text style={{ color: COLORS.red }}>v</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      <LocationSearchModal visible={locationModalVisible} gpsCoord={gpsCoord} gpsLabel={gpsLabel} onClose={() => setLocationModalVisible(false)}
        onSelect={({ coord, label }) => {
          setStandbyCoord(coord);
          setStandbyLabel(label);
          setLocationModalVisible(false);
          setTimeout(() => { mapRef.current?.animateToRegion({ ...coord, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 500); }, 300);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingTop: 50 },
  header: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 18, paddingBottom: 14, borderBottomWidth: 0.5, borderBottomColor: "rgba(255,255,255,0.07)" },
  back: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  title: { color: COLORS.white, fontSize: 18, fontWeight: "700" },
  subtitle: { color: COLORS.grayDim, fontSize: 12, marginTop: 2 },
  scroll: { padding: 16, paddingBottom: 40 },
  heroBanner: { backgroundColor: "rgba(232,25,44,0.08)", borderWidth: 0.5, borderColor: "rgba(232,25,44,0.25)", borderRadius: 14, padding: 14, marginBottom: 16 },
  heroText: { color: "#ccc", fontSize: 13, lineHeight: 18 },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.red },
  liveText: { fontSize: 11, color: COLORS.red, fontWeight: "600" },
  section: { backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 0.5, borderColor: "rgba(255,255,255,0.08)", borderRadius: 16, padding: 16, marginBottom: 14 },
  sectionTitle: { color: COLORS.white, fontSize: 15, fontWeight: "700", marginBottom: 14 },
  fieldLabel: { color: COLORS.grayDim, fontSize: 11, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  input: { backgroundColor: "rgba(0,0,0,0.4)", borderWidth: 0.5, borderColor: "rgba(255,255,255,0.1)", borderRadius: 10, padding: 12, color: COLORS.white, fontSize: 14, marginBottom: 14 },
  selectBtn: { backgroundColor: "rgba(0,0,0,0.4)", borderWidth: 0.5, borderColor: "rgba(255,255,255,0.1)", borderRadius: 10, padding: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  selectBtnActive: { borderColor: "rgba(232,25,44,0.4)" },
  selectBtnText: { color: COLORS.grayDim, fontSize: 14, flex: 1, marginRight: 8 },
  mapContainer: { height: 200, borderRadius: 12, overflow: "hidden", marginBottom: 14, position: "relative" },
  map: { flex: 1 },
  mapPlaceholder: { height: 120, backgroundColor: "rgba(0,0,0,0.3)", borderWidth: 0.5, borderColor: "rgba(255,255,255,0.08)", borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  mapPlaceholderText: { color: COLORS.grayDim, fontSize: 13 },
  mapHint: { position: "absolute", bottom: 10, left: 0, right: 0, alignItems: "center" },
  mapHintBubble: { backgroundColor: "rgba(0,0,0,0.7)", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  mapHintText: { color: "#fff", fontSize: 11, fontWeight: "600" },
  dateRow: { flexDirection: "row" },
  radioItem: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, backgroundColor: "rgba(0,0,0,0.3)", borderWidth: 0.5, borderColor: "rgba(255,255,255,0.08)", borderRadius: 10, marginBottom: 8 },
  radioItemActive: { borderColor: "rgba(232,25,44,0.5)", backgroundColor: "rgba(232,25,44,0.08)" },
  radioCircle: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: "#555", alignItems: "center", justifyContent: "center" },
  radioCircleActive: { borderColor: COLORS.red },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.red },
  radioName: { color: COLORS.white, fontSize: 13, fontWeight: "600" },
  radioTag: { color: COLORS.grayDim, fontSize: 11, marginTop: 2 },
  recommendedBadge: { backgroundColor: "rgba(232,25,44,0.15)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  recommendedText: { color: COLORS.red, fontSize: 10, fontWeight: "700" },
  staffRow: { flexDirection: "row", gap: 10, marginBottom: 4 },
  staffBtn: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)", borderWidth: 0.5, borderColor: "rgba(255,255,255,0.08)", borderRadius: 10, padding: 12, alignItems: "center" },
  staffBtnActive: { borderColor: "rgba(232,25,44,0.5)", backgroundColor: "rgba(232,25,44,0.08)" },
  staffText: { color: COLORS.grayDim, fontSize: 13, fontWeight: "600" },
  equipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  equipItem: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(0,0,0,0.3)", borderWidth: 0.5, borderColor: "rgba(255,255,255,0.08)", borderRadius: 10, padding: 10, width: "48%" },
  equipItemActive: { borderColor: "rgba(232,25,44,0.5)", backgroundColor: "rgba(232,25,44,0.08)" },
  checkbox: { width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, borderColor: "#555", alignItems: "center", justifyContent: "center" },
  checkboxActive: { backgroundColor: COLORS.red, borderColor: COLORS.red },
  equipText: { color: COLORS.grayDim, fontSize: 11, flex: 1 },
  pricingBox: { backgroundColor: "rgba(7,20,34,0.9)", borderWidth: 0.5, borderColor: "rgba(13,42,66,0.8)", borderRadius: 14, padding: 14, marginBottom: 16 },
  pricingTitle: { color: "#4a9eff", fontSize: 13, fontWeight: "600", marginBottom: 6 },
  pricingBody: { color: "#5a8ab0", fontSize: 12, lineHeight: 18 },
  submitBtn: { backgroundColor: COLORS.red, borderRadius: 14, padding: 17, alignItems: "center", marginBottom: 10 },
  submitText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  submitNote: { textAlign: "center", color: COLORS.grayDim, fontSize: 11, marginBottom: 10 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: "#141414", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  modalTitle: { color: COLORS.white, fontSize: 16, fontWeight: "700", marginBottom: 16 },
  modalItem: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: "rgba(255,255,255,0.06)" },
  modalItemActive: {},
  modalItemText: { color: COLORS.gray, fontSize: 14 },
});

const srch = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingTop: 54 },
  header: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 18, paddingBottom: 16 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  closeText: { color: COLORS.white, fontSize: 14, fontWeight: "700" },
  title: { color: COLORS.white, fontSize: 17, fontWeight: "700" },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 18, marginBottom: 8, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 0.5, borderColor: "rgba(255,255,255,0.1)", borderRadius: 12 },
  input: { flex: 1, color: COLORS.white, fontSize: 15 },
  clearBtn: { color: COLORS.grayDim, fontSize: 14, paddingHorizontal: 4 },
  gpsRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: "rgba(255,255,255,0.07)" },
  gpsTitle: { color: COLORS.white, fontSize: 14, fontWeight: "600" },
  gpsSub: { color: COLORS.grayDim, fontSize: 12, marginTop: 2 },
  suggRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: "rgba(255,255,255,0.04)" },
  suggMain: { color: COLORS.white, fontSize: 14, fontWeight: "500" },
  suggSub: { color: COLORS.grayDim, fontSize: 12, marginTop: 2 },
});



