import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { LostRoadSvg } from "@/components/illustrations/LostRoadSvg";

/**
 * Root 404. Next.js renders this whenever a route doesn't match or
 * `notFound()` is thrown outside a nested `not-found.tsx`. It renders
 * outside the `(main)` layout, so no navbar / bottom-nav / auth gate.
 *
 * Copy is written in the voice of the app: what happened, what to do next.
 * No "Oops!", no exclamation marks, no lost-astronaut clip-art.
 */
export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-canvas px-6 py-16 relative overflow-hidden">
      {/* Ambient wash — same radial-gold motif as the sign-in page, matched
          in intensity so the two pages read as one system. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 40% at 50% 20%, rgba(245,158,11,0.06), transparent 60%)",
        }}
      />

      <div className="relative w-full max-w-xl flex flex-col items-center text-center">
        <Link
          href="/destinations"
          className="font-display text-2xl font-black tracking-tighter text-accent-gold hover:text-accent-gold-strong transition-colors mb-8 select-none"
        >
          Rydr
        </Link>

        <LostRoadSvg className="w-full max-w-lg mb-4" />

        {/* The "404" itself in Rydr's metric dialect — the mono, tabular,
            small-caps unit signature. Reads as a dashboard readout rather
            than a stock error page. */}
        <div className="flex items-baseline gap-2 mb-4">
          <span className="metric-value text-6xl sm:text-7xl text-ink">404</span>
          <span className="metric-unit">not found</span>
        </div>

        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-ink mb-3">
          This road doesn&apos;t go anywhere.
        </h1>
        <p className="text-sm sm:text-base text-mute leading-relaxed max-w-md mb-8">
          The page you were looking for isn&apos;t on the map — the link may
          have changed, or the ride you were reading has been cancelled. Head
          back to Discover and pick a new destination.
        </p>

        <div className="flex flex-col sm:flex-row items-stretch gap-3 w-full max-w-sm">
          <Button asChild size="lg" className="sm:flex-1">
            <Link href="/destinations">Back to Discover</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="sm:flex-1">
            <Link href="/feed">Open the feed</Link>
          </Button>
        </div>

        {/* A quiet caption, useful when the user is trying to figure out
            whether they hit a genuine broken link. */}
        <p className="mt-10 text-xs text-stone">
          If you followed a link from somewhere in the app and expected this
          page to exist, let the team know.
        </p>
      </div>
    </main>
  );
}
