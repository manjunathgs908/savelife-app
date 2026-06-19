import { COLORS } from "../theme";

export const AMBULANCE_TYPES = [
  { id: "bls",        icon: "🚑",  name: "BLS Ambulance",           desc: "Basic Life Support • Maruti Eeco" },
  { id: "bls_tempo",  icon: "🚐",  name: "BLS Ambulance",           desc: "Basic Life Support • Tempo Traveller" },
  { id: "als_tempo",  icon: "🚐",  name: "ALS Ambulance",           desc: "Advanced Life Support • Tempo Traveller" },
  { id: "acls_tempo", icon: "🚐",  name: "ACLS Ambulance",          desc: "Advanced Cardiac Life Support • Tempo Traveller" },
  { id: "nicu_tempo", icon: "🚐",  name: "NICU Ambulance",          desc: "Newborn Intensive Care Transport • Tempo Traveller" },
  { id: "body_mini",  icon: "🚑", name: "Body Shifting Ambulance", desc: "Dead Body Transport • Maruti Eeco" },
  { id: "body_tempo", icon: "🚐", name: "Body Shifting Ambulance", desc: "Dead Body Transport • Tempo Traveller" },
];

// Cosmetic UI metadata only — badge/eta/color have no MongoDB equivalent.
// Real fares come live from the pricing API (see src/utils/pricingUtils.js).
export const AMB_DISPLAY = {
  bls:        { eta: "8",  badge: "MOST POPULAR", color: "#22c55e" },
  bls_tempo:  { eta: "10", badge: "BLS",           color: "#22c55e" },
  als_tempo:  { eta: "12", badge: "ADVANCED",      color: "#3b82f6" },
  acls_tempo: { eta: "12", badge: "CARDIAC",       color: COLORS.red },
  nicu_tempo: { eta: "15", badge: "NEONATAL",      color: "#f59e0b" },
  body_mini:  { eta: "18", badge: "DIGNIFIED",     color: "#8b5cf6" },
  body_tempo: { eta: "20", badge: "DIGNIFIED",     color: "#8b5cf6" },
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
