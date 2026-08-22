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
/**
 * calcFare — app/website mirror of the backend's fareCalculator.compute().
 *
 * opts.tripType 'round_trip' plus a roundTripSlabs array on the pricing doc
 * switches the lookup to that table, keyed on opts.oneWayKm (the single
 * leg). Without either, behaviour is exactly what it was. No price or
 * multiplier lives here — the numbers are only ever in MongoDB.
 */
export function calcFare(typeId, km, pricingList, opts = {}) {
  const doc = pricingList.find(
    p => p.serviceType?.toLowerCase() === typeId && p.active !== false
  );

  if (!doc?.slabs || doc.slabs.length < 2) {
    return { distFare: null, base: null, total: null, available: false };
  }

  // Normalise slab entries: accept [[km,price],...] or [{km,price},...]
  // Dedicated round-trip table, when the service has one.
  const useRt = opts.tripType === 'round_trip'
    && Array.isArray(doc.roundTripSlabs) && doc.roundTripSlabs.length >= 2;
  const table = useRt ? doc.roundTripSlabs : doc.slabs;
  const after300 = useRt ? doc.roundTripAfter300KmRate : doc.after300KmRate;
  // roundTripSlabs is keyed on the one-way leg; ordinary slabs on the
  // distance being billed.
  if (useRt) km = opts.oneWayKm != null ? opts.oneWayKm : km / 2;

  const pts = table.map(s => Array.isArray(s) ? s : [s.km, s.price]);

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
