"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import type { ReportTargetType } from "@/lib/api.types";

/**
 * Small "Report" trigger + inline reason form. Used from feed post cards and
 * chat messages so the moderation queue actually has a way to fill up.
 * Self-contained: manages its own open/submitting/error state and reports
 * success back to the caller via a one-line inline confirmation.
 */
export function ReportButton({
  targetType,
  targetId,
  className,
}: {
  targetType: ReportTargetType;
  targetId: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!reason.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      await api.createReport({
        target_type: targetType,
        target_id: targetId,
        reason: reason.trim(),
      });
      setDone(true);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit report");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return <span className={`caption ${className ?? ""}`}>Reported — thanks</span>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`caption hover:text-accent-red transition-colors ${className ?? ""}`}
      >
        Report
      </button>
    );
  }

  return (
    <div className={`mt-2 space-y-2 ${className ?? ""}`}>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        maxLength={1000}
        placeholder="Why are you reporting this?"
        className="textarea text-sm"
        autoFocus
      />
      {error && <p className="text-accent-red text-xs">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={submitting || !reason.trim()}
          className="btn btn-danger"
        >
          {submitting ? "Submitting…" : "Submit report"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setReason("");
            setError("");
          }}
          className="btn btn-outline"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
