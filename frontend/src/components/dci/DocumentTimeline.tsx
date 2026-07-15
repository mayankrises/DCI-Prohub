"use client";
import React, { useEffect, useState, useMemo } from "react";
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  PointElement, LineElement, Filler, Tooltip, Legend
} from "chart.js";
import { Bar, Line } from "react-chartjs-2";
import {
  Calendar, Loader2, AlertTriangle, Clock, TrendingUp,
  Filter, ChevronDown
} from "lucide-react";
import { getDCIDocuments } from "@/lib/api";

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Filler, Tooltip, Legend);

const PROJECT_ID = 1;

type Doc = {
  discipline: string;
  status: string;
  approval_code: string;
  uploaded_date?: string;
  from_eil_date?: string;
  schedule_submission_date?: string;
  age_days?: number;
  vendor?: string;
};

const CHART_BASE = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: "#8B95A2", font: { size: 11, family: "Inter" }, padding: 14 } },
    tooltip: {
      backgroundColor: "#fff", titleColor: "#0D1117", bodyColor: "#444C58",
      borderColor: "#E3E6EB", borderWidth: 1, padding: 10
    }
  },
  scales: {
    x: { ticks: { color: "#8B95A2", font: { size: 10 } }, grid: { color: "rgba(0,0,0,0.04)" }, border: { color: "rgba(0,0,0,0.05)" } },
    y: { ticks: { color: "#8B95A2", font: { size: 10 } }, grid: { color: "rgba(0,0,0,0.04)" }, border: { color: "rgba(0,0,0,0.05)" } }
  }
};

function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = String(item[key] || "Unknown");
    acc[k] = acc[k] || [];
    acc[k].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

function parseMonth(dateStr?: string): string | null {
  if (!dateStr) return null;
  try { return dateStr.slice(0, 7); } catch { return null; }
}

export default function DocumentTimeline() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterDiscipline, setFilterDiscipline] = useState<string>("All");
  const [filterVendor, setFilterVendor] = useState<string>("All");
  const [activeChart, setActiveChart] = useState<"submissions" | "returns" | "aging">("submissions");

  useEffect(() => {
    setLoading(true);
    getDCIDocuments(PROJECT_ID)
      .then(data => setDocs(data || []))
      .catch(() => setError("Failed to load documents."))
      .finally(() => setLoading(false));
  }, []);

  const disciplines = useMemo(() => ["All", ...Array.from(new Set(docs.map(d => d.discipline).filter(Boolean)))], [docs]);
  const vendors = useMemo(() => ["All", ...Array.from(new Set(docs.map(d => d.vendor || "").filter(Boolean))).slice(0, 30)], [docs]);

  const filtered = useMemo(() => docs.filter(d => {
    if (filterDiscipline !== "All" && d.discipline !== filterDiscipline) return false;
    if (filterVendor !== "All" && d.vendor !== filterVendor) return false;
    return true;
  }), [docs, filterDiscipline, filterVendor]);

  // Chart 1: Monthly submissions timeline
  const submissionsData = useMemo(() => {
    const byMonth: Record<string, number> = {};
    filtered.forEach(d => {
      const m = parseMonth(d.uploaded_date);
      if (m) { byMonth[m] = (byMonth[m] || 0) + 1; }
    });
    const months = Object.keys(byMonth).sort().slice(-18);
    return {
      labels: months.map(m => {
        const [y, mo] = m.split("-");
        return `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(mo)-1]} ${y.slice(2)}`;
      }),
      datasets: [{
        label: "Documents Submitted",
        data: months.map(m => byMonth[m]),
        backgroundColor: "rgba(225,29,72,0.08)",
        borderColor: "#E11D48",
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: "#E11D48",
        pointBorderColor: "#fff",
        pointBorderWidth: 2,
        pointRadius: 4,
      }]
    };
  }, [filtered]);

  // Chart 2: Monthly EIL returns
  const returnsData = useMemo(() => {
    const byMonth: Record<string, number> = {};
    filtered.forEach(d => {
      const m = parseMonth(d.from_eil_date);
      if (m) { byMonth[m] = (byMonth[m] || 0) + 1; }
    });
    const months = Object.keys(byMonth).sort().slice(-18);
    return {
      labels: months.map(m => {
        const [y, mo] = m.split("-");
        return `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(mo)-1]} ${y.slice(2)}`;
      }),
      datasets: [{
        label: "EIL Returns",
        data: months.map(m => byMonth[m]),
        backgroundColor: "rgba(16,185,129,0.08)",
        borderColor: "#10B981",
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: "#10B981",
        pointBorderColor: "#fff",
        pointBorderWidth: 2,
        pointRadius: 4,
      }]
    };
  }, [filtered]);

  // Chart 3: Aging distribution (bar chart)
  const agingData = useMemo(() => {
    const bins = { "0–14d": 0, "15–30d": 0, "31–60d": 0, "61–90d": 0, "91–180d": 0, ">180d": 0 };
    filtered.forEach(d => {
      const a = d.age_days ?? 0;
      if (a <= 14) bins["0–14d"]++;
      else if (a <= 30) bins["15–30d"]++;
      else if (a <= 60) bins["31–60d"]++;
      else if (a <= 90) bins["61–90d"]++;
      else if (a <= 180) bins["91–180d"]++;
      else bins[">180d"]++;
    });
    const COLORS = ["#10B981","#3B82F6","#F59E0B","#F97316","#E11D48","#8B5CF6"];
    return {
      labels: Object.keys(bins),
      datasets: [{
        label: "Documents",
        data: Object.values(bins),
        backgroundColor: COLORS,
        borderRadius: 6,
      }]
    };
  }, [filtered]);

  // Summary stats
  const stats = useMemo(() => {
    const withAge = filtered.filter(d => d.age_days != null && d.age_days > 0);
    const avgAge = withAge.length > 0 ? Math.round(withAge.reduce((s, d) => s + (d.age_days || 0), 0) / withAge.length) : 0;
    const overdue = filtered.filter(d => (d.age_days || 0) > 21).length;
    const scheduled = filtered.filter(d => d.schedule_submission_date).length;
    const submitted = filtered.filter(d => d.uploaded_date).length;
    return { avgAge, overdue, scheduled, submitted };
  }, [filtered]);

  const chartData = activeChart === "submissions" ? submissionsData : activeChart === "returns" ? returnsData : agingData;

  if (loading) return (
    <div className="fade-in" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300 }}>
      <Loader2 size={24} className="animate-spin" style={{ color: "var(--accent)", marginRight: 12 }} />
      <span style={{ fontSize: 14, color: "var(--text-muted)" }}>Loading timeline...</span>
    </div>
  );

  if (error) return (
    <div className="fade-in" style={{ padding: 32, textAlign: "center" }}>
      <AlertTriangle size={24} style={{ color: "var(--accent)", margin: "0 auto 10px" }} />
      <p style={{ color: "var(--text-muted)" }}>{error}</p>
    </div>
  );

  return (
    <div className="fade-in">
      {/* Header */}
      <div className="page-header">
        <div className="page-icon">
          <Calendar size={18} style={{ color: "var(--accent)" }} />
        </div>
        <div>
          <h1 className="page-title">Document Timeline</h1>
          <p className="page-subtitle">Submission history, EIL returns, and aging distribution</p>
        </div>
      </div>

      {/* Stat Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Submitted", value: stats.submitted.toLocaleString(), color: "#10B981", icon: <TrendingUp size={15} /> },
          { label: "Scheduled", value: stats.scheduled.toLocaleString(), color: "#3B82F6", icon: <Calendar size={15} /> },
          { label: "Avg Age (days)", value: stats.avgAge, color: "#F59E0B", icon: <Clock size={15} /> },
          { label: "Overdue (>21d)", value: stats.overdue.toLocaleString(), color: "#E11D48", icon: <AlertTriangle size={15} /> },
        ].map(({ label, value, color, icon }) => (
          <div key={label} className="card" style={{ padding: "14px 16px" }}>
            <div style={{
              width: 32, height: 32, borderRadius: "var(--radius-md)",
              background: `${color}15`, display: "flex", alignItems: "center",
              justifyContent: "center", color, marginBottom: 10
            }}>{icon}</div>
            <p style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1 }}>{value}</p>
            <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 16, padding: "12px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-muted)", fontSize: 12 }}>
            <Filter size={12} /> Filters:
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)" }}>
            Discipline
            <div style={{ position: "relative" }}>
              <select
                className="filter-select"
                value={filterDiscipline}
                onChange={e => setFilterDiscipline(e.target.value)}
              >
                {disciplines.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <ChevronDown size={10} style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--text-muted)" }} />
            </div>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)" }}>
            Vendor
            <div style={{ position: "relative" }}>
              <select
                className="filter-select"
                value={filterVendor}
                onChange={e => setFilterVendor(e.target.value)}
              >
                {vendors.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
              <ChevronDown size={10} style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--text-muted)" }} />
            </div>
          </label>
          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)" }}>
            {filtered.length.toLocaleString()} / {docs.length.toLocaleString()} docs
          </span>
        </div>
      </div>

      {/* Chart switcher + main chart */}
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 20, background: "var(--bg-subtle)", borderRadius: "var(--radius-md)", padding: 3, width: "fit-content" }}>
          {[
            { id: "submissions" as const, label: "Submissions" },
            { id: "returns" as const, label: "EIL Returns" },
            { id: "aging" as const, label: "Aging" },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveChart(tab.id)}
              style={{
                padding: "6px 16px",
                borderRadius: "var(--radius-sm)",
                border: "none",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 500,
                background: activeChart === tab.id ? "white" : "transparent",
                color: activeChart === tab.id ? "var(--accent)" : "var(--text-muted)",
                boxShadow: activeChart === tab.id ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                transition: "all 0.15s",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ height: 320 }}>
          {activeChart === "aging" ? (
            <Bar data={chartData as Parameters<typeof Bar>[0]["data"]} options={CHART_BASE as Parameters<typeof Bar>[0]["options"]} />
          ) : (
            <Line data={chartData as Parameters<typeof Line>[0]["data"]} options={CHART_BASE as Parameters<typeof Line>[0]["options"]} />
          )}
        </div>
      </div>

      {/* Discipline breakdown */}
      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginBottom: 14, fontSize: 13, fontWeight: 600 }}>By Discipline — Submission Timeline</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Object.entries(groupBy(filtered.filter(d => d.uploaded_date), "discipline"))
            .sort((a, b) => b[1].length - a[1].length)
            .slice(0, 12)
            .map(([disc, items]) => {
              const pct = (items.length / filtered.length) * 100;
              return (
                <div key={disc}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{disc}</span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                      {items.length.toLocaleString()} ({pct.toFixed(1)}%)
                    </span>
                  </div>
                  <div style={{ height: 5, background: "var(--bg-subtle)", borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: "var(--accent)", borderRadius: 999, transition: "width 0.3s" }} />
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
