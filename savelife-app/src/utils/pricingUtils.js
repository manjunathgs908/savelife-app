export const PRICING_API = "https://api.savelife.health/api/pricing";

// App-side ambulance ids that don't have a 1:1 serviceType in MongoDB.
// "deadbody" merges what used to be two separate vehicle options
// (BODY_MINI / BODY_TEMPO) into one — BODY_MINI is the cheaper one and
// is used as the single quoted rate.
export const SERVICE_TYPE_ALIAS = {
  deadbody: "body_mini",
};

/**
 * Returns { distFare, base, total } for any ambulance type.
 *
 * If the API pricing doc for that type has a slabs array, uses linear
 * interpolation and returns base=0 (base is baked into the slab table).
 * Otherwise falls back to the local fallbackRates per-km + base charge.
 *
 * @param {string}   typeId        e.g. "bls", "als"
 * @param {number}   km            trip distance
 * @param {Array}    pricingList   response from GET /api/pricing
 * @param {object}   fallbackRates local rates object keyed by typeId
 */
export function calcFare(typeId, km, pricingList, fallbackRates) {
  const serviceType = SERVICE_TYPE_ALIAS[typeId] || typeId;
  const doc = pricingList.find(
    p => p.serviceType?.toLowerCase() === serviceType && p.active !== false
  );

  if (doc?.slabs?.length >= 2) {
    // Normalise slab entries: accept [[km,price],...] or [{km,price},...]
    const pts = doc.slabs.map(s => Array.isArray(s) ? s : [s.km, s.price]);

    if (km <= pts[0][0]) return { distFare: pts[0][1], base: 0, total: pts[0][1] };

    let fare = null;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      if (km <= x1) {
        fare = Math.round(y0 + (km - x0) * (y1 - y0) / (x1 - x0));
        break;
      }
    }
    if (fare === null) {
      const [lastKm, lastPrice] = pts[pts.length - 1];
      if (doc.after300KmRate) {
        // Use MongoDB-defined per-km rate beyond the final slab point
        fare = Math.round(lastPrice + (km - lastKm) * doc.after300KmRate);
      } else {
        const [x0, y0] = pts[pts.length - 2];
        const [x1, y1] = pts[pts.length - 1];
        fare = Math.round(y0 + (km - x0) * (y1 - y0) / (x1 - x0));
      }
    }
    return { distFare: fare, base: 0, total: fare };
  }

  // Fallback if no live pricing doc matched (e.g. API unreachable) — returns
  // 0 unless fallbackRates[typeId] still defines a local km rate.
  const info = fallbackRates[typeId];
  if (!info?.km) return { distFare: 0, base: 0, total: 0 };
  const distFare = Math.round(info.km * km);
  const base = info.base || 0;
  return { distFare, base, total: distFare + base };
}
