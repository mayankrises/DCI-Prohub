"use client";
import React, { useEffect, useState } from "react";
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend, ArcElement
} from "chart.js";
import { Bar, Doughnut } from "react-chartjs-2";
import { Loader2, Building2, Package } from "lucide-react";
import { getVendorAnalysis, getDisciplineAnalysis } from "@/lib/api";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend, ArcElement);

const COLORS = ["#6366f1","#8b5cf6","#ec4899","#f59e0b","#22c55e","#06b6d4","#ef4444","#84cc16","#f97316","#14b8a6"];

const AXIS_OPTS = {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { ticks: { color: "#475569", font: { size: 11 } }, grid: { color: "rgba(255,255,255,0.04)" } },
    y: { ticks: { color: "#475569", font: { size: 11 } }, grid: { color: "rgba(255,255,255,0.06)" } }
  }
};

export default function VendorAnalysis({ projectId = 1 }: { projectId?: number }) {
  const [vendors, setVendors] = useState<{vendor: string; total: number}[]>([]);
  const [disciplines, setDisciplines] = useState<{discipline: string; total: number}[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      getVendorAnalysis(projectId),
      getDisciplineAnalysis(projectId),
    ]).then(([v, d]) => {
      if (v.status === "fulfilled") setVendors(v.value);
      if (d.status === "fulfilled") setDisciplines(d.value);
    }).finally(() => setLoading(false));
  }, [projectId]);

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
      <Loader2 size={28} color="var(--accent)" className="animate-spin" />
    </div>
  );

  const vendorData = {
    labels: vendors.map(v => v.vendor),
    datasets: [{ label: "Docs", data: vendors.map(v => v.total), backgroundColor: COLORS, borderRadius: 4 }]
  };

  const discData = {
    labels: disciplines.map(d => d.discipline),
    datasets: [{ data: disciplines.map(d => d.total), backgroundColor: COLORS, borderColor: "#111318", borderWidth: 2 }]
  };

  return (
    <div className="fade-in">
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: "linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.1))",
          border: "1px solid rgba(99,102,241,0.2)", display: "flex", alignItems: "center", justifyContent: "center"
        }}><Building2 size={20} color="var(--accent)" /></div>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)" }}>Vendor & Discipline Analysis</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Document distribution across vendors and engineering disciplines.</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16, display: "flex", alignItems: "center", gap: 6 }}>
            <Building2 size={14} color="var(--accent)" /> Documents by Vendor
          </h3>
          {vendors.length > 0 ? (
            <div style={{ height: 300 }}><Bar data={vendorData} options={AXIS_OPTS} /></div>
          ) : <p style={{ color: "var(--text-muted)", textAlign: "center", padding: 40 }}>No vendor data available.</p>}
        </div>
        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16, display: "flex", alignItems: "center", gap: 6 }}>
            <Package size={14} color="var(--accent)" /> By Discipline
          </h3>
          {disciplines.length > 0 ? (
            <div style={{ height: 300 }}>
              <Doughnut data={discData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "right", labels: { color: "#94a3b8", font: { size: 12 } } } } }} />
            </div>
          ) : <p style={{ color: "var(--text-muted)", textAlign: "center", padding: 40 }}>No discipline data.</p>}
        </div>
      </div>

      {/* Summary tables */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {vendors.length > 0 && (
          <div className="card">
            <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 10 }}>Vendor Summary</h3>
            <table className="data-table">
              <thead><tr><th>Vendor</th><th>Documents</th><th>%</th></tr></thead>
              <tbody>
                {vendors.map((v, i) => (
                  <tr key={i}>
                    <td style={{ color: "var(--text-primary)" }}>{v.vendor || "–"}</td>
                    <td><span className="badge badge-indigo">{v.total}</span></td>
                    <td style={{ color: "var(--text-muted)" }}>
                      {((v.total / vendors.reduce((a,b)=>a+b.total,0))*100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {disciplines.length > 0 && (
          <div className="card">
            <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 10 }}>Discipline Summary</h3>
            <table className="data-table">
              <thead><tr><th>Discipline</th><th>Documents</th><th>%</th></tr></thead>
              <tbody>
                {disciplines.map((d, i) => (
                  <tr key={i}>
                    <td style={{ color: "var(--text-primary)" }}>{d.discipline || "–"}</td>
                    <td><span className="badge badge-indigo">{d.total}</span></td>
                    <td style={{ color: "var(--text-muted)" }}>
                      {((d.total / disciplines.reduce((a,b)=>a+b.total,0))*100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}