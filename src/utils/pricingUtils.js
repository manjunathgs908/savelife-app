export const PRICING_API = "https://medifleet-backend.onrender.com/api/pricing";

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
 * @param {object}   fallbackRates local AMB_RATES object keyed by typeId
 */
export function calcFare(typeId, km, pricingList, fallbackRates) {
  const doc = pricingList.find(
    p => p.serviceType?.toLowerCase() === typeId && p.active !== false
  );

  if (doc?.slabs?.length >= 2) {
    // Normalise slab entries: accept [[km,price],...] or [{km,fare},...]
    const pts = doc.slabs.map(s => Array.isArray(s) ? s : [s.km, s.fare]);

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
      // Beyond last slab — extrapolate from final segment
      const [x0, y0] = pts[pts.length - 2];
      const [x1, y1] = pts[pts.length - 1];
      fare = Math.round(y0 + (km - x0) * (y1 - y0) / (x1 - x0));
    }
    return { distFare: fare, base: 0, total: fare };
  }

  // Fallback: local per-km rates
  const info = fallbackRates[typeId] || fallbackRates.bls;
  const distFare = Math.round(info.km * km);
  const base = info.base || 0;
  return { distFare, base, total: distFare + base };
}
