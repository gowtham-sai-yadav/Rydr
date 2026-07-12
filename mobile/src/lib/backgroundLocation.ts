import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE_URL } from "./constants";
import { getStoredToken } from "./api";

// TaskManager tasks must be defined at module scope, before any component
// mounts — the OS can relaunch this callback in a background JS context
// with no component tree at all, so it can't reach a live WebSocket ref
// or React state. It reads the active ride id from AsyncStorage (set by
// startBackgroundTracking/stopBackgroundTracking below) and posts each
// location straight to the REST twin of the WS position message
// (POST /api/rides/{id}/live/position — see backend/app/routers/live.py).
export const BACKGROUND_LOCATION_TASK = "rydr-background-location";
const ACTIVE_RIDE_KEY = "rydr_active_live_ride_id";

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) return;
  const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
  if (!locations || locations.length === 0) return;

  const rideId = await AsyncStorage.getItem(ACTIVE_RIDE_KEY);
  if (!rideId) return;

  const token = await getStoredToken();
  if (!token) return;

  const latest = locations[locations.length - 1];
  try {
    await fetch(`${API_BASE_URL}/api/rides/${rideId}/live/position`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        lat: latest.coords.latitude,
        lng: latest.coords.longitude,
        speed_kmh: latest.coords.speed != null && latest.coords.speed >= 0 ? latest.coords.speed * 3.6 : null,
      }),
    });
  } catch {
    // Best-effort — the next background tick (or foreground reconnect)
    // catches up. Nothing to retry from a detached task context.
  }
});

/**
 * Starts background location updates for a ride. Requests background
 * permission on top of foreground (a separate OS prompt on iOS/Android
 * 10+); silently no-ops the background upgrade if denied — the caller's
 * existing foreground watchPositionAsync keeps working either way, so
 * declining "always" just means tracking pauses when the app backgrounds
 * instead of failing outright.
 */
export async function startBackgroundTracking(rideId: string): Promise<boolean> {
  await AsyncStorage.setItem(ACTIVE_RIDE_KEY, rideId);

  const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
  if (bgStatus !== "granted") return false;

  const alreadyRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false);
  if (alreadyRunning) return true;

  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 8000,
    distanceInterval: 15,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "Rydr is tracking your ride",
      notificationBody: "Sharing your live position with the group.",
    },
  });
  return true;
}

export async function stopBackgroundTracking(): Promise<void> {
  await AsyncStorage.removeItem(ACTIVE_RIDE_KEY);
  const running = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false);
  if (running) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  }
}
