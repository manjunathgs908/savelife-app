import { COLORS, getBookingConfig } from "../theme";

const _bls = getBookingConfig("bls");
const _adv = getBookingConfig("als");

export const AMBULANCE_TYPES = [
  { id: "bls",        icon: "🚑",  name: "BLS Ambulance",           desc: "Basic Life Support • Maruti Eeco" },
  { id: "bls_tempo",  icon: "🚐",  name: "BLS Ambulance",           desc: "Basic Life Support • Tempo Traveller" },
  { id: "als_tempo",  icon: "🚐",  name: "ALS Ambulance",           desc: "Advanced Life Support • Tempo Traveller" },
  { id: "acls_tempo", icon: "🚐",  name: "ACLS Ambulance",          desc: "Advanced Cardiac Life Support • Tempo Traveller" },
  { id: "nicu_tempo", icon: "🚐",  name: "NICU Ambulance",          desc: "Newborn Intensive Care Transport • Tempo Traveller" },
  { id: "body_tempo", icon: "🚐",  name: "Body Shifting Ambulance",      desc: "Dead Body Transport • Tempo Traveller" },
  { id: "body_mini",  icon: "🚑",  name: "Body Shifting Mini Ambulance", desc: "Dead Body Transport • Maruti Eeco" },
];

// Services that are one-way by nature. Last-rites transport does not bring
// the deceased back, so a round trip is not a bookable shape for it - the UI
// withholds the option instead of offering it and rejecting it later.
// Ids match AMBULANCE_TYPES above. Mirrored on the website at
// savelife-web/lib/config.js - keep the two in sync.
export const ONE_WAY_ONLY_TYPES = ["body_tempo", "body_mini"];

export const isOneWayOnly = (id) => ONE_WAY_ONLY_TYPES.includes(id);

// Helper/attendant add-on eligibility. Two independent UI rules: only the
// BLS services carry a helper, and only for local trips - an intercity run
// is not a job a single attendant is booked for. The distance test is on
// the ONE-WAY leg, never the round-trip doubled figure, so a 40 km round
// trip still qualifies at 80 km billed.
// Mirrored on the website at savelife-web/lib/config.js - keep in sync.
// The fee itself is deliberately NOT here - it comes from the Pricing doc's
// helperCharge, so it stays editable in the DB like every other rupee value.
export const HELPER_ELIGIBLE_TYPES = ["bls", "bls_tempo"];
export const HELPER_MAX_ONE_WAY_KM = 50;

export const isHelperEligible = (id, oneWayKm) =>
  HELPER_ELIGIBLE_TYPES.includes(id) &&
  oneWayKm > 0 &&
  oneWayKm <= HELPER_MAX_ONE_WAY_KM;

export const AMB_RATES = {
  bls:        { km: _bls.vehicles[0].rate, base: 0,    eta: "8",  badge: "MOST POPULAR",  color: "#22c55e" },
  bls_tempo:  {                             eta: "10", badge: "BLS",            color: "#22c55e" },
  als_tempo:  { km: _adv.vehicles[0].rate, base: 500,  eta: "12", badge: "ADVANCED",       color: "#3b82f6" },
  acls_tempo: { km: 30,                    base: 1000, eta: "12", badge: "CARDIAC",         color: COLORS.red },
  nicu_tempo: { km: 25,                    base: 600,  eta: "15", badge: "NEONATAL",        color: "#f59e0b" },
  body_tempo: { km: 18,                    base: 350,  eta: "20", badge: "DIGNIFIED",       color: "#8b5cf6" },
  body_mini:  { km: 18,                    base: 350,  eta: "18", badge: "DIGNIFIED",       color: "#8b5cf6" },
};

export const AMB_FEATURES = {
  als_tempo: [
    "Oxygen Support",
    "Cardiac Monitor",
    "Suction Machine",
    "Infusion Pump (2)",
    "Ventilator",
    "BiPAP",
    "CPAP",
    "Trained Paramedic",
  ],
  acls_tempo: [
    "Ventilator",
    "Defibrillator (AED)",
    "Cardiac Monitor",
    "Multi Parameter Monitor",
    "Oxygen Support",
    "Suction Machine",
    "Infusion Pump",
    "Syringe Pump",
    "BiPAP",
    "CPAP",
    "AC Ambulance",
    "Spine Board",
    "Scoop Stretcher",
    "Trained Critical Care Paramedic",
  ],
};
