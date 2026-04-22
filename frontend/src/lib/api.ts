import { API_BASE_URL, TOKEN_KEY } from "./constants";

type FastApiValidationError = { loc?: unknown[]; msg?: string; type?: string };

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
    return res.json();
  }

  // Auth
  signup(data: Record<string, unknown>) {
    return this.request<{ access_token: string; token_type: string; user: unknown }>("/api/auth/signup", {
      method: "POST",
      headers: this.headers(false),
      body: JSON.stringify(data),
    });
  }

  login(email: string, password: string) {
    return this.request<{ access_token: string; token_type: string; user: unknown }>("/api/auth/login", {
      method: "POST",
      headers: this.headers(false),
      body: JSON.stringify({ email, password }),
    });
  }

  // Users
  getMe() {
    return this.request<unknown>("/api/users/me", { headers: this.headers() });
  }

  updateMe(data: Record<string, unknown>) {
    return this.request<unknown>("/api/users/me", {
      method: "PUT",
      headers: this.headers(),
      body: JSON.stringify(data),
    });
  }

  updateBike(data: Record<string, unknown>) {
    return this.request<unknown>("/api/users/me/bike", {
      method: "PUT",
      headers: this.headers(),
      body: JSON.stringify(data),
    });
  }

  getMyStats() {
    return this.request<unknown>("/api/users/me/stats", { headers: this.headers() });
  }

  getUser(userId: string) {
    return this.request<unknown>(`/api/users/${userId}`, { headers: this.headers() });
  }

  // Rides (M3 — destination-anchored ride planning)
  //
  // NOTE: the existing `/rides/create` page is still on the old PoC payload
  // shape (`stops`, `ride_date`, `start_time`) and will break against this
  // backend until the UX track rewrites it. The methods below match the
  // new server contract.
  getRideFeed(params: {
    destination_id?: string;
    region?: string;
    date_from?: string;
    date_to?: string;
    page?: number;
    limit?: number;
  } = {}) {
    const qs = new URLSearchParams();
    if (params.destination_id) qs.set("destination_id", params.destination_id);
    if (params.region) qs.set("region", params.region);
    if (params.date_from) qs.set("date_from", params.date_from);
    if (params.date_to) qs.set("date_to", params.date_to);
    if (params.page) qs.set("page", String(params.page));
    if (params.limit) qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.request<unknown>(`/api/rides/feed${suffix}`, { headers: this.headers() });
  }

  getMyRides(params: { status?: string; include_left?: boolean; page?: number; limit?: number } = {}) {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (params.include_left) qs.set("include_left", "true");
    if (params.page) qs.set("page", String(params.page));
    if (params.limit) qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.request<unknown>(`/api/rides/mine${suffix}`, { headers: this.headers() });
  }

  createRide(data: {
    destination_id: string;
    title: string;
    description?: string | null;
    thumbnail_url?: string | null;
    planned_date: string; // YYYY-MM-DD
    planned_start_time: string; // HH:MM:SS
    estimated_end_time?: string | null;
    visibility?: "solo" | "group";
    difficulty_level?: "easy" | "moderate" | "hard" | "expert";
    recommended_bike_type?: string | null;
    break_schedule?: string | null;
    max_riders?: number;
    route_id?: string | null;
  }) {
    return this.request<unknown>("/api/rides", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(data),
    });
  }

  getRide(id: string) {
    return this.request<unknown>(`/api/rides/${id}`, { headers: this.headers() });
  }

  updateRide(id: string, data: Record<string, unknown>) {
    return this.request<unknown>(`/api/rides/${id}`, {
      method: "PUT",
      headers: this.headers(),
      body: JSON.stringify(data),
    });
  }

  cancelRide(id: string) {
    return this.request<unknown>(`/api/rides/${id}`, {
      method: "DELETE",
      headers: this.headers(),
    });
  }

  // Back-compat alias — old call sites used `deleteRide`. Soft-cancel semantics.
  deleteRide(id: string) {
    return this.cancelRide(id);
  }

  joinRide(id: string) {
    return this.request<unknown>(`/api/rides/${id}/join`, {
      method: "POST",
      headers: this.headers(),
    });
  }

  leaveRide(id: string) {
    return this.request<unknown>(`/api/rides/${id}/leave`, {
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
    return this.request<unknown>(`/api/rides/${rideId}/participants${suffix}`, {
      headers: this.headers(),
    });
  }

  updateParticipant(rideId: string, userId: string, status: "approved" | "rejected") {
    return this.request<unknown>(`/api/rides/${rideId}/participants/${userId}`, {
      method: "PUT",
      headers: this.headers(),
      body: JSON.stringify({ status }),
    });
  }

  // Chat
  getChatGroups() {
    return this.request<unknown>("/api/chat/groups", { headers: this.headers() });
  }

  getChatMessages(groupId: string) {
    return this.request<unknown>(`/api/chat/groups/${groupId}/messages`, { headers: this.headers() });
  }

  // Destinations (M2)
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
    return this.request<unknown>(`/api/destinations${suffix}`, { headers: this.headers() });
  }

  getDestination(id: string) {
    return this.request<unknown>(`/api/destinations/${id}`, { headers: this.headers() });
  }

  getDestinationMedia(id: string, page = 1, limit = 20) {
    return this.request<unknown>(
      `/api/destinations/${id}/media?page=${page}&limit=${limit}`,
      { headers: this.headers() },
    );
  }

  submitDestination(data: Record<string, unknown>) {
    return this.request<unknown>("/api/destinations", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(data),
    });
  }

  listRatings(destinationId: string, page = 1, limit = 20) {
    return this.request<unknown>(
      `/api/destinations/${destinationId}/ratings?page=${page}&limit=${limit}`,
      { headers: this.headers() },
    );
  }

  submitRating(destinationId: string, data: { stars: number; review?: string; ride_log_id?: string }) {
    return this.request<unknown>(`/api/destinations/${destinationId}/ratings`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(data),
    });
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
    return this.request<unknown>(`/api/destinations/${destinationId}/cost-estimate${suffix}`, {
      headers: this.headers(),
    });
  }

  listTags() {
    return this.request<unknown>("/api/tags", { headers: this.headers() });
  }
}

export const api = new ApiClient();
