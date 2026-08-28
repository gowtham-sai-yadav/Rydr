"use client";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import type { BadgeOut, UserBadgeOut } from "@/lib/api.types";
import { ShareCardButton } from "@/components/share/ShareCardButton";


/**
 * Two-row grid: earned badges in full color, then locked badges greyed
 * out beneath. Used on both /profile (showLocked=true so users see
 * goals) and /users/[id] (showLocked=false so others see only what was
 * actually earned).
 *
 * `catalog` is optional — pass it only when `showLocked` is true.
 * Earned badges are matched to catalog rows by slug.
 */
type Props = {
  earned: UserBadgeOut[];
  catalog?: BadgeOut[];
  showLocked?: boolean;
};


function formatEarnedDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}


const BADGE_IMAGES: Record<string, string> = {
  "century-club": "/images/badge_century_club.png",
  "dawn-patrol": "/images/badge_dawn_patrol.png",
  "destination-collector": "/images/badge_destination_collector.png",
  "early-adopter": "/images/badge_early_adopter.png",
  "first-ride": "/images/badge_first_ride.png",
  "storyteller": "/images/badge_storyteller.png",
};

function getBadgeIcon(slug: string, fallbackUrl?: string | null): string {
  const norm = slug.toLowerCase().replace(/_/g, "-");
  return BADGE_IMAGES[norm] || fallbackUrl || "/images/badge_first_ride.png";
}

const RARITY_STYLES: Record<string, { border: string; text: string; label: string }> = {
  common: { border: "border-hairline-strong", text: "text-mute", label: "Common" },
  uncommon: { border: "border-accent-green/40", text: "text-accent-green", label: "Uncommon" },
  rare: { border: "border-accent-blue/40", text: "text-accent-blue", label: "Rare" },
  epic: { border: "border-accent-orange/40", text: "text-accent-orange", label: "Epic" },
  legendary: { border: "border-accent-gold/60", text: "text-accent-gold", label: "Legendary" },
};

function rarityStyle(rarity: string) {
  return RARITY_STYLES[rarity] ?? RARITY_STYLES.common;
}

function BadgeTile({
  badge,
  earnedAt,
  locked,
  userBadgeId,
  index = 0,
}: {
  badge: BadgeOut;
  earnedAt?: string;
  locked?: boolean;
  /** Present only for earned badges — the id the share-card endpoint keys on. */
  userBadgeId?: string;
  index?: number;
}) {
  const imageUrl = getBadgeIcon(badge.slug, badge.icon_url);
  const rarity = rarityStyle(badge.rarity);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index, 12) * 0.04 }}
      whileHover={locked ? undefined : { scale: 1.04 }}
      className={`card-bordered p-5 flex flex-col items-center justify-between text-center bg-surface-card/45 border rounded-2xl shadow-lg relative min-h-[220px] transition-all duration-300 ${
        locked ? "opacity-60 border-hairline-strong" : rarity.border
      }`}
      title={
        locked
          ? `${badge.name} — ${badge.description}`
          : `${badge.name} — earned ${earnedAt ? formatEarnedDate(earnedAt) : ""}`
      }
    >
      {locked ? (
        <div className="absolute top-3 right-3 bg-canvas/60 border border-hairline px-2 py-0.5 rounded text-[9px] font-bold text-stone uppercase tracking-wider select-none">
          Locked
        </div>
      ) : (
        <div className={`absolute top-3 right-3 bg-canvas/60 border ${rarity.border} px-2 py-0.5 rounded text-[9px] font-bold ${rarity.text} uppercase tracking-wider select-none`}>
          {rarity.label}
        </div>
      )}

      {/* Emblem graphics */}
      <div className="relative flex items-center justify-center py-2 select-none">
        <img
          src={imageUrl}
          alt={badge.name}
          className={`w-20 h-20 object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.4)] transition-all duration-500 ${
            locked ? "filter grayscale brightness-[0.35]" : ""
          }`}
          loading="lazy"
        />
        {locked && (
          <div className="absolute inset-0 flex items-center justify-center">
            <svg className="w-5 h-5 text-stone/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
        )}
      </div>

      <div className="space-y-1 w-full pt-2">
        <h4 className="text-ink font-bold text-xs uppercase tracking-wider line-clamp-1">{badge.name}</h4>
        <p className="text-mute text-[10px] leading-relaxed line-clamp-2 px-1">
          {badge.description}
        </p>
      </div>

      <div className="w-full pt-3">
        {!locked && earnedAt ? (
          <p className="text-accent-gold text-[9px] font-bold uppercase tracking-widest">
            {formatEarnedDate(earnedAt)}
          </p>
        ) : (
          <div className="h-3" />
        )}

        {!locked && userBadgeId && (
          <ShareCardButton
            fetchImage={() => api.getBadgeCardImage(userBadgeId)}
            fileName={`rydr-badge-${badge.slug}`}
            shareTitle={badge.name}
            shareText={`I earned the ${badge.name} badge on Rydr`}
            label="Share Badge"
            className="mt-3.5 w-full text-[10px] font-bold py-1.5 rounded-lg uppercase tracking-wider"
          />
        )}
      </div>
    </motion.div>
  );
}


export function BadgeShelf({ earned, catalog, showLocked }: Props) {
  const earnedSlugs = new Set(
    earned.map((u) => u.badge?.slug).filter((s): s is string => !!s),
  );

  // Locked = catalog minus what's already earned. Computed only when
  // we have a catalog AND showLocked is on.
  const locked =
    showLocked && catalog
      ? catalog.filter((b) => !earnedSlugs.has(b.slug))
      : [];

  if (earned.length === 0 && locked.length === 0) {
    return (
      <p className="text-mute text-sm">No badges yet.</p>
    );
  }

  return (
    <div className="space-y-6">
      {earned.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {earned.map((ub, i) =>
            ub.badge ? (
              <BadgeTile
                key={ub.id}
                badge={ub.badge}
                earnedAt={ub.earned_at}
                userBadgeId={ub.id}
                index={i}
              />
            ) : null,
          )}
        </div>
      )}

      {locked.length > 0 && (
        <div className="space-y-2">
          <p className="label-eyebrow text-stone">Locked Achievements</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {locked.map((b) => (
              <BadgeTile key={b.id} badge={b} locked />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
