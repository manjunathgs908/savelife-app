import React, { useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { COLORS } from "./src/theme";

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

const Stack = createNativeStackNavigator();

// Global app context for language
export const AppContext = React.createContext();

export default function App() {
  const [lang, setLang] = useState("EN");

  return (
    <SafeAreaProvider>
      <AppContext.Provider value={{ lang, setLang }}>
        <NavigationContainer>
          <StatusBar style="light" />
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
          </Stack.Navigator>
        </NavigationContainer>
      </AppContext.Provider>
    </SafeAreaProvider>
  );
}

