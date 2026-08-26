"use client";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import type { ReportOut, ReportStatus } from "@/lib/api.types";

const STATUS_FILTERS: Array<{ value: ReportStatus | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "reviewed", label: "Reviewed" },
  { value: "actioned", label: "Actioned" },
  { value: "dismissed", label: "Dismissed" },
];

const STATUS_OPTIONS: ReportStatus[] = ["open", "reviewed", "actioned", "dismissed"];

const statusPillColor: Record<string, string> = {
  open: "bg-accent-red/15 text-accent-red",
  reviewed: "bg-accent-yellow/15 text-accent-yellow",
  actioned: "bg-accent-green/15 text-accent-green",
  dismissed: "bg-surface-elevated text-mute",
};

export default function AdminReportsPage() {
  const { user, loading: authLoading } = useAuth();

  const [reports, setReports] = useState<ReportOut[]>([]);
  const [statusFilter, setStatusFilter] = useState<ReportStatus | "all">("open");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const isAdmin = user?.is_admin === true;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.listReports({
        status: statusFilter === "all" ? undefined : statusFilter,
        limit: 100,
      });
      setReports(res.reports);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reports");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const changeStatus = async (id: string, status: ReportStatus) => {
    setUpdatingId(id);
    setError("");
    try {
      const updated = await api.updateReport(id, { status });
      setReports((prev) => prev.map((r) => (r.id === id ? updated : r)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update report");
    } finally {
      setUpdatingId(null);
    }
  };

  if (authLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-ink/20 border-t-ink" />
      </div>
    );
  }

  // is_admin is being added to the User model in parallel — treat
  // missing/false as non-admin rather than trusting an absent field.
  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto text-center py-16 space-y-3">
        <h2 className="heading-md">Not authorized</h2>
        <p className="text-mute text-sm">
          This page is restricted to Rydr admins.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      <h1 className="display-lg">Reports</h1>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`chip ${statusFilter === f.value ? "chip-active" : ""}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="border border-accent-red/30 bg-accent-red/5 text-accent-red px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-ink/20 border-t-ink" />
        </div>
      ) : reports.length === 0 ? (
        <p className="text-mute text-center py-12">No reports match this filter.</p>
      ) : (
        <div className="card-bordered p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="px-4 py-3 label-eyebrow">Reporter</th>
                <th className="px-4 py-3 label-eyebrow">Target</th>
                <th className="px-4 py-3 label-eyebrow">Reason</th>
                <th className="px-4 py-3 label-eyebrow">Status</th>
                <th className="px-4 py-3 label-eyebrow">Action</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id} className="border-b border-hairline last:border-0 align-top">
                  <td className="px-4 py-3 text-ink whitespace-nowrap">
                    <span className="mono text-xs text-stone">{r.reporter_id.slice(0, 8)}</span>
                  </td>
                  <td className="px-4 py-3 text-body whitespace-nowrap">
                    <span className="capitalize">{r.target_type}</span>{" "}
                    <span className="mono text-xs text-stone">{r.target_id.slice(0, 8)}</span>
                  </td>
                  <td className="px-4 py-3 text-body max-w-xs">{r.reason}</td>
                  <td className="px-4 py-3">
                    <span className={`pill capitalize ${statusPillColor[r.status] ?? ""}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={r.status}
                      onChange={(e) => changeStatus(r.id, e.target.value as ReportStatus)}
                      disabled={updatingId === r.id}
                      className="select text-xs py-1.5"
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
