"use client";
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


function BadgeTile({
  badge,
  earnedAt,
  locked,
  userBadgeId,
}: {
  badge: BadgeOut;
  earnedAt?: string;
  locked?: boolean;
  /** Present only for earned badges — the id the share-card endpoint keys on. */
  userBadgeId?: string;
}) {
  return (
    <div
      className={`card-bordered p-4 flex flex-col items-center text-center transition-opacity ${
        locked ? "opacity-40" : ""
      }`}
      title={
        locked
          ? `${badge.name} — ${badge.description}`
          : `${badge.name} — earned ${earnedAt ? formatEarnedDate(earnedAt) : ""}`
      }
    >
      {badge.icon_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={badge.icon_url}
          alt={badge.name}
          className="w-12 h-12 mb-2"
          loading="lazy"
        />
      ) : (
        <div className="w-12 h-12 mb-2 rounded-full bg-surface-elevated" />
      )}
      <p className="text-ink text-sm font-medium leading-tight">{badge.name}</p>
      <p className="text-mute text-xs mt-1 leading-tight line-clamp-2">
        {badge.description}
      </p>
      {!locked && earnedAt && (
        <p className="text-stone text-[10px] mt-2 uppercase tracking-wide">
          {formatEarnedDate(earnedAt)}
        </p>
      )}
      {!locked && userBadgeId && (
        <ShareCardButton
          fetchImage={() => api.getBadgeCardImage(userBadgeId)}
          fileName={`rydr-badge-${badge.slug}`}
          shareTitle={badge.name}
          shareText={`I earned the ${badge.name} badge on Rydr`}
          label="Share"
          className="mt-3 w-full text-xs"
        />
      )}
    </div>
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
    <div className="space-y-4">
      {earned.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {earned.map((ub) =>
            ub.badge ? (
              <BadgeTile
                key={ub.id}
                badge={ub.badge}
                earnedAt={ub.earned_at}
                userBadgeId={ub.id}
              />
            ) : null,
          )}
        </div>
      )}

      {locked.length > 0 && (
        <div>
          <p className="label-eyebrow text-stone mb-2">Locked</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {locked.map((b) => (
              <BadgeTile key={b.id} badge={b} locked />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
