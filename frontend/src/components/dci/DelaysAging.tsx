"use client";
import React, { useEffect, useState } from "react";
import { Loader2, AlertTriangle, Clock } from "lucide-react";
import { getDelaysAging } from "@/lib/api";

const PROJECT_ID = 1;

export default function DelaysAging() {
  const [delays, setDelays] = useState<{doc_no: string; title: string; age_days: number; overdue_by: number; status: string; uploaded_date: string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all"|"critical"|"warning">("all");

  useEffect(() => {
    getDelaysAging(PROJECT_ID).then(setDelays).catch(() => setDelays([])).finally(() => setLoading(false));
  }, []);

  const filtered = delays.filter(d => {
    if (filter === "critical") return d.overdue_by > 30;
    if (filter === "warning")  return d.overdue_by <= 30;
    return true;
  });

  const critical = delays.filter(d => d.overdue_by > 30).length;
  const warning  = delays.filter(d => d.overdue_by <= 30).length;

  return (
    <div className="fade-in">
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)",
          display: "flex", alignItems: "center", justifyContent: "center"
        }}><AlertTriangle size={20} color="#ef4444" /></div>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)" }}>Delays & Aging</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Documents that have exceeded the allowed review period.</p>
        </div>
      </div>

      {/* Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
        <div className="stat-card" style={{ borderColor: "rgba(239,68,68,0.2)" }}>
          <p style={{ fontSize: 28, fontWeight: 700, color: "#ef4444" }}>{delays.length}</p>
          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Total Overdue</p>
        </div>
        <div className="stat-card" style={{ borderColor: "rgba(239,68,68,0.2)" }}>
          <p style={{ fontSize: 28, fontWeight: 700, color: "#ef4444" }}>{critical}</p>
          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Critical (&gt;30 days overdue)</p>
        </div>
        <div className="stat-card" style={{ borderColor: "rgba(245,158,11,0.2)" }}>
          <p style={{ fontSize: 28, fontWeight: 700, color: "#f59e0b" }}>{warning}</p>
          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Warning (≤30 days overdue)</p>
        </div>
      </div>

      {/* Filter */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {[["all","All"],["critical","Critical"],["warning","Warning"]].map(([id, label]) => (
          <button key={id}
            onClick={() => setFilter(id as "all"|"critical"|"warning")}
            className={filter === id ? "btn-primary" : "btn-ghost"}
            style={{ fontSize: 12, padding: "6px 14px" }}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Loader2 size={28} color="var(--accent)" className="animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 48 }}>
          <Clock size={32} color="var(--success)" style={{ margin: "0 auto 12px" }} />
          <p style={{ color: "var(--success)", fontWeight: 600 }}>All documents are on schedule!</p>
        </div>
      ) : (
        <div className="card" style={{ overflow: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Doc No</th>
                <th>Title</th>
                <th>Upload Date</th>
                <th>Age (days)</th>
                <th>Overdue by</th>
                <th>Severity</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d, i) => (
                <tr key={i}>
                  <td className="mono" style={{ color: "var(--text-primary)" }}>{d.doc_no}</td>
                  <td style={{ color: "var(--text-primary)", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis" }}>{d.title}</td>
                  <td style={{ color: "var(--text-muted)" }}>{d.uploaded_date}</td>
                  <td><span className="badge badge-yellow">{d.age_days}d</span></td>
                  <td><span className="badge badge-red">+{d.overdue_by}d</span></td>
                  <td>
                    {d.overdue_by > 30
                      ? <span className="badge badge-red">🔴 Critical</span>
                      : <span className="badge badge-yellow">⚠️ Warning</span>}
                  </td>
                  <td><span className="badge badge-gray">{d.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
