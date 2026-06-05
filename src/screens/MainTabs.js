import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Text } from "react-native";
import { COLORS } from "../theme";

import HomeScreen from "./HomeScreen";
import TripsScreen from "./TripsScreen";
import FamilyScreen from "./FamilyScreen";
import ProfileScreen from "./ProfileScreen";

const Tab = createBottomTabNavigator();

const icon = (emoji) => ({ color }) => (
  <Text style={{ fontSize: 18, opacity: color === COLORS.red ? 1 : 0.5 }}>{emoji}</Text>
);

export default function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.bg2,
          borderTopColor: COLORS.border,
          height: 70,
          paddingBottom: 14,
          paddingTop: 10,
        },
        tabBarActiveTintColor: COLORS.red,
        tabBarInactiveTintColor: COLORS.grayDim,
        tabBarLabelStyle: { fontSize: 10 },
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarIcon: icon("🏠") }} />
      <Tab.Screen name="Trips" component={TripsScreen} options={{ tabBarIcon: icon("📋") }} />
      <Tab.Screen name="Family" component={FamilyScreen} options={{ tabBarIcon: icon("👨‍👩‍👧") }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarIcon: icon("👤") }} />
    </Tab.Navigator>
  );
}
