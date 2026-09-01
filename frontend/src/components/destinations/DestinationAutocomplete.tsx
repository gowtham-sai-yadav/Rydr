"use client";
/**
 * DestinationAutocomplete — type-to-search destination picker.
 *
 * Why the dropdown is portaled
 * ----------------------------
 * The picker lives inside a form card that paints with `backdrop-blur`,
 * which creates its own stacking context. An absolutely-positioned dropdown
 * inside that context can't rise above sibling cards further down the page,
 * so it gets painted through the next card and mixed with its backdrop.
 * Portaling the dropdown into `document.body` escapes the parent's
 * stacking context; positioning is recomputed from the input's rect so it
 * still sits directly under the field visually.
 *
 * Everything else is unchanged: input value + selection state + keyboard
 * navigation + snap-back on click-outside.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DestinationSummary } from "@/lib/api.types";
import { cn } from "@/lib/cn";

interface DestinationAutocompleteProps {
  destinations: DestinationSummary[];
  loading?: boolean;
  value: string; // selected destination id
  onChange: (destinationId: string) => void;
}

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
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Portal + browser-only APIs — mark hydration-safe.
  useEffect(() => setMounted(true), []);

  // Keep the visible text in sync if the selection changes from outside
  // (e.g. arriving via a ?destination= URL param).
  useEffect(() => {
    if (selected) setQuery(selected.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Track the input's rect so the portaled dropdown can position under it.
  // Recompute on open, on window scroll and on window resize.
  useLayoutEffect(() => {
    if (!open || !inputRef.current) return;
    const update = () => {
      if (inputRef.current) setRect(inputRef.current.getBoundingClientRect());
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

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
      const t = e.target as Node;
      const insideInput = inputRef.current?.contains(t);
      const insideList = listRef.current?.contains(t);
      if (!insideInput && !insideList) {
        setOpen(false);
        // Snap back to the last real selection if the user typed and clicked
        // away without picking anything.
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

  const inputClass = cn(
    "w-full bg-surface-card text-ink placeholder:text-stone text-sm",
    "border border-hairline-strong rounded-[var(--radius-input)]",
    "h-10 px-3",
    "transition-[border-color,box-shadow] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)]",
    "hover:border-accent-gold/40",
    "focus:outline-none focus:border-accent-gold focus:shadow-[0_0_0_3px_var(--color-accent-gold-glow)]",
    "disabled:opacity-60",
  );

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlighted(0);
          setOpen(true);
          if (value) onChange("");
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        disabled={loading}
        placeholder={loading ? "Loading destinations…" : "Start typing a destination…"}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        className={inputClass}
      />

      {mounted && open && !loading && rect &&
        createPortal(
          <div
            ref={listRef}
            style={{
              position: "fixed",
              top: rect.bottom + 6,
              left: rect.left,
              width: rect.width,
              zIndex: 60,
            }}
            className={cn(
              "anim-fade-scale",
              "rounded-[var(--radius-card)] overflow-hidden",
              // Solid surface — no translucency so nothing bleeds through
              // from the pages underneath. Border + soft shadow for depth.
              "bg-surface-deep border border-hairline-strong shadow-2xl shadow-black/60",
              "max-h-72 overflow-y-auto",
            )}
            role="listbox"
          >
            {matches.length === 0 ? (
              <p className="px-4 py-3 text-xs text-mute">
                No match.{" "}
                <a
                  href="/destinations/new"
                  className="text-accent-gold hover:underline"
                >
                  Add it as a new destination →
                </a>
              </p>
            ) : (
              matches.map((d, i) => (
                <button
                  key={d.id}
                  type="button"
                  role="option"
                  aria-selected={i === highlighted}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(d)}
                  onMouseEnter={() => setHighlighted(i)}
                  className={cn(
                    "w-full text-left px-4 py-2.5 text-sm border-b border-hairline last:border-0 transition-colors duration-[120ms]",
                    i === highlighted
                      ? "bg-white/[0.06] text-ink"
                      : "text-body hover:bg-white/[0.03]",
                  )}
                >
                  <span className="text-ink font-medium">{d.name}</span>
                  {d.region && (
                    <span className="text-stone text-xs"> · {d.region}</span>
                  )}
                </button>
              ))
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
