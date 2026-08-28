"use client";
import { useEffect, useRef, useState } from "react";
import type { DestinationSummary } from "@/lib/api.types";

interface DestinationAutocompleteProps {
  destinations: DestinationSummary[];
  loading?: boolean;
  value: string; // selected destination id
  onChange: (destinationId: string) => void;
}

/** Type-to-search destination picker, replacing a giant <select> of every
 * destination in the catalog. Selecting a suggestion carries its known
 * latitude/longitude along automatically via destination_id — there's
 * nothing for the rider to type or paste, unlike the "add a new
 * destination" form, which is for places that AREN'T in the catalog yet. */
export function DestinationAutocomplete({
  destinations,
  loading,
  value,
  onChange,
}: DestinationAutocompleteProps) {
  const selected = destinations.find((d) => d.id === value) || null;
  const [query, setQuery] = useState(selected ? selected.name : "");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep the visible text in sync if the selection changes from outside
  // (e.g. arriving via a ?destination= URL param).
  useEffect(() => {
    if (selected) setQuery(selected.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const matches =
    query.trim().length === 0
      ? destinations.slice(0, 8)
      : destinations
          .filter(
            (d) =>
              d.name.toLowerCase().includes(query.toLowerCase()) ||
              (d.region || "").toLowerCase().includes(query.toLowerCase()),
          )
          .slice(0, 8);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        // Snap back to the last real selection's label if they typed and
        // clicked away without picking anything.
        setQuery(selected ? selected.name : "");
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const pick = (d: DestinationSummary) => {
    onChange(d.id);
    setQuery(d.name);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (matches[highlighted]) pick(matches[highlighted]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlighted(0);
          setOpen(true);
          if (value) onChange(""); // typing invalidates the previous pick until a new one is made
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        disabled={loading}
        placeholder={loading ? "Loading destinations…" : "Start typing a destination…"}
        autoComplete="off"
        className="w-full bg-surface-deep/80 border border-hairline-strong focus:border-accent-gold rounded-lg px-4 py-2.5 text-ink text-sm focus:outline-none transition-all duration-200 disabled:opacity-60"
      />

      {open && !loading && (
        <div className="absolute left-0 right-0 mt-1.5 z-30 card-bordered bg-canvas/95 backdrop-blur-xl max-h-72 overflow-y-auto shadow-2xl">
          {matches.length === 0 ? (
            <p className="px-4 py-3 text-xs text-mute">
              No match. <a href="/destinations/new" className="text-accent-gold hover:underline">Add it as a new destination →</a>
            </p>
          ) : (
            matches.map((d, i) => (
              <button
                key={d.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(d)}
                className={`w-full text-left px-4 py-2.5 text-sm border-b border-hairline last:border-0 transition-colors ${
                  i === highlighted ? "bg-surface-elevated text-ink" : "text-body hover:bg-surface-elevated/60"
                }`}
              >
                <span className="text-ink font-medium">{d.name}</span>
                {d.region && <span className="text-stone text-xs"> · {d.region}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
