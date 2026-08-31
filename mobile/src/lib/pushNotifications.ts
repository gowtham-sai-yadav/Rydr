import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { api } from "./api";

// Foreground behavior: still show an alert + play a sound even while the
// app is open, rather than the OS default of silently swallowing it.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Requests permission and registers this device's Expo push token with
 * the backend. Call once after login/signup and once on app launch if
 * already authenticated (AuthContext does both).
 *
 * Two things this can't do anything about, both flagged rather than
 * silently failing weirdly:
 *  - Push notifications require a real device (the simulator/emulator
 *    has no APNs/FCM channel) - `Device.isDevice` gates this.
 *  - `getExpoPushTokenAsync` needs a real EAS project id
 *    (app.json `extra.eas.projectId`), which only exists after running
 *    `eas init` under a logged-in Expo account - until then this no-ops.
 *  - As of recent Expo SDKs, remote push simply doesn't deliver inside
 *    Expo Go at all - a development or production build is required to
 *    actually receive one, even once the token registers fine.
 */
export async function registerForPushNotifications(): Promise<void> {
  if (!Device.isDevice) return;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") return;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return; // no EAS project linked yet - nothing to register with

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.registerPushToken({ token, platform: Platform.OS });
  } catch {
    // Best-effort - a missing/invalid push token should never block login.
  }
}
