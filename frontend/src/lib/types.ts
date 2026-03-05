export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatar_url?: string;
  bio?: string;
  bike?: Bike;
}

export interface Bike {
  id: string;
  user_id: string;
  name?: string;
  model?: string;
  year?: number;
}

export interface Ride {
  id: string;
  captain_id: string;
  title: string;
  description?: string;
  thumbnail_url?: string;
  ride_date: string;
  start_time: string;
  estimated_end_time?: string;
  difficulty_level: "easy" | "moderate" | "hard" | "expert";
  recommended_bike_type?: string;
  break_schedule?: string;
  status: "open" | "in_progress" | "completed" | "cancelled";
  max_riders: number;
  captain?: User;
  stops?: RideStop[];
  participants?: RideParticipant[];
  participant_count?: number;
}

export interface RideStop {
  id: string;
  ride_id: string;
  name: string;
  description?: string;
  stop_order: number;
  latitude?: number;
  longitude?: number;
  is_break_stop: boolean;
}

export interface RideParticipant {
  id: string;
  ride_id: string;
  user_id: string;
  status: "pending" | "approved" | "rejected" | "left";
  user?: User;
}

export interface ChatGroup {
  id: string;
  ride_id: string;
  name: string;
}

export interface ChatMessage {
  id: string;
  sender_name: string;
  sender_avatar?: string;
  content: string;
  timestamp: string;
  is_mine: boolean;
}

export interface UserStats {
  rides_captained: number;
  rides_joined: number;
  rides_completed: number;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}
