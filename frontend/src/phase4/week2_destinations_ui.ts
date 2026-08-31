export type DestinationCardView = {
  id: number;
  name: string;
  region?: string;
  avgRating: number;
  reviewCount: number;
  heroMediaUrl?: string;
};

export type DestinationFilterView = {
  query?: string;
  vibes: string[];
  vehicleFit: string[];
  maxCost?: "low" | "mid" | "high";
};

