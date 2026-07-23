# SaveLife App — Complete UX Flow Analysis

Read-only analysis of every screen in `src/screens/`, `App.js`'s navigation graph, `src/theme/`, and `src/utils/`. No code changed. Verified by direct code reading (not inference) — where a finding says "confirmed," it means the actual source was read and, where relevant, cross-referenced against a repo-wide grep for who calls/navigates to it.

---

## 0. The five things that matter most

Before the screen-by-screen breakdown, these are the findings that change how you should read everything below:

1. **Login has no backend behind it.** Neither `LoginScreen.js` nor `OtpScreen.js` calls any API. Any 10-digit number proceeds; any 4 digits at all (correct or not) "log in" by writing the literal string `"loggedIn"` into storage. The unified OTP endpoints confirmed working on the backend this session are never called by this app.
2. **The app has two complete, parallel booking flows, and only one is reachable.** `Home → DestinationScreen → AmbulanceList → ConfirmBooking → Searching → Tracking` is live. `SelectTypeScreen → BookingWizardScreen` is a fully-built, more sophisticated alternate flow (live map, real Directions routing, per-vehicle calculator) that **nothing in the app ever navigates to** — dead code that still ships two more hardcoded Google API keys in the bundle.
3. **Four "specialized service" screens never create a real booking.** Air Ambulance, Train Ambulance, Antim Yatra, and Standby Ambulance are enquiry-only forms — fill it out, tap submit, see an `Alert`, everything you typed is discarded. Freezer Box goes further (real live pricing fetch, a fully-animated "searching → driver assigned" sequence with a named driver and plate number) but that entire sequence is a client-side `setTimeout` theater — no trip is ever created server-side.
4. **There is no "Trip Completed" screen.** `TrackingScreen` just swaps its status label to "Trip Completed" and leaves the user on the same map view — no rating, no bill breakdown, no receipt, no chat, even though the backend now returns all of this data (this session's work) and none of it is wired into the UI yet.
5. **A fully-built, unreachable feature exists:** `FamilyScreen.js` (add family members, manage their saved addresses) is complete and polished — and is not registered in any navigator, not linked from `ProfileScreen`, not reachable from anywhere. It's a finished feature nobody can open.

---

## 1. Real navigation map (verified against `App.js` + grep for every `navigate()` call)

```
Splash ──(token?)──► Main (bottom tabs: Home / Bookings / Wallet / Profile + EmergencyCall button)
       └──(no token)──► Login → Otp → Main

Home ─┬─► DestinationScreen ─┬─► AmbulanceList → ConfirmBooking → Searching → Tracking
      │                       └─► DeadBodyTransport → ConfirmBooking → Searching → Tracking
      ├─► Remains → ConfirmBooking → Searching → Tracking   (dist:0, pricingList:[] — see §9)
      ├─► FreezerBox → FreezerBoxBooking   (dead-ends — no real booking created)
      ├─► AirAmbulance                     (dead-ends — enquiry only)
      ├─► Train                           (dead-ends — enquiry only)
      ├─► EventAmbulance                  (dead-ends — enquiry only)
      ├─► AntimYatra                      (dead-ends — enquiry only)
      └─► Standby                         (dead-ends — enquiry only)

UNREACHABLE (registered in App.js, never navigated to from anywhere):
  SelectType → Booking      (legacy booking wizard)
  AmbulanceSelect            (nicer alternate ambulance picker)
  LocationSearch             (nicer alternate pickup/drop picker)

NOT REGISTERED IN ANY NAVIGATOR (exists on disk, no route at all):
  FamilyScreen.js
  AmbulanceListScreen.backup.js
```

| Screen file | Reachable? | Notes |
|---|---|---|
| SplashScreen | ✅ | initial route |
| LoginScreen / OtpScreen | ✅ | no backend wired |
| MainTabs → Home/TripsScreen/WalletScreen/ProfileScreen | ✅ | |
| DestinationScreen | ✅ | live entry to core flow |
| AmbulanceListScreen | ✅ | live ambulance picker |
| ConfirmBookingScreen | ✅ | live, real `POST /api/trips` |
| SearchingScreen / TrackingScreen | ✅ | live, real polling |
| DeadBodyTransportScreen | ✅ | via Destination `flow:"deadbody"` |
| RemainsScreen, FreezerBoxScreen, FreezerBoxBookingScreen, AirAmbulanceScreen, TrainAmbulanceScreen, EventAmbulanceScreen, AntimYatraScreen, StandbyScreen | ✅ reachable, but ❌ none create a real backend record except Remains (which reaches ConfirmBooking but with broken data — §9) | |
| SelectTypeScreen, BookingWizardScreen | ❌ dead | fully built, unreachable |
| AmbulanceSelectScreen | ❌ dead | nicer than the live one — feature donor |
| LocationSearchScreen | ❌ dead | nicer GPS fallback than the live one — feature donor |
| AmbulanceListScreen.backup.js | ❌ dead, not even imported | superseded earlier revision |
| FamilyScreen.js | ❌ dead, not registered anywhere | fully built, zero entry point |

---

## 2. Splash Screen

**File:** `SplashScreen.js`

- **Purpose:** Boot screen; decides Login vs Main based on stored session.
- **User actions:** None — timed, no touchables.
- **Navigation:** Fixed 1800ms delay, then reads `storage.getItem("userToken")` → `navigation.replace(token ? "Main" : "Login")`.
- **API calls:** None.
- **Business logic:** "Session check" is just "does any truthy string exist under `userToken`" — no expiry, no server validation. (And since `OtpScreen` writes the literal string `"loggedIn"` regardless of what was entered, this check is currently meaningless.)
- **Missing UX:** Artificial fixed delay on every launch regardless of how fast the storage read finishes; no try/catch around the storage read; the "pulse" animation is a static circle, not animated.
- **Missing features:** No token expiry/refresh, no deep-link handling, no offline check.
- **Suggested improvements:** Navigate as soon as the storage check resolves rather than after a fixed timeout; wrap the read in try/catch.

---

## 3. Login

**File:** `LoginScreen.js`

- **Purpose:** Phone-number entry, step 1 of login.
- **User actions:** 10-digit numeric input (auto-strips non-digits); "Get OTP" button, disabled until 10 digits.
- **Navigation:** `navigate("Otp", { phone })`.
- **API calls: none.** No call to `unified-send-otp` or any endpoint — confirmed via full file read, zero `fetch`/`axios`.
- **Business logic:** Only client-side length check. No regex for valid Indian mobile prefixes. Static "+91" is not a real country selector.
- **Missing UX:** Button "succeeds" for any 10 digits, real or not — no loading state, no error state, because nothing is actually requested.
- **Missing features:** No resend/rate-limit concept here, no working terms/privacy link (plain text, not tappable), no alternate login method.
- **Suggested improvements:** Wire to `POST /api/auth/unified-send-otp`; add loading/error states; disable button during the in-flight request.

---

## 4. OTP

**File:** `OtpScreen.js`

- **Purpose:** 4-digit OTP entry, step 2 of login.
- **User actions:** 4 separate digit boxes with auto-advance focus; "Verify & Continue"; a "Resend" text that **looks tappable (red) but has no `onPress` at all.**
- **Navigation:** On "success," `storage.setItem("userToken", "loggedIn")` → `navigate.replace("Main")`.
- **API calls: none.** No call to `unified-verify-otp`. **Any 4 digits — "0000," "1234," anything — logs the user in.** This is not a simplification of a real check; there is no check.
- **Business logic:** `valid = otp.every(d => d)` — only checks all 4 boxes are non-empty, not that they're correct.
- **Missing UX:** Dead "Resend" control with no cooldown timer; no backspace-to-previous-box; no paste/SMS-autofill support; no wrong-OTP error path (impossible currently, since nothing is verified).
- **Missing features:** No SMS auto-read (Android SMS Retriever / iOS `textContentType="oneTimeCode"`).
- **Suggested improvements:** Wire to `POST /api/auth/unified-verify-otp`; store the real returned token, not a placeholder string; give Resend a real handler with a cooldown; add backspace navigation.

---

## 5. Home

**File:** `HomeScreen.js`

- **Purpose:** Main dashboard — map with simulated nearby ambulances, search bar into booking, 9-tile services grid, promo banner.
- **User actions (exhaustive — 10 total, 6 are dead):**
  1. Hamburger menu — **no `onPress`.**
  2. Location row (styled with a chevron implying "tap to change") — **no `onPress`.**
  3. Notification bell (shows an unread badge unconditionally) — **no `onPress`.**
  4. "SOS" pill, the most visually emphasized button on the screen — **no `onPress`.**
  5. "Nearest Ambulance" card — not touchable; "2 min away" is a hardcoded string, not a calculation.
  6. "Live Tracking" button → `Alert.alert("Live tracking is coming soon.")`, with a comment claiming `TrackingScreen.js was removed` — **stale**, `TrackingScreen.js` exists and is registered.
  7. Search bar → `navigate("DestinationScreen", { gpsCoord, gpsLabel, flow: undefined })` — works.
  8. "View All" — **no `onPress`.**
  9. 9 service cards → work (2 special-cased to `DestinationScreen`, 7 direct `navigate(svc.screen)`).
  10. Promo "Know More →" — **no `onPress`.**
- **Navigation:** → `DestinationScreen` (2 cards) or directly to `AirAmbulance`/`Remains`/`FreezerBox`/`EventAmbulance`/`AntimYatra`/`Train`/`Standby` (7 cards), all with no params.
- **API calls:** Google Geocoding only (`reverseGeocode`), to label the user's GPS position. **No SaveLife backend call at all** on this screen.
- **Business logic:** The 5 "nearby ambulances" are **entirely fabricated** — a fixed seed array jittered every 2 seconds around the user's real GPS position, with no relationship to any real vehicle. Presented with no "simulated" disclaimer.
- **Missing UX:** 6 of 10 interactive-looking controls do nothing (menu, location row, bell, SOS, View All, promo). A first-time user tapping the most emergency-looking button on the screen (SOS) gets no feedback at all.
- **Missing features:** No saved/favorite destination shortcuts on Home; no live nearby-ambulance data; SOS has no dial/booking behavior, unlike the tab bar's own (working) emergency button — two different "emergency" affordances exist in the app, one real, one decorative.
- **Suggested improvements:** Wire SOS to the same `tel:112` pattern already used correctly in `MainTabs.js`; wire "Live Tracking" to the real `Tracking` route when a trip is active; either implement or remove the 5 remaining dead controls; add a "simulated" treatment to the fake ambulance markers — presenting fabricated positions as live data in an ambulance app is a trust concern worth taking seriously.
- **Security note:** Hardcoded Google Maps key `AIzaSyB8wxgXxQxskgUZG868g_4Qdsezr07i9yA` shipped in this file (reused verbatim in at least 5 other screens — see §Appendix C).

---

## 6. Select Service

There is no single dedicated "Select Service" screen — this step is split across two things:

**A. `HomeScreen`'s 9-tile grid** (the live "select a service" moment) — see §5.

**B. `SelectTypeScreen.js` + `BookingWizardScreen.js`** — a **fully-built, unreachable** legacy flow. `SelectTypeScreen` shows a 6-type radio list (BLS/ALS/ICU/Neonatal/Cardiac/Mortuary); `BookingWizardScreen` is a 5-6 step wizard (Location → Vehicle → AC → Staff-if-advanced → Add-ons → Review) with its own real Google Maps integration, draggable pickup/drop markers, and its own independent fare calculator.

- **Confirmed dead:** repo-wide grep for `navigate("SelectType"` returns zero matches anywhere except `App.js`'s own registration.
- **If it were ever revived, it has its own real bugs:** the final confirm step passes only `{ service }` to `Searching` — **every piece of data the wizard just collected (pickup/drop, vehicle, AC, staff, addons, computed fare) is discarded at that boundary.** The fare calculator falls back to a hardcoded `dist ?? 8.4` placeholder distance (acknowledged in the repo's own README as a known placeholder). Vehicle icons are corrupted mojibake (`"ðŸš"`). Two more Google API keys are hardcoded here, one of which (`MAPS_KEY`) is declared and never even used.
- **Suggested improvement:** This is a binary decision, not a tweak — either delete `SelectTypeScreen`/`BookingWizardScreen` and their `App.js` registrations (removes dead code, two exposed API keys, and a maintenance trap for future changes to shared files like `theme/index.js`), or deliberately re-link them as an alternate path and fix the data-loss bug at the `Searching` handoff. Leaving it as-is is the worst of both options.

---

## 7. Pickup & Drop

**Live file:** `DestinationScreen.js` — **Dead alternate:** `LocationSearchScreen.js`

**DestinationScreen (live):**
- **Purpose:** Confirms pickup (GPS, editable), searches/picks a destination, captures who the patient is, sets Now/Schedule.
- **User actions:** Tap pickup to open a "Who needs this ambulance?" sheet then a pickup editor (GPS re-resolve / search / recents); type destination for Places Autocomplete, or pick Favourites (Home/Work, persisted) / Recents / Nearby Hospitals (live Places Nearby Search, 5km); tap Now/Schedule to open a 4-column wheel-picker modal; "Find Ambulance →".
- **Navigation:** → `AmbulanceList` (standard flow) or → `DeadBodyTransport` (flow `"deadbody"`, and — inconsistently — immediately on destination pick rather than after the Find-Ambulance button, unlike every other flow through this screen).
- **API calls:** Google Geocoding, Place Details, Nearby Search, Places Autocomplete (all via a hardcoded key), plus `getRouteInfo()` for real Directions distance/duration with an instant Haversine fallback.
- **Business logic:** Favourites and recents persist via `storage.js` (AsyncStorage wrapper). Schedule wheel-picker disables already-past times for today.
- **Missing UX:** No error/retry UX if GPS fails beyond a static text string; the "tap pickup → two modals deep" flow is a lot of friction for a simple address correction; the deadbody/remains flow-branch inconsistency noted above.
- **Missing features:** No map/pin preview on this screen at all (everything is list-driven); no hospital specialty/ER filtering; **`patientType`/`contactName`/`contactPhone` — captured specifically to answer "who should the driver contact" — are forwarded through every downstream screen and then silently dropped before the `POST /api/trips` call in `ConfirmBookingScreen`.** The entire point of that sheet never reaches the driver.
- **Suggested improvements:** Wire patient/contact info into the trip-creation POST body; add a lightweight route-line map preview; reconcile the deadbody/remains branching inconsistency.

**LocationSearchScreen (dead):** An alternate Uber/Ola-style pickup→drop picker with a mandatory (no-skip) contact sheet and a more robust GPS fallback chain (`getLastKnownPositionAsync` as backup) than the live screen has. Confirmed unreachable — nothing calls `navigate("LocationSearch", ...)` except the screen recursing into its own drop-mode. Worth mining for its GPS-fallback logic even though the screen itself should probably stay retired given `DestinationScreen` already covers the job with favourites/recents this one lacks.

---

## 8. Ambulance List

**Live file:** `AmbulanceListScreen.js` — **Dead alternates:** `AmbulanceSelectScreen.js`, `AmbulanceListScreen.backup.js`

**AmbulanceListScreen (live):**
- **Purpose:** Choose vehicle type with live per-type fares.
- **User actions:** Adjust Now/Schedule (carried over from Destination, re-editable here independently — can silently diverge from what was chosen one screen earlier); tap a vehicle card (disabled if unpriced); "Confirm Type →".
- **Navigation:** → `ConfirmBooking` with pickup/drop coords, distance/duration, schedule, selected type, and the full pricing list.
- **API calls:** `GET /api/pricing` (silent `.catch(() => {})` — a failure just makes every card read "Unavailable" with zero explanation); `getRouteInfo()` for real distance.
- **Business logic:** Excludes body-shifting vehicle types (those have their own flow). Fare via `calcFare()` — DB-driven only, never a hardcoded fallback rate.
- **Missing UX:** No distinction between "this vehicle type genuinely has no service" and "the pricing API is down" — both render identically as "Unavailable." No fare breakdown (base vs distance) shown even though `calcFare` computes them separately.
- **Real bug found:** if `getRouteInfo` and its own Haversine fallback both fail to produce a distance (e.g. missing pickup/drop coords), the screen silently substitutes **`dist ?? 5` and `duration ?? 1200`** — a fabricated 5km/20-minute trip — with no warning, and that fake number flows straight into the fare shown and the eventual backend trip record.
- **Missing features:** No equipment/feature list per vehicle type (exists in the dead `AmbulanceSelectScreen` but not here); no nearby-vehicle-count trust signal; no surge pricing.
- **Suggested improvements:** Give pricing-fetch failure its own distinct, actionable state; port the equipment-checklist feature over from the dead screen; replace the silent `dist ?? 5` fabrication with an explicit "distance unavailable" block on progression.

**AmbulanceSelectScreen (dead) & AmbulanceListScreen.backup.js (dead):** Confirmed unreachable. The Select variant has genuinely nicer content (per-vehicle equipment checklist, a pricing-transparency disclaimer) worth merging into the live screen before deleting it. The `.backup.js` file is a strictly older, strictly worse revision (no pricing-availability guard at all — would crash calling `.toLocaleString()` on a null fare; includes body-shifting vehicles inline where they don't belong; drops `pickupCoord`/`dropCoord` entirely when handing off; a 6am–midnight scheduling blackout) — pure historical cruft, nothing to salvage, safe to delete outright.

---

## 9. Fare Estimate

There is no dedicated fare-estimate screen. Fare is computed and shown inline in two places, both via `src/utils/pricingUtils.js`'s `calcFare(typeId, km, pricingList)` against live `GET /api/pricing` data:

- On **Ambulance List** (§8), per vehicle-type card.
- On **Confirm Booking** (§10), as the final total including AC add-on and round-trip logic.

`calcFare` never falls back to a hardcoded rate — no active/valid Pricing document for a type means that type is simply unavailable, by design. The gap is transparency, not correctness: `calcFare` returns `distFare`/`base` as separate fields, but no screen ever displays that breakdown — the user only ever sees one lump total, both pre-booking and (per §13) even after the trip completes.

**Suggested improvement:** Surface the existing base/distance-fare split in the UI rather than computing it and discarding it.

---

## 10. Confirm Booking

**File:** `ConfirmBookingScreen.js`

- **Purpose:** Final review — trip type (One Way/Round Trip), optional different return address, AC add-on, computed total, and the actual `POST /api/trips` call.
- **User actions:** Toggle One Way/Round Trip; toggle "Same as Pickup" for the return leg or search a different one; toggle AC (only if the backend Pricing doc for this type defines an AC rate); "Confirm Booking."
- **Navigation:** → `Searching` with `{ tripId, ... }` on success.
- **API calls:** `GET /api/pricing` (skipped if already passed in from the previous screen); `getRouteInfo()` for the return leg if a different address is chosen; and the real trip-creation call:
  ```
  POST https://api.savelife.health/api/trips
  { pickupLabel, pickupLat, pickupLng, dropLabel, dist, effectiveDist, duration,
    selectedType, scheduleType, scheduleDate, tripType, returnAddress, acEnabled }
  ```
  Confirmed: **no `patientType`/`contactName`/`contactPhone`, no `paymentPreference`** in this body — the first two were captured screens ago and dropped (§7); there is no payment-method UI on this screen at all, so `paymentPreference` simply never exists in this flow's state to send.
- **Business logic:** Round-trip distance defaults to `dist × 2`, upgraded to a real Directions-computed return leg only when a specific different address resolves successfully via Google (explicit design rule: never trust a non-Google/fallback result for this calculation).
- **Missing UX — the most important finding for this screen:** **`handleConfirm` has no loading state and no double-submit guard.** Nothing disables the button or shows a spinner while the POST is in flight. In an emergency-booking context, where a stressed user is exactly the kind of person likely to tap twice, this can plausibly create duplicate trip records.
- **Missing features:** No payment-method selection UI anywhere on this screen (§ the payment-preference field exists on the backend and is simply never populated by this app); no fare breakdown; no promo code; no special-instructions field for dispatch.
- **Confirmed structural problem — this screen is a shared terminal point for four incompatible upstream param shapes:** it's reached from `AmbulanceListScreen` (safe, full data), `DeadBodyTransportScreen` (no pickup/drop coordinates), `RemainsScreen` (dist:0, **empty pricingList**), and the dead `AmbulanceSelectScreen`. Because `calcFare` always returns `available:false` for an empty pricing list, **any booking arriving via `RemainsScreen` permanently dead-ends here — the Confirm button can never become enabled for that flow.** This is a real, live bug, not a hypothetical.
- **Suggested improvements:** Add a loading/disabled state during submission (highest-priority fix on this screen); populate `patientType`/`contactName`/`contactPhone` in the POST body; fix the `RemainsScreen` dead-end by giving that flow its own real pricing data or its own dedicated confirm path instead of routing through a screen that assumes ambulance-style pricing; add a payment-method step.

---

## 11. Searching Driver

**File:** `SearchingScreen.js`

- **Purpose:** "Finding your ambulance" interstitial, polls until a driver is assigned.
- **User actions:** "Cancel Booking" → `navigate("Main")`; "Need Help? Contact Support" → a placeholder `Alert`.
- **Navigation:** → `Tracking` via `navigation.replace()` once `trip.driver` exists or status is in `["dispatched","en_route","completed","cancelled"]`.
- **API calls:** `GET /api/trips/:id/track`, polled every 3000ms.
- **Business logic:** A 5-step visual timeline ("Confirmed / Finding / Contacting / Assigned / Tracking") exists but its active-step index is **hardcoded to "Finding" and never actually driven by the real polled status** — cosmetic only.
- **Missing UX — confirmed real gap:** **Cancel Booking does not call the backend at all.** It only navigates away; the trip stays open server-side in whatever state it was in. (Contrast with `TrackingScreen`, one screen later, which *does* correctly call the real cancel endpoint added this session.) "Need Help" is a dead-end alert.
- **Missing features:** No timeout/escalation if no driver is found after an extended wait; no push-token registration despite the backend endpoint existing, so a backgrounded app gets no update.
- **Suggested improvements:** Wire Cancel to `PUT /api/trips/:id/customer-cancel` (the same endpoint `TrackingScreen` already uses correctly) before navigating away; drive the timeline from real `trip.status`; add a search-timeout state.

---

## 12. Driver Assigned

There is no dedicated "Driver Assigned" screen or moment. The transition happens invisibly: `SearchingScreen` detects `trip.driver` exists (or a status change) mid-poll and immediately `navigation.replace()`s straight into `TrackingScreen` — there's no distinct "a driver has accepted!" confirmation beat, no driver photo/name reveal animation, nothing that marks this as a distinct, reassuring moment in an emergency flow. It's arguably one of the more valuable "missing UX" moments in the entire app precisely because of the context (a person just found out an ambulance is coming).

- **Suggested improvement:** A brief, dedicated transition state (even a 1-2 second "Driver assigned" reveal with name/photo/vehicle before sliding into the live map) would give this moment the weight it deserves relative to how the rest of the app is paced.

---

## 13. Live Tracking

**File:** `TrackingScreen.js`

- **Purpose:** Live map, driver/vehicle card, pickup OTP, addresses, fare, cancel/helpline — the main "ambulance is coming" screen. (This screen received substantial work earlier this session — the analysis below reflects its current, already-improved state.)
- **User actions:** Back, share (via `Share.share`, includes a `savelife://track/:id` deep link), call driver, "Helpline" (currently a placeholder — no real support number exists anywhere in the app yet), Cancel Booking (reason picker → real cancel call).
- **Navigation:** Entered via `replace()` from Searching; exits to `Main`.
- **API calls:** `GET /api/trips/:id/track` every 5000ms (now returns driver rating/trip-count, live driver location, ETA/distance-to-pickup, a route polyline, and — once completed — a full bill breakdown); `PUT /api/trips/:id/customer-cancel` — **confirmed correctly wired**, with proper loading/error states in the cancel modal.
- **Confirmed NOT yet wired in** (endpoints exist server-side, unused here): `PUT /api/trips/:id/rate`, `GET/POST /api/trips/:id/customer-messages`, `POST /api/trips/:id/payment/order` + `/verify`, `PUT /api/trips/:id/push-token`.
- **Business logic:** "Paramedic on board" is inferred client-side from vehicle type (no backend field for this exists); driver rating display correctly distinguishes "New driver" (zero ratings) from a real average; route polyline is throttled to avoid excessive Directions API calls as the driver moves.
- **Missing UX — the most consequential gap in the whole app:** **no rating/feedback UI, no bill-breakdown display, no in-app chat, and no distinct "Trip Completed" screen at all**, despite the backend now supporting every one of these. On completion, the screen just relabels the status text; the user is left looking at the same map with nothing to do.
- **Missing features:** No payment collection UI (Razorpay endpoints exist, unused); no driver photo; no push-token registration (so a backgrounded app during a live emergency gets no update).
- **Suggested improvements:** Build a distinct completed-trip state that shows the bill, prompts a rating, and offers payment; add a chat surface; register for push on mount; replace the helpline placeholder once a real number exists.

---

## 14. Trip Completed

There is no dedicated screen for this — see §13's "Missing UX." `TrackingScreen`'s only acknowledgment of completion is swapping its status label to "Trip Completed" (`STATUS_LABELS.completed`) and hiding the Cancel button. Everything else — the bill breakdown the backend now returns, a rating prompt, a payment action, a "book again" or "return home" CTA — is absent. This is the single highest-value screen to build next given how much backend groundwork already supports it.

---

## 15. Profile

**File:** `ProfileScreen.js`

- **Purpose:** Account/profile — identity card, saved addresses, settings list.
- **User actions:** Only the "Language" row does anything (cycles through 6 languages via a shared context). **The other 5 settings rows — Medical Information, Payment Methods, Insurance, Rate & Feedback, Help & Support — have no `onPress` at all.** Tapping them produces zero feedback, not even a placeholder alert, which reads as more broken than an explicit "coming soon."
- **Navigation:** None — this screen never calls `navigate()` to anything, including to `FamilyScreen` (which has no entry point anywhere in the app; see §0).
- **API calls:** None. Name, phone, and all 3 saved addresses are hardcoded literals.
- **Missing UX:** No edit capability for any profile field; no logout button anywhere in the file; 5 of 6 settings rows are silently dead.
- **Missing features:** No real address book (contrast with the fully-built `FamilyScreen`, sitting unused); no medical-info intake (allergies, blood type — relevant for an ambulance app and currently absent everywhere in the codebase, not just here).
- **Suggested improvements:** Give every settings row either a real destination or an explicit "coming soon," consistent with the pattern used elsewhere; source identity data from a real profile API; add a "Family Members" row here linking to the orphaned `FamilyScreen`; add logout.

---

## 16. History

**File:** `TripsScreen.js`

- **Purpose:** Booking history list.
- **User actions:** "Rebook →" is rendered on every card but is plain `Text`, not a touchable — **it has no `onPress` at all**, despite visually implying an action.
- **Navigation:** None — cards aren't tappable, screen doesn't accept a `navigation` prop.
- **API calls:** None. `HISTORY` is a hardcoded array of exactly 3 fake trips (May/April 2026 dates) — **every user sees the identical 3 trips forever**, regardless of their real activity. Every status badge is hardcoded to the literal string `"Completed"`.
- **Missing UX:** No empty state, no refresh, no per-trip detail view, no real data at all.
- **Missing features:** No connection to any real trip-history endpoint; no receipt access; no rebooking flow (despite the button implying one); no filter/search.
- **Suggested improvements:** Replace the hardcoded array with a real fetch scoped to the logged-in user; make cards tappable to a detail/receipt view; wire "Rebook" to actually prefill a new booking.

---

## 17. Emergency SOS

There is no dedicated SOS screen, and — importantly — **there are two different, inconsistent implementations of "emergency" in this app:**

1. **`MainTabs.js`'s floating center tab-bar button** — genuinely functional: `Linking.openURL("tel:112")` dials India's real emergency number directly. This works correctly today, with no confirmation step (a single mis-tap dials 112 immediately — arguably correct for genuine emergencies, but worth being a deliberate choice rather than an accident).
2. **`HomeScreen`'s red "SOS" pill** — the most visually emphasized button on the entire Home screen (red, badge-styled, top of screen) — **has no `onPress` handler at all.** It does nothing.

A user who has seen the working tab-bar button and then taps the visually-louder Home-screen SOS button in a real emergency will get silence. This is worth fixing before almost anything else in this document given the product category.

- **Suggested improvement:** Wire Home's SOS button to the same `tel:112` pattern already proven correct in `MainTabs.js`, or repurpose it to jump straight into the booking flow if that's the intended distinction between the two buttons — but the two must not continue to differ in whether they actually do anything.

---

## 18. Freezer Box

**Files:** `FreezerBoxScreen.js` (location + tier picker) → `FreezerBoxBookingScreen.js` (checkout)

- **Purpose:** Book a mortuary freezer box for delivery to a location, with duration and floor-access pricing.
- **User actions:** Screen 1 — drag-pin map or search an address, pick a box tier (Normal/Standard/VIP), set Now/Schedule via a custom wheel picker. Screen 2 — pick a live-priced Duration and Floor option, review a computed bill, enter name/phone, "Confirm Booking."
- **Navigation:** Screen 2 has no forward navigation after "confirmed" — it's a dead-end modal with only a Cancel option.
- **API calls:** `GET /api/freezer/durations` and `GET /api/freezer/floors` — **real, live, working.** But: **`CITY` is hardcoded to `"Bengaluru"`** on screen 2, ignoring the actual resolved city captured from the user's real pin on screen 1 — every delivery anywhere gets Bengaluru pricing regardless of where it's actually going.
- **Confirmed: `POST /api/trips` (or any creation endpoint) is never called.** `handleSubmit` builds a complete order payload and does `console.log(...)` with it, then shows a **fully-animated fake "searching → driver assigned" sequence** with a hardcoded driver name ("Ravi Kumar"), plate ("KA-01-AB-1234"), rating (4.9), and ETA (5 min) via a local 3-second `setTimeout`. **Visually indistinguishable from a real booking confirmation. No record is ever created anywhere.** The Call/Message buttons on this fake "assigned" card also have no `onPress` at all.
- **Also confirmed dead:** `src/utils/freezerPricing.js` — a full local mock pricing engine, unreferenced anywhere in the app, superseded by the real endpoints above but never deleted.
- **Missing UX:** Two separate near-identical error boxes/retry buttons if both duration and floor fetches fail; the Confirm button enables before phone/name are validated, only erroring at click-time.
- **Missing features:** No real order persistence (the core gap), no tracking, no receipt.
- **Suggested improvements:** Wire `handleSubmit` to a real order-creation endpoint mirroring `ConfirmBookingScreen`'s pattern; use the real resolved city instead of a hardcoded one; delete the dead `freezerPricing.js`; give the Call/Message buttons real handlers or remove them.

---

## 19. Air Ambulance

**File:** `AirAmbulanceScreen.jsx`

- **Purpose:** Enquiry form for air ambulance requests (domestic/international, aircraft type, conditions, equipment, staff).
- **User actions:** A large, detailed multi-section form; "Request Air Ambulance."
- **Navigation:** On submit, a generic success `Alert` → `goBack()` to Home. No confirmation screen, no reference number.
- **API calls: none.** Confirmed — no `fetch`/`axios` anywhere. Everything collected (conditions, equipment, staff, dates, contact) is validated locally, then **discarded** — not even logged.
- **Business logic:** Only name/pickup-airport/drop-airport/phone are actually required; no phone-format validation.
- **Missing UX:** A large form's worth of user effort vanishes into a generic alert with no trace anywhere.
- **Missing features:** No lead persistence (the core gap — the promised "team will call within 15 minutes" has no record to call about), no reference number, no pricing estimate at all.
- **Suggested improvements:** Wire to a real lead-capture endpoint so submitted requests actually exist somewhere; give the user a reference number.

---

## 20. Train Ambulance

**File:** `TrainAmbulanceScreen.js`

- **Purpose:** Enquiry form for train-based long-distance medical transport, structurally similar to Air Ambulance but simpler.
- **User actions:** Patient info, condition chips, pickup/drop city, train type, date, time preference, medical staff toggle, notes, submit.
- **Navigation:** Same generic-alert-then-goBack pattern as Air Ambulance.
- **API calls: none.** Confirmed — identical "collect then discard" pattern.
- **Missing UX — worse than Air Ambulance's version of this screen:** **this form has no phone number field at all.** The success message says "our medical team will call you for confirmation," but there is no number anywhere on the screen for anyone to call.
- **Missing features:** Same lead-persistence gap as Air Ambulance, compounded by the missing contact field.
- **Suggested improvements:** Add a required phone field (the single most severe individual defect found across the whole enquiry-screen cluster); wire to a real backend endpoint.

---

## 21. Dead Body Transport

**File:** `DeadBodyTransportScreen.js`, plus a related-but-distinct sibling cluster worth understanding together: `AntimYatraScreen.js`, `RemainsScreen.js`, `StandbyScreen.js`.

**Important clarification found in the code:** these four are **not** a single funnel with a menu screen branching into the others. They're four separately-entered, largely independent flows that happen to share a "body/funeral/standby" theme:

- **DeadBodyTransportScreen** — reachable only via `DestinationScreen` (`flow:"deadbody"`), since it needs a real pickup/drop pair. Picks between two body-shifting vehicle types (Mini/Tempo) with live DB pricing, then → `ConfirmBooking` → a **real trip** (this is the one screen in this cluster that actually reaches the real backend, via the shared `ConfirmBookingScreen`).
- **AntimYatraScreen** ("last rites" hearse booking) — its own self-contained 3-step wizard, entered directly from Home. **Confirmed: real Basic/Standard/Luxury hearse pricing tiers exist and are correctly fetched live** — but the final "Request" button only shows a local alert; no booking is ever created, and there's no contact-phone field despite promising a callback.
- **RemainsScreen** ("Air Cargo Body Transport" on-screen, labeled "Air Cargo" on the Home tile, routed as `"Remains"` — three different names for one screen) — a plain-text enquiry form for shipping remains via air cargo, with **no API calls of any kind**, that hands off to `ConfirmBooking` with `dist:0` and an **empty pricing list** — which, per §10, means it permanently dead-ends at the Confirm button.
- **StandbyScreen** (B2B contract ambulance rental) — fully independent 4-step wizard, no pricing logic by design (explicitly deferred to a human quote), **no API call of any kind** — the entire form's data is discarded on submit.
- A dead, orphaned branch exists in `DestinationScreen` for a `flow==="remains"` case that actually routes to `DeadBodyTransport` — nothing in the app ever sets that flow value, so it's unreachable leftover from an earlier design.

- **Suggested improvements:** Wire Antim Yatra's and Standby's submissions to a real leads/enquiry endpoint (the pricing work behind Antim Yatra is real and shouldn't be wasted on a screen that then throws the result away); fix Remains's `pricingList:[]` dead-end by giving it its own pricing path rather than routing through the ambulance-shaped `ConfirmBookingScreen`; add a contact-phone field to Antim Yatra; reconcile the three different names for the Remains screen/route/tile.

---

## Appendix A — Screens that exist but weren't in your list of 20

- **`FamilyScreen.js`** — fully built family-member + per-member saved-address CRUD, with the explicit stated purpose "book ambulances for them quickly." **Not registered in any navigator, not linked from anywhere, including `ProfileScreen`.** No persistence either (local state only, lost on reload) even if it were reachable. The single most complete "wasted" feature found in this audit.
- **`WalletScreen.js`** — balance/top-up/transactions UI with full visual polish. Confirmed 100% non-functional: balance is permanently ₹0, "Add Money" → `handleProceed()` is an explicit code-commented stub ("Payment gateway coming soon. Balance not updated."), and 3 of 4 quick-action tiles (Statement/Offers/Security) have no handler. This is the most convincingly "real-looking" non-functional screen in the app.
- **`EventAmbulanceScreen.js`** — enquiry form for standby-at-events ambulances (weddings, marathons, concerts). Same enquiry-only pattern as Air/Train (no API call, data discarded). Has a real latent bug: its default `ambulanceType` state (`"bls"`) doesn't match any real option id (`BLS_VAN`/`BLS_TEMPO`/`ALS`/`ACLS`), so no card appears selected on first render despite one being marked "recommended." Also has an unreachable `catch` block in its submit handler, giving a false impression of error handling.
- **`SelectTypeScreen.js` / `BookingWizardScreen.js`** — see §6.
- **`AmbulanceSelectScreen.js` / `LocationSearchScreen.js` / `AmbulanceListScreen.backup.js`** — see §7/§8.

## Appendix B — Shared utils & theme

- **`src/theme/index.js`** — single light theme only, no dark mode anywhere in the app. Exports a working `COLORS` palette (used in 30 files) alongside several **dead exports**: `t()` (a translation helper, never called anywhere despite `LANGUAGES` populating a real picker in Profile — the app is English-only in practice), a `SERVICES` array that disagrees with and is superseded by `HomeScreen`'s own local copy, and a `getBookingConfig()` whose vehicle icons are corrupted mojibake.
- **`src/utils/pricingUtils.js`** — `calcFare()`, the one real, DB-only fare engine used everywhere pricing actually works. Never falls back to a hardcoded rate by design.
- **`src/utils/routeUtils.js`** — `getRouteInfo()`, real Google Directions with a Haversine fallback and an in-memory cache; used by 8 files.
- **`src/utils/freezerPricing.js`** — confirmed entirely dead/unreferenced.
- **`src/utils/ambulanceCatalog.js`** — cosmetic vehicle metadata (badges/ETA/color), not the real pricing source; incomplete for several vehicle types.
- **`src/utils/storage.js`** — AsyncStorage wrapper with an in-memory fallback for Expo Go/dev-client (meaning "logged in" state doesn't survive a JS reload in that mode — worth knowing when testing persistence).

## Appendix C — Every hardcoded API key found

The identical Google Maps/Places/Directions/Geocoding key `AIzaSyB8wxgXxQxskgUZG868g_4Qdsezr07i9yA` is hardcoded in at least **9 separate files**: `HomeScreen.js`, `BookingWizardScreen.js`, `DestinationScreen.js`, `LocationSearchScreen.js`, `AmbulanceListScreen.js`, `AmbulanceSelectScreen.js`, `AmbulanceListScreen.backup.js`, `ConfirmBookingScreen.js`, `FreezerBoxScreen.js`, `EventAmbulanceScreen.js`, `DeadBodyTransportScreen.js`, `AntimYatraScreen.js`, `RemainsScreen.js` (no — Remains makes no API calls), and `routeUtils.js`. A second, unused key (`AIzaSyDbfZSXgpZqZy3pzyt2Is0b1YWZQduy8dY`) is also hardcoded in `BookingWizardScreen.js` and declared but never called. All are shipped in plaintext in the client bundle.

## Appendix D — Every confirmed dead-end `onPress` (no handler, or placeholder-only)

- **HomeScreen:** hamburger menu, location row, notification bell, SOS button, "View All", promo "Know More →" (no handler); "Live Tracking" (placeholder alert with a stale comment).
- **OtpScreen:** "Resend" (styled as a link, no handler).
- **ProfileScreen:** Medical Information, Payment Methods, Insurance, Rate & Feedback, Help & Support (no handler).
- **TripsScreen:** "Rebook →" on every card (no handler).
- **WalletScreen:** Statement, Offers, Security quick-action tiles (no handler); "Add Money" is an explicit stub.
- **FreezerBoxBookingScreen:** Call/Message buttons on the fake driver card (no handler).
- **SearchingScreen:** "Need Help? Contact Support" (placeholder alert only).
- **TrackingScreen:** Helpline button (placeholder — no real number exists anywhere in the app to wire it to yet).
