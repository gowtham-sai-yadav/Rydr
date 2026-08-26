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
export type ParticipantStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "left"
  // Phase 4 W6: captain approved but the ride was full. Promoted
  // automatically, oldest first, when a seat frees.
  | "waitlisted";
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
  total_km_since_service: number;
  total_km_lifetime: number;
  service_interval_km: number;
  last_serviced_at: string | null;
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
  follows_me: boolean;
  is_private: boolean;
  has_pending_follow_request: boolean;
  privacy_zone_radius_km: number | null;
  is_verified_rider: boolean;
  /** Phase 4 W7. Granted from the server only (scripts/grant_admin.py) — UI hint, not access control. */
  is_admin: boolean;
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
  /**
   * Phase 4 W3 — poster frame for video, resized variant for images.
   * Null means the asset is not Cloudinary-hosted: render `url`.
   */
  thumbnail_url: string | null;
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
  max_riders: number | null; // null = no cap
  requires_approval: boolean;
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
  max_riders: number | null; // null = no cap
  requires_approval: boolean;
  status: RidePlanStatus;
  created_at: string;
  updated_at: string;
  chat_group_id: string | null;
  destination: DestinationSummary | null;
  captain: UserBrief | null;
  participants: RidePlanParticipantOut[];
  participant_count: number;
  // Phase 4 W6. participant_count is seats taken; these save the
  // client from knowing that max_riders includes the captain.
  seats_available: number;
  waitlist_count: number;
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
  captured_latitude: number | null;
  captured_longitude: number | null;
  captured_at: string | null;
  created_at: string;
  /** Poster frame for video; null means render `url`. */
  thumbnail_url: string | null;
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
  // Auto-recorded track stats — populated when the rider submits a
  // recorded_track; null for manually-logged rides with no GPS track.
  distance_km: number | null;
  moving_duration_seconds: number | null;
  avg_speed_kmh: number | null;
  elevation_gain_m: number | null;
  terrain_type: string | null;
  relative_effort: number | null;
  matched_route_id: string | null;
  recorded_track: { lat: number; lng: number; ts: string; speed_kmh?: number | null }[] | null;
  created_at: string;
  updated_at: string;
  media: RideMediaOut[];
  rider: UserBrief | null;
  rating: RatingBrief | null;
  // Populated only right after a recorded_track submission that broke a
  // record — e.g. ["longest_ride", "best_month"] — empty otherwise.
  new_personal_records: string[];
}

export interface RideLogListResponse {
  logs: RideLogOut[];
  total: number;
  page: number;
  limit: number;
}

export interface RideLogCommentOut {
  id: string;
  ride_log_id: string;
  body: string;
  created_at: string;
  author: UserBrief;
}

export interface RideLogCommentListResponse {
  comments: RideLogCommentOut[];
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
// Direct messages - 1:1 threads between mutual followers
// ---------------------------------------------------------------------------
export interface DMThreadOut {
  id: string;
  other_user: UserBrief;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
}

export interface DMThreadListResponse {
  threads: DMThreadOut[];
}

export interface DirectMessageOut {
  id: string;
  thread_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
  author: UserBrief;
}

export interface DirectMessageListResponse {
  messages: DirectMessageOut[];
  total: number;
  page: number;
  limit: number;
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
  rarity: string;
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
// Leaderboard companions — LocalLegendOut / WeeklyLeague. PostOut,
// RiderLeaderboardEntry/Response and DestinationLeaderboardEntry/Response
// now live under the "Phase 4" sections below, matching the real
// backend/app/schemas/{post,leaderboard}.py shapes.
// ---------------------------------------------------------------------------
export interface LocalLegendOut {
  destination_id: string;
  user: UserBrief | null;
  ride_count: number;
  window_days: number;
}

export interface WeeklyLeagueTier {
  tier: "gold" | "silver" | "bronze";
  rank: number;
  user: UserBrief;
  distance_km: number;
}

export interface WeeklyLeagueResponse {
  week_start: string;
  tiers: WeeklyLeagueTier[];
}

export interface LongestRideOut {
  ride_log_id: string;
  distance_km: number;
  destination_name: string | null;
  ride_date: string | null;
}

export interface BestMonthOut {
  year: number;
  month: number;
  total_distance_km: number;
  ride_count: number;
}

export interface BestWeekOut {
  week_start: string;
  destination_count: number;
}

export interface PersonalRecordsOut {
  longest_ride: LongestRideOut | null;
  best_month: BestMonthOut | null;
  most_destinations_in_a_week: BestWeekOut | null;
}

// Notifications and Moderation types now live under the "Phase 4" sections
// below (NotificationType/NotificationOut/NotificationListResponse and
// ReportedContentType/ReportOut/ReportListResponse), matching the real
// backend/app/schemas/{notification,report}.py shapes.

// ---------------------------------------------------------------------------
// Routes (planned waypoints — distinct from a ride log's recorded_track)
// ---------------------------------------------------------------------------
export interface RoutePointOut {
  id: string;
  ordinal: number;
  latitude: number;
  longitude: number;
  label: string | null;
  is_stop: boolean;
}

export interface RouteOut {
  id: string;
  destination_id: string;
  name: string | null;
  description: string | null;
  created_by_user_id: string | null;
  is_published: boolean;
  distance_km: number | null;
  created_at: string;
  points: RoutePointOut[];
}

export interface RouteSummary {
  id: string;
  destination_id: string;
  name: string | null;
  distance_km: number | null;
  created_by_user_id: string | null;
  created_at: string;
}

export interface RouteListResponse {
  routes: RouteSummary[];
}

// ---------------------------------------------------------------------------
// Hazard reports
// ---------------------------------------------------------------------------
export type HazardType =
  | "pothole"
  | "gravel"
  | "police_check"
  | "animal_crossing"
  | "accident"
  | "waterlogging"
  | "other";

export interface HazardReportOut {
  id: string;
  latitude: number;
  longitude: number;
  hazard_type: HazardType;
  description: string | null;
  destination_id: string | null;
  reporter: UserBrief | null;
  created_at: string;
  expires_at: string;
  is_active: boolean;
}

export interface HazardReportListResponse {
  hazards: HazardReportOut[];
}

// ---------------------------------------------------------------------------
// Clubs — persistent joinable groups, separate from one-off group rides
// ---------------------------------------------------------------------------
export type ClubRole = "admin" | "member";

export interface ClubOut {
  id: string;
  name: string;
  description: string | null;
  city: string | null;
  avatar_url: string | null;
  created_by_user_id: string | null;
  created_at: string;
  member_count: number;
  is_member: boolean;
  my_role: ClubRole | null;
}

export interface ClubListResponse {
  clubs: ClubOut[];
  total: number;
  page: number;
  limit: number;
}

export interface ClubMemberOut {
  user: UserBrief;
  role: ClubRole;
  joined_at: string;
}

export interface ClubMemberListResponse {
  members: ClubMemberOut[];
}

export interface ClubLeaderboardEntry {
  rank: number;
  user: UserBrief;
  distance_km: number;
  ride_count: number;
}

export interface ClubLeaderboardResponse {
  entries: ClubLeaderboardEntry[];
  period: "week" | "month";
}

export interface ClubBadgeOut {
  id: string;
  club_id: string;
  slug: string;
  name: string;
  description: string;
  icon_url: string | null;
}

export interface ClubChallengeOut {
  id: string;
  club_id: string;
  title: string;
  goal_km: number;
  start_date: string;
  end_date: string;
  reward_club_badge_id: string | null;
  progress_km: number;
  is_complete: boolean;
}

export interface ClubChallengeListResponse {
  challenges: ClubChallengeOut[];
}

// ---------------------------------------------------------------------------
// Events — organized public rides/meetups with open RSVP
// ---------------------------------------------------------------------------
export type RSVPStatus = "going" | "interested" | "not_going";

export interface EventOut {
  id: string;
  club_id: string | null;
  destination_id: string | null;
  title: string;
  description: string | null;
  event_date: string;
  meeting_point: string | null;
  meeting_latitude: number | null;
  meeting_longitude: number | null;
  created_by_user_id: string;
  created_at: string;
  going_count: number;
  interested_count: number;
  my_rsvp: RSVPStatus | null;
}

export interface EventListResponse {
  events: EventOut[];
  total: number;
  page: number;
  limit: number;
}

export interface EventRSVPOut {
  user: UserBrief;
  status: RSVPStatus;
  created_at: string;
}

export interface EventRSVPListResponse {
  rsvps: EventRSVPOut[];
}

// ---------------------------------------------------------------------------
// Trips — multi-day tours grouping a sequence of the owner's own RideLogs
// ---------------------------------------------------------------------------
export interface TripDayOut {
  day_index: number;
  ride_log_id: string;
  ride_plan_id: string;
  destination_name: string | null;
  distance_km: number | null;
  actual_start_ts: string | null;
  thumbnail_url: string | null;
}

export interface TripOut {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  created_at: string;
  days: TripDayOut[];
  total_distance_km: number;
  total_days: number;
}

export interface TripListResponse {
  trips: TripOut[];
}

// ---------------------------------------------------------------------------
// Photo-tagged timeline
// ---------------------------------------------------------------------------
export interface TimelineEntryOut {
  media_id: string;
  url: string;
  media_type: "image" | "video";
  caption: string | null;
  latitude: number | null;
  longitude: number | null;
  taken_at: string;
  ride_log_id: string;
  ride_plan_id: string;
  destination_name: string | null;
}

export interface TimelineResponse {
  entries: TimelineEntryOut[];
}

export interface MyRideLogOut {
  id: string;
  ride_plan_id: string;
  destination_name: string | null;
  distance_km: number | null;
  actual_start_ts: string | null;
  thumbnail_url: string | null;
}

export interface MyRideLogListResponse {
  logs: MyRideLogOut[];
}

// ---------------------------------------------------------------------------
// Best efforts — fastest completion per matched Route
// ---------------------------------------------------------------------------
export interface BestEffortOut {
  route_id: string;
  route_name: string | null;
  destination_name: string | null;
  best_moving_duration_seconds: number;
  best_avg_speed_kmh: number | null;
  attempt_count: number;
  achieved_at: string | null;
}

export interface BestEffortListResponse {
  efforts: BestEffortOut[];
}

// ---------------------------------------------------------------------------
// Regional discovery
// ---------------------------------------------------------------------------
export interface RegionSummary {
  region: string;
  destination_count: number;
  avg_rating: number;
  hero_media_url: string | null;
}

export interface RegionListResponse {
  regions: RegionSummary[];
}

// ---------------------------------------------------------------------------
// Route elevation profile
// ---------------------------------------------------------------------------
export interface ElevationProfilePoint {
  ordinal: number;
  label: string | null;
  distance_from_start_km: number;
  elevation_m: number;
}

export interface ElevationProfileOut {
  route_id: string;
  points: ElevationProfilePoint[];
  total_gain_m: number;
  total_loss_m: number;
}

// ---------------------------------------------------------------------------
// Year in Rydr
// ---------------------------------------------------------------------------
export interface TopDestinationOut {
  destination_id: string;
  name: string;
  ride_count: number;
}

export interface YearInRydrOut {
  year: number;
  total_rides: number;
  total_distance_km: number;
  total_elevation_gain_m: number;
  total_moving_hours: number;
  longest_ride_km: number | null;
  top_destination: TopDestinationOut | null;
  distinct_destinations: number;
  badges_earned: number;
  active_months: number;
}

// ---------------------------------------------------------------------------
// Heatmaps
// ---------------------------------------------------------------------------
export interface HeatmapResponse {
  points: number[][];
  ride_count: number;
}

// ---------------------------------------------------------------------------
// Flyby
// ---------------------------------------------------------------------------
export interface FlybyOut {
  rider: UserBrief;
  other_ride_log_id: string;
  closest_distance_km: number;
  approx_time: string | null;
}

export interface FlybyListResponse {
  flybys: FlybyOut[];
}

// ---------------------------------------------------------------------------
// Generic API error shape
// ---------------------------------------------------------------------------
export interface FastApiValidationError {
  loc?: unknown[];
  msg: string;
  type: string;
}

// ---------------------------------------------------------------------------
// Phase 4 — notifications (W5)
// ---------------------------------------------------------------------------
export type NotificationType =
  | "ride_join_requested"
  | "ride_join_approved"
  | "ride_join_rejected"
  | "ride_waitlisted"
  | "ride_waitlist_promoted"
  | "ride_cancelled"
  | "ride_starting"
  | "ride_completed"
  | "chat_message"
  | "badge_earned"
  | "new_follower"
  | "post_liked"
  | "post_commented"
  | "destination_rated"
  | "report_resolved";

export type NotificationEntityType =
  | "ride"
  | "chat_group"
  | "destination"
  | "post"
  | "badge"
  | "user"
  | "report";

export interface NotificationOut {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  entity_type: NotificationEntityType | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
  actor: UserBrief | null;
}

export interface NotificationListResponse {
  notifications: NotificationOut[];
  total: number;
  unread: number;
  page: number;
  limit: number;
}

// ---------------------------------------------------------------------------
// Phase 4 — community feed (W4)
// ---------------------------------------------------------------------------
export interface PostMediaOut {
  id: string;
  url: string;
  media_type: MediaType;
  thumbnail_url: string | null;
}

export interface PostDestinationBrief {
  id: string;
  name: string;
}

export interface PostOut {
  id: string;
  body: string;
  created_at: string;
  updated_at: string;
  author: UserBrief | null;
  media: PostMediaOut[];
  ride_log_id: string | null;
  destination: PostDestinationBrief | null;
  like_count: number;
  comment_count: number;
  /** null for anonymous readers — render a neutral control, not an unliked one. */
  liked_by_me: boolean | null;
}

export interface PostListResponse {
  posts: PostOut[];
  total: number;
  page: number;
  limit: number;
}

export interface PostCommentOut {
  id: string;
  post_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  author: UserBrief | null;
}

export interface PostCommentListResponse {
  comments: PostCommentOut[];
  total: number;
  page: number;
  limit: number;
}

export interface LikeResponse {
  post_id: string;
  liked: boolean;
  like_count: number;
}

// ---------------------------------------------------------------------------
// Phase 4 — leaderboards + personal stats (W5)
// ---------------------------------------------------------------------------
export type LeaderboardPeriod = "week" | "month" | "year" | "all";

export interface RiderLeaderboardEntry {
  rank: number;
  user_id: string;
  name: string;
  avatar_url: string | null;
  rides: number;
  /** Derived from home -> destination -> home, not measured. Label it. */
  estimated_distance_km: number;
}

export interface RiderLeaderboardResponse {
  period: string;
  entries: RiderLeaderboardEntry[];
  my_rank: number | null;
}

export interface DestinationLeaderboardEntry {
  rank: number;
  destination_id: string;
  name: string;
  region: string | null;
  hero_media_url: string | null;
  avg_rating: number;
  ride_count: number;
  unique_riders: number;
}

export interface DestinationLeaderboardResponse {
  period: string;
  entries: DestinationLeaderboardEntry[];
}

export interface PersonalStatsOut {
  rides_captained: number;
  rides_joined: number;
  rides_completed: number;
  total_distance_km: number;
  distance_this_week_km: number;
  distance_this_month_km: number;
  rides_this_week: number;
  rides_this_month: number;
  longest_ride_km: number;
  current_streak_weeks: number;
  longest_streak_weeks: number;
  destinations_visited: number;
  /** False means every distance above is zero for lack of an origin. */
  has_home_location: boolean;
}

// ---------------------------------------------------------------------------
// Phase 4 — maps (W2)
// ---------------------------------------------------------------------------
export interface MapConfigOut {
  provider: string;
  tile_url: string;
  /** A licence obligation for OSM. Render it. */
  attribution: string;
  max_zoom: number;
  access_token: string | null;
}

// Named DirectionsOut (not RouteOut) — backend/app/schemas/maps.py names
// this RouteOut too, but it is a genuinely different concept from
// schemas/route.py's RouteOut (a saved, published set of waypoints for a
// destination): this one is a computed point-to-point driving path. Python
// can have both share a name across modules; a flat TS namespace cannot.
export interface DirectionsOut {
  origin: [number, number];
  destination: [number, number];
  distance_km: number;
  duration_minutes: number | null;
  /** [lat, lng] pairs. Empty when is_estimate is true. */
  geometry: [number, number][];
  /** True when the router was unreachable; label the number as approximate. */
  is_estimate: boolean;
  provider: string;
}

export interface GeocodeHit {
  name: string;
  latitude: number;
  longitude: number;
  kind: string | null;
}

export interface GeocodeResponse {
  query: string;
  results: GeocodeHit[];
}

export interface DestinationPin {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  avg_rating: number;
  rating_count: number;
  terrain_difficulty: TerrainDifficulty | null;
}

export interface MapPinsResponse {
  pins: DestinationPin[];
  total: number;
  /** True when the cap was hit — tell the user to zoom in. */
  truncated: boolean;
}

// ---------------------------------------------------------------------------
// Phase 4 — ride summary / share cards (W4)
// ---------------------------------------------------------------------------
export interface RideSummary {
  ride_log_id: string;
  ride_plan_id: string;
  rider_name: string;
  rider_avatar_url: string | null;
  destination_id: string;
  destination_name: string;
  destination_region: string | null;
  ride_title: string;
  ride_date: string;
  estimated_distance_km: number;
  duration_minutes: number | null;
  actual_cost: number | null;
  road_condition: RoadCondition | null;
  recommended: boolean | null;
  rider_count: number;
  stars: number | null;
}

// ---------------------------------------------------------------------------
// Phase 4 — moderation (W7)
// ---------------------------------------------------------------------------
export type ReportedContentType =
  | "post"
  | "post_comment"
  | "destination"
  | "ride_plan"
  | "chat_message"
  | "user";

export type ReportReason =
  | "spam"
  | "harassment"
  | "misinformation"
  | "unsafe"
  | "inappropriate"
  | "other";

export type ReportStatus = "open" | "reviewing" | "actioned" | "dismissed";

export interface ReportOut {
  id: string;
  content_type: ReportedContentType;
  content_id: string;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  created_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
}

export interface AdminReportOut extends ReportOut {
  reporter: UserBrief | null;
  resolver: UserBrief | null;
  /** How many distinct people reported this content. */
  report_count: number;
}

export interface AdminReportListResponse {
  reports: AdminReportOut[];
  total: number;
  open_count: number;
  page: number;
  limit: number;
}

export interface ReportListResponse {
  reports: ReportOut[];
  total: number;
  page: number;
  limit: number;
}
