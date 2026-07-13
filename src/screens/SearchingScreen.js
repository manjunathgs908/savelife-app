import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Animated, Easing, Dimensions } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { COLORS } from "../theme";

const { height: SCREEN_H } = Dimensions.get("window");
const FALLBACK_REGION = {
  latitude: 12.9716, longitude: 77.5946,
  latitudeDelta: 0.08, longitudeDelta: 0.08,
};
const COORD_DELTA = { latitudeDelta: 0.05, longitudeDelta: 0.05 };

export default function SearchingScreen({ navigation, route }) {
  const { pickupCoord, pickupLabel, dropCoord, dropLabel, dist, fare } = route.params || {};
  const mapRef = useRef(null);
  const barAnim = useRef(new Animated.Value(0)).current;
  const [trackWidth, setTrackWidth] = useState(0);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(barAnim, {
        toValue: 1,
        duration: 1100,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      })
    );
    loop.start();

    const t = setTimeout(() => navigation.replace("Tracking", route.params), 2500);
    return () => { clearTimeout(t); loop.stop(); };
  }, []);

  useEffect(() => {
    if (!pickupCoord || !dropCoord) return;
    const t = setTimeout(() => {
      mapRef.current?.fitToCoordinates([pickupCoord, dropCoord], {
        edgePadding: { top: 70, right: 50, bottom: 70, left: 50 },
        animated: true,
      });
    }, 300);
    return () => clearTimeout(t);
  }, [pickupCoord, dropCoord]);

  const initialRegion = pickupCoord
    ? { latitude: pickupCoord.latitude, longitude: pickupCoord.longitude, ...COORD_DELTA }
    : dropCoord
    ? { latitude: dropCoord.latitude, longitude: dropCoord.longitude, ...COORD_DELTA }
    : FALLBACK_REGION;

  const barWidthPx = trackWidth * 0.35;
  const translateX = barAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-barWidthPx, trackWidth],
  });

  return (
    <View style={styles.container}>
      <View style={styles.mapWrap}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          initialRegion={initialRegion}
          scrollEnabled={false}
          zoomEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          moveOnMarkerPress={false}
        >
          {pickupCoord && (
            <Marker coordinate={pickupCoord} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false} title="Pickup" description={pickupLabel}>
              <View style={styles.pickupMarker}>
                <View style={styles.pickupMarkerDot} />
              </View>
            </Marker>
          )}
          {dropCoord && (
            <Marker coordinate={dropCoord} anchor={{ x: 0.5, y: 1 }} tracksViewChanges={false} title="Drop" description={dropLabel}>
              <View style={styles.dropMarker}>
                <View style={styles.dropMarkerHead} />
                <View style={styles.dropMarkerTail} />
              </View>
            </Marker>
          )}
          {pickupCoord && dropCoord && (
            <Polyline
              coordinates={[pickupCoord, dropCoord]}
              strokeColor={COLORS.red}
              strokeWidth={3}
              lineDashPattern={[8, 8]}
            />
          )}
        </MapView>
      </View>

      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>Ride requested</Text>
        <Text style={styles.sheetSub}>Finding drivers nearby</Text>

        <View
          style={styles.progressTrack}
          onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        >
          {trackWidth > 0 && (
            <Animated.View
              style={[styles.progressBar, { width: barWidthPx, transform: [{ translateX }] }]}
            />
          )}
        </View>

        {(pickupLabel || dropLabel) && (
          <View style={styles.routeSummary}>
            {pickupLabel ? (
              <Text style={styles.routeSummaryText} numberOfLines={1}>📍 {pickupLabel}</Text>
            ) : null}
            {dropLabel ? (
              <Text style={styles.routeSummaryText} numberOfLines={1}>🏁 {dropLabel}</Text>
            ) : null}
          </View>
        )}

        {dist != null && fare != null && (
          <>
            <View style={styles.divider} />
            <Text style={styles.fareRow}>{dist.toFixed(1)} km · ₹{fare.toLocaleString()}</Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  mapWrap: { width: "100%", height: SCREEN_H * 0.55 },
  map: { ...StyleSheet.absoluteFillObject },

  pickupMarker: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: COLORS.bg, borderWidth: 3, borderColor: COLORS.text,
    alignItems: "center", justifyContent: "center",
  },
  pickupMarkerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.text },

  dropMarker: { alignItems: "center" },
  dropMarkerHead: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: COLORS.red, borderWidth: 3, borderColor: COLORS.bg,
  },
  dropMarkerTail: {
    width: 0, height: 0, marginTop: -3,
    borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 9,
    borderLeftColor: "transparent", borderRightColor: "transparent",
    borderTopColor: COLORS.red,
  },

  sheet: {
    flex: 1,
    backgroundColor: COLORS.bg2,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    marginTop: -24,
    borderWidth: 1, borderColor: COLORS.border,
    paddingTop: 12, paddingHorizontal: 22,
    alignItems: "center",
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: COLORS.border, marginBottom: 20,
  },
  sheetTitle: { color: COLORS.text, fontSize: 19, fontWeight: "700" },
  sheetSub: { color: COLORS.grayDim, fontSize: 13, marginTop: 6 },

  progressTrack: {
    width: "100%", height: 4, borderRadius: 2,
    backgroundColor: COLORS.border, overflow: "hidden",
    marginTop: 22,
  },
  progressBar: { height: 4, borderRadius: 2, backgroundColor: COLORS.red },

  routeSummary: { width: "100%", marginTop: 22, gap: 8 },
  routeSummaryText: { color: COLORS.grayDim, fontSize: 12.5, fontWeight: "500" },

  divider: { width: "100%", height: 1, backgroundColor: COLORS.border, marginTop: 16 },
  fareRow: { width: "100%", color: COLORS.text, fontSize: 13.5, fontWeight: "600", marginTop: 12 },
});
