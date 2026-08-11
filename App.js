import React, { useState, useEffect } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Updates from "expo-updates";
import { COLORS } from "./src/theme";
import { LocationDisclosureHost } from "./src/utils/locationPermission";

import SplashScreen from "./src/screens/SplashScreen";
import LoginScreen from "./src/screens/LoginScreen";
import OtpScreen from "./src/screens/OtpScreen";
import MainTabs from "./src/screens/MainTabs";
import SelectTypeScreen from "./src/screens/SelectTypeScreen";
import BookingWizardScreen from "./src/screens/BookingWizardScreen";
import SearchingScreen from "./src/screens/SearchingScreen";
import TrackingScreen from "./src/screens/TrackingScreen";
import EventAmbulanceScreen from "./src/screens/EventAmbulanceScreen";
import FreezerBoxScreen from "./src/screens/FreezerBoxScreen";
import FreezerBoxBookingScreen from "./src/screens/FreezerBoxBookingScreen";
import TrainAmbulanceScreen from "./src/screens/TrainAmbulanceScreen";
import AirAmbulanceScreen from "./src/screens/AirAmbulanceScreen.jsx";
import RemainsScreen from "./src/screens/RemainsScreen";
import DeadBodyTransportScreen from "./src/screens/DeadBodyTransportScreen";
import DestinationScreen from "./src/screens/DestinationScreen";
import LocationSearchScreen from "./src/screens/LocationSearchScreen";
import AmbulanceListScreen from "./src/screens/AmbulanceListScreen";
import AmbulanceSelectScreen from "./src/screens/AmbulanceSelectScreen";
import ConfirmBookingScreen from "./src/screens/ConfirmBookingScreen";
import AntimYatraScreen from "./src/screens/AntimYatraScreen";
import StandbyScreen from "./src/screens/StandbyScreen";

const Stack = createNativeStackNavigator();

// Global app context for language
export const AppContext = React.createContext();

export default function App() {
  const [lang,     setLang]     = useState("EN");
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    async function checkOTA() {
      // expo-updates is a no-op in dev mode / Expo Go — skip to avoid errors
      if (__DEV__) return;
      try {
        const { isAvailable } = await Updates.checkForUpdateAsync();
        if (isAvailable) {
          setUpdating(true);
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync(); // reboots JS bundle — never returns
        }
      } catch {
        // Network error, not an EAS build, etc — fail silently
      }
    }
    checkOTA();
  }, []);

  if (updating) {
    return (
      <View style={ota.container}>
        <ActivityIndicator size="large" color={COLORS.red} />
        <Text style={ota.title}>Updating app…</Text>
        <Text style={ota.sub}>Please wait a moment</Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <AppContext.Provider value={{ lang, setLang }}>
        <NavigationContainer>
          <StatusBar style="dark" />
          <Stack.Navigator
            initialRouteName="Splash"
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: COLORS.bg },
              animation: "slide_from_right",
            }}
          >
            <Stack.Screen name="Splash" component={SplashScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Otp" component={OtpScreen} />
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="SelectType" component={SelectTypeScreen} />
            <Stack.Screen name="Booking" component={BookingWizardScreen} />
            <Stack.Screen name="Searching" component={SearchingScreen} />
            <Stack.Screen name="Tracking" component={TrackingScreen} />
            <Stack.Screen name="EventAmbulance" component={EventAmbulanceScreen} />
            <Stack.Screen name="FreezerBox" component={FreezerBoxScreen} />
            <Stack.Screen name="FreezerBoxBooking" component={FreezerBoxBookingScreen} />
            <Stack.Screen name="Train" component={TrainAmbulanceScreen} />
            <Stack.Screen name="AirAmbulance" component={AirAmbulanceScreen} />
            <Stack.Screen name="Remains" component={RemainsScreen} />
            <Stack.Screen name="DeadBodyTransport" component={DeadBodyTransportScreen} />
            <Stack.Screen name="AntimYatra" component={AntimYatraScreen} />
            <Stack.Screen name="Standby" component={StandbyScreen} />
            <Stack.Screen name="DestinationScreen" component={DestinationScreen} />
            <Stack.Screen name="LocationSearch" component={LocationSearchScreen} />
            <Stack.Screen name="AmbulanceList" component={AmbulanceListScreen} />
            <Stack.Screen name="AmbulanceSelect" component={AmbulanceSelectScreen} />
            <Stack.Screen name="ConfirmBooking" component={ConfirmBookingScreen} />
          </Stack.Navigator>
        </NavigationContainer>
        {/* Mounted once, above the navigator — every screen's
            ensureLocationPermission() call drives this one modal. */}
        <LocationDisclosureHost />
      </AppContext.Provider>
    </SafeAreaProvider>
  );
}

const ota = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: COLORS.bg,
    alignItems: "center", justifyContent: "center",
  },
  title: {
    color: COLORS.text, fontSize: 16, fontWeight: "700", marginTop: 16,
  },
  sub: {
    color: COLORS.grayDim, fontSize: 13, marginTop: 6,
  },
});
