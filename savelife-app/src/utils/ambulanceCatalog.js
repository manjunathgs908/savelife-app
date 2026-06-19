import { COLORS, getBookingConfig } from "../theme";

const _bls = getBookingConfig("bls");
const _adv = getBookingConfig("als");

export const AMBULANCE_TYPES = [
  { id: "bls",        icon: "🚑",  name: "BLS Ambulance",           desc: "Basic Life Support • Maruti Eeco" },
  { id: "bls_tempo",  icon: "🚐",  name: "BLS Ambulance",           desc: "Basic Life Support • Tempo Traveller" },
  { id: "als_tempo",  icon: "🚐",  name: "ALS Ambulance",           desc: "Advanced Life Support • Tempo Traveller" },
  { id: "acls_tempo", icon: "🚐",  name: "ACLS Ambulance",          desc: "Advanced Cardiac Life Support • Tempo Traveller" },
  { id: "nicu_tempo", icon: "🚐",  name: "NICU Ambulance",          desc: "Newborn Intensive Care Transport • Tempo Traveller" },
  { id: "deadbody", icon: "⚰️",  name: "Dead Body Transport", desc: "Dignified Transport Service" },
];

export const AMB_RATES = {
  bls:        { km: _bls.vehicles[0].rate, base: 0,    eta: "8",  badge: "MOST POPULAR",  color: "#22c55e" },
  bls_tempo:  {                             eta: "10", badge: "BLS",            color: "#22c55e" },
  als_tempo:  { km: _adv.vehicles[0].rate, base: 500,  eta: "12", badge: "ADVANCED",       color: "#3b82f6" },
  acls_tempo: { km: 30,                    base: 1000, eta: "12", badge: "CARDIAC",         color: COLORS.red },
  nicu_tempo: { km: 25,                    base: 600,  eta: "15", badge: "NEONATAL",        color: "#f59e0b" },
  deadbody:   { km: 18,                    base: 350,  eta: "20", badge: "DIGNIFIED",       color: "#8b5cf6" },
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
