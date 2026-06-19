import React, { useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, TextInput, Alert, KeyboardAvoidingView, Platform,
} from "react-native";
import { COLORS } from "../theme";

const RELATIONS     = ["Self", "Spouse", "Father", "Mother", "Son", "Daughter", "Other"];
const ADDR_LABELS   = ["Home", "Work", "Hospital", "Other"];

const EMPTY_MEMBER  = { name: "", relation: null, age: "", phone: "" };
const EMPTY_ADDR    = { label: null, address: "" };

export default function FamilyScreen() {
  const [members,    setMembers]   = useState([]);

  // Member modal
  const [memberModal, setMemberModal] = useState(false);
  const [editingId,   setEditingId]   = useState(null);
  const [memberForm,  setMemberForm]  = useState(EMPTY_MEMBER);

  // Address modal
  const [addrModal,   setAddrModal]   = useState(false);
  const [addrOwner,   setAddrOwner]   = useState(null);   // member id
  const [addrForm,    setAddrForm]    = useState(EMPTY_ADDR);

  // ── Member helpers ──────────────────────────────────────
  function openAddMember() {
    setEditingId(null);
    setMemberForm(EMPTY_MEMBER);
    setMemberModal(true);
  }

  function openEditMember(m) {
    setEditingId(m.id);
    setMemberForm({ name: m.name, relation: m.relation, age: m.age, phone: m.phone });
    setMemberModal(true);
  }

  function saveMember() {
    if (!memberForm.name.trim()) { Alert.alert("Required", "Please enter a name."); return; }
    if (!memberForm.relation)    { Alert.alert("Required", "Please select a relation."); return; }

    if (editingId !== null) {
      setMembers(prev => prev.map(m =>
        m.id === editingId ? { ...m, ...memberForm } : m
      ));
    } else {
      setMembers(prev => [...prev, { id: Date.now(), ...memberForm, savedAddresses: [] }]);
    }
    setMemberModal(false);
  }

  function confirmDeleteMember(m) {
    Alert.alert(
      "Remove member",
      `Remove ${m.name} from your family list?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: () => setMembers(prev => prev.filter(x => x.id !== m.id)) },
      ]
    );
  }

  // ── Address helpers ─────────────────────────────────────
  function openAddAddress(memberId) {
    setAddrOwner(memberId);
    setAddrForm(EMPTY_ADDR);
    setAddrModal(true);
  }

  function saveAddress() {
    if (!addrForm.label)           { Alert.alert("Required", "Please select a label."); return; }
    if (!addrForm.address.trim())  { Alert.alert("Required", "Please enter an address."); return; }

    setMembers(prev => prev.map(m =>
      m.id === addrOwner
        ? { ...m, savedAddresses: [...m.savedAddresses, { id: Date.now(), ...addrForm }] }
        : m
    ));
    setAddrModal(false);
  }

  function deleteAddress(memberId, addrId) {
    setMembers(prev => prev.map(m =>
      m.id === memberId
        ? { ...m, savedAddresses: m.savedAddresses.filter(a => a.id !== addrId) }
        : m
    ));
  }

  // ── Render ───────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <Text style={styles.header}>Family Profiles</Text>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {members.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>👨‍👩‍👧‍👦</Text>
            <Text style={styles.emptyText}>No family members added yet</Text>
            <Text style={styles.emptyHint}>Add your family members to book ambulances for them quickly</Text>
          </View>
        )}

        {members.map(m => (
          <View key={m.id} style={styles.card}>

            {/* ── Member row ── */}
            <TouchableOpacity
              style={styles.memberRow}
              activeOpacity={0.85}
              onLongPress={() => confirmDeleteMember(m)}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{m.name.trim()[0]?.toUpperCase() ?? "?"}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{m.name}</Text>
                <Text style={styles.rel}>{m.relation}{m.age ? `  ·  Age ${m.age}` : ""}</Text>
                {m.phone ? <Text style={styles.phone}>📞 {m.phone}</Text> : null}
              </View>
              <TouchableOpacity style={styles.editBtn} onPress={() => openEditMember(m)}>
                <Text style={{ fontSize: 15 }}>✏️</Text>
              </TouchableOpacity>
            </TouchableOpacity>

            {/* ── Saved addresses ── */}
            {m.savedAddresses.length > 0 && (
              <View style={styles.addrList}>
                {m.savedAddresses.map(a => (
                  <View key={a.id} style={styles.addrRow}>
                    <View style={styles.addrLabelBadge}>
                      <Text style={styles.addrLabelText}>{a.label}</Text>
                    </View>
                    <Text style={styles.addrText} numberOfLines={1}>{a.address}</Text>
                    <TouchableOpacity
                      style={styles.addrDelete}
                      onPress={() => deleteAddress(m.id, a.id)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={styles.addrDeleteText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* ── Add address button ── */}
            <TouchableOpacity style={styles.addAddrBtn} onPress={() => openAddAddress(m.id)}>
              <Text style={styles.addAddrText}>＋ Add address</Text>
            </TouchableOpacity>

          </View>
        ))}

        <TouchableOpacity style={styles.addMemberBtn} onPress={openAddMember}>
          <Text style={styles.addMemberText}>+ Add Family Member</Text>
        </TouchableOpacity>

        {members.length > 0 && (
          <Text style={styles.hint}>Long press a card to remove member</Text>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ── Member modal ── */}
      <Modal visible={memberModal} transparent animationType="slide" onRequestClose={() => setMemberModal(false)}>
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <ScrollView style={styles.sheet} contentContainerStyle={styles.sheetContent}
            keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.handle} />
            <Text style={styles.modalTitle}>{editingId !== null ? "Edit Member" : "Add Family Member"}</Text>

            <Text style={styles.fieldLabel}>Name *</Text>
            <TextInput style={styles.input} placeholder="Full name"
              placeholderTextColor={COLORS.grayDim}
              value={memberForm.name} onChangeText={v => setMemberForm(f => ({ ...f, name: v }))} />

            <Text style={styles.fieldLabel}>Relation *</Text>
            <View style={styles.chipGrid}>
              {RELATIONS.map(r => (
                <TouchableOpacity key={r}
                  style={[styles.chip, memberForm.relation === r && styles.chipActive]}
                  onPress={() => setMemberForm(f => ({ ...f, relation: r }))}
                >
                  <Text style={[styles.chipText, memberForm.relation === r && styles.chipTextActive]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Age</Text>
            <TextInput style={styles.input} placeholder="e.g. 45"
              placeholderTextColor={COLORS.grayDim} keyboardType="numeric"
              value={memberForm.age} onChangeText={v => setMemberForm(f => ({ ...f, age: v }))} />

            <Text style={styles.fieldLabel}>Phone number</Text>
            <TextInput style={styles.input} placeholder="+91 00000 00000"
              placeholderTextColor={COLORS.grayDim} keyboardType="phone-pad"
              value={memberForm.phone} onChangeText={v => setMemberForm(f => ({ ...f, phone: v }))} />

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setMemberModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={saveMember}>
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
            <View style={{ height: 16 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Address modal ── */}
      <Modal visible={addrModal} transparent animationType="slide" onRequestClose={() => setAddrModal(false)}>
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.sheet}>
            <View style={styles.sheetContent}>
              <View style={styles.handle} />
              <Text style={styles.modalTitle}>Add Address</Text>

              <Text style={styles.fieldLabel}>Label *</Text>
              <View style={styles.chipGrid}>
                {ADDR_LABELS.map(l => (
                  <TouchableOpacity key={l}
                    style={[styles.chip, addrForm.label === l && styles.chipActive]}
                    onPress={() => setAddrForm(f => ({ ...f, label: l }))}
                  >
                    <Text style={[styles.chipText, addrForm.label === l && styles.chipTextActive]}>{l}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Address *</Text>
              <TextInput
                style={[styles.input, styles.inputMulti]}
                placeholder="Full address"
                placeholderTextColor={COLORS.grayDim}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                value={addrForm.address}
                onChangeText={v => setAddrForm(f => ({ ...f, address: v }))}
              />

              <View style={styles.modalBtns}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setAddrModal(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={saveAddress}>
                  <Text style={styles.saveBtnText}>Save Address</Text>
                </TouchableOpacity>
              </View>
              <View style={{ height: Platform.OS === "ios" ? 24 : 8 }} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingTop: 50 },
  header: { color: COLORS.white, fontSize: 22, fontWeight: "800", paddingHorizontal: 22, paddingBottom: 18 },
  scroll: { paddingHorizontal: 18 },

  // Empty state
  empty: { alignItems: "center", paddingVertical: 48 },
  emptyIcon: { fontSize: 52, marginBottom: 16 },
  emptyText: { color: COLORS.white, fontSize: 16, fontWeight: "700", marginBottom: 8 },
  emptyHint: { color: COLORS.grayDim, fontSize: 13, textAlign: "center", lineHeight: 20, paddingHorizontal: 24 },

  // Member card (outer wrapper)
  card: { backgroundColor: COLORS.bg3, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, marginBottom: 12, overflow: "hidden" },
  memberRow: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: COLORS.red, alignItems: "center", justifyContent: "center" },
  avatarText: { color: COLORS.white, fontWeight: "800", fontSize: 18 },
  name: { color: COLORS.white, fontWeight: "700", fontSize: 15 },
  rel: { color: COLORS.grayDim, fontSize: 12, marginTop: 2 },
  phone: { color: COLORS.gray, fontSize: 12, marginTop: 3 },
  editBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },

  // Saved addresses
  addrList: { borderTopWidth: 0.5, borderTopColor: "rgba(255,255,255,0.07)", paddingHorizontal: 14, paddingTop: 8, paddingBottom: 4 },
  addrRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: "rgba(255,255,255,0.05)" },
  addrLabelBadge: { backgroundColor: "rgba(232,25,44,0.15)", borderWidth: 0.5, borderColor: "rgba(232,25,44,0.4)", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  addrLabelText: { color: COLORS.red, fontSize: 11, fontWeight: "700" },
  addrText: { flex: 1, color: COLORS.gray, fontSize: 12 },
  addrDelete: { padding: 2 },
  addrDeleteText: { color: "rgba(255,255,255,0.25)", fontSize: 13 },

  // Add address button (inside card)
  addAddrBtn: { borderTopWidth: 0.5, borderTopColor: "rgba(255,255,255,0.06)", paddingVertical: 10, alignItems: "center" },
  addAddrText: { color: "rgba(255,255,255,0.3)", fontSize: 12, fontWeight: "600" },

  // Add member button
  addMemberBtn: { paddingVertical: 14, backgroundColor: "rgba(232,25,44,0.1)", borderWidth: 1, borderColor: "rgba(232,25,44,0.4)", borderStyle: "dashed", borderRadius: 12, alignItems: "center", marginTop: 4 },
  addMemberText: { color: COLORS.red, fontSize: 14, fontWeight: "600" },
  hint: { color: COLORS.grayDim, fontSize: 11, textAlign: "center", marginTop: 10 },

  // Modal shared
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: { backgroundColor: "#0d1018", borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  sheetContent: { padding: 24 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.15)", alignSelf: "center", marginBottom: 20 },
  modalTitle: { color: COLORS.white, fontSize: 18, fontWeight: "800", marginBottom: 16 },

  // Form
  fieldLabel: { color: COLORS.grayDim, fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: "rgba(0,0,0,0.5)", borderWidth: 0.5, borderColor: "rgba(255,255,255,0.1)", borderRadius: 10, padding: 11, fontSize: 13, color: COLORS.white },
  inputMulti: { height: 80, textAlignVertical: "top" },

  // Chips
  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 10, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.04)" },
  chipActive: { backgroundColor: "rgba(232,25,44,0.15)", borderColor: "rgba(232,25,44,0.5)" },
  chipText: { color: COLORS.grayDim, fontSize: 13 },
  chipTextActive: { color: COLORS.red, fontWeight: "600" },

  // Modal buttons
  modalBtns: { flexDirection: "row", gap: 12, marginTop: 24 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.15)", alignItems: "center" },
  cancelBtnText: { color: COLORS.grayDim, fontSize: 15, fontWeight: "600" },
  saveBtn: { flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: COLORS.red, alignItems: "center" },
  saveBtnText: { color: COLORS.white, fontSize: 15, fontWeight: "700" },
});
