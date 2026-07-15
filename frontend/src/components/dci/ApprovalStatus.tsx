"use client";
import React, { useEffect, useState } from "react";
import {
  Chart as ChartJS, ArcElement, Tooltip, Legend,
  CategoryScale, LinearScale, BarElement, PointElement, LineElement, Filler
} from "chart.js";
import { Doughnut, Bar, Line } from "react-chartjs-2";
import { BarChart2, Loader2, AlertTriangle, FileText, Clock, TrendingUp } from "lucide-react";
import { getApprovalStatus, getDisciplineAnalysis, getDelaysAging, getTimeline } from "@/lib/api";

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Filler);

const PROJECT_ID = 1;

const PALETTE = ["#E11D48","#F43F5E","#FB7185","#F97316","#EAB308","#10B981","#0EA5E9","#8B5CF6","#EC4899","#14B8A6","#F59E0B","#6366F1"];

const CHART_BASE = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: "#8B95A2", font: { size: 12, family: "Inter" }, padding: 16 } },
    tooltip: { backgroundColor: "#fff", titleColor: "#0D1117", bodyColor: "#444C58", borderColor: "#E3E6EB", borderWidth: 1, padding: 10, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }
  }
};

const AXIS_OPTS = {
  ...CHART_BASE,
  plugins: { ...CHART_BASE.plugins, legend: { display: false } },
  scales: {
    x: { ticks: { color: "#8B95A2", font: { size: 11 } }, grid: { color: "rgba(0,0,0,0.04)" }, border: { color: "rgba(0,0,0,0.06)" } },
    y: { ticks: { color: "#8B95A2", font: { size: 11 } }, grid: { color: "rgba(0,0,0,0.04)" }, border: { color: "rgba(0,0,0,0.06)" } }
  }
};

function StatCard({ label, value, icon, accent = "#4F46E5" }: { label: string; value: string | number; icon: React.ReactNode; accent?: string }) {
  return (
    <div className="stat-card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: "var(--radius-md)", flexShrink: 0,
          background: `${accent}12`, border: `1px solid ${accent}20`,
          display: "flex", alignItems: "center", justifyContent: "center", color: accent
        }}>{icon}</div>
      </div>
      <p style={{ fontSize: 26, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1 }}>{value}</p>
      <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{label}</p>
    </div>
  );
}

export default function ApprovalStatus() {
  const [statusData, setStatusData] = useState<{ counts: Record<string, number>; returned_counts: Record<string, number>; total: number } | null>(null);
  const [disciplines, setDisciplines] = useState<{ discipline: string; total: number }[]>([]);
  const [delays, setDelays] = useState<{ doc_no: string; title: string; age_days: number; overdue_by: number; status: string }[]>([]);
  const [timeline, setTimeline] = useState<{ month: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.allSettled([
      getApprovalStatus(PROJECT_ID),
      getDisciplineAnalysis(PROJECT_ID),
      getDelaysAging(PROJECT_ID),
      getTimeline(PROJECT_ID),
    ]).then(([s, d, dl, t]) => {
      if (s.status === "fulfilled") setStatusData(s.value);
      if (d.status === "fulfilled") setDisciplines(d.value);
      if (dl.status === "fulfilled") setDelays(dl.value);
      if (t.status === "fulfilled") setTimeline(t.value);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 300, gap: 10 }}>
      <Loader2 size={20} className="animate-spin" style={{ color: "var(--accent)" }} />
      <span style={{ color: "var(--text-muted)", fontSize: 13 }}>Loading data...</span>
    </div>
  );

  const statusLabels = Object.keys(statusData?.counts || {});
  const statusValues = Object.values(statusData?.counts || {});
  const total = statusData?.total || 0;

  const doughnutData = {
    labels: statusLabels,
    datasets: [{ data: statusValues, backgroundColor: PALETTE, borderColor: "#fff", borderWidth: 3, hoverBorderWidth: 3 }]
  };
  const discBarData = {
    labels: disciplines.map(d => d.discipline),
    datasets: [{ label: "Documents", data: disciplines.map(d => d.total), backgroundColor: PALETTE, borderRadius: 5, borderSkipped: false }]
  };
  const timelineData = {
    labels: timeline.map(t => t.month),
    datasets: [{
      label: "Submissions",
      data: timeline.map(t => t.count),
      borderColor: "#E11D48",
      backgroundColor: "rgba(225,29,72,0.06)",
      fill: true, tension: 0.4,
      pointBackgroundColor: "#E11D48", pointBorderColor: "#fff", pointBorderWidth: 2, pointRadius: 4,
    }]
  };

  return (
    <div className="fade-in">
      {/* Header */}
      <div className="page-header">
        <div className="page-icon"><BarChart2 size={18} style={{ color: "var(--accent)" }} /></div>
        <div>
          <h1 className="page-title">Approval Status</h1>
          <p className="page-subtitle">Live overview of document review status across all disciplines</p>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        <StatCard label="Total Documents" value={total.toLocaleString()} icon={<FileText size={16} />} />
        <StatCard label="Disciplines" value={disciplines.length} icon={<BarChart2 size={16} />} accent="#7C3AED" />
        <StatCard label="Overdue" value={delays.length} icon={<AlertTriangle size={16} />} accent="#DC2626" />
        <StatCard
          label="Avg Monthly Submissions"
          value={timeline.length > 0 ? Math.round(timeline.reduce((a, b) => a + b.count, 0) / timeline.length) : 0}
          icon={<TrendingUp size={16} />} accent="#10B981"
        />
      </div>

      {/* Charts row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Status Breakdown</h3>
          {statusLabels.length > 0 ? (
            <div style={{ height: 240 }}>
              <Doughnut data={doughnutData} options={{
                ...CHART_BASE,
                plugins: { ...CHART_BASE.plugins, legend: { ...CHART_BASE.plugins.legend, position: "right" as const } }
              }} />
            </div>
          ) : (
            <div style={{ height: 240, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8 }}>
              <BarChart2 size={28} style={{ color: "var(--text-muted)" }} />
              <p style={{ fontSize: 13, color: "var(--text-muted)" }}>No status data. Is the backend running?</p>
            </div>
          )}
        </div>
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Documents by Discipline</h3>
          {disciplines.length > 0 ? (
            <div style={{ height: 240 }}><Bar data={discBarData} options={AXIS_OPTS} /></div>
          ) : (
            <div style={{ height: 240, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <p style={{ fontSize: 13, color: "var(--text-muted)" }}>No discipline data found</p>
            </div>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
          <TrendingUp size={15} style={{ color: "var(--accent)" }} />
          <h3>Monthly Submission Timeline</h3>
        </div>
        {timeline.length > 0 ? (
          <div style={{ height: 200 }}><Line data={timelineData} options={AXIS_OPTS} /></div>
        ) : (
          <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>No timeline data available</p>
          </div>
        )}
      </div>

      {/* Overdue table */}
      {delays.length > 0 && (
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
            <AlertTriangle size={15} style={{ color: "var(--error)" }} />
            <h3>Overdue Documents</h3>
            <span className="badge badge-red" style={{ marginLeft: 4 }}>{delays.length}</span>
          </div>
          <div style={{ overflow: "auto" }}>
            <table className="data-table">
              <thead>
                <tr><th>Doc No</th><th>Title</th><th>Age</th><th>Overdue by</th><th>Status</th></tr>
              </thead>
              <tbody>
                {delays.slice(0, 15).map((d, i) => (
                  <tr key={i}>
                    <td><span className="mono">{d.doc_no}</span></td>
                    <td style={{ maxWidth: 280 }} className="truncate">{d.title}</td>
                    <td><span className="badge badge-yellow">{d.age_days}d</span></td>
                    <td><span className="badge badge-red">+{d.overdue_by}d</span></td>
                    <td><span className="badge badge-gray">{d.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
