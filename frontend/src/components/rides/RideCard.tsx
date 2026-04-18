"use client";
import Link from "next/link";
import { Ride } from "@/lib/types";

const difficultyColors: Record<string, string> = {
  easy: "bg-green-600",
  moderate: "bg-yellow-600",
  hard: "bg-orange-600",
  expert: "bg-red-600",
};

export default function RideCard({ ride }: { ride: Ride }) {
  return (
    <Link href={`/rides/${ride.id}`}>
      <div className="bg-gray-800 rounded-xl overflow-hidden hover:ring-2 hover:ring-orange-500/50 transition-all cursor-pointer group">
        <div className="relative h-44 bg-gray-700">
          {ride.thumbnail_url ? (
            <img
              src={ride.thumbnail_url}
              alt={ride.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-500">
              <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
            </div>
          )}
          <div className="absolute top-3 right-3">
            <span className={`${difficultyColors[ride.difficulty_level] || "bg-gray-600"} text-white text-xs px-2 py-1 rounded-full font-medium capitalize`}>
              {ride.difficulty_level}
            </span>
          </div>
        </div>
        <div className="p-4">
          <h3 className="text-white font-semibold text-lg mb-1 line-clamp-1">{ride.title}</h3>
          <p className="text-gray-400 text-sm line-clamp-2 mb-3">{ride.description}</p>
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-gray-400">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>{ride.ride_date}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-400">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>{ride.participant_count ?? 0}/{ride.max_riders}</span>
            </div>
          </div>
          {ride.captain && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-700">
              <div className="w-6 h-6 rounded-full bg-orange-600 flex items-center justify-center text-xs font-bold text-white">
                {ride.captain.name.charAt(0)}
              </div>
              <span className="text-gray-400 text-sm">{ride.captain.name}</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
