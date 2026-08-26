import { API_BASE_URL, TOKEN_KEY } from "./constants";
import type {
  AuthResponse,
  BadgeOut,
  BikeOut,
  ChatGroupListResponse,
  ChatGroupOut,
  ChatMessageListResponse,
  ChatMessageOut,
  CloudinarySignature,
  CostEstimate,
  DestinationListResponse,
  DestinationMediaListResponse,
  DestinationOut,
  DestinationLeaderboardResponse,
  FastApiValidationError,
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
  RideLogListResponse,
  RideLogOut,
  RideMediaOut,
  RidePlanListResponse,
  RidePlanOut,
  RidePlanParticipantOut,
  TagListResponse,
  UserBadgeOut,
  UserOut,
  UserStatsOut,
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

  // Binary (image/png) response — used by the shareable-card endpoints.
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
  // Social feed (Phase 4 W4) — POST /api/feed wraps an optional ride_log_id
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
  // Leaderboard (Phase 4 W5) — two independent endpoints, no combined route.
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
  // Moderation (Phase 4) — filing a report only requires auth; reading and
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
}

export const api = new ApiClient();
