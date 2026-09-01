"use client";
/**
 * Moderation queue — Phase 4 W7.
 *
 * Admin-only. The API returns 403 for non-admins rather than 404, because the
 * admin routes are a fixed documented surface whose existence is not secret,
 * so this page can say plainly that an admin account is needed instead of
 * pretending the page does not exist.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { api } from "@/lib/api";
import type {
  AdminReportOut,
  ReportStatus,
  ReportedContentType,
} from "@/lib/api.types";
import { routes } from "@/lib/routes";
import {
  Alert,
  Spinner,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui";
import { cn } from "@/lib/cn";

const STATUSES: { value: ReportStatus | "all"; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "reviewing", label: "Reviewing" },
  { value: "actioned", label: "Actioned" },
  { value: "dismissed", label: "Dismissed" },
  { value: "all", label: "All" },
];

/** Where an admin goes to look at the thing that was reported. */
function contentHref(type: ReportedContentType, id: string): string | null {
  switch (type) {
    case "destination":
      return routes.destination(id);
    case "ride_plan":
      return routes.ride(id);
    case "user":
      return routes.user(id);
    case "post":
    case "post_comment":
      // No single-post route yet; the feed is the closest place to look.
      return "/feed";
    case "chat_message":
      // Chat is scoped to a ride the admin may not be a member of, so there
      // is nothing safe to link to.
      return null;
    default:
      return null;
  }
}

const STATUS_STYLES: Record<ReportStatus, string> = {
  open: "bg-accent-orange/15 text-accent-orange",
  reviewing: "bg-accent-blue/15 text-accent-blue",
  actioned: "bg-accent-green/15 text-accent-green",
  dismissed: "bg-surface-elevated text-mute",
};

export default function AdminReportsPage() {
  const [reports, setReports] = useState<AdminReportOut[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<ReportStatus | "all">("open");
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (status: ReportStatus | "all") => {
    setLoading(true);
    setError("");
    try {
      const res = await api.listReportQueue({
        status: status === "all" ? undefined : status,
        limit: 50,
      });
      setReports(res.reports);
      setOpenCount(res.open_count);
      setTotal(res.total);
      setForbidden(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not load the queue";
      // The API's 403 detail names the requirement; surfacing it verbatim
      // beats inventing our own wording.
      if (/administrator/i.test(message)) setForbidden(true);
      else setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(filter);
  }, [filter, load]);

  async function resolve(report: AdminReportOut, status: ReportStatus) {
    setBusyId(report.id);
    try {
      await api.resolveReport(report.id, {
        status,
        resolution_note: notes[report.id]?.trim() || null,
      });
      // Refetch rather than patching in place: resolving changes open_count
      // and can move the row out of the current filter.
      await load(filter);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the report");
    } finally {
      setBusyId(null);
    }
  }

  if (forbidden) {
    return (
      <div className="max-w-md mx-auto text-center py-16 space-y-3">
        <h1 className="text-xl font-semibold text-ink">Admins only</h1>
        <p className="text-[13px] text-mute">
          This is the moderation queue. Your account does not have
          administrator access.
        </p>
        <p className="text-[12px] text-stone">
          Admin is granted from the server with
          <code className="mx-1 px-1 rounded bg-surface-card">
            scripts/grant_admin.py
          </code>
          — there is deliberately no way to grant it through the app.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-12">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-ink tracking-tight">
          Moderation
        </h1>
        <span className="text-sm text-mute">
          <span className="mono font-semibold text-ink">{openCount}</span> open
        </span>
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as ReportStatus | "all")}>
        <TabsList className={cn("overflow-x-auto max-w-full")}>
          {STATUSES.map((s) => (
            <TabsTrigger key={s.value} value={s.value}>
              {s.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {error && <Alert variant="destructive">{error}</Alert>}

      {loading && <Spinner size="lg" block />}

      {!loading && reports.length === 0 && (
        <div className="bg-surface-card rounded-xl p-8 text-center">
          <p className="text-ink font-medium">Nothing to review</p>
          <p className="text-[13px] text-mute mt-1">
            {filter === "open"
              ? "The queue is empty."
              : `No ${filter} reports.`}
          </p>
        </div>
      )}

      {reports.map((r) => {
        const href = contentHref(r.content_type, r.content_id);
        const terminal = r.status === "actioned" || r.status === "dismissed";
        return (
          <article key={r.id} className="bg-surface-card rounded-xl p-4 space-y-3">
            <header className="flex flex-wrap items-center gap-2">
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase ${STATUS_STYLES[r.status]}`}
              >
                {r.status}
              </span>
              <span className="text-[13px] text-ink font-medium capitalize">
                {r.content_type.replace(/_/g, " ")}
              </span>
              <span className="text-[13px] text-mute">· {r.reason}</span>
              {/* How many distinct people reported it — the signal that
                  separates one annoyed rider from a real problem. */}
              {r.report_count > 1 && (
                <span className="px-2 py-0.5 rounded-full bg-accent-red/15 text-accent-red text-[11px] font-semibold">
                  {r.report_count} reports
                </span>
              )}
              <span className="text-[12px] text-stone ml-auto">
                {new Date(r.created_at).toLocaleString()}
              </span>
            </header>

            {r.details && (
              <p className="text-[13px] text-body whitespace-pre-wrap">
                {r.details}
              </p>
            )}

            <p className="text-[12px] text-mute">
              Reported by {r.reporter?.name ?? "unknown"}
              {r.resolver && ` · resolved by ${r.resolver.name}`}
            </p>

            <div className="flex flex-wrap items-center gap-2">
              {href ? (
                <Link
                  href={href}
                  className="text-[13px] text-link hover:underline"
                >
                  View content →
                </Link>
              ) : (
                <span className="text-[12px] text-stone">
                  No direct link for this content type
                </span>
              )}
              <code className="text-[11px] text-stone">{r.content_id}</code>
            </div>

            {!terminal && (
              <div className="pt-2 border-t border-hairline space-y-2">
                <input
                  value={notes[r.id] ?? ""}
                  onChange={(e) =>
                    setNotes((n) => ({ ...n, [r.id]: e.target.value }))
                  }
                  placeholder="What did you do? (shown to the reporter)"
                  maxLength={2000}
                  className="w-full bg-surface-elevated border border-hairline rounded-lg px-3 py-1.5 text-[13px] text-ink placeholder:text-stone"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => resolve(r, "actioned")}
                    disabled={busyId === r.id}
                    className="bg-accent-green/90 hover:bg-accent-green text-ink text-[12px] font-medium px-3 py-1.5 rounded-lg disabled:opacity-40"
                  >
                    Actioned
                  </button>
                  <button
                    onClick={() => resolve(r, "dismissed")}
                    disabled={busyId === r.id}
                    className="bg-surface-elevated hover:bg-surface-light/10 text-ink text-[12px] font-medium px-3 py-1.5 rounded-lg disabled:opacity-40"
                  >
                    Dismiss
                  </button>
                  {r.status === "open" && (
                    <button
                      onClick={() => resolve(r, "reviewing")}
                      disabled={busyId === r.id}
                      className="bg-accent-blue/20 text-accent-blue text-[12px] font-medium px-3 py-1.5 rounded-lg disabled:opacity-40"
                    >
                      Mark reviewing
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-stone">
                  Actioning or dismissing notifies the reporter.
                </p>
              </div>
            )}

            {terminal && r.resolution_note && (
              <p className="text-[12px] text-mute pt-2 border-t border-hairline">
                Resolution: {r.resolution_note}
              </p>
            )}
          </article>
        );
      })}

      {total > reports.length && (
        <p className="text-[12px] text-stone text-center">
          Showing {reports.length} of {total}.
        </p>
      )}
    </div>
  );
}
