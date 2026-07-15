"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Calendar, CheckCircle, Clock, FileText, Loader2, RotateCcw } from "lucide-react";
import { getDCIDocumentChoices, getDocumentTimeline, getTimeline } from "@/lib/api";

type Choice = { id: number; document_number?: string; document_title?: string };
type Event = { date?: string; type?: string; title?: string; revision?: string; code?: string; old_value?: string; new_value?: string; changed_by?: string; source?: string };

type MonthlyTimeline = { submissions?: { month: string; count: number }[]; returns?: { month: string; count: number }[]; approvals?: { month: string; count: number }[] };

const EVENT_ICON: Record<string, React.ReactNode> = {
  submitted: <FileText size={14} />,
  returned: <RotateCcw size={14} />,
  approved: <CheckCircle size={14} />,
};

export default function DocumentTimeline({ projectId }: { projectId: number }) {
  const [choices, setChoices] = useState<Choice[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [monthly, setMonthly] = useState<MonthlyTimeline>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([getDCIDocumentChoices(projectId), getTimeline(projectId)])
      .then(([documentChoices, timeline]) => {
        setChoices(documentChoices || []);
        setMonthly(timeline || {});
        setSelectedId(documentChoices?.[0]?.id || null);
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    if (!selectedId) { setEvents([]); return; }
    setLoading(true);
    getDocumentTimeline(selectedId).then(result => setEvents(result?.events || [])).finally(() => setLoading(false));
  }, [selectedId]);

  const maxCount = useMemo(() => Math.max(1, ...Object.values(monthly).flat().map(item => item.count)), [monthly]);

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-icon"><Calendar size={18} style={{ color: "var(--accent)" }} /></div>
        <div><h1 className="page-title">Document Timeline</h1><p className="page-subtitle">Revision-wise submissions, EIL returns, approvals and dashboard edits.</p></div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 12 }}>Project activity by month</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {(["submissions", "returns", "approvals"] as const).map(kind => (
            <div key={kind}>
              <p style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 8 }}>{kind}</p>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 90, overflowX: "auto" }}>
                {(monthly[kind] || []).slice(-12).map(item => (
                  <div key={item.month} title={`${item.month}: ${item.count}`} style={{ minWidth: 18, height: `${Math.max(8, (item.count / maxCount) * 80)}px`, background: "var(--accent)", borderRadius: "4px 4px 0 0", opacity: kind === "submissions" ? 1 : kind === "returns" ? .7 : .45 }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>Choose document</label>
        <select className="input" value={selectedId || ""} onChange={e => setSelectedId(Number(e.target.value))}>
          {choices.map(choice => <option key={choice.id} value={choice.id}>{choice.document_number} — {choice.document_title}</option>)}
        </select>
      </div>

      <div className="card">
        {loading ? <div style={{ padding: 44, display: "flex", justifyContent: "center" }}><Loader2 className="animate-spin" /></div> : events.length === 0 ? (
          <p style={{ color: "var(--text-muted)", textAlign: "center", padding: 30 }}>No timeline events were found for this document.</p>
        ) : (
          <div style={{ position: "relative", paddingLeft: 26 }}>
            <div style={{ position: "absolute", left: 10, top: 8, bottom: 8, width: 2, background: "var(--border)" }} />
            {events.map((event, index) => (
              <div key={`${event.date}-${index}`} style={{ position: "relative", padding: "0 0 22px 18px" }}>
                <div style={{ position: "absolute", left: -24, top: 0, width: 26, height: 26, borderRadius: "50%", background: "var(--accent-light)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--border)" }}>{EVENT_ICON[event.type || ""] || <Clock size={14} />}</div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <strong style={{ fontSize: 13 }}>{event.title || event.type || "Document updated"}</strong>
                    <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                      {event.revision ? `Revision ${event.revision}` : ""}{event.code ? ` · Code ${event.code}` : ""}{event.changed_by ? ` · by ${event.changed_by}` : ""}
                    </p>
                    {(event.old_value !== undefined || event.new_value !== undefined) && <p style={{ fontSize: 11, marginTop: 5 }}>{event.old_value || "—"} → {event.new_value || "—"}</p>}
                  </div>
                  <time style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{String(event.date || "").slice(0, 16).replace("T", " ")}</time>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
