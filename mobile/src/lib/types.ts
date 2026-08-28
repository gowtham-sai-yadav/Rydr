/**
 * Back-compat re-export shim — the canonical type definitions now live in
 * `api.types.ts` (M9 audit fix). The names here match what older consumer
 * imports expected so no call site has to change just to upgrade.
 *
 * For new code, import directly from `@/lib/api.types`.
 */
export type {
  UserOut as User,
  BikeOut as Bike,
  UserStatsOut as UserStats,
  AuthResponse,
  RidePlanOut as Ride,
  RidePlanSummary,
  RidePlanParticipantOut as RideParticipant,
  ChatGroupOut as ChatGroup,
  ChatMessageOut as ChatMessage,
  DestinationOut as Destination,
  DestinationSummary,
  TagOut as Tag,
  RatingOut as Rating,
  CostEstimate,
  RideLogOut as RideLog,
  RideMediaOut as RideMedia,
  FollowOut as Follow,
  FollowEdgeOut,
} from "./api.types";

// Old `RideStop` and `ride_id` / `is_break_stop` shapes are removed — the
// M1 schema replaced them with destination-anchored rides + optional routes.
// If anything still imports `RideStop`, the TypeScript compiler will catch
// it (intentional: those call sites are stale code that needs rewriting).
