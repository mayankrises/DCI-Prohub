"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileText,
  MessageSquareReply,
  Send,
  Users,
} from "lucide-react";
import { getInternalReviewDashboard } from "@/lib/api";

interface Props {
  projectId: number;
  onOpenRegister: () => void;
  onOpenCRS: () => void;
}

interface DashboardData {
  kpis: Record<string, number>;
  status_counts: Record<string, number>;
  discipline_counts: Record<string, number>;
  recent_documents: Array<{
    id: number;
    document_number: string;
    document_title: string;
    discipline: string;
    status: string;
    current_version_number: number;
  }>;
}

const EMPTY: DashboardData = {
  kpis: {},
  status_counts: {},
  discipline_counts: {},
  recent_documents: [],
};

function label(value: string): string {
  return value.replaceAll("_", " ");
}

export default function InternalDashboard({
  projectId,
  onOpenRegister,
  onOpenCRS,
}: Props) {
  const [data, setData] = useState<DashboardData>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getInternalReviewDashboard(projectId)
      .then((value) => setData(value ?? EMPTY))
      .catch((error) => {
        console.error("Failed to load Inner Circle dashboard:", error);
        setData(EMPTY);
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  const maxDiscipline = useMemo(
    () => Math.max(1, ...Object.values(data.discipline_counts || {})),
    [data.discipline_counts],
  );

  const cards = [
    ["Internal documents", data.kpis.total_documents ?? 0, FileText],
    ["Waiting for contractor", data.kpis.waiting_contractor ?? 0, Users],
    ["Waiting for consultant", data.kpis.waiting_consultant ?? 0, MessageSquareReply],
    ["Awaiting verification", data.kpis.waiting_verification ?? 0, Clock3],
    ["Open CRS comments", data.kpis.open_comments ?? 0, MessageSquareReply],
    ["Ready for External DCI", data.kpis.ready_external ?? 0, Send],
  ] as const;

  return (
    <div className="fade-in">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 20 }}>
        <div>
          <p style={{ margin: 0, color: "var(--accent)", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".12em" }}>
            Inner Circle
          </p>
          <h1 style={{ margin: "4px 0 0", fontSize: 24, color: "var(--text-primary)" }}>Internal Review Dashboard</h1>
          <p style={{ margin: "5px 0 0", fontSize: 13, color: "var(--text-muted)" }}>
            Consultant uploads, contractor review, CRS responses and release readiness.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn-ghost" onClick={onOpenCRS}><MessageSquareReply size={14} /> Open CRS</button>
          <button className="btn-primary" onClick={onOpenRegister}><FileCheck2 size={14} /> Open Register</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12, marginBottom: 18 }}>
        {cards.map(([title, value, Icon]) => (
          <div className="card" key={title} style={{ padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 11, background: "var(--accent-light)", color: "var(--accent)", display: "grid", placeItems: "center" }}>
              <Icon size={19} />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)" }}>{title}</p>
              <p style={{ margin: "3px 0 0", fontSize: 25, lineHeight: 1, fontWeight: 800, color: "var(--text-primary)" }}>
                {loading ? "–" : value}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <section className="card" style={{ padding: 16 }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 15 }}>Documents by discipline</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {Object.entries(data.discipline_counts || {}).length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: 12 }}>No internal documents yet.</p>
            ) : Object.entries(data.discipline_counts).map(([discipline, count]) => (
              <div key={discipline}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                  <span>{discipline}</span><strong>{count}</strong>
                </div>
                <div style={{ height: 8, background: "var(--bg-subtle)", borderRadius: 999, overflow: "hidden" }}>
                  <div style={{ width: `${Math.max(7, (count / maxDiscipline) * 100)}%`, height: "100%", background: "linear-gradient(90deg,var(--accent),#8b5cf6)", borderRadius: 999 }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card" style={{ padding: 16 }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 15 }}>Workflow status</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {Object.entries(data.status_counts || {}).map(([status, count]) => (
              <div key={status} style={{ padding: 11, borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-primary)" }}>
                <p style={{ margin: 0, fontSize: 10, color: "var(--text-muted)", textTransform: "capitalize" }}>{label(status)}</p>
                <strong style={{ display: "block", marginTop: 3, fontSize: 20 }}>{count}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="card" style={{ padding: 16, marginTop: 16 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 15 }}>Recently updated internal documents</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data.recent_documents.length === 0 ? (
            <p style={{ color: "var(--text-muted)", fontSize: 12 }}>Nothing has been uploaded to the Inner Circle yet.</p>
          ) : data.recent_documents.map((document) => (
            <div key={document.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 9 }}>
              <CheckCircle2 size={15} color="var(--accent)" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ fontSize: 12 }}>{document.document_number}</strong>
                <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{document.document_title}</p>
              </div>
              <span className="badge badge-indigo">V{document.current_version_number}</span>
              <span style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "capitalize" }}>{label(document.status)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
