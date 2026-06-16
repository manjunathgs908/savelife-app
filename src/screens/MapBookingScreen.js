import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, TouchableOpacity, TextInput, FlatList,
  StyleSheet, ActivityIndicator, Modal, Platform, Animated,
  Dimensions,
} from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import * as Location from "expo-location";
import { COLORS } from "../theme";

const PLACES_KEY = "AIzaSyB8wxgXxQxskgUZG868g_4Qdsezr07i9yA";

const SCREEN_H  = Dimensions.get("window").height;
const SHEET_H   = 170;  // Phase A bottom sheet height (approx)
// Pin total height: head(34) + stem(12) + tip(10) = 56px
// Camera center y with mapPadding.bottom = SHEET_H: (SCREEN_H - SHEET_H) / 2
const MAP_CTR_Y  = (SCREEN_H - SHEET_H) / 2;
const PIN_H      = 56;  // total pin body height
const PIN_BODY_Y = MAP_CTR_Y - PIN_H;  // position pin body so its tip = MAP_CTR_Y

const DARK_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#1a1f2e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a1f2e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8a9bb0" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#c0c8d8" }] },
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2c3347" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#1a1f2e" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#6b7a94" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3d4a63" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#1a1f2e" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#a0aec0" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#252d40" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0d1520" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#3a4a5c" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#1a2030" }] },
];

function decodePolyline(encoded) {
  const pts = [];
  let i = 0, lat = 0, lng = 0;
  while (i < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = result = 0;
    do { b = encoded.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    pts.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return pts;
}

async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${PLACES_KEY}`
    );
    const data = await res.json();
    if (data.results?.length) return data.results[0].formatted_address;
  } catch {}
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

// ─── Search modal (drop only) ─────────────────────────────────────────────────
function SearchModal({ visible, title, onClose, onSelect }) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const debRef = useRef(null);

  useEffect(() => {
    if (visible) { setQuery(""); setSuggestions([]); }
  }, [visible]);

  function onChange(text) {
    setQuery(text);
    clearTimeout(debRef.current);
    if (text.length < 2) { setSuggestions([]); return; }
    debRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(
          `https://maps.googleapis.com/maps/api/place/autocomplete/json` +
          `?input=${encodeURIComponent(text)}&key=${PLACES_KEY}&language=en&components=country:in`
        );
        const d = await r.json();
        setSuggestions(d.predictions || []);
      } catch {}
      setLoading(false);
    }, 350);
  }

  async function pick(pred) {
    try {
      const r = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json` +
        `?place_id=${pred.place_id}&fields=geometry,formatted_address&key=${PLACES_KEY}`
      );
      const d = await r.json();
      if (d.result?.geometry) {
        onSelect({
          coord: {
            latitude: d.result.geometry.location.lat,
            longitude: d.result.geometry.location.lng,
          },
          label: d.result.formatted_address || pred.description,
        });
      }
    } catch {}
  }

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={srch.container}>
        <View style={srch.header}>
          <TouchableOpacity style={srch.closeBtn} onPress={onClose}>
            <Text style={srch.closeX}>←</Text>
          </TouchableOpacity>
          <Text style={srch.title}>{title}</Text>
        </View>

        <View style={srch.inputWrap}>
          <Text style={srch.searchIco}>🔍</Text>
          <TextInput
            style={srch.input}
            placeholder="Hospital, area or address…"
            placeholderTextColor={COLORS.grayDim}
            value={query}
            onChangeText={onChange}
            autoFocus
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => { setQuery(""); setSuggestions([]); }}>
              <Text style={srch.clearX}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {loading && <ActivityIndicator color={COLORS.red} style={{ marginTop: 18 }} />}

        <FlatList
          data={suggestions}
          keyExtractor={item => item.place_id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <TouchableOpacity style={srch.row} onPress={() => pick(item)}>
              <View style={srch.ico}><Text style={{ fontSize: 15 }}>📍</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={srch.main} numberOfLines={1}>
                  {item.structured_formatting?.main_text || item.description}
                </Text>
                {item.structured_formatting?.secondary_text ? (
                  <Text style={srch.sub} numberOfLines={1}>
                    {item.structured_formatting.secondary_text}
                  </Text>
                ) : null}
              </View>
            </TouchableOpacity>
          )}
        />
      </View>
    </Modal>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const BANGALORE = { latitude: 12.9716, longitude: 77.5946, latitudeDelta: 0.06, longitudeDelta: 0.06 };

function fmtDate(d) {
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}
function fmtTime(d) {
  const h = d.getHours(), m = d.getMinutes();
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

// ─── Pure-JS date / time picker ───────────────────────────────────────────────
const DAYS_S  = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONS_S  = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const ITEM_H  = 58;

function buildDateList() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return d;
  });
}

const TIME_SLOTS = (() => {
  const slots = [];
  for (let h = 6; h < 24; h++)
    for (let m = 0; m < 60; m += 30)
      slots.push({ h, m });
  return slots;
})();

function fmt12(h, m) {
  const ap = h < 12 ? "AM" : "PM";
  return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${ap}`;
}

function DateTimePickerModal({ visible, mode, value, onConfirm, onClose }) {
  const DATE_LIST = buildDateList();
  const [selDate, setSelDate] = useState(0);
  const [selTime, setSelTime] = useState(0);

  useEffect(() => {
    if (!visible) return;
    const v = new Date(value);
    v.setHours(0, 0, 0, 0);
    const di = DATE_LIST.findIndex(d => d.toDateString() === v.toDateString());
    setSelDate(di >= 0 ? di : 0);
    const ti = TIME_SLOTS.findIndex(s => s.h === value.getHours() && s.m === value.getMinutes());
    setSelTime(ti >= 0 ? ti : 0);
  }, [visible]);

  function confirm() {
    if (mode === "date") {
      const d = DATE_LIST[selDate];
      const next = new Date(value);
      next.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
      onConfirm(next);
    } else {
      const { h, m } = TIME_SLOTS[selTime];
      const next = new Date(value);
      next.setHours(h, m, 0, 0);
      onConfirm(next);
    }
  }

  const isDate = mode === "date";
  const data   = isDate ? DATE_LIST : TIME_SLOTS;
  const selIdx = isDate ? selDate : selTime;

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={pk.overlay}>
        <View style={pk.sheet}>
          <View style={pk.handle} />
          <View style={pk.header}>
            <Text style={pk.title}>{isDate ? "📅  Select Date" : "🕐  Select Time"}</Text>
            <TouchableOpacity style={pk.closeBtn} onPress={onClose}>
              <Text style={pk.closeX}>✕</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={data}
            keyExtractor={(_, i) => String(i)}
            style={pk.list}
            showsVerticalScrollIndicator={false}
            initialScrollIndex={selIdx}
            getItemLayout={(_, i) => ({ length: ITEM_H, offset: ITEM_H * i, index: i })}
            renderItem={({ item, index }) => {
              const active = index === selIdx;
              let main, sub;
              if (isDate) {
                main = index === 0 ? "Today" : index === 1 ? "Tomorrow" : DAYS_S[item.getDay()];
                sub  = `${item.getDate()} ${MONS_S[item.getMonth()]}`;
              } else {
                main = fmt12(item.h, item.m);
                sub  = null;
              }
              return (
                <TouchableOpacity
                  style={[pk.row, active && pk.rowActive]}
                  onPress={() => isDate ? setSelDate(index) : setSelTime(index)}
                  activeOpacity={0.7}
                >
                  <View style={[pk.dot, active && pk.dotActive]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[pk.rowMain, active && pk.rowMainActive]}>{main}</Text>
                    {sub ? <Text style={[pk.rowSub, active && { color: COLORS.red }]}>{sub}</Text> : null}
                  </View>
                  {active && <Text style={pk.check}>✓</Text>}
                </TouchableOpacity>
              );
            }}
          />
          <View style={pk.footer}>
            <TouchableOpacity style={pk.confirmBtn} onPress={confirm} activeOpacity={0.85}>
              <Text style={pk.confirmTxt}>
                {isDate
                  ? `Confirm — ${selDate === 0 ? "Today" : selDate === 1 ? "Tomorrow" : `${DAYS_S[DATE_LIST[selDate]?.getDay()]}, ${DATE_LIST[selDate]?.getDate()} ${MONS_S[DATE_LIST[selDate]?.getMonth()]}`}`
                  : `Confirm — ${fmt12(TIME_SLOTS[selTime]?.h, TIME_SLOTS[selTime]?.m)}`
                }
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function MapBookingScreen({ navigation, route }) {
  const [gpsCoord, setGpsCoord]       = useState(null);
  const [pickupCoord, setPickupCoord] = useState(route?.params?.pickupCoord ?? null);
  const [pickupLabel, setPickupLabel] = useState(route?.params?.pickupLabel ?? "Finding your location…");
  const [geoLoading, setGeoLoading]   = useState(false);

  // True when the caller already supplied a pickup — GPS must not overwrite it.
  const hasParamPickup = !!(route?.params?.pickupCoord);

  const [dropCoord, setDropCoord]   = useState(route?.params?.dropCoord ?? null);
  const [dropLabel, setDropLabel]   = useState(route?.params?.dropLabel ?? "");
  const [routeCoords, setRouteCoords] = useState([]);
  const [dist, setDist]             = useState(null);
  const [duration, setDuration]     = useState(null);

  const [searchVisible, setSearchVisible] = useState(false);
  const [scheduleType, setScheduleType]   = useState("now");
  const [scheduleDate, setScheduleDate]   = useState(new Date());
  const [pickerMode, setPickerMode]       = useState(null);

  // Animated values for the center pin lift/drop
  const pinLift    = useRef(new Animated.Value(0)).current;
  const shadowScl  = useRef(new Animated.Value(1)).current;
  const isLifted   = useRef(false);
  const geoEnabled = useRef(false); // gates onRegionChangeComplete geocoding
  const mapRef     = useRef(null);

  const hasRoute    = !!dropCoord;
  // Ref mirror of hasRoute to avoid stale closure in map callbacks
  const hasRouteRef = useRef(false);
  useEffect(() => { hasRouteRef.current = hasRoute; }, [hasRoute]);

  // ── Pin animations ────────────────────────────────────────────────────────
  function liftPin() {
    Animated.parallel([
      Animated.spring(pinLift,   { toValue: -16, useNativeDriver: true, friction: 5, tension: 80 }),
      Animated.spring(shadowScl, { toValue: 0.6, useNativeDriver: true, friction: 5, tension: 80 }),
    ]).start();
  }

  function dropPin() {
    Animated.parallel([
      Animated.spring(pinLift,   { toValue: 0, useNativeDriver: true, friction: 8, tension: 140 }),
      Animated.spring(shadowScl, { toValue: 1, useNativeDriver: true, friction: 8, tension: 140 }),
    ]).start();
  }

  // ── GPS on mount ──────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        if (!hasParamPickup) setPickupLabel("Location permission denied — search below");
        geoEnabled.current = true;
        return;
      }
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const coord = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setGpsCoord(coord);
        if (!hasParamPickup) {
          const label = await reverseGeocode(coord.latitude, coord.longitude);
          setPickupCoord(coord);
          setPickupLabel(label);
          mapRef.current?.animateToRegion(
            { ...coord, latitudeDelta: 0.035, longitudeDelta: 0.035 }, 900
          );
        } else {
          // Caller supplied pickup — center map on that instead
          mapRef.current?.animateToRegion(
            { ...route.params.pickupCoord, latitudeDelta: 0.035, longitudeDelta: 0.035 }, 900
          );
        }
        geoEnabled.current = true;
      } catch {
        const last = await Location.getLastKnownPositionAsync();
        if (last) {
          const coord = { latitude: last.coords.latitude, longitude: last.coords.longitude };
          setGpsCoord(coord);
          if (!hasParamPickup) {
            const label = await reverseGeocode(coord.latitude, coord.longitude);
            setPickupCoord(coord);
            setPickupLabel(label);
            mapRef.current?.animateToRegion(
              { ...coord, latitudeDelta: 0.035, longitudeDelta: 0.035 }, 900
            );
          }
        } else if (!hasParamPickup) {
          setPickupLabel("Bangalore, Karnataka");
        }
        geoEnabled.current = true;
      }
    })();
  }, []);

  // ── Fetch route whenever EITHER coord changes (handles GPS-after-drop case) ──
  useEffect(() => {
    if (pickupCoord && dropCoord) fetchRoute(pickupCoord, dropCoord);
  }, [pickupCoord, dropCoord]);

  async function fetchRoute(from, to) {
    try {
      const url =
        `https://maps.googleapis.com/maps/api/directions/json` +
        `?origin=${from.latitude},${from.longitude}` +
        `&destination=${to.latitude},${to.longitude}` +
        `&key=${PLACES_KEY}`;
      const r = await fetch(url);
      const d = await r.json();

      if (d.routes?.length) {
        const leg = d.routes[0].legs[0];
        const decoded = decodePolyline(d.routes[0].overview_polyline.points);
        setDist(leg.distance.value / 1000);
        setDuration(leg.duration.value);
        setRouteCoords(decoded);
        // Fit map to show the full route, clearing both the top route-card (~180px)
        // and the Phase B bottom sheet (~380px).
        setTimeout(() => {
          mapRef.current?.fitToCoordinates([from, to], {
            edgePadding: { top: 200, right: 60, bottom: 400, left: 60 },
            animated: true,
          });
        }, 300);
      } else {
        // API returned no routes — compute straight-line distance as fallback
        const R = 6371;
        const dLat = ((to.latitude  - from.latitude)  * Math.PI) / 180;
        const dLng = ((to.longitude - from.longitude) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos((from.latitude  * Math.PI) / 180) *
          Math.cos((to.latitude    * Math.PI) / 180) *
          Math.sin(dLng / 2) ** 2;
        const fallbackKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        setDist(parseFloat(fallbackKm.toFixed(1)));
        setDuration(Math.round((fallbackKm / 30) * 3600)); // assume 30 km/h
        setRouteCoords([from, to]); // straight line fallback
        setTimeout(() => {
          mapRef.current?.fitToCoordinates([from, to], {
            edgePadding: { top: 200, right: 60, bottom: 400, left: 60 },
            animated: true,
          });
        }, 300);
      }
    } catch (err) {
      console.warn("[fetchRoute] error:", err?.message ?? err);
      // Still show a straight-line fallback so the user can proceed
      const R = 6371;
      const dLat = ((to.latitude  - from.latitude)  * Math.PI) / 180;
      const dLng = ((to.longitude - from.longitude) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((from.latitude  * Math.PI) / 180) *
        Math.cos((to.latitude    * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
      const fallbackKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      setDist(parseFloat(fallbackKm.toFixed(1)));
      setDuration(Math.round((fallbackKm / 30) * 3600));
      setRouteCoords([from, to]);
      setTimeout(() => {
        mapRef.current?.fitToCoordinates([from, to], {
          edgePadding: { top: 200, right: 60, bottom: 400, left: 60 },
          animated: true,
        });
      }, 300);
    }
  }

  // ── Map region callbacks ──────────────────────────────────────────────────
  function handleRegionChange() {
    if (hasRouteRef.current) return;
    if (!isLifted.current) {
      isLifted.current = true;
      liftPin();
    }
  }

  async function handleRegionChangeComplete(region) {
    if (!geoEnabled.current || hasRouteRef.current) return;
    isLifted.current = false;
    dropPin();
    const { latitude, longitude } = region;
    setPickupCoord({ latitude, longitude });
    setGeoLoading(true);
    const label = await reverseGeocode(latitude, longitude);
    setPickupLabel(label);
    setGeoLoading(false);
  }

  // ── Handlers ──────────────────────────────────────────────────────────────
  function recenterToGPS() {
    if (!gpsCoord) return;
    mapRef.current?.animateToRegion(
      { ...gpsCoord, latitudeDelta: 0.035, longitudeDelta: 0.035 }, 600
    );
  }

  function clearDrop() {
    setDropCoord(null);
    setDropLabel("");
    setRouteCoords([]);
    setDist(null);
    setDuration(null);
    if (pickupCoord) {
      setTimeout(() => {
        mapRef.current?.animateToRegion(
          { ...pickupCoord, latitudeDelta: 0.04, longitudeDelta: 0.04 }, 400
        );
      }, 100);
    }
  }

  function handleChoose() {
    navigation.navigate("AmbulanceSelect", {
      pickupLabel,
      dropLabel,
      dist: dist ?? 5,
      duration: duration ?? 1200,
      scheduleType,
      scheduleDate: scheduleType === "later" ? scheduleDate.toISOString() : null,
    });
  }

  return (
    <View style={styles.container}>

      {/* ── Full-screen map ──────────────────────────────────────────────── */}
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        customMapStyle={DARK_MAP_STYLE}
        initialRegion={BANGALORE}
        mapPadding={{
          top: 0,
          right: 0,
          bottom: hasRoute ? 380 : SHEET_H,
          left: 0,
        }}
        showsMyLocationButton={false}
        showsCompass={false}
        onRegionChange={handleRegionChange}
        onRegionChangeComplete={handleRegionChangeComplete}
      >
        {/* Drop marker (Phase B) */}
        {dropCoord && (
          <Marker
            coordinate={dropCoord}
            tracksViewChanges={false}
            draggable
            onDragEnd={async e => {
              const c = e.nativeEvent.coordinate;
              setDropCoord(c);
              setDropLabel(await reverseGeocode(c.latitude, c.longitude));
            }}
          >
            <View style={styles.dropPin}>
              <View style={styles.dropPinHead} />
              <View style={styles.dropPinTail} />
            </View>
          </Marker>
        )}

        {/* Route polyline (Phase B) */}
        {routeCoords.length > 0 && (
          <Polyline
            coordinates={routeCoords}
            strokeColor={COLORS.red}
            strokeWidth={4}
            lineCap="round"
            lineJoin="round"
          />
        )}
      </MapView>

      {/* ── Fixed center pin (Phase A only) ──────────────────────────────── */}
      {!hasRoute && (
        <View style={styles.pinOverlay} pointerEvents="none">

          {/*
            Shadow: centered at MAP_CTR_Y (the camera coordinate center).
            Scales down when pin lifts to simulate the shadow shrinking with distance.
          */}
          <View style={styles.shadowWrap}>
            <Animated.View
              style={[styles.pinShadow, { transform: [{ scale: shadowScl }] }]}
            />
          </View>

          {/*
            Pin body: absolutely positioned so its BOTTOM TIP sits at MAP_CTR_Y.
            translateY lifts/drops the body while the shadow stays fixed.
          */}
          <Animated.View
            style={[styles.pinBodyWrap, { transform: [{ translateY: pinLift }] }]}
          >
            {/* Circle head with white inner dot */}
            <View style={styles.pinHead}>
              <View style={styles.pinDot} />
            </View>
            {/* Stem + downward-pointing triangle tip */}
            <View style={styles.pinLeg}>
              <View style={styles.pinStem} />
              <View style={styles.pinTip} />
            </View>
          </Animated.View>

        </View>
      )}

      {/* ── Top address card ─────────────────────────────────────────────── */}
      <View style={styles.topArea}>
        {/* Back button row */}
        <View style={styles.topRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>

          {hasRoute && dist != null && (
            <View style={styles.distPill}>
              <Text style={styles.distPillTxt}>
                📏  {dist.toFixed(1)} km  ·  ~{Math.round(duration / 60)} min
              </Text>
            </View>
          )}
        </View>

        {/* Phase A — live pickup address */}
        {!hasRoute && (
          <View style={styles.pickupCard}>
            <View style={styles.greenDotSm} />
            <View style={{ flex: 1 }}>
              <Text style={styles.pickupCardLabel}>PICKUP LOCATION</Text>
              {geoLoading ? (
                <View style={styles.pickupLoadingRow}>
                  <ActivityIndicator size="small" color={COLORS.red} style={{ marginRight: 6 }} />
                  <Text style={styles.pickupLoadingTxt}>Updating address…</Text>
                </View>
              ) : (
                <Text style={styles.pickupCardValue} numberOfLines={2}>
                  {pickupLabel}
                </Text>
              )}
            </View>
            {gpsCoord && !geoLoading && (
              <TouchableOpacity style={styles.recenterBtn} onPress={recenterToGPS} activeOpacity={0.7}>
                <Text style={styles.recenterIco}>⊕</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Phase B — pickup + drop addresses */}
        {hasRoute && (
          <View style={styles.routeCard}>
            <TouchableOpacity style={styles.routeAddrRow} onPress={clearDrop} activeOpacity={0.75}>
              <View style={styles.greenDotSm} />
              <Text style={styles.routeAddrTxt} numberOfLines={1}>{pickupLabel}</Text>
              <Text style={styles.routeChangeTxt}>Change</Text>
            </TouchableOpacity>
            <View style={styles.routeCardSep}>
              <View style={styles.routeCardLine} />
            </View>
            <TouchableOpacity
              style={styles.routeAddrRow}
              onPress={() => setSearchVisible(true)}
              activeOpacity={0.75}
            >
              <View style={styles.redDotSm} />
              <Text style={styles.routeAddrTxt} numberOfLines={1}>{dropLabel}</Text>
              <Text style={styles.routeChangeTxt}>Edit</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ── Bottom sheet ─────────────────────────────────────────────────── */}
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />

        {!hasRoute ? (
          // ── Phase A: move map hint + "Where to?" ─────────────────────────
          <>
            <Text style={styles.moveHint}>
              Move the map to set your pickup, then tap below
            </Text>
            <TouchableOpacity
              style={styles.whereToBtn}
              onPress={() => setSearchVisible(true)}
              activeOpacity={0.88}
            >
              <View style={styles.searchIcoBox}>
                <Text style={{ fontSize: 18 }}>🔍</Text>
              </View>
              <Text style={styles.whereToTxt}>Where to?</Text>
              <View style={styles.whereToArrow}>
                <Text style={{ color: COLORS.white, fontSize: 16, fontWeight: "700" }}>→</Text>
              </View>
            </TouchableOpacity>
          </>
        ) : (
          // ── Phase B: schedule + choose ────────────────────────────────────
          <>
            {/* Schedule */}
            <View style={styles.schedSection}>
              <Text style={styles.schedHeading}>When do you need it?</Text>
              <View style={styles.schedTabs}>
                <TouchableOpacity
                  style={[styles.schedTab, scheduleType === "now" && styles.schedTabActive]}
                  onPress={() => { setScheduleType("now"); setPickerMode(null); }}
                >
                  <Text style={[styles.schedTabTxt, scheduleType === "now" && styles.schedTabTxtActive]}>
                    🟢  Now
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.schedTab, scheduleType === "later" && styles.schedTabActive]}
                  onPress={() => setScheduleType("later")}
                >
                  <Text style={[styles.schedTabTxt, scheduleType === "later" && styles.schedTabTxtActive]}>
                    🕐  Schedule
                  </Text>
                </TouchableOpacity>
              </View>

              {scheduleType === "later" && (
                <View style={styles.dateTimeRow}>
                  <TouchableOpacity style={styles.dtChip} onPress={() => setPickerMode("date")}>
                    <Text style={styles.dtChipIco}>📅</Text>
                    <Text style={styles.dtChipTxt}>{fmtDate(scheduleDate)}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.dtChip} onPress={() => setPickerMode("time")}>
                    <Text style={styles.dtChipIco}>🕐</Text>
                    <Text style={styles.dtChipTxt}>{fmtTime(scheduleDate)}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Choose ambulance CTA */}
            <TouchableOpacity style={styles.chooseBtn} onPress={handleChoose} activeOpacity={0.85}>
              <Text style={styles.chooseBtnText}>Choose Ambulance</Text>
              <Text style={styles.chooseBtnArrow}>→</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Drop-location search modal */}
      <SearchModal
        visible={searchVisible}
        title="Where to?"
        onClose={() => setSearchVisible(false)}
        onSelect={({ coord, label }) => {
          setDropCoord(coord);
          setDropLabel(label);
          setSearchVisible(false);
        }}
      />

      {/* Pure-JS date/time picker */}
      <DateTimePickerModal
        visible={pickerMode != null}
        mode={pickerMode || "date"}
        value={scheduleDate}
        onConfirm={d => { setScheduleDate(d); setPickerMode(null); }}
        onClose={() => setPickerMode(null)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  // ── Center pin overlay ──────────────────────────────────────────────────
  // Full-screen transparent overlay; children use absolute positioning so
  // the pin TIP and shadow both land exactly at MAP_CTR_Y (camera center).
  pinOverlay: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
  },

  // Shadow container — vertically centered on MAP_CTR_Y
  shadowWrap: {
    position: "absolute",
    top: MAP_CTR_Y - 5,   // shadow height=10 → center at MAP_CTR_Y
    left: 0, right: 0,
    alignItems: "center",
  },
  pinShadow: {
    width: 28, height: 10, borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.3)",
    shadowColor: COLORS.red,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 0,
  },

  // Pin body — tip (bottom edge) at MAP_CTR_Y, head floats above
  pinBodyWrap: {
    position: "absolute",
    top: PIN_BODY_Y,   // = MAP_CTR_Y - 56, so bottom (tip) = MAP_CTR_Y
    left: 0, right: 0,
    alignItems: "center",
  },
  pinHead: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.red,
    borderWidth: 3, borderColor: COLORS.white,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 12,
  },
  pinDot: {
    width: 11, height: 11, borderRadius: 6,
    backgroundColor: COLORS.white,
  },
  pinLeg: { alignItems: "center" },
  pinStem: { width: 4, height: 10, backgroundColor: COLORS.red },
  // CSS-border triangle pointing downward — forms the pin tip
  pinTip: {
    width: 0, height: 0,
    borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 10,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: COLORS.red,
  },

  // ── Top address area ────────────────────────────────────────────────────
  topArea: {
    position: "absolute",
    top: Platform.OS === "ios" ? 54 : 40,
    left: 14, right: 14,
    zIndex: 10,
    gap: 8,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(5,6,8,0.88)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 0.5, borderColor: "rgba(255,255,255,0.14)",
    shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 6, elevation: 8,
  },
  backArrow: { color: COLORS.white, fontSize: 20, lineHeight: 22 },
  distPill: {
    flex: 1,
    backgroundColor: "rgba(5,6,8,0.88)",
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9,
    borderWidth: 0.5, borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 6, elevation: 6,
  },
  distPillTxt: { color: COLORS.white, fontSize: 13, fontWeight: "600" },

  // Phase A: live pickup card
  pickupCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "rgba(5,6,8,0.92)",
    borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14,
    borderWidth: 0.5, borderColor: "rgba(255,255,255,0.12)",
    shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 10, elevation: 10,
  },
  pickupCardLabel: {
    color: COLORS.grayDim, fontSize: 10, fontWeight: "700",
    letterSpacing: 0.8, marginBottom: 4,
  },
  pickupCardValue: { color: COLORS.white, fontSize: 13, fontWeight: "500", lineHeight: 18 },
  pickupLoadingRow: { flexDirection: "row", alignItems: "center", marginTop: 2 },
  pickupLoadingTxt: { color: COLORS.grayDim, fontSize: 12 },
  recenterBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(232,25,44,0.12)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 0.5, borderColor: "rgba(232,25,44,0.35)",
  },
  recenterIco: { color: COLORS.red, fontSize: 20, lineHeight: 22 },

  // Phase B: route addresses card
  routeCard: {
    backgroundColor: "rgba(5,6,8,0.92)",
    borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6,
    borderWidth: 0.5, borderColor: "rgba(255,255,255,0.12)",
    shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 10, elevation: 10,
  },
  routeAddrRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 10,
  },
  routeAddrTxt: { flex: 1, color: COLORS.white, fontSize: 12, fontWeight: "500" },
  routeChangeTxt: { color: COLORS.red, fontSize: 11, fontWeight: "700" },
  routeCardSep: { paddingLeft: 6 },
  routeCardLine: {
    height: 0.5, backgroundColor: "rgba(255,255,255,0.1)",
    marginBottom: 2,
  },

  // Dot indicators
  greenDotSm: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: COLORS.green,
    borderWidth: 1.5, borderColor: "rgba(34,197,94,0.4)",
  },
  redDotSm: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: COLORS.red,
    borderWidth: 1.5, borderColor: "rgba(232,25,44,0.4)",
  },

  // Drop marker (inside MapView)
  dropPin: { alignItems: "center" },
  dropPinHead: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: COLORS.red,
    borderWidth: 3, borderColor: COLORS.white,
    shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 4, elevation: 6,
  },
  dropPinTail: {
    width: 3, height: 8,
    backgroundColor: COLORS.red,
    marginTop: -1,
  },

  // ── Bottom sheet ────────────────────────────────────────────────────────
  sheet: {
    position: "absolute",
    bottom: 0, left: 0, right: 0,
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingHorizontal: 18,
    paddingBottom: Platform.OS === "ios" ? 36 : 22,
    paddingTop: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.65,
    shadowRadius: 18,
    elevation: 26,
  },
  sheetHandle: {
    width: 36, height: 4,
    backgroundColor: "rgba(0,0,0,0.12)",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 14,
  },

  // Phase A
  moveHint: {
    textAlign: "center",
    color: COLORS.grayDim,
    fontSize: 12,
    marginBottom: 12,
    lineHeight: 17,
  },
  whereToBtn: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: COLORS.red,
    borderRadius: 14, paddingVertical: 15, paddingHorizontal: 16,
  },
  searchIcoBox: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: "rgba(0,0,0,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  whereToTxt: { flex: 1, color: COLORS.white, fontSize: 16, fontWeight: "700" },
  whereToArrow: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.2)",
    alignItems: "center", justifyContent: "center",
  },

  // Phase B — schedule
  schedSection: { marginBottom: 12 },
  schedHeading: {
    color: COLORS.grayDim, fontSize: 11, fontWeight: "700",
    textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8,
  },
  schedTabs: { flexDirection: "row", gap: 8 },
  schedTab: {
    flex: 1, paddingVertical: 10, alignItems: "center",
    borderRadius: 10, borderWidth: 0.5,
    borderColor: "rgba(0,0,0,0.1)",
    backgroundColor: "rgba(0,0,0,0.04)",
  },
  schedTabActive: { backgroundColor: COLORS.red, borderColor: COLORS.red },
  schedTabTxt: { color: COLORS.grayDim, fontSize: 13, fontWeight: "600" },
  schedTabTxtActive: { color: COLORS.white, fontWeight: "700" },
  dateTimeRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  dtChip: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(0,0,0,0.05)",
    borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12,
    borderWidth: 0.5, borderColor: "rgba(0,0,0,0.1)",
  },
  dtChipIco: { fontSize: 14 },
  dtChipTxt: { color: COLORS.text, fontSize: 12, fontWeight: "600" },
  chooseBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: COLORS.red, borderRadius: 14,
    paddingVertical: 16, gap: 10,
  },
  chooseBtnText: { color: COLORS.white, fontSize: 16, fontWeight: "700" },
  chooseBtnArrow: { color: COLORS.white, fontSize: 18, fontWeight: "700" },
});

// ─── Search modal styles ──────────────────────────────────────────────────────
const srch = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingTop: 54 },
  header: {
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingHorizontal: 18, paddingBottom: 16,
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.bg3,
    alignItems: "center", justifyContent: "center",
  },
  closeX: { color: COLORS.text, fontSize: 18, fontWeight: "700" },
  title: { color: COLORS.text, fontSize: 17, fontWeight: "700" },
  inputWrap: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginHorizontal: 18, marginBottom: 8,
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: COLORS.bg3,
    borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 12,
  },
  searchIco: { fontSize: 16 },
  input: { flex: 1, color: COLORS.text, fontSize: 15 },
  clearX: { color: COLORS.grayDim, fontSize: 14, paddingHorizontal: 4 },
  ico: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: "rgba(0,0,0,0.05)",
    alignItems: "center", justifyContent: "center",
  },
  row: {
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingHorizontal: 18, paddingVertical: 13,
    borderBottomWidth: 0.5, borderBottomColor: COLORS.border,
  },
  main: { color: COLORS.text, fontSize: 14, fontWeight: "500" },
  sub: { color: COLORS.grayDim, fontSize: 12, marginTop: 2 },
});

// ─── Date/time picker styles ──────────────────────────────────────────────────
const pk = StyleSheet.create({
  overlay: {
    flex: 1, justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    backgroundColor: COLORS.bg2,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingBottom: Platform.OS === "ios" ? 36 : 22,
    maxHeight: "75%",
  },
  handle: {
    width: 36, height: 4,
    backgroundColor: "rgba(0,0,0,0.12)",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 10, marginBottom: 6,
  },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 18, paddingVertical: 12,
    borderBottomWidth: 0.5, borderBottomColor: COLORS.border,
  },
  title: { flex: 1, color: COLORS.text, fontSize: 16, fontWeight: "700" },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.06)",
    alignItems: "center", justifyContent: "center",
  },
  closeX: { color: COLORS.grayDim, fontSize: 14, fontWeight: "700" },
  list: { flex: 1 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingHorizontal: 18, height: ITEM_H,
    borderBottomWidth: 0.5, borderBottomColor: "rgba(0,0,0,0.05)",
  },
  rowActive: { backgroundColor: "rgba(232,25,44,0.07)" },
  dot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  dotActive: { backgroundColor: COLORS.red },
  rowMain: { color: COLORS.text, fontSize: 15, fontWeight: "500" },
  rowMainActive: { color: COLORS.text, fontWeight: "700" },
  rowSub: { color: COLORS.grayDim, fontSize: 12, marginTop: 2 },
  check: { color: COLORS.red, fontSize: 18, fontWeight: "700" },
  footer: {
    paddingHorizontal: 18, paddingTop: 12,
    borderTopWidth: 0.5, borderTopColor: COLORS.border,
  },
  confirmBtn: {
    backgroundColor: COLORS.red, borderRadius: 14,
    paddingVertical: 15, alignItems: "center",
  },
  confirmTxt: { color: COLORS.white, fontSize: 15, fontWeight: "700" },
});
