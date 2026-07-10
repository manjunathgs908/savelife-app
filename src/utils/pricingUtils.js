export const PRICING_API = "https://api.savelife.health/api/pricing";

/**
 * Returns { distFare, base, total, available } for any ambulance type.
 *
 * MongoDB's Pricing collection (GET /api/pricing) is the only source of
 * truth. If no active doc with a slabs array exists for typeId, the fare
 * is NOT guessed from any local/hardcoded rate — `available` is false and
 * distFare/base/total are all null. Callers must check `available` before
 * displaying or charging a fare.
 *
 * @param {string}   typeId       e.g. "bls", "als"
 * @param {number}   km           trip distance
 * @param {Array}    pricingList  response from GET /api/pricing
 */
export function calcFare(typeId, km, pricingList) {
  const doc = pricingList.find(
    p => p.serviceType?.toLowerCase() === typeId && p.active !== false
  );

  if (!doc?.slabs || doc.slabs.length < 2) {
    return { distFare: null, base: null, total: null, available: false };
  }

  // Normalise slab entries: accept [[km,price],...] or [{km,price},...]
  const pts = doc.slabs.map(s => Array.isArray(s) ? s : [s.km, s.price]);

  if (km <= pts[0][0]) {
    return { distFare: pts[0][1], base: 0, total: pts[0][1], available: true };
  }

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
  return { distFare: fare, base: 0, total: fare, available: true };
}
