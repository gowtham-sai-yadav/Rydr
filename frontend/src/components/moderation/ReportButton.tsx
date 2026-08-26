"use client";
/**
 * Report a piece of content — Phase 4 W7.
 *
 * Deliberately understated: a report control that competes visually with
 * like and comment invites use as a disagree button. It opens a small
 * inline form rather than a modal, because a modal for a six-field choice
 * is heavier than the decision warrants.
 */
import { useState } from "react";

import { api } from "@/lib/api";
import type { ReportReason, ReportedContentType } from "@/lib/api.types";

const REASONS: { value: ReportReason; label: string }[] = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment" },
  { value: "misinformation", label: "Misleading" },
  { value: "unsafe", label: "Unsafe advice" },
  { value: "inappropriate", label: "Inappropriate" },
  { value: "other", label: "Something else" },
];

type Props = {
  contentType: ReportedContentType;
  contentId: string;
  label?: string;
  className?: string;
};

export default function ReportButton({ contentType, contentId, label = "Report", className }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>("spam");
  const [details, setDetails] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit() {
    setState("sending");
    try {
      await api.createReport({
        content_type: contentType,
        content_id: contentId,
        reason,
        details: details.trim() || null,
      });
      setState("sent");
      // Say what happens next. "Thanks" alone leaves the reporter unsure
      // whether anything will come of it.
      setMessage("Reported. A moderator will review it and you'll be notified.");
    } catch (e) {
      setState("error");
      setMessage(e instanceof Error ? e.message : "Could not send the report");
    }
  }

  if (state === "sent") {
    return <p className={`text-[12px] text-accent-green max-w-xs ${className ?? ""}`}>{message}</p>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`text-[12px] text-stone hover:text-mute transition-colors ${className ?? ""}`}
      >
        {label}
      </button>
    );
  }

  return (
    <div className={`bg-surface-elevated border border-hairline rounded-lg p-3 space-y-2 w-full max-w-xs ${className ?? ""}`}>
      <p className="text-[12px] text-ink font-medium">Why are you reporting this?</p>
      <select
        value={reason}
        onChange={(e) => setReason(e.target.value as ReportReason)}
        className="w-full bg-surface-card border border-hairline rounded px-2 py-1.5 text-[13px] text-ink"
      >
        {REASONS.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      <textarea
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        placeholder="Anything else a moderator should know? (optional)"
        rows={2}
        maxLength={2000}
        className="w-full bg-surface-card border border-hairline rounded px-2 py-1.5 text-[13px] text-ink placeholder:text-stone resize-none"
      />
      {message && state === "error" && (
        <p className="text-[12px] text-accent-red">{message}</p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={state === "sending"}
          className="bg-ink text-canvas text-[12px] font-medium px-3 py-1.5 rounded disabled:opacity-40"
        >
          {state === "sending" ? "Sending…" : "Send report"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[12px] text-charcoal hover:text-ink px-2"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
