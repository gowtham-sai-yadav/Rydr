export type DestinationCardView = {
  id: number;
  name: string;
  region?: string;
  rating: number;
  reviewCount: number;
  heroMediaUrl?: string;
};

export type DestinationFilterView = {
  query: string;
  vibes: string[];
  vehicleFit: string[];
  maxCost?: "low" | "mid" | "high";
};
