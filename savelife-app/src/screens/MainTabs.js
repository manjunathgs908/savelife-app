import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { View, Text, TouchableOpacity, StyleSheet, Platform, Linking } from "react-native";
import { COLORS } from "../theme";

import HomeScreen    from "./HomeScreen";
import TripsScreen   from "./TripsScreen";
import ProfileScreen from "./ProfileScreen";
import WalletScreen  from "./WalletScreen";

const Tab = createBottomTabNavigator();

// ─── Simple icon component ────────────────────────────────────────────────────
function TabIcon({ emoji, focused }) {
  return (
    <Text style={{ fontSize: 21, opacity: focused ? 1 : 0.42 }}>{emoji}</Text>
  );
}

// ─── Floating centre emergency call button ────────────────────────────────────
function EmergencyButton() {
  return (
    <View style={tab.emergencyWrap} pointerEvents="box-none">
      <TouchableOpacity
        style={tab.emergencyBtn}
        activeOpacity={0.82}
        onPress={() => Linking.openURL("tel:112")}
      >
        <Text style={tab.emergencyEmoji}>📞</Text>
      </TouchableOpacity>
      <Text style={tab.emergencyLbl}>Emergency</Text>
    </View>
  );
}

export default function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.bg,
          borderTopColor: COLORS.border,
          borderTopWidth: 0.5,
          height: Platform.OS === "ios" ? 84 : 70,
          paddingBottom: Platform.OS === "ios" ? 26 : 12,
          paddingTop: 10,
          shadowColor: "#000",
          shadowOpacity: 0.1,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: -4 },
          elevation: 12,
          overflow: "visible",
        },
        tabBarActiveTintColor: COLORS.red,
        tabBarInactiveTintColor: COLORS.grayDim,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600", marginTop: 2 },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" focused={focused} />,
        }}
      />

      <Tab.Screen
        name="Bookings"
        component={TripsScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon emoji="📋" focused={focused} />,
        }}
      />

      {/* Centre floating emergency call button */}
      <Tab.Screen
        name="EmergencyCall"
        component={HomeScreen}
        options={{
          tabBarLabel: () => null,
          tabBarIcon:  () => null,
          tabBarButton: () => <EmergencyButton />,
        }}
      />

      <Tab.Screen
        name="Wallet"
        component={WalletScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon emoji="👛" focused={focused} />,
        }}
      />

      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

// ─── Emergency button styles ──────────────────────────────────────────────────
const tab = StyleSheet.create({
  emergencyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: Platform.OS === "ios" ? 20 : 8,
  },
  emergencyBtn: {
    width: 58, height: 58, borderRadius: 29,
    backgroundColor: COLORS.red,
    alignItems: "center", justifyContent: "center",
    transform: [{ translateY: -18 }],
    shadowColor: COLORS.red,
    shadowOpacity: 0.55, shadowRadius: 14,
    shadowOffset: { width: 0, height: -3 },
    elevation: 14,
    borderWidth: 3.5, borderColor: "#fff",
  },
  emergencyEmoji: { fontSize: 24 },
  emergencyLbl: {
    color: COLORS.red,
    fontSize: 10, fontWeight: "700",
    marginTop: Platform.OS === "ios" ? -10 : -2,
  },
});
