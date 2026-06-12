/**
 * Safe AsyncStorage wrapper.
 *
 * The native @react-native-async-storage/async-storage module is only available
 * in production builds and dev-client builds that include it. When the native
 * module is absent (e.g. Expo Go, or a dev-client built before the package was
 * added) every call would crash with "NativeModule: AsyncStorage is null".
 *
 * This wrapper detects the missing native module at runtime and falls back to a
 * plain in-memory Map so the app keeps running. Data stored through the fallback
 * is lost when the JS engine restarts (i.e. on reload / app kill), which is
 * acceptable during development until a new native build is installed.
 */

import { NativeModules } from "react-native";

const mem = new Map();

const memoryStorage = {
  getItem:    async (key)        => mem.get(key) ?? null,
  setItem:    async (key, value) => { mem.set(key, value); },
  removeItem: async (key)        => { mem.delete(key); },
  clear:      async ()           => { mem.clear(); },
  getAllKeys:  async ()           => [...mem.keys()],
  multiGet:   async (keys)       => keys.map(k => [k, mem.get(k) ?? null]),
  multiSet:   async (pairs)      => { pairs.forEach(([k, v]) => mem.set(k, v)); },
};

let storage;

// NativeModules.RNCAsyncStorage is non-null only when the native module linked.
if (NativeModules.RNCAsyncStorage) {
  try {
    storage = require("@react-native-async-storage/async-storage").default;
  } catch {
    storage = memoryStorage;
  }
} else {
  storage = memoryStorage;
}

export default storage;
