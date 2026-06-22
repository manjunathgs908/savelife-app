// Local source of truth for freezer box pricing, shaped like a future
// `GET /api/pricing/freezer?city=...` response so swapping in a real
// backend call later only means replacing the body of getFreezerPricing().

const VIP_PINCODES = new Set([
  "560001", "560003", "560008", "560011", "560034", "560037", "560038", "560041",
  "560048", "560054", "560055", "560066", "560069", "560070", "560080", "560094",
  "560095", "560102",
]);

const BASE_RATES = {
  normal:   { normalArea: 2500, vipArea: 3000 },
  standard: { normalArea: 3500, vipArea: 4000 },
  vip:      { normalArea: 7000, vipArea: 9000 },
};

const FLOOR_CHARGES = {
  ground: 0,
  "1st": 600,
  "2nd": 1000,
  "3rd": 1200,
  above: 1500,
};

export function isVipPincode(pincode) {
  return pincode ? VIP_PINCODES.has(pincode) : false;
}

// Returns a dbPricing-shaped object: { city, isVipArea, boxRates, floorCharges }
export async function getFreezerPricing(city, pincode) {
  const isVipArea = isVipPincode(pincode);
  const areaKey = isVipArea ? "vipArea" : "normalArea";
  return {
    city: city || null,
    isVipArea,
    boxRates: {
      normal: BASE_RATES.normal[areaKey],
      standard: BASE_RATES.standard[areaKey],
      vip: BASE_RATES.vip[areaKey],
    },
    floorCharges: { ...FLOOR_CHARGES },
  };
}
