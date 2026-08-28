"use client";
import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = ["00", "15", "30", "45"];

function formatLabel(value: string): string {
  if (!value) return "";
  const [hStr, mStr] = value.split(":");
  const h = Number(hStr);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mStr} ${period}`;
}

interface TimePickerProps {
  value: string; // "HH:MM"
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  "aria-label"?: string;
}

/** Popover hour/minute picker replacing the native <input type="time">,
 * whose control chrome differs across browsers and is fiddly on touch. */
export function TimePicker({ value, onChange, placeholder = "Select time", required, "aria-label": ariaLabel }: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const [hour, minute] = value ? value.split(":") : ["", ""];

  const setHour = (h: string) => onChange(`${h}:${minute || "00"}`);
  const setMinute = (m: string) => onChange(`${hour || "00"}:${m}`);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={ariaLabel ?? "Choose time"}
          className={`w-full flex items-center justify-between gap-2 bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2.5 text-left focus:outline-none focus:ring-2 focus:ring-ink/30 ${
            value ? "text-ink" : "text-mute"
          }`}
        >
          <span className="truncate">{value ? formatLabel(value) : placeholder}</span>
          <svg className="w-4 h-4 text-mute shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
      </Popover.Trigger>
      {required && <input type="hidden" required value={value} readOnly />}
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          align="start"
          className="z-50 card-bordered p-2 bg-canvas shadow-xl flex gap-1"
        >
          <div className="max-h-48 overflow-y-auto flex flex-col w-14">
            {HOURS.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setHour(h)}
                className={`px-2 py-1.5 text-sm rounded text-center transition-colors ${
                  hour === h ? "bg-accent-gold text-canvas font-semibold" : "text-ink hover:bg-surface-elevated"
                }`}
              >
                {h}
              </button>
            ))}
          </div>
          <div className="max-h-48 overflow-y-auto flex flex-col w-14">
            {MINUTES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMinute(m);
                  if (hour) setOpen(false);
                }}
                className={`px-2 py-1.5 text-sm rounded text-center transition-colors ${
                  minute === m ? "bg-accent-gold text-canvas font-semibold" : "text-ink hover:bg-surface-elevated"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
