"use client";
import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseISODate(s: string): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function startOfCalendarGrid(year: number, month: number): Date {
  const first = new Date(year, month, 1);
  const dow = (first.getDay() + 6) % 7; // Monday = 0
  const start = new Date(first);
  start.setDate(first.getDate() - dow);
  return start;
}

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  placeholder?: string;
  required?: boolean;
  "aria-label"?: string;
}

/** Accessible calendar-popover date picker replacing the native
 * <input type="date">, whose rendering varies across browsers. */
export function DatePicker({ value, onChange, min, placeholder = "Select date", required, "aria-label": ariaLabel }: DatePickerProps) {
  const selected = parseISODate(value);
  const minDate = min ? parseISODate(min) : null;
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => selected ?? new Date());

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const gridStart = startOfCalendarGrid(year, month);
  const days: Date[] = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });

  const isDisabled = (d: Date) => !!minDate && d < new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate());

  const label = selected
    ? selected.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" })
    : placeholder;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={ariaLabel ?? "Choose date"}
          className={`w-full flex items-center justify-between gap-2 bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2.5 text-left focus:outline-none focus:ring-2 focus:ring-ink/30 ${
            selected ? "text-ink" : "text-mute"
          }`}
        >
          <span className="truncate">{label}</span>
          <svg className="w-4 h-4 text-mute shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
          </svg>
        </button>
      </Popover.Trigger>
      {required && <input type="hidden" required value={value} readOnly />}
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          align="start"
          className="z-50 w-72 card-bordered p-3 bg-canvas shadow-xl"
        >
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setViewDate(new Date(year, month - 1, 1))}
              className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-surface-elevated text-charcoal hover:text-ink"
            >
              ‹
            </button>
            <p className="text-sm font-medium text-ink">{MONTHS[month]} {year}</p>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setViewDate(new Date(year, month + 1, 1))}
              className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-surface-elevated text-charcoal hover:text-ink"
            >
              ›
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAYS.map((w) => (
              <div key={w} className="text-[10px] text-stone text-center uppercase">{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((d) => {
              const inMonth = d.getMonth() === month;
              const iso = toISODate(d);
              const isSelected = value === iso;
              const disabled = isDisabled(d);
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onChange(iso);
                    setOpen(false);
                  }}
                  className={`h-8 w-8 text-xs rounded-full flex items-center justify-center transition-colors ${
                    disabled
                      ? "text-stone/40 cursor-not-allowed"
                      : isSelected
                        ? "bg-accent-gold text-canvas font-semibold"
                        : inMonth
                          ? "text-ink hover:bg-surface-elevated"
                          : "text-stone/60 hover:bg-surface-elevated"
                  }`}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
