"use client";
/**
 * Push notifications via FCM — Phase 4 W10.
 *
 * What is and is not wired up
 * ---------------------------
 * The client half is complete: permission request, registration, token
 * retrieval, and handlers for a notification arriving in the foreground and
 * for the user tapping one.
 *
 * The server half is not, and that is a deliberate stopping point rather than
 * an oversight. Sending an FCM message needs a Firebase project, a service
 * account credential on the backend, and `google-services.json` in the Android
 * app — none of which this project has, and all of which are accounts someone
 * has to create. `registerDeviceToken` therefore posts the token nowhere yet;
 * it logs it, and the release checklist in
 * docs/plan/phase4-android-release.md lists exactly what has to exist before
 * this path can deliver anything.
 *
 * The in-app notification feed (W5) works today and is unaffected — push is
 * an additional delivery channel for the same notifications, not a
 * replacement.
 */
import { hasPlugin, isNative } from "./platform";

export type PushHandlers = {
  /** A notification arrived while the app was open. */
  onForeground?: (title: string, body: string) => void;
  /** The user tapped a notification. `data` carries the server's routing hint. */
  onTap?: (data: Record<string, unknown>) => void;
};

let initialised = false;

/**
 * Register for push and attach handlers. Safe to call on the web, where it
 * returns immediately.
 *
 * Returns the FCM token when registration succeeded, else null.
 */
export async function initPush(handlers: PushHandlers = {}): Promise<string | null> {
  if (!isNative() || !hasPlugin("PushNotifications")) return null;
  // Guard against double registration across React re-mounts, which would
  // attach duplicate listeners and fire every handler twice.
  if (initialised) return null;
  initialised = true;

  const { PushNotifications } = await import("@capacitor/push-notifications");

  const status = await PushNotifications.checkPermissions();
  let granted = status.receive === "granted";
  if (!granted && status.receive === "prompt") {
    const asked = await PushNotifications.requestPermissions();
    granted = asked.receive === "granted";
  }
  // A denied permission is a normal outcome, not an error. Android 13+ shows a
  // system prompt and riders decline it; the in-app feed still works.
  if (!granted) return null;

  return new Promise<string | null>((resolve) => {
    let settled = false;

    PushNotifications.addListener("registration", (token) => {
      if (!settled) {
        settled = true;
        resolve(token.value);
      }
      void registerDeviceToken(token.value);
    });

    PushNotifications.addListener("registrationError", (err) => {
      // Almost always a missing or malformed google-services.json.
      console.warn("[push] registration failed", err);
      if (!settled) {
        settled = true;
        resolve(null);
      }
    });

    PushNotifications.addListener("pushNotificationReceived", (notification) => {
      handlers.onForeground?.(
        notification.title ?? "Rydr",
        notification.body ?? ""
      );
    });

    PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      handlers.onTap?.(action.notification.data ?? {});
    });

    void PushNotifications.register();
  });
}

/**
 * Hand the device token to the backend so it can target this device.
 *
 * Not implemented: there is no endpoint yet, because there is no Firebase
 * project to send from. When one exists this becomes a POST to a
 * `/api/devices` endpoint storing (user_id, token, platform), and the token
 * has to be re-sent on every app start — FCM rotates tokens, and a stale one
 * silently drops messages.
 */
async function registerDeviceToken(token: string): Promise<void> {
  console.info(
    "[push] device token acquired; no backend endpoint yet",
    token.slice(0, 12) + "…"
  );
}
