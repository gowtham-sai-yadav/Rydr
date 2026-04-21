import { API_BASE_URL, TOKEN_KEY } from "./constants";

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
      throw new Error(body.detail || `Request failed: ${res.status}`);
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

  // Rides
  getRideFeed(page = 1, limit = 12) {
    return this.request<unknown>(`/api/rides/feed?page=${page}&limit=${limit}`, { headers: this.headers() });
  }

  getMyRides(status?: string) {
    const q = status ? `?status=${status}` : "";
    return this.request<unknown>(`/api/rides/mine${q}`, { headers: this.headers() });
  }

  createRide(data: Record<string, unknown>) {
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

  deleteRide(id: string) {
    return this.request<unknown>(`/api/rides/${id}`, {
      method: "DELETE",
      headers: this.headers(),
    });
  }

  joinRide(id: string) {
    return this.request<unknown>(`/api/rides/${id}/join`, {
      method: "POST",
      headers: this.headers(),
    });
  }

  getParticipants(rideId: string) {
    return this.request<unknown>(`/api/rides/${rideId}/participants`, { headers: this.headers() });
  }

  updateParticipant(rideId: string, userId: string, status: string) {
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
