"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";

interface NominatimResult {
  place_id: number;
  display_name: string;
  name?: string;
  lat: string;
  lon: string;
  address?: Record<string, string>;
}

interface PlaceSuggestion {
  id: number;
  label: string;
  region: string;
  lat: number;
  lng: number;
}

interface PlaceAutocompleteProps {
  query: string;
  /** Names of destinations we already have (for the "no rider has been
   * here yet" distinction) - matched case-insensitively, substring either
   * direction so "Munnar" matches a Nominatim "Munnar, Idukki, Kerala". */
  knownNames: string[];
}

function regionOf(addr?: Record<string, string>): string {
  if (!addr) return "India";
  return addr.state || addr.county || addr.city || addr.town || "India";
}

function isKnown(label: string, knownNames: string[]): boolean {
  const lower = label.toLowerCase();
  return knownNames.some(
    (n) => lower.includes(n.toLowerCase()) || n.toLowerCase().includes(lower.split(",")[0].trim()),
  );
}

/** India-wide place search-as-you-type, backed by OpenStreetMap's free
 * Nominatim geocoder (no API key). Distinct from the grid below it, which
 * only searches the ~40 destinations Rydr actually has data for - this
 * covers every town/hill/lake in the country, and tells the rider plainly
 * when nobody's logged a ride there yet instead of just coming up empty. */
export function PlaceAutocomplete({ query, knownNames }: PlaceAutocompleteProps) {
  const router = useRouter();
  const [results, setResults] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLElement | null>(null);

  // react-dom's createPortal + window APIs are browser-only. Marking mounted
  // avoids a hydration mismatch on the first paint.
  useEffect(() => setMounted(true), []);

  // The anchor is the RELATIVE wrapper that holds both the search <input>
  // and this component in the parent tree. On mount we walk up one level to
  // find it, then track its rect on scroll / resize so the portaled panel
  // always sits directly under the search input.
  useLayoutEffect(() => {
    anchorRef.current = containerRef.current?.parentElement ?? null;
    const update = () => {
      if (anchorRef.current) setRect(anchorRef.current.getBoundingClientRect());
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      setOpen(false);
      return;
    }
    const handle = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      try {
        const url = new URL("https://nominatim.openstreetmap.org/search");
        url.searchParams.set("q", q);
        url.searchParams.set("countrycodes", "in");
        url.searchParams.set("format", "json");
        url.searchParams.set("addressdetails", "1");
        url.searchParams.set("limit", "8");
        const res = await fetch(url.toString(), { signal: controller.signal });
        if (!res.ok) throw new Error("place search failed");
        const data: NominatimResult[] = await res.json();
        const mapped: PlaceSuggestion[] = data
          .map((r) => ({
            id: r.place_id,
            label: r.name || r.display_name.split(",")[0].trim(),
            region: regionOf(r.address),
            lat: parseFloat(r.lat),
            lng: parseFloat(r.lon),
          }))
          // Alphabetical, as asked - Nominatim's own order is relevance-ranked.
          .sort((a, b) => a.label.localeCompare(b.label));
        setResults(mapped);
        setOpen(mapped.length > 0);
      } catch (err) {
        if ((err as Error).name !== "AbortError") setResults([]);
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = containerRef.current;
      // The panel is portaled outside the anchor, so we tag it with
      // data-rydr-place-panel and treat clicks inside it as "in".
      if (target.closest?.("[data-rydr-place-panel]")) return;
      if (anchor && !anchor.contains(target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // A zero-height marker so we can find our anchor (the wrapping "relative"
  // element in the parent tree). The actual panel is portaled to the body so
  // it escapes any `backdrop-blur` stacking context set by parent cards —
  // that was the source of the "dropdown paints behind the next card" bug.
  const anchor = <span ref={(el) => {
    // Keep the ref shape a `div` so React doesn't yell about mismatched types.
    if (el) containerRef.current = el.parentElement as HTMLDivElement | null;
  }} className="hidden" />;

  if (!open) return anchor;

  const panel = rect ? (
    <div
      data-rydr-place-panel
      style={{
        position: "fixed",
        top: rect.bottom + 8,
        left: rect.left,
        width: rect.width,
        zIndex: 60,
      }}
      className={cn(
        "anim-fade-scale",
        "rounded-[var(--radius-card)] overflow-hidden max-h-80 overflow-y-auto",
        "bg-surface-deep border border-hairline-strong shadow-2xl shadow-black/60",
      )}
    >
      {loading && (
        <p className="px-4 py-3 text-xs text-mute uppercase tracking-wider font-semibold">
          Searching India…
        </p>
      )}
      {!loading && results.length === 0 && (
        <p className="px-4 py-3 text-xs text-mute">No places found.</p>
      )}
      {results.map((r) => {
        const known = isKnown(r.label, knownNames);
        return (
          <button
            key={r.id}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setOpen(false);
              if (known) return;
              router.push(
                `/destinations/new?name=${encodeURIComponent(r.label)}&region=${encodeURIComponent(r.region)}&latitude=${r.lat}&longitude=${r.lng}`,
              );
            }}
            className="w-full text-left px-4 py-3 border-b border-hairline last:border-0 hover:bg-white/[0.04] transition-colors flex items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <p className="text-ink text-sm font-medium truncate">{r.label}</p>
              <p className="text-stone text-xs truncate">{r.region}</p>
            </div>
            {known ? (
              <span className="text-[10px] font-bold uppercase tracking-wider text-accent-gold shrink-0">
                In Rydr
              </span>
            ) : (
              <span className="text-[10px] font-bold uppercase tracking-wider text-mute shrink-0 text-right">
                No rider here yet
                <br />
                <span className="text-accent-gold">Plan the first trip →</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  ) : null;

  return (
    <>
      {anchor}
      {mounted && panel && createPortal(panel, document.body)}
    </>
  );
}
