import { API_BASE_URL, TOKEN_KEY } from "./constants";

/**
 * Derives a ws:// or wss:// URL from the same API_BASE_URL config the REST
 * client uses, and appends the caller's JWT as a query param (the chat WS
 * endpoint contract: `wss://<api-host>/api/chat/groups/{id}/ws?token=<jwt>`).
 */
export function buildWsUrl(path: string): string {
  const httpUrl = new URL(path, API_BASE_URL);
  httpUrl.protocol = httpUrl.protocol === "https:" ? "wss:" : "ws:";
  const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  if (token) {
    httpUrl.searchParams.set("token", token);
  }
  return httpUrl.toString();
}

export function chatGroupWsUrl(groupId: string): string {
  return buildWsUrl(`/api/chat/groups/${groupId}/ws`);
}

export function liveRideWsUrl(rideId: string): string {
  return buildWsUrl(`/api/rides/${rideId}/live/ws`);
}
