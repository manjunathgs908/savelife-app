// Legal links and the standing emergency disclaimer.
//
// Paths are the real ones on savelife.health — /terms and /privacy, NOT
// /terms-of-service and /privacy-policy. Verified against the live site's
// footer and the route folders in the savelife-web repo. Don't "fix" these
// to the longer names; those 404.
import { Linking } from "react-native";

export const LEGAL = {
  terms: "https://savelife.health/terms",
  privacy: "https://savelife.health/privacy",
  accountDeletion: "https://savelife.health/account-deletion",
};

// Single source of truth — rendered on both HomeScreen and ProfileScreen.
export const EMERGENCY_DISCLAIMER =
  "SaveLife is a private ambulance service. In a life-threatening emergency, " +
  "also call 108 or 112. Response times are not guaranteed.";

// Opens in the system browser. Deliberately no in-app browser: that would
// mean adding expo-web-browser as a dependency.
export async function openLegal(url) {
  try {
    await Linking.openURL(url);
  } catch {
    // No browser available / malformed URL — nothing useful to show the user.
  }
}
