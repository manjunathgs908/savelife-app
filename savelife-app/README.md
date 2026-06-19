# SaveLife — Customer App (React Native / Expo)

ambulance booking app. One-tap booking, multi-step wizard, live fare, 6 languages.

## ⚡ Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start the app
npx expo start

# 3. Scan QR code with Expo Go app (Android/iOS)
#    or press 'a' for Android emulator, 'i' for iOS
```

## 📱 Test on Phone
1. Play Store / App Store inda **Expo Go** app download madi
2. `npx expo start` run madi
3. QR code scan madi — app open aaguthe

## 📂 Structure
```
savelife-app/
├── App.js                    # Navigation + language context
├── src/
│   ├── theme/index.js        # Colors, services, fare config
│   └── screens/
│       ├── SplashScreen.js
│       ├── LoginScreen.js    # Phone input
│       ├── OtpScreen.js      # 4-digit OTP
│       ├── MainTabs.js       # Bottom tabs
│       ├── HomeScreen.js     # Hold-to-book + services
│       ├── SelectTypeScreen.js
│       ├── BookingWizardScreen.js  # Location→Vehicle→AC→Staff→Addons→Review
│       ├── SearchingScreen.js
│       ├── TrackingScreen.js
│       ├── TripsScreen.js
│       ├── FamilyScreen.js
│       └── ProfileScreen.js
```

## ✅ Features Built
- One-tap (hold) ambulance booking
- 6 languages (EN/KN/HI/TE/TA/ML)
- Multi-step booking wizard with LIVE fare
- Location-first flow (distance → auto fare)
- BLS/ALS/ICU different options
- Family profiles, medical info
- Booking history, saved addresses
- Live tracking with driver details

## 🔜 TODO (next phases)
- **Google Maps API** — real location & distance (replace `DIST = 8.4` in BookingWizardScreen.js)
- **SMS OTP** — Fast2SMS/MSG91 (OtpScreen.js)
- **Payment** — Razorpay
- **Backend** — connect to your Node.js/MongoDB API
- **Push notifications** — Firebase

## 🎨 Branding
- Customer-facing: **SaveLife**
- Platform/CRM: **MediFleet**
- Domain: savelife.health

## 📦 Build APK (later)
```bash
npm install -g eas-cli
eas build -p android --profile preview
```
