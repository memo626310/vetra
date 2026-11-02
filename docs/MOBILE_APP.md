# VETRA mobile app (Android + iOS)

VETRA is prepared to ship as one Android and iOS app with Capacitor. The app
uses the deployed Next.js site as its web runtime, so clinic accounts, Supabase
authentication, API routes, uploads, and push notifications keep the same
behavior as the web dashboard.

## First-time setup

Install Node.js 20+, Android Studio with an Android SDK, and Xcode 15+ on macOS
for iOS builds. Then install Capacitor and create the native projects:

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios @capacitor/splash-screen @capacitor/status-bar
npm run mobile:add
```

The `android/` and `ios/` folders are created by `mobile:add` and should be
committed after setup so CI and the release team build the same app.

## Sync and run

Set the deployed app URL. Use HTTPS for release builds:

```powershell
$env:CAP_SERVER_URL = "https://app.vetra.top"
npm run mobile:sync
npm run mobile:open:android
# or on macOS:
npm run mobile:open:ios
```

For local device work, use a URL reachable from the phone (for example the
computer's LAN IP). Keep production on HTTPS.

## Release checklist

1. Set `CAP_SERVER_URL` to the production VETRA URL and run `npm run mobile:sync`.
2. Set the Android application ID / iOS bundle identifier to the store-owned identifiers if needed.
3. Add the VETRA app icon and splash assets in Android Studio/Xcode.
4. Configure push notification entitlements and signing profiles for each store.
5. Test login, clinic switching, file uploads, camera/barcode flows, invoices, and push notifications on physical devices.
