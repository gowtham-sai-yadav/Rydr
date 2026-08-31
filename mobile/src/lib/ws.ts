import { API_BASE_URL } from "./constants";
import { getStoredToken } from "./api";

/**
 * Derives a ws:// or wss:// URL from the same API_BASE_URL config the REST
 * client uses, and appends the caller's JWT as a query param (the chat WS
 * endpoint contract: `wss://<api-host>/api/chat/groups/{id}/ws?token=<jwt>`).
 *
 * Builds the URL by string substitution rather than the WHATWG `URL` class —
 * React Native's built-in URL polyfill has historically been unreliable for
 * relative-to-base resolution, and API_BASE_URL is always an absolute
 * http(s) URL here anyway, so a straight prefix swap is simpler and safer.
 */
export async function buildWsUrl(path: string): Promise<string> {
  const wsBase = API_BASE_URL.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
  const token = await getStoredToken();
  const sep = path.includes("?") ? "&" : "?";
  return token ? `${wsBase}${path}${sep}token=${encodeURIComponent(token)}` : `${wsBase}${path}`;
}

export function chatGroupWsUrl(groupId: string): Promise<string> {
  return buildWsUrl(`/api/chat/groups/${groupId}/ws`);
}

export function liveRideWsUrl(rideId: string): Promise<string> {
  return buildWsUrl(`/api/rides/${rideId}/live/ws`);
}
