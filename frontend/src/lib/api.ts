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
}

export const api = new ApiClient();
