const PLACES_KEY = "AIzaSyB8wxgXxQskgUZG868g_4Qdsezr07i9yA";
const DIRECTIONS_API_URL = "https://maps.googleapis.com/maps/api/directions/json";
const ROUTE_TIMEOUT_MS = 3000;

const routeCache = new Map();

function roundCoord(coord) {
  return `${coord.latitude.toFixed(6)},${coord.longitude.toFixed(6)}`;
}

function routeCacheKey(from, to) {
  return `${roundCoord(from)}|${roundCoord(to)}`;
}

export function haversineDistanceKm(from, to) {
  const R = 6371;
  const dLat = ((to.latitude - from.latitude) * Math.PI) / 180;
  const dLng = ((to.longitude - from.longitude) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((from.latitude * Math.PI) / 180) *
    Math.cos((to.latitude * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function estimateRouteDurationSeconds(km, averageSpeedKmh = 30) {
  return Math.max(60, Math.round((km / averageSpeedKmh) * 3600));
}

export function decodePolyline(encoded) {
  const pts = [];
  let i = 0;
  let lat = 0;
  let lng = 0;

  while (i < encoded.length) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);

    pts.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }

  return pts;
}

async function fetchWithTimeout(url, timeoutMs = ROUTE_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getRouteInfo(from, to) {
  const cacheKey = routeCacheKey(from, to);
  if (routeCache.has(cacheKey)) {
    return routeCache.get(cacheKey);
  }

  const fallbackDistance = haversineDistanceKm(from, to);
  const fallback = {
    distance: fallbackDistance,
    duration: estimateRouteDurationSeconds(fallbackDistance),
    coords: [from, to],
    source: "fallback",
  };

  try {
    const url =
      `${DIRECTIONS_API_URL}` +
      `?origin=${from.latitude},${from.longitude}` +
      `&destination=${to.latitude},${to.longitude}` +
      `&key=${PLACES_KEY}`;
    const response = await fetchWithTimeout(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!data.routes?.length) return fallback;

    const leg = data.routes[0].legs[0];
    const points = data.routes[0].overview_polyline?.points;
    const coords = points ? decodePolyline(points) : [from, to];
    const result = {
      distance: leg.distance.value / 1000,
      duration: leg.duration.value,
      coords,
      source: "google",
    };
    routeCache.set(cacheKey, result);
    return result;
  } catch {
    return fallback;
  }
}
