import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
} from "react-native";
import { COLORS } from "../theme";

export default function RemainsScreen({ navigation }) {
  const [formData, setFormData] = useState({
    pickupCity: "",
    dropCity: "",
    deceasedName: "",
    senderName: "",
    senderPhone: "",
    remarks: "",
  });

  const handleTextChange = (key, value) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleAirCargoSubmit = () => {
    if (!formData.pickupCity || !formData.dropCity || !formData.deceasedName || !formData.senderPhone) {
      Alert.alert("Required Fields", "Please fill in all mandatory fields (*)");
      return;
    }
    
    // Direct handoff to ConfirmBooking screen for Air Cargo parameters
    navigation.navigate("ConfirmBooking", {
      pickupLabel: `Air Cargo: From ${formData.pickupCity}`,
      dropLabel: `To ${formData.dropCity}`,
      dist: 0, // Air cargo uses flat slab rates or manual calculation
      duration: 0,
      scheduleType: "now",
      scheduleDate: null,
      patientType: "DECEASED_AIR",
      contactName: formData.senderName || "Not Provided",
      contactPhone: formData.senderPhone,
      selectedType: "air_cargo",
      selectedAmb: {
        id: "air_cargo",
        name: "Air Cargo Body Transport",
        icon: "✈️",
        desc: "Deceased remains transport via airline cargo services",
      },
      pricingList: [],
      metaData: {
        deceasedName: formData.deceasedName,
        remarks: formData.remarks,
      }
    });
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Air Cargo Body Transport</Text>
          <Text style={styles.headerSub}>Fill details for airway shifting</Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.formContainer} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionHeading}>ROUTE DETAILS</Text>
        
        <Text style={styles.label}>Pickup City *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., Bengaluru"
          placeholderTextColor={COLORS.grayDim}
          value={formData.pickupCity}
          onChangeText={(txt) => handleTextChange("pickupCity", txt)}
        />

        <Text style={styles.label}>Destination City *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., Delhi"
          placeholderTextColor={COLORS.grayDim}
          value={formData.dropCity}
          onChangeText={(txt) => handleTextChange("dropCity", txt)}
        />

        <View style={styles.divider} />
        <Text style={styles.sectionHeading}>DECEASED & SENDER DETAILS</Text>

        <Text style={styles.label}>Deceased Person Name *</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter name"
          placeholderTextColor={COLORS.grayDim}
          value={formData.deceasedName}
          onChangeText={(txt) => handleTextChange("deceasedName", txt)}
        />

        <Text style={styles.label}>Sender Name</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter your name"
          placeholderTextColor={COLORS.grayDim}
          value={formData.senderName}
          onChangeText={(txt) => handleTextChange("senderName", txt)}
        />

        <Text style={styles.label}>Sender Contact Number *</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter 10-digit mobile number"
          placeholderTextColor={COLORS.grayDim}
          keyboardType="phone-pad"
          maxLength={10}
          value={formData.senderPhone}
          onChangeText={(txt) => handleTextChange("senderPhone", txt)}
        />

        <Text style={styles.label}>Specific Requirements / Remarks</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="e.g., Embalming needed, Coffin box required..."
          placeholderTextColor={COLORS.grayDim}
          multiline={true}
          numberOfLines={3}
          value={formData.remarks}
          onChangeText={(txt) => handleTextChange("remarks", txt)}
        />

        <TouchableOpacity style={styles.submitBtn} onPress={handleAirCargoSubmit} activeOpacity={0.85}>
          <Text style={styles.submitBtnTxt}>Proceed to Book Cargo</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingTop: 50 },
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
  
  formContainer: { paddingHorizontal: 20, paddingTop: 15, paddingBottom: 30 },
  sectionHeading: { color: COLORS.red, fontSize: 11, fontWeight: "700", letterSpacing: 1, marginBottom: 12 },
  label: { color: COLORS.text, fontSize: 13, fontWeight: "600", marginBottom: 6 },
  input: {
    backgroundColor: "rgba(0,0,0,0.03)",
    borderWidth: 1, borderColor: "rgba(0,0,0,0.08)",
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: Platform.OS === "ios" ? 14 : 10,
    color: COLORS.text, fontSize: 14, marginBottom: 16,
  },
  textArea: { height: 80, textAlignVertical: "top" },
  divider: { height: 0.5, backgroundColor: "rgba(0,0,0,0.1)", marginVertical: 14 },
  submitBtn: {
    backgroundColor: COLORS.red,
    borderRadius: 12, paddingVertical: 14,
    alignItems: "center", justifyContent: "center",
    marginTop: 10,
  },
  submitBtnTxt: { color: "#fff", fontSize: 15, fontWeight: "700" },
});