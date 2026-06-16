import React, { useState } from "react";
import {
  View, Text, TouchableOpacity, TextInput, FlatList,
  StyleSheet, Platform, Modal, KeyboardAvoidingView,
  ScrollView, StatusBar,
} from "react-native";
import { COLORS } from "../theme";

const QUICK_AMOUNTS = [100, 200, 500, 1000, 2000];

// ─── Balance gradient card ────────────────────────────────────────────────────
function BalanceCard({ balance, onAddMoney }) {
  return (
    <View style={s.balCard}>
      {/* decorative circles */}
      <View style={s.balCircle1} />
      <View style={s.balCircle2} />

      <View style={s.balTop}>
        <Text style={s.balLbl}>SaveLife Wallet</Text>
        <View style={s.balBadge}>
          <Text style={s.balBadgeTxt}>ACTIVE</Text>
        </View>
      </View>

      <Text style={s.balAmt}>₹{balance.toFixed(2)}</Text>
      <Text style={s.balSub}>Available Balance</Text>

      <TouchableOpacity style={s.addBtn} onPress={onAddMoney} activeOpacity={0.82}>
        <Text style={s.addBtnTxt}>+ Add Money</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Add Money bottom sheet ───────────────────────────────────────────────────
function AddMoneySheet({ visible, onClose, onProceed }) {
  const [custom, setCustom] = useState("");
  const [selected, setSelected] = useState(null);

  function handleQuick(amt) {
    setSelected(amt);
    setCustom("");
  }

  function handleCustomChange(txt) {
    const numeric = txt.replace(/[^0-9]/g, "");
    setCustom(numeric);
    setSelected(null);
  }

  function handleClose() {
    setSelected(null);
    setCustom("");
    onClose();
  }

  const amount = custom ? parseInt(custom, 10) : selected;
  const canProceed = amount && amount > 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={handleClose} />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={s.kvWrap}
        pointerEvents="box-none"
      >
        <View style={s.sheet}>
          <View style={s.handle} />

          <Text style={s.sheetTitle}>Add Money to Wallet</Text>

          {/* Quick amounts */}
          <Text style={s.sectionLbl}>Choose amount</Text>
          <View style={s.quickRow}>
            {QUICK_AMOUNTS.map(amt => (
              <TouchableOpacity
                key={amt}
                style={[s.quickBtn, selected === amt && s.quickBtnActive]}
                onPress={() => handleQuick(amt)}
                activeOpacity={0.75}
              >
                <Text style={[s.quickBtnTxt, selected === amt && s.quickBtnTxtActive]}>
                  ₹{amt}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Custom input */}
          <Text style={s.sectionLbl}>Or enter custom amount</Text>
          <View style={s.inputRow}>
            <Text style={s.rupeePrefix}>₹</Text>
            <TextInput
              style={s.amtInput}
              placeholder="Enter amount"
              placeholderTextColor={COLORS.grayDim}
              keyboardType="number-pad"
              value={custom}
              onChangeText={handleCustomChange}
              maxLength={6}
            />
          </View>

          {/* Proceed button */}
          <TouchableOpacity
            style={[s.proceedBtn, !canProceed && s.proceedBtnDisabled]}
            activeOpacity={canProceed ? 0.85 : 1}
            onPress={() => canProceed && onProceed(amount)}
          >
            <Text style={s.proceedBtnTxt}>
              {canProceed ? `Proceed to Pay ₹${amount}` : "Proceed to Pay"}
            </Text>
          </TouchableOpacity>

          <Text style={s.gatewayNote}>
            🔒 Payment gateway integration coming soon
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Single transaction row ───────────────────────────────────────────────────
function TxnRow({ txn }) {
  const isCredit = txn.type === "credit";
  return (
    <View style={s.txnRow}>
      <View style={[s.txnIcon, isCredit ? s.txnIconCredit : s.txnIconDebit]}>
        <Text style={s.txnIconTxt}>{isCredit ? "↓" : "↑"}</Text>
      </View>
      <View style={s.txnInfo}>
        <Text style={s.txnTitle}>{txn.title}</Text>
        <Text style={s.txnDate}>{txn.date}</Text>
      </View>
      <Text style={[s.txnAmt, isCredit ? s.txnAmtCredit : s.txnAmtDebit]}>
        {isCredit ? "+" : "−"}₹{txn.amount.toFixed(2)}
      </Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function WalletScreen() {
  const [balance,       setBalance]       = useState(0);
  const [sheetVisible,  setSheetVisible]  = useState(false);
  const [transactions,  setTransactions]  = useState([]);
  const [toast,         setToast]         = useState("");

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  function handleProceed(amount) {
    // Payment gateway stub — just close the sheet and show note
    setSheetVisible(false);
    showToast("Payment gateway coming soon. Balance not updated.");
  }

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <Text style={s.headerTitle}>
          <Text style={{ color: COLORS.text }}>My </Text>
          <Text style={{ color: COLORS.red }}>Wallet</Text>
        </Text>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Balance card ─────────────────────────────────────────────────── */}
        <BalanceCard balance={balance} onAddMoney={() => setSheetVisible(true)} />

        {/* ── Quick actions ─────────────────────────────────────────────────── */}
        <View style={s.quickActions}>
          <TouchableOpacity style={s.qaBtn} activeOpacity={0.75} onPress={() => setSheetVisible(true)}>
            <Text style={s.qaEmoji}>💳</Text>
            <Text style={s.qaLbl}>Add Money</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.qaBtn} activeOpacity={0.75}>
            <Text style={s.qaEmoji}>📜</Text>
            <Text style={s.qaLbl}>Statement</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.qaBtn} activeOpacity={0.75}>
            <Text style={s.qaEmoji}>🎁</Text>
            <Text style={s.qaLbl}>Offers</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.qaBtn} activeOpacity={0.75}>
            <Text style={s.qaEmoji}>🔒</Text>
            <Text style={s.qaLbl}>Security</Text>
          </TouchableOpacity>
        </View>

        {/* ── Transaction history ───────────────────────────────────────────── */}
        <View style={s.txnSection}>
          <Text style={s.txnSectionTitle}>Transaction History</Text>

          {transactions.length === 0 ? (
            <View style={s.emptyState}>
              <Text style={s.emptyEmoji}>🧾</Text>
              <Text style={s.emptyTitle}>No transactions yet</Text>
              <Text style={s.emptySub}>
                Add money to your wallet to start using it for bookings.
              </Text>
            </View>
          ) : (
            transactions.map(txn => <TxnRow key={txn.id} txn={txn} />)
          )}
        </View>
      </ScrollView>

      {/* ── Toast ──────────────────────────────────────────────────────────── */}
      {!!toast && (
        <View style={s.toast}>
          <Text style={s.toastTxt}>{toast}</Text>
        </View>
      )}

      {/* ── Add Money sheet ────────────────────────────────────────────────── */}
      <AddMoneySheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        onProceed={handleProceed}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },

  // header
  header: {
    paddingTop: Platform.OS === "ios" ? 56 : 42,
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: COLORS.bg,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
    shadowColor: "#000",
    shadowOpacity: 0.05, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  headerTitle: { fontSize: 22, fontWeight: "800" },

  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 40 },

  // ── Balance card ────────────────────────────────────────────────────────────
  balCard: {
    margin: 16,
    borderRadius: 20,
    backgroundColor: COLORS.red,
    padding: 22,
    overflow: "hidden",
    shadowColor: COLORS.red,
    shadowOpacity: 0.38, shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  balCircle1: {
    position: "absolute", top: -30, right: -30,
    width: 130, height: 130, borderRadius: 65,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  balCircle2: {
    position: "absolute", bottom: -20, right: 40,
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  balTop: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: 18,
  },
  balLbl: { color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: "600" },
  balBadge: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 100, paddingHorizontal: 9, paddingVertical: 3,
  },
  balBadgeTxt: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  balAmt: { color: "#fff", fontSize: 36, fontWeight: "900", letterSpacing: -0.5 },
  balSub: { color: "rgba(255,255,255,0.68)", fontSize: 12, marginTop: 3, marginBottom: 20 },
  addBtn: {
    alignSelf: "flex-start",
    backgroundColor: "#fff",
    borderRadius: 100, paddingHorizontal: 18, paddingVertical: 9,
    shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  addBtnTxt: { color: COLORS.red, fontSize: 13, fontWeight: "800" },

  // ── Quick actions ────────────────────────────────────────────────────────────
  quickActions: {
    flexDirection: "row",
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: COLORS.bg,
    borderRadius: 16,
    borderWidth: 0.5, borderColor: COLORS.border,
    padding: 12,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  qaBtn: { flex: 1, alignItems: "center", paddingVertical: 6 },
  qaEmoji: { fontSize: 24, marginBottom: 5 },
  qaLbl: { fontSize: 11, color: COLORS.gray, fontWeight: "600" },

  // ── Transaction section ──────────────────────────────────────────────────────
  txnSection: {
    marginHorizontal: 16, marginTop: 16,
    backgroundColor: COLORS.bg,
    borderRadius: 16,
    borderWidth: 0.5, borderColor: COLORS.border,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
    overflow: "hidden",
  },
  txnSectionTitle: {
    fontSize: 15, fontWeight: "700", color: COLORS.text,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10,
    borderBottomWidth: 0.5, borderBottomColor: COLORS.border,
  },
  emptyState: {
    alignItems: "center", paddingVertical: 40, paddingHorizontal: 24,
  },
  emptyEmoji: { fontSize: 44, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: COLORS.text, marginBottom: 6 },
  emptySub: {
    fontSize: 13, color: COLORS.grayDim,
    textAlign: "center", lineHeight: 19,
  },

  // Transaction row
  txnRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: 0.5, borderBottomColor: COLORS.border,
  },
  txnIcon: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
    marginRight: 12,
  },
  txnIconCredit: { backgroundColor: "#dcfce7" },
  txnIconDebit:  { backgroundColor: "#fee2e2" },
  txnIconTxt:    { fontSize: 17, fontWeight: "700" },
  txnInfo:       { flex: 1 },
  txnTitle:      { fontSize: 14, fontWeight: "600", color: COLORS.text },
  txnDate:       { fontSize: 11, color: COLORS.grayDim, marginTop: 2 },
  txnAmt:        { fontSize: 15, fontWeight: "800" },
  txnAmtCredit:  { color: "#16a34a" },
  txnAmtDebit:   { color: COLORS.red },

  // ── Add Money sheet ──────────────────────────────────────────────────────────
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  kvWrap: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: Platform.OS === "ios" ? 42 : 28,
    shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 }, elevation: 24,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: "center", marginBottom: 18,
  },
  sheetTitle: {
    fontSize: 18, fontWeight: "800", color: COLORS.text, marginBottom: 20,
  },
  sectionLbl: {
    fontSize: 12, fontWeight: "600", color: COLORS.grayDim,
    textTransform: "uppercase", letterSpacing: 0.5,
    marginBottom: 10,
  },
  quickRow: {
    flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20,
  },
  quickBtn: {
    borderWidth: 1.5, borderColor: COLORS.border,
    borderRadius: 100, paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: COLORS.bg2,
  },
  quickBtnActive: {
    borderColor: COLORS.red, backgroundColor: "#fff0f1",
  },
  quickBtnTxt:       { fontSize: 14, fontWeight: "700", color: COLORS.gray },
  quickBtnTxtActive: { color: COLORS.red },
  inputRow: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1.5, borderColor: COLORS.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: COLORS.bg2, marginBottom: 22,
  },
  rupeePrefix: { fontSize: 18, fontWeight: "700", color: COLORS.text, marginRight: 6 },
  amtInput: { flex: 1, fontSize: 18, fontWeight: "700", color: COLORS.text },
  proceedBtn: {
    backgroundColor: COLORS.red,
    borderRadius: 14, paddingVertical: 15,
    alignItems: "center",
    shadowColor: COLORS.red,
    shadowOpacity: 0.38, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 8,
    marginBottom: 12,
  },
  proceedBtnDisabled: {
    backgroundColor: COLORS.grayDim,
    shadowOpacity: 0,
    elevation: 0,
  },
  proceedBtnTxt: { color: "#fff", fontSize: 16, fontWeight: "800" },
  gatewayNote: {
    textAlign: "center", fontSize: 12,
    color: COLORS.grayDim, lineHeight: 17,
  },

  // ── Toast ─────────────────────────────────────────────────────────────────────
  toast: {
    position: "absolute", bottom: 90, left: 20, right: 20,
    backgroundColor: "#1f2937",
    borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16,
    shadowColor: "#000", shadowOpacity: 0.20, shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  toastTxt: { color: "#fff", fontSize: 13, fontWeight: "600", textAlign: "center" },
});
