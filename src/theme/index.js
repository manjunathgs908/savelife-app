// SaveLife App Theme
export const COLORS = {
  red: "#e8192c",
  redDark: "#a01020",
  bg: "#050608",
  bg2: "#080b12",
  bg3: "#0d1018",
  white: "#ffffff",
  gray: "rgba(255,255,255,0.5)",
  grayDim: "rgba(255,255,255,0.35)",
  border: "rgba(255,255,255,0.08)",
  green: "#22c55e",
};
export const LANGUAGES = ["EN", "KN", "HI", "TE", "TA", "ML"];
export const t = (lang, en, kn, hi, te, ta, ml) =>
  lang === "KN" ? kn : lang === "HI" ? hi : lang === "TE" ? te : lang === "TA" ? ta : lang === "ML" ? ml : en;
export const AMB_TYPES = [
  { id: "bls", icon: "🚑", name: "BLS", desc: "Basic Life Support" },
  { id: "als", icon: "🏥", name: "ALS", desc: "Advanced Life Support" },
  { id: "icu", icon: "🏥", name: "ICU", desc: "Mobile Intensive Care" },
  { id: "neo", icon: "👶", name: "Neonatal", desc: "Newborn Transport" },
  { id: "card", icon: "💗", name: "Cardiac", desc: "Heart Emergency" },
  { id: "mort", icon: "🕊", name: "Mortuary", desc: "Deceased Transport" },
];
export const SERVICES = [
  { icon: "📅", label: "Schedule", screen: "Schedule" },
  { icon: "✈️", label: "Air", screen: "AirAmbulance" },
  { icon: "🎪", label: "Event", screen: "EventAmbulance" },
  { icon: "🛡️", label: "Standby", screen: "Standby" },
  { icon: "🏠", label: "Home Care", screen: "HomeCare" },
  { icon: "❄️", label: "Freezer Box", screen: "FreezerBox" },
  { icon: "⚰️", label: "Remains", screen: "Remains" },
  { icon: "🕉️", label: "Antim Yatra", screen: "AntimYatra" },
  { icon: "🚆", label: "Train", screen: "Train" },
];
export const getBookingConfig = (service) => {
  const isAdvanced = service === "als" || service === "icu";
  return {
    isAdvanced,
    vehicles: isAdvanced
      ? [
          { id: "winger", icon: "ðŸš", name: "Winger Ambulance", rate: 22 },
          { id: "tempo", icon: "ðŸšŒ", name: "Tempo Traveller", rate: 28 },
        ]
      : [
          { id: "eeco", icon: "ðŸš", name: "Eeco Ambulance", rate: 15 },
          { id: "tempo", icon: "ðŸšŒ", name: "Tempo Traveller", rate: 20 },
        ],
    addons: isAdvanced
      ? [
          { id: "vent", name: "Ventilator", price: 1500 },
          { id: "defib", name: "Defibrillator", price: 1200 },
          { id: "monitor", name: "Cardiac Monitor", price: 800 },
          { id: "oxygen", name: "Oxygen", price: 300 },
          { id: "scoop", name: "Scoop Stretcher", price: 100 },
          { id: "spine", name: "Spine Board", price: 200 },
          { id: "wheel", name: "Wheelchair", price: 100 },
        ]
      : [
          { id: "scoop", name: "Scoop Stretcher", price: 100 },
          { id: "wheel", name: "Wheelchair", price: 100 },
          { id: "oxygen", name: "Oxygen", price: 300 },
          { id: "helper", name: "Helper", price: 400 },
          { id: "spine", name: "Spine Board", price: 200 },
        ],
    staffPrice: { nurse: 500, doctor: 1200 },
    acPrice: 200,
  };
};


