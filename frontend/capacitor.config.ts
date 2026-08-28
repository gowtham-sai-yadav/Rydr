import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor configuration — Phase 4 W9.
 *
 * `webDir: "out"` is the Next static export, produced by
 * `NEXT_OUTPUT=export npm run build`. That build mode exists because
 * Capacitor serves files from the device filesystem and has no Node runtime;
 * see next.config.ts and lib/routes.ts for why every route had to become
 * statically exportable first.
 *
 * The API base URL is baked into the bundle at build time
 * (NEXT_PUBLIC_API_URL), so a debug build pointing at a laptop and a release
 * build pointing at staging are genuinely different builds. That is called
 * out in the release checklist rather than left to be discovered when a
 * store build cannot reach the backend.
 */
const config: CapacitorConfig = {
  appId: "com.rydr.app",
  appName: "Rydr",
  webDir: "out",

  server: {
    // https rather than the default http scheme. The webview origin becomes
    // https://localhost, which means localStorage — where the JWT lives —
    // persists across app restarts and is not treated as an insecure origin;
    // under the http scheme some APIs are restricted and the origin can be
    // wiped.
    androidScheme: "https",

    // Deliberately no `url`. Pointing Capacitor at a hosted URL would make
    // the app a browser wrapper with no offline shell, and Play review
    // sometimes flags exactly that. The bundle ships inside the APK; only API
    // calls go over the network.
    //
    // For local development against a laptop, set `url` to your LAN address
    // and `cleartext: true` — and note that cleartext HTTP to a private
    // address also needs a network-security-config exception, which
    // androidScheme alone does not grant.
    // url: "http://192.168.1.10:3000",
    // cleartext: true,
  },

  plugins: {
    SplashScreen: {
      // Hidden explicitly from app code once the first screen has data, rather
      // than on a timer — a fixed duration is either a stall on a fast device
      // or a white flash on a slow one.
      launchAutoHide: false,
      backgroundColor: "#000000",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
    PushNotifications: {
      // Badge only. Sound and alert presentation are decided per notification
      // by the server payload.
      presentationOptions: ["badge"],
    },
  },
};

export default config;
