// app.config.js
// ================================================================
// Dynamic override layer on top of app.json — Expo evaluates app.json
// first, then passes the resulting config into this function's `config`
// argument, and uses whatever this returns as the final config. Only
// the Google Maps Android API key needs to be dynamic (injected from
// an EAS Environment Variable at build time, never committed to git);
// everything else stays exactly as defined in app.json.
//
// Locally (expo start / expo prebuild without EAS), this reads from
// the shell environment — export GOOGLE_MAPS_ANDROID_API_KEY=... first,
// or the Android map simply won't render. On EAS Build, the value
// comes from the EAS Environment Variable of the same name (visibility:
// secret) — see the setup commands in the PR/commit message.
// ================================================================
module.exports = ({ config }) => {
  return {
    ...config,
    android: {
      ...config.android,
      config: {
        ...config.android.config,
        googleMaps: {
          apiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY,
        },
      },
    },
  };
};
