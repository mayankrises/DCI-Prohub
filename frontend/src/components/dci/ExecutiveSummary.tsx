"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Activity, CheckCircle2, Clock3, FileCheck2, FileText, Loader2, RotateCcw, Send, ShieldCheck, TimerReset } from "lucide-react";
import { getSummary } from "@/lib/api";

type Summary = {
  import?: { original_filename?: string; row_count?: number; uploaded_at?: string } | null;
  total: number;
  approved: number;
  returned: number;
  delayed: number;
  under_review: number;
  fresh_submission: number;
  returned_counts?: Record<string, number>;
  review_period_days?: number;
};

const EMPTY: Summary = { total: 0, approved: 0, returned: 0, delayed: 0, under_review: 0, fresh_submission: 0 };

function Kpi({ label, value, icon, note }: { label: string; value: number; icon: React.ReactNode; note?: string }) {
  return <div className="card" style={{ padding: 18, minHeight: 126 }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <div><p style={{ fontSize: 12, color: "var(--text-muted)" }}>{label}</p><p style={{ fontSize: 34, lineHeight: 1.1, fontWeight: 750, marginTop: 10 }}>{value.toLocaleString()}</p>{note && <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>{note}</p>}</div>
      <div style={{ color: "var(--accent)", opacity: .9 }}>{icon}</div>
    </div>
  </div>;
}

export default function ExecutiveSummary({ projectId }: { projectId: number }) {
  const [data, setData] = useState<Summary>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true); setError("");
    getSummary(projectId).then(setData).catch(() => setError("Could not load the executive summary.")) .finally(() => setLoading(false));
  }, [projectId]);

  const retained = data.returned_counts?.R || 0;
  const voided = data.returned_counts?.V || 0;
  const submitted = Math.max(0, data.total - data.fresh_submission);
  const reviewed = Math.max(0, submitted - data.under_review);
  const approvalPct = useMemo(() => data.total ? Math.round((data.approved / data.total) * 100) : 0, [data]);

  if (loading) return <div style={{ minHeight: 300, display: "grid", placeItems: "center" }}><Loader2 className="animate-spin" /></div>;

  return <div className="fade-in">
    <div className="page-header"><div className="page-icon"><Activity size={18} style={{ color: "var(--accent)" }} /></div><div><h1 className="page-title">Executive Summary</h1><p className="page-subtitle">A compact project health view for the currently selected DCI workspace.</p></div></div>
    {error && <div className="card" style={{ color: "var(--error)", marginBottom: 14 }}>{error}</div>}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 14 }}>
      <Kpi label="Total documents" value={data.total} icon={<FileText size={24}/>} />
      <Kpi label="Submitted" value={submitted} icon={<Send size={24}/>} note={`${data.total ? Math.round(submitted/data.total*100) : 0}% of register`} />
      <Kpi label="Reviewed (latest rev)" value={reviewed} icon={<FileCheck2 size={24}/>} />
      <Kpi label="Approved / retained" value={data.approved} icon={<ShieldCheck size={24}/>} note={`${approvalPct}% of register`} />
      <Kpi label="Retained for record" value={retained} icon={<CheckCircle2 size={24}/>} />
      <Kpi label="Under review with client / EIL" value={data.under_review} icon={<Clock3 size={24}/>} />
      <Kpi label="Pending first submission" value={data.fresh_submission} icon={<TimerReset size={24}/>} />
      <Kpi label="Returned for action" value={data.returned} icon={<RotateCcw size={24}/>} />
      <Kpi label="Void" value={voided} icon={<FileText size={24}/>} />
      <Kpi label="Overdue" value={data.delayed} icon={<Clock3 size={24}/>} note={`Review period: ${data.review_period_days || 21} days`} />
    </div>
    <div className="card" style={{ marginTop: 16 }}>
      <h3>Active workbook</h3>
      <p style={{ color: "var(--text-muted)", marginTop: 8 }}>{data.import?.original_filename || "No workbook imported"}{data.import?.row_count ? ` · ${data.import.row_count} rows` : ""}</p>
    </div>
  </div>;
}
