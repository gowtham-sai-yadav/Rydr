import { API_BASE_URL, TOKEN_KEY } from "./constants";
import type {
  AdminReportListResponse,
  AdminReportOut,
  AuthResponse,
  BadgeOut,
  BikeOut,
  ChatGroupListResponse,
  ChatGroupOut,
  ChatMessageListResponse,
  ChatMessageOut,
  CloudinarySignature,
  CostEstimate,
  DestinationLeaderboardResponse,
  DestinationPin,
  DestinationListResponse,
  DestinationMediaListResponse,
  DestinationOut,
  FastApiValidationError,
  FollowListResponse,
  FollowOut,
  GeocodeResponse,
  LeaderboardPeriod,
  LikeResponse,
  MapConfigOut,
  MapPinsResponse,
  MineRidesResponse,
  NotificationListResponse,
  NotificationOut,
  ParticipantListResponse,
  PersonalStatsOut,
  PostCommentListResponse,
  PostCommentOut,
  PostListResponse,
  PostOut,
  RatingListResponse,
  RatingOut,
  ReportListResponse,
  ReportOut,
  ReportReason,
  ReportStatus,
  ReportedContentType,
  RideSummary,
  RiderLeaderboardResponse,
  RouteOut,
  RideLogListResponse,
  RideLogOut,
  RideMediaOut,
  RidePlanListResponse,
  RidePlanOut,
  RidePlanParticipantOut,
  TagListResponse,
  UserBadgeOut,
  UserOut,
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
  }>) {
    return this.request<BikeOut>("/api/users/me/bike", {
      method: "PUT",
      headers: this.headers(),
      body: JSON.stringify(data),
    });
  }

  /**
   * Personal stats dashboard. Widened in Phase 4 W5 from three ride
   * counters to weekly/monthly distance, streaks and personal bests; the
   * original three fields kept their names.
   */
  getMyStats() {
    return this.request<PersonalStatsOut>("/api/users/me/stats", {
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
    max_riders?: number;
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
  // ---------------------------------------------------------------------------
  // Notifications (Phase 4 W5)
  // ---------------------------------------------------------------------------
  listNotifications(params: { unread_only?: boolean; page?: number; limit?: number } = {}) {
    const qs = new URLSearchParams();
    if (params.unread_only) qs.set("unread_only", "true");
    if (params.page) qs.set("page", String(params.page));
    if (params.limit) qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs}` : "";
    return this.request<NotificationListResponse>(`/api/notifications${suffix}`, {
      headers: this.headers(),
    });
  }

  getUnreadCount() {
    return this.request<{ unread: number }>("/api/notifications/unread-count", {
      headers: this.headers(),
    });
  }

  markNotificationRead(id: string) {
    return this.request<NotificationOut>(`/api/notifications/${id}/read`, {
      method: "POST",
      headers: this.headers(),
    });
  }

  markAllNotificationsRead() {
    return this.request<{ marked: number }>("/api/notifications/read-all", {
      method: "POST",
      headers: this.headers(),
    });
  }

  dismissNotification(id: string) {
    return this.request<void>(`/api/notifications/${id}`, {
      method: "DELETE",
      headers: this.headers(),
    });
  }

  // ---------------------------------------------------------------------------
  // Community feed (Phase 4 W4)
  // ---------------------------------------------------------------------------
  listPosts(params: {
    following_only?: boolean;
    author_id?: string;
    page?: number;
    limit?: number;
  } = {}) {
    const qs = new URLSearchParams();
    if (params.following_only) qs.set("following_only", "true");
    if (params.author_id) qs.set("author_id", params.author_id);
    if (params.page) qs.set("page", String(params.page));
    if (params.limit) qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs}` : "";
    return this.request<PostListResponse>(`/api/posts${suffix}`, {
      headers: this.headers(),
    });
  }

  createPost(data: {
    body: string;
    ride_log_id?: string | null;
    destination_id?: string | null;
    media?: { url: string; media_type?: string; thumbnail_url?: string | null }[];
  }) {
    return this.request<PostOut>("/api/posts", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(data),
    });
  }

  getPost(id: string) {
    return this.request<PostOut>(`/api/posts/${id}`, { headers: this.headers() });
  }

  updatePost(id: string, body: string) {
    return this.request<PostOut>(`/api/posts/${id}`, {
      method: "PATCH",
      headers: this.headers(),
      body: JSON.stringify({ body }),
    });
  }

  deletePost(id: string) {
    return this.request<void>(`/api/posts/${id}`, {
      method: "DELETE",
      headers: this.headers(),
    });
  }

  likePost(id: string) {
    return this.request<LikeResponse>(`/api/posts/${id}/like`, {
      method: "POST",
      headers: this.headers(),
    });
  }

  unlikePost(id: string) {
    return this.request<LikeResponse>(`/api/posts/${id}/like`, {
      method: "DELETE",
      headers: this.headers(),
    });
  }

  listComments(postId: string, params: { page?: number; limit?: number } = {}) {
    const qs = new URLSearchParams();
    if (params.page) qs.set("page", String(params.page));
    if (params.limit) qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs}` : "";
    return this.request<PostCommentListResponse>(
      `/api/posts/${postId}/comments${suffix}`,
      { headers: this.headers() }
    );
  }

  createComment(postId: string, body: string) {
    return this.request<PostCommentOut>(`/api/posts/${postId}/comments`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ body }),
    });
  }

  deleteComment(commentId: string) {
    return this.request<void>(`/api/posts/comments/${commentId}`, {
      method: "DELETE",
      headers: this.headers(),
    });
  }

  // ---------------------------------------------------------------------------
  // Leaderboards (Phase 4 W5)
  // ---------------------------------------------------------------------------
  getRiderLeaderboard(period: LeaderboardPeriod = "month", limit = 20) {
    return this.request<RiderLeaderboardResponse>(
      `/api/leaderboards/riders?period=${period}&limit=${limit}`,
      { headers: this.headers() }
    );
  }

  getDestinationLeaderboard(period: LeaderboardPeriod = "month", limit = 20) {
    return this.request<DestinationLeaderboardResponse>(
      `/api/leaderboards/destinations?period=${period}&limit=${limit}`,
      { headers: this.headers() }
    );
  }

  // ---------------------------------------------------------------------------
  // Maps + routing (Phase 4 W2)
  // ---------------------------------------------------------------------------
  getMapConfig() {
    // No auth: the map is browsable logged out, and the config carries the
    // attribution string the tile licence requires.
    return this.request<MapConfigOut>("/api/maps/config", {
      headers: this.headers(false),
    });
  }

  getRoute(from: [number, number], to: [number, number]) {
    const qs = new URLSearchParams({
      from_lat: String(from[0]),
      from_lng: String(from[1]),
      to_lat: String(to[0]),
      to_lng: String(to[1]),
    });
    return this.request<RouteOut>(`/api/maps/route?${qs}`, {
      headers: this.headers(false),
    });
  }

  getRouteToDestination(destinationId: string, from: [number, number]) {
    const qs = new URLSearchParams({
      from_lat: String(from[0]),
      from_lng: String(from[1]),
    });
    return this.request<RouteOut>(
      `/api/maps/destinations/${destinationId}/route?${qs}`,
      { headers: this.headers(false) }
    );
  }

  geocode(query: string, limit = 5) {
    const qs = new URLSearchParams({ q: query, limit: String(limit) });
    return this.request<GeocodeResponse>(`/api/maps/geocode?${qs}`, {
      headers: this.headers(false),
    });
  }

  getMapPins(bounds?: {
    north: number;
    south: number;
    east: number;
    west: number;
  }, limit = 500) {
    const qs = new URLSearchParams({ limit: String(limit) });
    if (bounds) {
      // All four or none — the API rejects a partial box rather than
      // silently returning the whole world.
      qs.set("north", String(bounds.north));
      qs.set("south", String(bounds.south));
      qs.set("east", String(bounds.east));
      qs.set("west", String(bounds.west));
    }
    return this.request<MapPinsResponse>(`/api/maps/pins?${qs}`, {
      headers: this.headers(false),
    });
  }

  // ---------------------------------------------------------------------------
  // Ride summary + share cards (Phase 4 W4)
  // ---------------------------------------------------------------------------
  getRideSummary(logId: string) {
    return this.request<RideSummary>(`/api/ride-logs/${logId}/summary`, {
      headers: this.headers(false),
    });
  }

  /**
   * URL of a share card. Not fetched through `request` — this is an image
   * source, handed straight to an <img> or a download link, and the endpoint
   * is public so no Authorization header is involved.
   */
  rideCardUrl(logId: string, opts: { download?: boolean } = {}) {
    const suffix = opts.download ? "?download=1" : "";
    return `${API_BASE_URL}/api/share-cards/rides/${logId}.svg${suffix}`;
  }

  badgeCardUrl(userBadgeId: string, opts: { download?: boolean } = {}) {
    const suffix = opts.download ? "?download=1" : "";
    return `${API_BASE_URL}/api/share-cards/badges/${userBadgeId}.svg${suffix}`;
  }

  // ---------------------------------------------------------------------------
  // Moderation (Phase 4 W7)
  // ---------------------------------------------------------------------------
  createReport(data: {
    content_type: ReportedContentType;
    content_id: string;
    reason: ReportReason;
    details?: string | null;
  }) {
    return this.request<ReportOut>("/api/reports", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(data),
    });
  }

  listMyReports(params: { page?: number; limit?: number } = {}) {
    const qs = new URLSearchParams();
    if (params.page) qs.set("page", String(params.page));
    if (params.limit) qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs}` : "";
    return this.request<ReportListResponse>(`/api/reports/mine${suffix}`, {
      headers: this.headers(),
    });
  }

  listReportQueue(params: {
    status?: ReportStatus;
    content_type?: ReportedContentType;
    page?: number;
    limit?: number;
  } = {}) {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (params.content_type) qs.set("content_type", params.content_type);
    if (params.page) qs.set("page", String(params.page));
    if (params.limit) qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs}` : "";
    return this.request<AdminReportListResponse>(`/api/reports/admin${suffix}`, {
      headers: this.headers(),
    });
  }

  resolveReport(
    id: string,
    data: { status: ReportStatus; resolution_note?: string | null }
  ) {
    return this.request<AdminReportOut>(`/api/reports/admin/${id}`, {
      method: "PATCH",
      headers: this.headers(),
      body: JSON.stringify(data),
    });
  }
}

export const api = new ApiClient();
