import { API_BASE_URL, TOKEN_KEY } from "./constants";
import type {
  AuthResponse,
  BadgeOut,
  BestEffortListResponse,
  BikeOut,
  ChatGroupListResponse,
  ChatGroupOut,
  ChatMessageListResponse,
  ChatMessageOut,
  ClubBadgeOut,
  ClubChallengeListResponse,
  ClubChallengeOut,
  ClubLeaderboardResponse,
  ClubListResponse,
  ClubMemberListResponse,
  ClubOut,
  CloudinarySignature,
  CostEstimate,
  DestinationListResponse,
  DestinationMediaListResponse,
  DestinationOut,
  DestinationLeaderboardResponse,
  DirectMessageListResponse,
  DirectMessageOut,
  DMThreadListResponse,
  DMThreadOut,
  ElevationProfileOut,
  EventListResponse,
  EventOut,
  EventRSVPListResponse,
  FastApiValidationError,
  FlybyListResponse,
  HazardReportListResponse,
  HazardReportOut,
  HazardType,
  HeatmapResponse,
  LocalLegendOut,
  MyRideLogListResponse,
  PersonalRecordsOut,
  RegionListResponse,
  RouteListResponse,
  RouteOut,
  RSVPStatus,
  FeedListResponse,
  FollowListResponse,
  FollowOut,
  MineRidesResponse,
  NotificationListResponse,
  ParticipantListResponse,
  PostCommentOut,
  PostOut,
  RatingListResponse,
  RatingOut,
  ReportListResponse,
  ReportOut,
  ReportStatus,
  ReportTargetType,
  RiderLeaderboardResponse,
  RideLogCommentListResponse,
  RideLogCommentOut,
  RideLogListResponse,
  RideLogOut,
  RideMediaOut,
  RidePlanListResponse,
  RidePlanOut,
  RidePlanParticipantOut,
  TagListResponse,
  TimelineResponse,
  TripListResponse,
  TripOut,
  UserBadgeOut,
  UserOut,
  UserStatsOut,
  WeeklyLeagueResponse,
  YearInRydrOut,
} from "./api.types";


function formatErrorDetail(detail: unknown, status: number): string {
  // FastAPI returns 422 validation errors as an array of {loc, msg, type}.
  // Coercing the array via String(detail) yields "[object Object],..." which
  // is what users were seeing — normalize to a readable string instead.
  if (typeof detail === "string" && detail) return detail;
  if (Array.isArray(detail)) {
    const parts = (detail as FastApiValidationError[])
      .map((d) => {
        const loc = Array.isArray(d?.loc)
          ? d.loc.filter((p) => p !== "body").join(".")
          : "";
        const msg = d?.msg ?? "";
        return loc ? `${loc}: ${msg}` : msg;
      })
      .filter(Boolean);
    if (parts.length) return parts.join("; ");
  }
  return `Request failed: ${status}`;
}


class ApiClient {
  private getToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(TOKEN_KEY);
  }

  private headers(auth = true): HeadersInit {
    const h: HeadersInit = { "Content-Type": "application/json" };
    if (auth) {
      const token = this.getToken();
      if (token) h["Authorization"] = `Bearer ${token}`;
    }
    return h;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${API_BASE_URL}${path}`, options);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(formatErrorDetail(body?.detail, res.status));
    }
    // 204 No Content and any other empty-body success → resolve without
    // calling res.json() (M5 audit #2 fix).
    if (res.status === 204 || res.headers.get("Content-Length") === "0") {
      return undefined as T;
    }
    return res.json();
  }

  // Binary (image/png) response, used by the shareable-card endpoints.
  private async requestBlob(path: string, options: RequestInit = {}): Promise<Blob> {
    const res = await fetch(`${API_BASE_URL}${path}`, options);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(formatErrorDetail(body?.detail, res.status));
    }
    return res.blob();
  }

  // ---------------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------------
  signup(data: Record<string, unknown>) {
    return this.request<AuthResponse>("/api/auth/signup", {
      method: "POST",
      headers: this.headers(false),
      body: JSON.stringify(data),
    });
  }

  login(email: string, password: string) {
    return this.request<AuthResponse>("/api/auth/login", {
      method: "POST",
      headers: this.headers(false),
      body: JSON.stringify({ email, password }),
    });
  }

  // ---------------------------------------------------------------------------
  // Users (M1, M6)
  // ---------------------------------------------------------------------------
  getMe() {
    return this.request<UserOut>("/api/users/me", { headers: this.headers() });
  }

  updateMe(data: Partial<{
    name: string;
    phone: string | null;
    avatar_url: string | null;
    bio: string | null;
    home_city: string | null;
    home_latitude: number | null;
    home_longitude: number | null;
    is_private: boolean;
    privacy_zone_radius_km: number | null;
  }>) {
    return this.request<UserOut>("/api/users/me", {
      method: "PUT",
      headers: this.headers(),
      body: JSON.stringify(data),
    });
  }

  updateBike(data: Partial<{
    name: string | null;
    model: string | null;
    year: number | null;
    engine_cc: number | null;
    mileage_kmpl: number | null;
    type: "commuter" | "sport" | "adventure" | "cruiser" | "any";
    service_interval_km: number;
  }>) {
    return this.request<BikeOut>("/api/users/me/bike", {
      method: "PUT",
      headers: this.headers(),
      body: JSON.stringify(data),
    });
  }

  markBikeServiced() {
    return this.request<BikeOut>("/api/users/me/bike/service", {
      method: "PUT",
      headers: this.headers(),
    });
  }

  getMyStats() {
    return this.request<UserStatsOut>("/api/users/me/stats", {
      headers: this.headers(),
    });
  }

  getUser(userId: string) {
    return this.request<UserOut>(`/api/users/${userId}`, {
      headers: this.headers(),
    });
  }

  // Follow (M6)
  followUser(userId: string) {
    return this.request<FollowOut>(`/api/users/${userId}/follow`, {
      method: "POST",
      headers: this.headers(),
    });
  }

  unfollowUser(userId: string) {
    return this.request<void>(`/api/users/${userId}/follow`, {
      method: "DELETE",
      headers: this.headers(),
    });
  }

  /** Pending requests to follow ME (private account), awaiting accept/reject. */
  listFollowRequests() {
    return this.request<FollowListResponse>("/api/users/me/follow-requests", {
      headers: this.headers(),
    });
  }

  acceptFollowRequest(followerId: string) {
    return this.request<FollowOut>(`/api/users/follow-requests/${followerId}/accept`, {
      method: "POST",
      headers: this.headers(),
    });
  }

  rejectFollowRequest(followerId: string) {
    return this.request<void>(`/api/users/follow-requests/${followerId}`, {
      method: "DELETE",
      headers: this.headers(),
    });
  }

  getFollowers(userId: string, params: { page?: number; limit?: number } = {}) {
    const qs = new URLSearchParams();
    if (params.page) qs.set("page", String(params.page));
    if (params.limit) qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.request<FollowListResponse>(
      `/api/users/${userId}/followers${suffix}`,
      { headers: this.headers() },
    );
  }

  getFollowing(userId: string, params: { page?: number; limit?: number } = {}) {
    const qs = new URLSearchParams();
    if (params.page) qs.set("page", String(params.page));
    if (params.limit) qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.request<FollowListResponse>(
      `/api/users/${userId}/following${suffix}`,
      { headers: this.headers() },
    );
  }

  // ---------------------------------------------------------------------------
  // Rides (M3 + M6 following_only)
  // ---------------------------------------------------------------------------
  getRideFeed(params: {
    destination_id?: string;
    region?: string;
    date_from?: string;
    date_to?: string;
    following_only?: boolean;
    page?: number;
    limit?: number;
  } = {}) {
    const qs = new URLSearchParams();
    if (params.destination_id) qs.set("destination_id", params.destination_id);
    if (params.region) qs.set("region", params.region);
    if (params.date_from) qs.set("date_from", params.date_from);
    if (params.date_to) qs.set("date_to", params.date_to);
    if (params.following_only) qs.set("following_only", "true");
    if (params.page) qs.set("page", String(params.page));
    if (params.limit) qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.request<RidePlanListResponse>(`/api/rides/feed${suffix}`, {
      headers: this.headers(),
    });
  }

  getMyRides(params: { status?: string; include_left?: boolean; page?: number; limit?: number } = {}) {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (params.include_left) qs.set("include_left", "true");
    if (params.page) qs.set("page", String(params.page));
    if (params.limit) qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.request<MineRidesResponse>(`/api/rides/mine${suffix}`, {
      headers: this.headers(),
    });
  }

  createRide(data: {
    destination_id: string;
    title: string;
    description?: string | null;
    thumbnail_url?: string | null;
    planned_date: string;
    planned_start_time: string;
    estimated_end_time?: string | null;
    visibility?: "solo" | "group";
    difficulty_level?: "easy" | "moderate" | "hard" | "expert";
    recommended_bike_type?: string | null;
    break_schedule?: string | null;
    max_riders?: number | null;
    requires_approval?: boolean;
    route_id?: string | null;
  }) {
    return this.request<RidePlanOut>("/api/rides", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(data),
    });
  }

  getRide(id: string) {
    return this.request<RidePlanOut>(`/api/rides/${id}`, {
      headers: this.headers(),
    });
  }

  updateRide(id: string, data: Record<string, unknown>) {
    return this.request<RidePlanOut>(`/api/rides/${id}`, {
      method: "PUT",
      headers: this.headers(),
      body: JSON.stringify(data),
    });
  }

  cancelRide(id: string) {
    return this.request<RidePlanOut>(`/api/rides/${id}`, {
      method: "DELETE",
      headers: this.headers(),
    });
  }

  deleteRide(id: string) {
    return this.cancelRide(id);
  }

  joinRide(id: string) {
    return this.request<RidePlanParticipantOut>(`/api/rides/${id}/join`, {
      method: "POST",
      headers: this.headers(),
    });
  }

  leaveRide(id: string) {
    return this.request<RidePlanParticipantOut>(`/api/rides/${id}/leave`, {
      method: "POST",
      headers: this.headers(),
    });
  }

  getParticipants(rideId: string, params: { status?: string; page?: number; limit?: number } = {}) {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (params.page) qs.set("page", String(params.page));
    if (params.limit) qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.request<ParticipantListResponse>(
      `/api/rides/${rideId}/participants${suffix}`,
      { headers: this.headers() },
    );
  }

  updateParticipant(rideId: string, userId: string, status: "approved" | "rejected") {
    return this.request<RidePlanParticipantOut>(
      `/api/rides/${rideId}/participants/${userId}`,
      {
        method: "PUT",
        headers: this.headers(),
        body: JSON.stringify({ status }),
      },
    );
  }

  // Ride status transitions (M4)
  startRide(id: string) {
    return this.request<RidePlanOut>(`/api/rides/${id}/start`, {
      method: "POST",
      headers: this.headers(),
    });
  }

  completeRide(id: string) {
    return this.request<RidePlanOut>(`/api/rides/${id}/complete`, {
      method: "POST",
      headers: this.headers(),
    });
  }

  listRideLogs(rideId: string, page = 1, limit = 20) {
    return this.request<RideLogListResponse>(
      `/api/rides/${rideId}/logs?page=${page}&limit=${limit}`,
      { headers: this.headers() },
    );
  }

  // ---------------------------------------------------------------------------
  // Ride logs (M4 — post-ride capture)
  // ---------------------------------------------------------------------------
  createRideLog(data: { ride_plan_id: string; actual_start_ts?: string }) {
    return this.request<RideLogOut>("/api/ride-logs", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(data),
    });
  }

  getRideLog(id: string) {
    return this.request<RideLogOut>(`/api/ride-logs/${id}`, {
      headers: this.headers(),
    });
  }

  updateRideLog(
    id: string,
    data: {
      actual_start_ts?: string | null;
      actual_end_ts?: string | null;
      actual_cost?: number | null;
      road_condition?: "good" | "ok" | "rough" | "bad" | null;
      recommended?: boolean | null;
      notes?: string | null;
    },
  ) {
    return this.request<RideLogOut>(`/api/ride-logs/${id}`, {
      method: "PATCH",
      headers: this.headers(),
      body: JSON.stringify(data),
    });
  }

  signRideMedia(rideLogId: string) {
    return this.request<CloudinarySignature>(
      `/api/ride-logs/${rideLogId}/media/sign`,
      {
        method: "POST",
        headers: this.headers(),
      },
    );
  }

  confirmRideMedia(
    rideLogId: string,
    data: {
      url: string;
      media_type?: "image" | "video";
      caption?: string | null;
      link_to_destination?: boolean;
    },
  ) {
    return this.request<RideMediaOut>(`/api/ride-logs/${rideLogId}/media`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(data),
    });
  }

  deleteRideMedia(rideLogId: string, mediaId: string) {
    return this.request<void>(
      `/api/ride-logs/${rideLogId}/media/${mediaId}`,
      {
        method: "DELETE",
        headers: this.headers(),
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Chat (M5)
  // ---------------------------------------------------------------------------
  getChatGroups(params: { page?: number; limit?: number } = {}) {
    const qs = new URLSearchParams();
    if (params.page) qs.set("page", String(params.page));
    if (params.limit) qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.request<ChatGroupListResponse>(`/api/chat/groups${suffix}`, {
      headers: this.headers(),
    });
  }

  getChatGroup(groupId: string) {
    return this.request<ChatGroupOut>(`/api/chat/groups/${groupId}`, {
      headers: this.headers(),
    });
  }

  getChatMessages(
    groupId: string,
    params: { after_id?: string; before_id?: string; limit?: number } = {},
  ) {
    const qs = new URLSearchParams();
    if (params.after_id) qs.set("after_id", params.after_id);
    if (params.before_id) qs.set("before_id", params.before_id);
    if (params.limit) qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.request<ChatMessageListResponse>(
      `/api/chat/groups/${groupId}/messages${suffix}`,
      { headers: this.headers() },
    );
  }

  sendChatMessage(groupId: string, body: string) {
    return this.request<ChatMessageOut>(
      `/api/chat/groups/${groupId}/messages`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ body }),
      },
    );
  }

  deleteChatMessage(messageId: string) {
    return this.request<void>(`/api/chat/messages/${messageId}`, {
      method: "DELETE",
      headers: this.headers(),
    });
  }

  // ---------------------------------------------------------------------------
  // Routes
  // ---------------------------------------------------------------------------
  createRoute(data: {
    destination_id: string;
    name?: string;
    description?: string;
    points: { ordinal: number; latitude: number; longitude: number; label?: string; is_stop: boolean }[];
    publish?: boolean;
  }) {
    return this.request<RouteOut>("/api/routes", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(data),
    });
  }

  getRoute(routeId: string) {
    return this.request<RouteOut>(`/api/routes/${routeId}`, {
      headers: this.headers(),
    });
  }

  listRoutes(destinationId: string) {
    return this.request<RouteListResponse>(`/api/routes?destination_id=${destinationId}`, {
      headers: this.headers(),
    });
  }

  publishRoute(routeId: string) {
    return this.request<RouteOut>(`/api/routes/${routeId}/publish`, {
      method: "POST",
      headers: this.headers(),
    });
  }

  // ---------------------------------------------------------------------------
  // Hazard reports
  // ---------------------------------------------------------------------------
  listHazards(params: { nearLat?: number; nearLng?: number; radiusKm?: number; destinationId?: string } = {}) {
    const qs = new URLSearchParams();
    if (params.nearLat != null) qs.set("near_lat", String(params.nearLat));
    if (params.nearLng != null) qs.set("near_lng", String(params.nearLng));
    if (params.radiusKm != null) qs.set("radius_km", String(params.radiusKm));
    if (params.destinationId) qs.set("destination_id", params.destinationId);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.request<HazardReportListResponse>(`/api/hazards${suffix}`, {
      headers: this.headers(),
    });
  }

  reportHazard(data: {
    latitude: number;
    longitude: number;
    hazard_type: HazardType;
    description?: string | null;
    destination_id?: string | null;
  }) {
    return this.request<HazardReportOut>("/api/hazards", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(data),
    });
  }

  deleteHazard(hazardId: string) {
    return this.request<void>(`/api/hazards/${hazardId}`, {
      method: "DELETE",
      headers: this.headers(),
    });
  }

  // ---------------------------------------------------------------------------
  // Direct messages
  // ---------------------------------------------------------------------------
  listDMThreads() {
    return this.request<DMThreadListResponse>("/api/dm/threads", {
      headers: this.headers(),
    });
  }

  /** Gets the existing thread with this user, or creates one — only
   * succeeds if you follow each other (403 otherwise). */
  openDMThread(otherUserId: string) {
    return this.request<DMThreadOut>(`/api/dm/threads/${otherUserId}`, {
      method: "POST",
      headers: this.headers(),
    });
  }

  getDMMessages(threadId: string, params: { page?: number; limit?: number } = {}) {
    const qs = new URLSearchParams();
    if (params.page) qs.set("page", String(params.page));
    if (params.limit) qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.request<DirectMessageListResponse>(
      `/api/dm/threads/${threadId}/messages${suffix}`,
      { headers: this.headers() },
    );
  }

  sendDMMessage(threadId: string, body: string) {
    return this.request<DirectMessageOut>(
      `/api/dm/threads/${threadId}/messages`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ body }),
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Destinations (M2)
  // ---------------------------------------------------------------------------
  listDestinations(params: {
    tags?: string[];
    vehicle_fit?: string[];
    radius_km?: number;
    from_lat?: number;
    from_lng?: number;
    max_budget?: number;
    q?: string;
    region?: string;
    sort?: "rating" | "distance" | "popularity";
    page?: number;
    limit?: number;
  } = {}) {
    const qs = new URLSearchParams();
    for (const slug of params.tags ?? []) qs.append("tags", slug);
    for (const slug of params.vehicle_fit ?? []) qs.append("vehicle_fit", slug);
    if (params.radius_km != null) qs.set("radius_km", String(params.radius_km));
    if (params.from_lat != null) qs.set("from_lat", String(params.from_lat));
    if (params.from_lng != null) qs.set("from_lng", String(params.from_lng));
    if (params.max_budget != null) qs.set("max_budget", String(params.max_budget));
    if (params.q) qs.set("q", params.q);
    if (params.region) qs.set("region", params.region);
    if (params.sort) qs.set("sort", params.sort);
    if (params.page) qs.set("page", String(params.page));
    if (params.limit) qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.request<DestinationListResponse>(
      `/api/destinations${suffix}`,
      { headers: this.headers() },
    );
  }

  getDestination(id: string) {
    return this.request<DestinationOut>(`/api/destinations/${id}`, {
      headers: this.headers(),
    });
  }

  getDestinationMedia(id: string, page = 1, limit = 20) {
    return this.request<DestinationMediaListResponse>(
      `/api/destinations/${id}/media?page=${page}&limit=${limit}`,
      { headers: this.headers() },
    );
  }

  submitDestination(data: {
    name: string;
    description?: string | null;
    region?: string | null;
    country?: string;
    currency?: string;
    latitude: number;
    longitude: number;
    terrain_difficulty?: "chill" | "moderate" | "rough";
    estimated_food_cost?: number | null;
    estimated_entry_cost?: number | null;
    best_season?: string | null;
    best_time_of_day?: string | null;
    hero_media_url?: string | null;
    tag_slugs?: string[];
    gallery_urls?: string[];
  }) {
    return this.request<DestinationOut>("/api/destinations", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(data),
    });
  }

  listRatings(destinationId: string, page = 1, limit = 20) {
    return this.request<RatingListResponse>(
      `/api/destinations/${destinationId}/ratings?page=${page}&limit=${limit}`,
      { headers: this.headers() },
    );
  }

  submitRating(destinationId: string, data: { stars: number; review?: string; ride_log_id?: string }) {
    return this.request<RatingOut>(
      `/api/destinations/${destinationId}/ratings`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(data),
      },
    );
  }

  getCostEstimate(
    destinationId: string,
    params: { from_lat?: number; from_lng?: number; bike_mileage_kmpl?: number; fuel_price?: number } = {},
  ) {
    const qs = new URLSearchParams();
    if (params.from_lat != null) qs.set("from_lat", String(params.from_lat));
    if (params.from_lng != null) qs.set("from_lng", String(params.from_lng));
    if (params.bike_mileage_kmpl != null) qs.set("bike_mileage_kmpl", String(params.bike_mileage_kmpl));
    if (params.fuel_price != null) qs.set("fuel_price", String(params.fuel_price));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.request<CostEstimate>(
      `/api/destinations/${destinationId}/cost-estimate${suffix}`,
      { headers: this.headers() },
    );
  }

  listTags() {
    return this.request<TagListResponse>("/api/tags", {
      headers: this.headers(),
    });
  }

  // ---------------------------------------------------------------------------
  // Badges (M8)
  // ---------------------------------------------------------------------------
  listBadgeCatalog() {
    return this.request<BadgeOut[]>("/api/badges", {
      headers: this.headers(),
    });
  }

  listMyBadges() {
    return this.request<UserBadgeOut[]>("/api/badges/me", {
      headers: this.headers(),
    });
  }

  listUserBadges(userId: string) {
    return this.request<UserBadgeOut[]>(`/api/badges/users/${userId}`, {
      headers: this.headers(),
    });
  }

  getBadgeCardImage(userBadgeId: string) {
    return this.requestBlob(`/api/badges/${userBadgeId}/card`, {
      headers: this.headers(),
    });
  }

  // ---------------------------------------------------------------------------
  // Ride log shareable card
  // ---------------------------------------------------------------------------
  getRideLogCardImage(rideLogId: string) {
    return this.requestBlob(`/api/ride-logs/${rideLogId}/card`, {
      headers: this.headers(),
    });
  }

  // ---------------------------------------------------------------------------
  // Social feed (Phase 4 W4). POST /api/feed wraps an optional ride_log_id
  // so a completed ride's photos surface as the post's media without a
  // separate upload; like/unlike are 204-no-body and idempotent.
  // ---------------------------------------------------------------------------
  getFeed(params: { page?: number; limit?: number } = {}) {
    const qs = new URLSearchParams();
    if (params.page) qs.set("page", String(params.page));
    if (params.limit) qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.request<FeedListResponse>(`/api/feed${suffix}`, {
      headers: this.headers(),
    });
  }

  createPost(data: { caption: string; ride_log_id?: string }) {
    return this.request<PostOut>("/api/feed", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(data),
    });
  }

  likePost(postId: string) {
    return this.request<void>(`/api/feed/${postId}/like`, {
      method: "POST",
      headers: this.headers(),
    });
  }

  unlikePost(postId: string) {
    return this.request<void>(`/api/feed/${postId}/like`, {
      method: "DELETE",
      headers: this.headers(),
    });
  }

  getPostComments(postId: string) {
    return this.request<PostCommentOut[]>(`/api/feed/${postId}/comments`, {
      headers: this.headers(),
    });
  }

  addPostComment(postId: string, body: string) {
    return this.request<PostCommentOut>(`/api/feed/${postId}/comments`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ body }),
    });
  }

  // ---------------------------------------------------------------------------
  // Leaderboard (Phase 4 W5), two independent endpoints, no combined route.
  // ---------------------------------------------------------------------------
  getRiderLeaderboard(limit = 20) {
    return this.request<RiderLeaderboardResponse>(
      `/api/leaderboard/riders?limit=${limit}`,
      { headers: this.headers() },
    );
  }

  getDestinationLeaderboard(limit = 20) {
    return this.request<DestinationLeaderboardResponse>(
      `/api/leaderboard/destinations?limit=${limit}`,
      { headers: this.headers() },
    );
  }

  getLocalLegend(destinationId: string) {
    return this.request<LocalLegendOut>(`/api/leaderboard/destinations/${destinationId}/local-legend`, {
      headers: this.headers(),
    });
  }

  getWeeklyLeague() {
    return this.request<WeeklyLeagueResponse>("/api/leaderboard/weekly-league", {
      headers: this.headers(),
    });
  }

  // ---------------------------------------------------------------------------
  // Personal records, fog-of-war, verification
  // ---------------------------------------------------------------------------
  getPersonalRecords(userId: string) {
    return this.request<PersonalRecordsOut>(`/api/users/${userId}/personal-records`, {
      headers: this.headers(),
    });
  }

  getVisitedDestinations(userId: string) {
    return this.request<{ visited_destination_ids: string[] }>(`/api/users/${userId}/visited-destinations`, {
      headers: this.headers(),
    });
  }

  setVerifiedRider(userId: string, verified: boolean) {
    return this.request<UserOut>(`/api/users/${userId}/verify?verified=${verified}`, {
      method: "PUT",
      headers: this.headers(),
    });
  }

  // ---------------------------------------------------------------------------
  // Ride log comments
  // ---------------------------------------------------------------------------
  getRideLogComments(rideLogId: string) {
    return this.request<RideLogCommentListResponse>(`/api/ride-logs/${rideLogId}/comments`, {
      headers: this.headers(),
    });
  }

  addRideLogComment(rideLogId: string, body: string) {
    return this.request<RideLogCommentOut>(`/api/ride-logs/${rideLogId}/comments`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ body }),
    });
  }

  deleteRideLogComment(rideLogId: string, commentId: string) {
    return this.request<void>(`/api/ride-logs/${rideLogId}/comments/${commentId}`, {
      method: "DELETE",
      headers: this.headers(),
    });
  }

  // ---------------------------------------------------------------------------
  // Surprise Me
  // ---------------------------------------------------------------------------
  surpriseMe(params: { time_budget_hours: number; from_lat?: number; from_lng?: number }) {
    const qs = new URLSearchParams();
    qs.set("time_budget_hours", String(params.time_budget_hours));
    if (params.from_lat != null) qs.set("from_lat", String(params.from_lat));
    if (params.from_lng != null) qs.set("from_lng", String(params.from_lng));
    return this.request<DestinationOut>(`/api/destinations/surprise-me?${qs.toString()}`, {
      headers: this.headers(),
    });
  }

  // ---------------------------------------------------------------------------
  // Notifications (Phase 4)
  // ---------------------------------------------------------------------------
  getNotifications(params: { page?: number; limit?: number } = {}) {
    const qs = new URLSearchParams();
    if (params.page) qs.set("page", String(params.page));
    if (params.limit) qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.request<NotificationListResponse>(
      `/api/notifications${suffix}`,
      { headers: this.headers() },
    );
  }

  markNotificationRead(id: string) {
    return this.request<void>(`/api/notifications/${id}/read`, {
      method: "POST",
      headers: this.headers(),
    });
  }

  markAllNotificationsRead() {
    return this.request<void>("/api/notifications/read-all", {
      method: "POST",
      headers: this.headers(),
    });
  }

  // ---------------------------------------------------------------------------
  // Moderation (Phase 4). Filing a report only requires auth; reading and
  // actioning the queue is admin-gated server-side (403 for non-admins).
  // ---------------------------------------------------------------------------
  listReports(params: { status?: ReportStatus; page?: number; limit?: number } = {}) {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (params.page) qs.set("page", String(params.page));
    if (params.limit) qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.request<ReportListResponse>(`/api/moderation/reports${suffix}`, {
      headers: this.headers(),
    });
  }

  updateReport(id: string, data: { status: ReportStatus }) {
    return this.request<ReportOut>(`/api/moderation/reports/${id}`, {
      method: "PATCH",
      headers: this.headers(),
      body: JSON.stringify(data),
    });
  }

  createReport(data: { target_type: ReportTargetType; target_id: string; reason: string }) {
    return this.request<ReportOut>("/api/moderation/reports", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(data),
    });
  }

  // ---------------------------------------------------------------------------
  // Clubs
  // ---------------------------------------------------------------------------
  createClub(data: { name: string; description?: string | null; city?: string | null; avatar_url?: string | null }) {
    return this.request<ClubOut>("/api/clubs", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(data),
    });
  }

  listClubs(params: { city?: string; q?: string; page?: number; limit?: number } = {}) {
    const qs = new URLSearchParams();
    if (params.city) qs.set("city", params.city);
    if (params.q) qs.set("q", params.q);
    if (params.page) qs.set("page", String(params.page));
    if (params.limit) qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.request<ClubListResponse>(`/api/clubs${suffix}`, { headers: this.headers() });
  }

  getClub(clubId: string) {
    return this.request<ClubOut>(`/api/clubs/${clubId}`, { headers: this.headers() });
  }

  joinClub(clubId: string) {
    return this.request<ClubOut>(`/api/clubs/${clubId}/join`, { method: "POST", headers: this.headers() });
  }

  leaveClub(clubId: string) {
    return this.request<void>(`/api/clubs/${clubId}/join`, { method: "DELETE", headers: this.headers() });
  }

  listClubMembers(clubId: string) {
    return this.request<ClubMemberListResponse>(`/api/clubs/${clubId}/members`, { headers: this.headers() });
  }

  getClubLeaderboard(clubId: string, period: "week" | "month" = "week") {
    return this.request<ClubLeaderboardResponse>(`/api/clubs/${clubId}/leaderboard?period=${period}`, {
      headers: this.headers(),
    });
  }

  listClubBadges(clubId: string) {
    return this.request<ClubBadgeOut[]>(`/api/clubs/${clubId}/badges`, { headers: this.headers() });
  }

  createClubBadge(clubId: string, data: { slug: string; name: string; description: string; icon_url?: string | null }) {
    return this.request<ClubBadgeOut>(`/api/clubs/${clubId}/badges`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(data),
    });
  }

  awardClubBadge(clubId: string, badgeId: string, userId: string) {
    return this.request<void>(`/api/clubs/${clubId}/badges/${badgeId}/award/${userId}`, {
      method: "POST",
      headers: this.headers(),
    });
  }

  listClubChallenges(clubId: string) {
    return this.request<ClubChallengeListResponse>(`/api/clubs/${clubId}/challenges`, { headers: this.headers() });
  }

  createClubChallenge(clubId: string, data: { title: string; goal_km: number; start_date: string; end_date: string; reward_club_badge_id?: string | null }) {
    return this.request<ClubChallengeOut>(`/api/clubs/${clubId}/challenges`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(data),
    });
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------
  createEvent(data: {
    club_id?: string | null;
    destination_id?: string | null;
    title: string;
    description?: string | null;
    event_date: string;
    meeting_point?: string | null;
    meeting_latitude?: number | null;
    meeting_longitude?: number | null;
  }) {
    return this.request<EventOut>("/api/events", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(data),
    });
  }

  listEvents(params: { club_id?: string; upcoming_only?: boolean; page?: number; limit?: number } = {}) {
    const qs = new URLSearchParams();
    if (params.club_id) qs.set("club_id", params.club_id);
    if (params.upcoming_only != null) qs.set("upcoming_only", String(params.upcoming_only));
    if (params.page) qs.set("page", String(params.page));
    if (params.limit) qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.request<EventListResponse>(`/api/events${suffix}`, { headers: this.headers() });
  }

  getEvent(eventId: string) {
    return this.request<EventOut>(`/api/events/${eventId}`, { headers: this.headers() });
  }

  setEventRsvp(eventId: string, status: RSVPStatus) {
    return this.request<EventOut>(`/api/events/${eventId}/rsvp`, {
      method: "PUT",
      headers: this.headers(),
      body: JSON.stringify({ status }),
    });
  }

  cancelEventRsvp(eventId: string) {
    return this.request<void>(`/api/events/${eventId}/rsvp`, { method: "DELETE", headers: this.headers() });
  }

  listEventRsvps(eventId: string) {
    return this.request<EventRSVPListResponse>(`/api/events/${eventId}/rsvps`, { headers: this.headers() });
  }

  // ---------------------------------------------------------------------------
  // Trips
  // ---------------------------------------------------------------------------
  createTrip(data: { name: string; description?: string | null }) {
    return this.request<TripOut>("/api/trips", { method: "POST", headers: this.headers(), body: JSON.stringify(data) });
  }

  listMyTrips() {
    return this.request<TripListResponse>("/api/trips", { headers: this.headers() });
  }

  getTrip(tripId: string) {
    return this.request<TripOut>(`/api/trips/${tripId}`, { headers: this.headers() });
  }

  addTripDay(tripId: string, data: { ride_log_id: string; day_index: number }) {
    return this.request<TripOut>(`/api/trips/${tripId}/days`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(data),
    });
  }

  removeTripDay(tripId: string, rideLogId: string) {
    return this.request<TripOut>(`/api/trips/${tripId}/days/${rideLogId}`, { method: "DELETE", headers: this.headers() });
  }

  deleteTrip(tripId: string) {
    return this.request<void>(`/api/trips/${tripId}`, { method: "DELETE", headers: this.headers() });
  }

  // ---------------------------------------------------------------------------
  // Photo timeline, best efforts, regions, elevation profile, year in rydr,
  // heatmaps, flyby
  // ---------------------------------------------------------------------------
  getMyRideLogs(limit = 50) {
    return this.request<MyRideLogListResponse>(`/api/ride-logs/mine?limit=${limit}`, { headers: this.headers() });
  }

  getTimeline(userId: string, limit = 100) {
    return this.request<TimelineResponse>(`/api/users/${userId}/timeline?limit=${limit}`, { headers: this.headers() });
  }

  getBestEfforts(userId: string) {
    return this.request<BestEffortListResponse>(`/api/users/${userId}/best-efforts`, { headers: this.headers() });
  }

  listRegions() {
    return this.request<RegionListResponse>("/api/destinations/regions", { headers: this.headers() });
  }

  getElevationProfile(routeId: string) {
    return this.request<ElevationProfileOut>(`/api/routes/${routeId}/elevation-profile`, { headers: this.headers() });
  }

  getYearInRydr(userId: string, year?: number) {
    const suffix = year ? `?year=${year}` : "";
    return this.request<YearInRydrOut>(`/api/users/${userId}/year-in-rydr${suffix}`, { headers: this.headers() });
  }

  getUserHeatmap(userId: string) {
    return this.request<HeatmapResponse>(`/api/heatmap/users/${userId}`, { headers: this.headers() });
  }

  getGlobalHeatmap() {
    return this.request<HeatmapResponse>("/api/heatmap/global", { headers: this.headers() });
  }

  getFlybys(rideLogId: string) {
    return this.request<FlybyListResponse>(`/api/ride-logs/${rideLogId}/flybys`, { headers: this.headers() });
  }
}

export const api = new ApiClient();
