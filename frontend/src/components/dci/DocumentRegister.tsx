"use client";
import React, { useEffect, useState } from "react";
import { Loader2, Search, Download, RefreshCw, FileText } from "lucide-react";
import { getRegister } from "@/lib/api";


export default function DocumentRegister({ projectId = 1 }: { projectId?: number }) {
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [inputVal, setInputVal] = useState("");
  const [loading, setLoading] = useState(false);
  const PAGE_SIZE = 50;

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await getRegister(projectId, page, search);
      setData(res.data || []);
      setTotal(res.total || 0);
    } catch { setData([]); setTotal(0); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [page, search]);

  const columns = data.length > 0
    ? Object.keys(data[0]).filter(k => !["id", "project_id", "created_at", "updated_at", "import_run_id"].includes(k)).slice(0, 12)
    : [];

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="fade-in">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: "linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.1))",
            border: "1px solid rgba(99,102,241,0.2)", display: "flex", alignItems: "center", justifyContent: "center"
          }}><FileText size={20} color="var(--accent)" /></div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)" }}>Document Register</h1>
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
              {total.toLocaleString()} documents · Page {page} of {totalPages}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn-ghost" onClick={fetchData} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {/* Search */}
      <div style={{ position: "relative", marginBottom: 16 }}>
        <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
        <input
          className="input"
          style={{ paddingLeft: 36 }}
          placeholder="Search across all columns..."
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { setSearch(inputVal); setPage(1); } }}
        />
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Loader2 size={28} color="var(--accent)" className="animate-spin" />
        </div>
      ) : (
        <>
          <div style={{ overflow: "auto", borderRadius: 10, border: "1px solid var(--border)" }}>
            <table className="data-table">
              <thead>
                <tr>
                  {columns.map(col => (
                    <th key={col} style={{ whiteSpace: "nowrap" }}>
                      {col.replace(/_/g, " ").toUpperCase()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr><td colSpan={columns.length} style={{ textAlign: "center", padding: 32, color: "var(--text-muted)" }}>No documents found.</td></tr>
                ) : data.map((row, i) => (
                  <tr key={i}>
                    {columns.map(col => {
                      const val = row[col];
                      const str = val === null || val === undefined ? "–" : String(val);
                      return (
                        <td key={col} style={{ whiteSpace: "nowrap", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>
                          {str.startsWith("http") ? (
                            <a href={str} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>Link</a>
                          ) : str}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", marginTop: 16 }}>
              <button className="btn-ghost" style={{ padding: "6px 14px", fontSize: 12 }} onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Prev</button>
              {[...Array(Math.min(7, totalPages))].map((_, i) => {
                const p = i + 1;
                return (
                  <button key={p} onClick={() => setPage(p)}
                    style={{
                      padding: "6px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer",
                      background: page === p ? "var(--accent)" : "transparent",
                      color: page === p ? "white" : "var(--text-muted)",
                      border: `1px solid ${page === p ? "var(--accent)" : "var(--border)"}`,
                      fontFamily: "inherit"
                    }}>{p}</button>
                );
              })}
              <button className="btn-ghost" style={{ padding: "6px 14px", fontSize: 12 }} onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}