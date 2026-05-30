/**
 * Canonical TypeScript types that mirror the Pydantic response schemas in
 * `backend/app/schemas/`. M9 audit fix: the previous `types.ts` declared
 * stale PoC shapes (`ride_date`, `sender_name`, `is_mine`) that drifted
 * away from every backend milestone since M1.
 *
 * When the backend schema changes, update this file FIRST so TypeScript
 * catches every consumer that needs to follow.
 */

// ---------------------------------------------------------------------------
// Enums — match the backend SQLEnum string values
// ---------------------------------------------------------------------------
export type BikeType = "commuter" | "sport" | "adventure" | "cruiser" | "any";
export type TerrainDifficulty = "chill" | "moderate" | "rough";
export type TagCategory = "vibe" | "vehicle_fit";
export type RidePlanStatus =
  | "planned"
  | "in_progress"
  | "completed"
  | "cancelled";
export type RidePlanVisibility = "solo" | "group";
export type DifficultyLevel = "easy" | "moderate" | "hard" | "expert";
export type ParticipantStatus = "pending" | "approved" | "rejected" | "left" | "waitlisted";
export type RoadCondition = "good" | "ok" | "rough" | "bad";
export type MediaType = "image" | "video";

// ---------------------------------------------------------------------------
// User domain (M1 + M6)
// ---------------------------------------------------------------------------
export interface BikeOut {
  id: string;
  user_id: string;
  name: string | null;
  model: string | null;
  year: number | null;
  engine_cc: number | null;
  mileage_kmpl: number | null;
  type: BikeType;
}

export interface UserBrief {
  id: string;
  name: string;
  avatar_url: string | null;
}

export interface UserOut {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  bio: string | null;
  home_city: string | null;
  home_latitude: number | null;
  home_longitude: number | null;
  created_at: string;
  updated_at: string;
  bike: BikeOut | null;
  // M6 follow surface
  followers_count: number;
  following_count: number;
  is_followed_by_me: boolean;
  // Moderation surface — being added to the User model in parallel. Read
  // defensively: absent/false both mean "not an admin".
  is_admin?: boolean;
}

export interface UserStatsOut {
  rides_captained: number;
  rides_joined: number;
  rides_completed: number;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: UserOut;
}

// ---------------------------------------------------------------------------
// Destination domain (M2)
// ---------------------------------------------------------------------------
export interface TagOut {
  id: string;
  slug: string;
  label: string;
  category: TagCategory;
}

export interface TagListResponse {
  vibe: TagOut[];
  vehicle_fit: TagOut[];
}

export interface DestinationMediaOut {
  id: string;
  destination_id: string;
  url: string;
  caption: string | null;
  uploaded_by_user_id: string | null;
  ride_log_id: string | null;
  created_at: string;
}

export interface DestinationMediaListResponse {
  media: DestinationMediaOut[];
  total: number;
  page: number;
  limit: number;
}

export interface DestinationSummary {
  id: string;
  name: string;
  region: string | null;
  country: string;
  currency: string;
  latitude: number;
  longitude: number;
  terrain_difficulty: TerrainDifficulty;
  hero_media_url: string | null;
  avg_rating: number;
  rating_count: number;
  // Populated when the caller passed an origin (radius / distance sort).
  distance_km: number | null;
}

export interface DestinationListResponse {
  destinations: DestinationSummary[];
  total: number;
  page: number;
  limit: number;
}

export interface DestinationOut {
  id: string;
  name: string;
  description: string | null;
  region: string | null;
  country: string;
  currency: string;
  latitude: number;
  longitude: number;
  terrain_difficulty: TerrainDifficulty;
  estimated_food_cost: number | null;
  estimated_entry_cost: number | null;
  best_season: string | null;
  best_time_of_day: string | null;
  hero_media_url: string | null;
  avg_rating: number;
  rating_count: number;
  submitted_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  tags: TagOut[];
  media: DestinationMediaOut[];
  recent_rider_count: number;
  recent_riders: UserBrief[];
}

export interface RatingOut {
  id: string;
  destination_id: string;
  user_id: string;
  stars: number;
  review: string | null;
  ride_log_id: string | null;
  created_at: string;
  updated_at: string;
  user: UserBrief | null;
}

export interface RatingListResponse {
  ratings: RatingOut[];
  total: number;
  page: number;
  limit: number;
}

export interface CostEstimate {
  distance_km: number;
  fuel: number | null;
  food: number;
  entry: number;
  total_low: number | null;
  total_high: number | null;
  currency: string;
  fuel_included: boolean;
  assumptions: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Ride domain (M3)
// ---------------------------------------------------------------------------
export interface RidePlanParticipantOut {
  id: string;
  ride_plan_id: string;
  user_id: string;
  status: ParticipantStatus;
  created_at: string;
  updated_at: string;
  user: UserBrief | null;
}

export interface ParticipantListResponse {
  participants: RidePlanParticipantOut[];
  total: number;
  page: number;
  limit: number;
}

export interface RidePlanSummary {
  id: string;
  title: string;
  thumbnail_url: string | null;
  destination: DestinationSummary | null;
  captain: UserBrief | null;
  planned_date: string;        // ISO date (YYYY-MM-DD)
  planned_start_time: string;  // ISO time (HH:MM:SS)
  visibility: RidePlanVisibility;
  difficulty_level: DifficultyLevel;
  status: RidePlanStatus;
  max_riders: number;
  participant_count: number;
}

export interface RidePlanListResponse {
  rides: RidePlanSummary[];
  total: number;
  page: number;
  limit: number;
}

export interface MineRideOut extends RidePlanSummary {
  role: "captain" | "participant";
  my_participant_status: ParticipantStatus | null;
}

export interface MineRidesResponse {
  rides: MineRideOut[];
  total: number;
  page: number;
  limit: number;
}

export interface RidePlanOut {
  id: string;
  destination_id: string;
  route_id: string | null;
  captain_id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  planned_date: string;
  planned_start_time: string;
  estimated_end_time: string | null;
  visibility: RidePlanVisibility;
  difficulty_level: DifficultyLevel;
  recommended_bike_type: string | null;
  break_schedule: string | null;
  max_riders: number;
  status: RidePlanStatus;
  created_at: string;
  updated_at: string;
  chat_group_id: string | null;
  destination: DestinationSummary | null;
  captain: UserBrief | null;
  participants: RidePlanParticipantOut[];
  participant_count: number;
}

// ---------------------------------------------------------------------------
// Ride log domain (M4)
// ---------------------------------------------------------------------------
export interface RideMediaOut {
  id: string;
  ride_log_id: string;
  url: string;
  media_type: MediaType;
  uploaded_by_user_id: string | null;
  caption: string | null;
  created_at: string;
}

export interface RatingBrief {
  id: string;
  destination_id: string;
  stars: number;
  review: string | null;
}

export interface RideLogOut {
  id: string;
  ride_plan_id: string;
  rider_id: string;
  actual_start_ts: string | null;
  actual_end_ts: string | null;
  actual_cost: number | null;
  road_condition: RoadCondition | null;
  recommended: boolean | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  media: RideMediaOut[];
  rider: UserBrief | null;
  rating: RatingBrief | null;
}

export interface RideLogListResponse {
  logs: RideLogOut[];
  total: number;
  page: number;
  limit: number;
}

export interface CloudinarySignature {
  cloud_name: string;
  api_key: string;
  timestamp: number;
  folder: string;
  signature: string;
  upload_url: string;
  max_image_bytes: number;
  max_video_bytes: number;
  ride_log_id: string;
  extras?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Chat domain (M5)
// ---------------------------------------------------------------------------
export interface ChatGroupRide {
  id: string;
  title: string;
  planned_date: string;
  status: RidePlanStatus;
  captain_id: string;
  destination_id: string;
  destination_name: string | null;
  participant_count: number;
}

export interface ChatGroupOut {
  id: string;
  ride_plan_id: string;
  name: string;
  ride: ChatGroupRide | null;
}

export interface ChatGroupListResponse {
  groups: ChatGroupOut[];
  total: number;
  page: number;
  limit: number;
}

export interface ChatMessageOut {
  id: string;
  chat_group_id: string;
  body: string;
  created_at: string;
  // M6 audit #19 tightened: author is never null for live rows
  author: UserBrief;
}

export interface ChatMessageListResponse {
  messages: ChatMessageOut[];
  has_more: boolean;
}

// ---------------------------------------------------------------------------
// Follow domain (M6)
// ---------------------------------------------------------------------------
export interface FollowOut {
  follower_id: string;
  followed_id: string;
  created_at: string;
}

export interface FollowEdgeOut {
  user: UserBrief;
  created_at: string;
}

export interface FollowListResponse {
  edges: FollowEdgeOut[];
  total: number;
  page: number;
  limit: number;
}

// ---------------------------------------------------------------------------
// Badges (M8)
// ---------------------------------------------------------------------------
// Catalog entry — shared between the catalog endpoint and the nested
// ``badge`` field on an earned award.
export interface BadgeOut {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon_url: string | null;
}

// One earned award. ``badge`` is eager-loaded by the backend so the
// frontend doesn't have to cross-reference catalog separately.
export interface UserBadgeOut {
  id: string;
  user_id: string;
  badge_id: string;
  earned_at: string;
  badge: BadgeOut | null;
}

// ---------------------------------------------------------------------------
// Social feed (new — written against the documented contract; backend
// routes live at backend/app/routers/feed.py on main, not yet present in
// this worktree, so field names are our best-effort match to the rest of
// the API's conventions and should be reconciled against the real schema
// once merged).
// ---------------------------------------------------------------------------
export interface PostMediaOut {
  url: string;
  media_type: string;
}

export interface PostOut {
  id: string;
  author: UserBrief;
  ride_log_id: string | null;
  caption: string;
  media: PostMediaOut[];
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  created_at: string;
}

export interface FeedListResponse {
  posts: PostOut[];
  total: number;
  page: number;
  limit: number;
}

export interface PostCommentOut {
  id: string;
  post_id: string;
  author: UserBrief;
  body: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Leaderboard (two independent endpoints — riders by all-time ride-log
// count, destinations by completed-ride count this calendar month)
// ---------------------------------------------------------------------------
export interface RiderLeaderboardEntry {
  rank: number;
  user: UserBrief;
  rides_logged: number;
}

export interface RiderLeaderboardResponse {
  entries: RiderLeaderboardEntry[];
}

export interface DestinationLeaderboardEntry {
  rank: number;
  destination_id: string;
  destination_name: string;
  ride_count: number;
}

export interface DestinationLeaderboardResponse {
  entries: DestinationLeaderboardEntry[];
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
export type NotificationType =
  | "ride_join_requested"
  | "ride_join_approved"
  | "ride_join_rejected"
  | "post_liked"
  | "post_commented"
  | "badge_earned";

export interface NotificationOut {
  id: string;
  type: NotificationType;
  actor_id: string | null;
  ride_plan_id: string | null;
  post_id: string | null;
  badge_id: string | null;
  message: string;
  read_at: string | null;
  created_at: string;
}

export interface NotificationListResponse {
  notifications: NotificationOut[];
  total: number;
  page: number;
  limit: number;
  unread_count: number;
}

// ---------------------------------------------------------------------------
// Moderation
// ---------------------------------------------------------------------------
export type ReportTargetType = "post" | "comment" | "rating" | "chat_message" | "user";
export type ReportStatus = "open" | "reviewed" | "dismissed" | "actioned";

export interface ReportOut {
  id: string;
  reporter_id: string;
  target_type: ReportTargetType;
  target_id: string;
  reason: string;
  status: ReportStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface ReportListResponse {
  reports: ReportOut[];
  total: number;
  page: number;
  limit: number;
}

// ---------------------------------------------------------------------------
// Generic API error shape
// ---------------------------------------------------------------------------
export interface FastApiValidationError {
  loc?: unknown[];
  msg: string;
  type: string;
}
