/**
 * Route builders — Phase 4 W9.
 *
 * Every internal link to a record-scoped page goes through this module.
 *
 * Why query parameters instead of path segments
 * ---------------------------------------------
 * Capacitor bundles a static export of the frontend. Next's
 * `output: "export"` refuses a dynamic route segment without
 * `generateStaticParams`, and Rydr's segments are all runtime UUIDs with no
 * build-time list — there is no set of destination ids to prerender. So the
 * record id moves into the query string, which the export handles because
 * there is exactly one HTML file per route regardless of how many records
 * exist.
 *
 * The cost is plainer URLs on the web. The alternative was two builds with
 * two route shapes to keep in sync, which is a larger and quieter failure:
 * a link that works in the browser and 404s in the Android shell.
 *
 * Centralising the builders means the shape is changed in one place, and a
 * missed call site is a compile error rather than a dead link.
 */

export const routes = {
  destinations: "/destinations",
  destination: (id: string) => `/destinations/detail?id=${encodeURIComponent(id)}`,
  newDestination: "/destinations/new",

  rides: "/rides",
  ride: (id: string) => `/rides/detail?id=${encodeURIComponent(id)}`,
  rideLog: (id: string) => `/rides/log?id=${encodeURIComponent(id)}`,
  createRide: "/rides/create",

  chat: "/chat",
  chatRoom: (id: string) => `/chat/room?id=${encodeURIComponent(id)}`,

  user: (id: string) => `/users/detail?id=${encodeURIComponent(id)}`,
  userFollowers: (id: string) => `/users/followers?id=${encodeURIComponent(id)}`,
  userFollowing: (id: string) => `/users/following?id=${encodeURIComponent(id)}`,

  feed: "/feed",
  leaderboard: "/leaderboard",
  profile: "/profile",
  adminReports: "/admin/reports",
} as const;
