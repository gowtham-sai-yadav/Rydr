import { Platform } from "react-native";

// The Android emulator can't reach the host machine via `localhost` — it has
// to go through the special `10.0.2.2` alias. iOS simulator and web share
// the host's network namespace, so `localhost` works there. A physical
// device needs the host's real LAN IP, which is why this is overridable via
// EXPO_PUBLIC_API_URL (set it in `.env` when running on a real phone).
const DEV_DEFAULT = Platform.OS === "android" ? "http://10.0.2.2:8000" : "http://localhost:8000";

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || DEV_DEFAULT;
export const TOKEN_KEY = "ryder_token";
