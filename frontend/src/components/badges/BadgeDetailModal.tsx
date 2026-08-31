"use client";
/**
 * BadgeDetailModal — opens when a badge tile is clicked.
 *
 * The badge itself becomes the focus of the modal — it grows from its
 * shelf-size to a hero-size in one motion, orbits gently, and shows the
 * name, description, rarity and earned-date. When the badge was earned
 * recently (last 24h) we also fire a one-shot particle burst behind the
 * emblem for the celebratory hit.
 *
 * Design intent
 * -------------
 * A badge is a small thing that just became a big thing. The modal should
 * feel like that — arrive with weight, hold still, invite reading. The
 * ambient orbit is small enough that it reads as "alive" without pulling
 * focus from the type. Reduced-motion collapses everything to a static
 * pose.
 *
 * `sharing` is delegated back to the caller so the shelf can pass its
 * existing ShareCardButton unchanged.
 */
import { motion, useReducedMotion } from "framer-motion";
import { useMemo, type ReactNode } from "react";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { Badge as UiBadge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";

const RARITY_META: Record<
  string,
  { label: string; badgeVariant: "default" | "success" | "blue" | "warning" | "gold"; ringClass: string; glowClass: string }
> = {
  common: {
    label: "Common",
    badgeVariant: "default",
    ringClass: "ring-hairline-strong",
    glowClass: "from-white/[0.02]",
  },
  uncommon: {
    label: "Uncommon",
    badgeVariant: "success",
    ringClass: "ring-accent-green/40",
    glowClass: "from-accent-green/25",
  },
  rare: {
    label: "Rare",
    badgeVariant: "blue",
    ringClass: "ring-accent-blue/40",
    glowClass: "from-accent-blue/30",
  },
  epic: {
    label: "Epic",
    badgeVariant: "warning",
    ringClass: "ring-accent-orange/40",
    glowClass: "from-accent-orange/30",
  },
  legendary: {
    label: "Legendary",
    badgeVariant: "gold",
    ringClass: "ring-accent-gold/60",
    glowClass: "from-accent-gold/35",
  },
};

function rarityMeta(rarity: string) {
  return RARITY_META[rarity] ?? RARITY_META.common;
}

function formatEarned(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function wasRecentlyEarned(iso?: string) {
  if (!iso) return false;
  const then = new Date(iso).getTime();
  return Date.now() - then < 24 * 60 * 60 * 1000;
}

interface BadgeDetail {
  slug: string;
  name: string;
  description: string;
  rarity: string;
  imageUrl: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  badge: BadgeDetail | null;
  earnedAt?: string;
  locked?: boolean;
  /** Slot for a share-button (or anything else) rendered under the description. */
  actions?: ReactNode;
}

export function BadgeDetailModal({
  open,
  onOpenChange,
  badge,
  earnedAt,
  locked,
  actions,
}: Props) {
  const reduced = useReducedMotion();
  const meta = badge ? rarityMeta(badge.rarity) : rarityMeta("common");
  const celebrate = !locked && wasRecentlyEarned(earnedAt);

  // Particle offsets are computed once per open so the burst is stable
  // during the animation and doesn't reshuffle on re-render.
  const particles = useMemo(() => {
    if (!celebrate || reduced) return [];
    return Array.from({ length: 18 }, (_, i) => {
      const angle = (i / 18) * Math.PI * 2;
      const distance = 90 + Math.random() * 40;
      return {
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance,
        delay: Math.random() * 0.15,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [celebrate, reduced, badge?.slug]);

  if (!badge) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!p-0 overflow-hidden"
        // The badge itself provides the focus target; the aria-label carries
        // the name for screen readers.
        aria-label={`${badge.name} — ${badge.description}`}
      >
        {/* Ambient glow behind the emblem — hue matches rarity. */}
        <div
          className={cn(
            "relative flex flex-col items-center gap-6 px-8 pt-14 pb-10 text-center",
            "bg-gradient-to-b to-transparent",
            meta.glowClass,
          )}
        >
          <div className="relative flex items-center justify-center">
            {/* Particle burst — only for recently-earned, respects reduced motion. */}
            {particles.map((p, i) => (
              <motion.span
                key={i}
                className="pointer-events-none absolute h-1.5 w-1.5 rounded-full bg-accent-gold shadow-[0_0_8px_var(--color-accent-gold)]"
                initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
                animate={{
                  x: p.x,
                  y: p.y,
                  opacity: [0, 1, 0],
                  scale: [0, 1, 0.4],
                }}
                transition={{
                  duration: 1.1,
                  delay: p.delay,
                  ease: "easeOut",
                }}
              />
            ))}

            <motion.div
              className={cn(
                "relative flex h-40 w-40 items-center justify-center rounded-full",
                "ring-2 ring-offset-4 ring-offset-surface-elevated",
                meta.ringClass,
                "bg-canvas/40 backdrop-blur",
              )}
              initial={reduced ? { scale: 1, rotate: 0 } : { scale: 0.4, rotate: -12, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{
                type: "spring",
                stiffness: 240,
                damping: 22,
                mass: 0.8,
              }}
            >
              <motion.img
                src={badge.imageUrl}
                alt={badge.name}
                className={cn(
                  "h-28 w-28 object-contain drop-shadow-[0_12px_24px_rgba(0,0,0,0.55)]",
                  locked && "grayscale brightness-[0.4]",
                )}
                animate={
                  reduced
                    ? undefined
                    : { y: [0, -4, 0], rotate: [0, 1.5, -1.5, 0] }
                }
                transition={{
                  duration: 6,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
            </motion.div>
          </div>

          <div className="space-y-3 max-w-sm">
            <div className="flex items-center justify-center gap-2">
              <UiBadge variant={meta.badgeVariant}>{meta.label}</UiBadge>
              {locked && <UiBadge variant="outline">Locked</UiBadge>}
            </div>
            <h2 className="font-display text-2xl font-bold text-ink tracking-tight">
              {badge.name}
            </h2>
            <p className="text-sm text-mute leading-relaxed">{badge.description}</p>
          </div>

          {!locked && earnedAt && (
            <div className="pt-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-mute">
                Earned {formatEarned(earnedAt)}
              </span>
            </div>
          )}

          {actions && <div className="pt-2 w-full max-w-xs">{actions}</div>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
