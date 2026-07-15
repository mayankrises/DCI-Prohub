"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Building2, FileSpreadsheet, Loader2, Plus, RefreshCw } from "lucide-react";
import { createProject, getProjects } from "@/lib/api";

type Project = {
  id: number;
  project_name: string;
  contractor?: string;
  client?: string;
  review_period_days?: number;
  active_import?: {
    id: number;
    original_filename?: string;
    display_name?: string;
    row_count?: number;
    uploaded_at?: string;
    version_number?: number;
  } | null;
};

interface Props {
  selectedProjectId: number;
  onSelectProject: (projectId: number) => void;
  onOpenDashboard: () => void;
}

export default function ProjectHome({ selectedProjectId, onSelectProject, onOpenDashboard }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ project_name: "", contractor: "", client: "", review_period_days: 21 });

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await getProjects();
      setProjects(rows || []);
      if ((!selectedProjectId || !rows?.some((p: Project) => p.id === selectedProjectId)) && rows?.[0]) {
        onSelectProject(rows[0].id);
      }
    } catch (err) {
      setError("Could not load projects. Check the backend and Supabase configuration.");
    } finally {
      setLoading(false);
    }
  }, [onSelectProject, selectedProjectId]);

  useEffect(() => { void loadProjects(); }, [loadProjects]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.project_name.trim()) return;
    setCreating(true);
    setError("");
    try {
      const project = await createProject({
        ...form,
        project_name: form.project_name.trim(),
        contractor: form.contractor.trim(),
        client: form.client.trim(),
      });
      onSelectProject(project.id);
      setForm({ project_name: "", contractor: "", client: "", review_period_days: 21 });
      setShowCreate(false);
      await loadProjects();
    } catch {
      setError("Project creation failed. Make sure the core schema migration has been run.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fade-in">
      <div className="page-header" style={{ justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="page-icon"><Building2 size={18} style={{ color: "var(--accent)" }} /></div>
          <div>
            <h1 className="page-title">Project Home</h1>
            <p className="page-subtitle">Choose a project, create a workspace, then import its DCI workbook.</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn-ghost" onClick={() => void loadProjects()}><RefreshCw size={14} /> Refresh</button>
          <button className="btn-primary" onClick={() => setShowCreate(v => !v)}><Plus size={14} /> New Project</button>
        </div>
      </div>

      {error && <div className="card" style={{ marginBottom: 16, color: "var(--error)" }}>{error}</div>}

      {showCreate && (
        <form className="card" onSubmit={submit} style={{ marginBottom: 18 }}>
          <h3 style={{ marginBottom: 14 }}>Create project</h3>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 160px", gap: 10 }}>
            <input className="input" required placeholder="Project name" value={form.project_name} onChange={e => setForm(v => ({ ...v, project_name: e.target.value }))} />
            <input className="input" placeholder="Contractor" value={form.contractor} onChange={e => setForm(v => ({ ...v, contractor: e.target.value }))} />
            <input className="input" placeholder="Client" value={form.client} onChange={e => setForm(v => ({ ...v, client: e.target.value }))} />
            <input className="input" type="number" min={1} max={90} value={form.review_period_days} onChange={e => setForm(v => ({ ...v, review_period_days: Number(e.target.value) || 21 }))} />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
            <button type="button" className="btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={creating}>{creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create</button>
          </div>
        </form>
      )}

      {loading ? (
        <div style={{ minHeight: 260, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
          <Loader2 size={22} className="animate-spin" style={{ color: "var(--accent)" }} /> Loading projects…
        </div>
      ) : projects.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 50 }}>
          <Building2 size={34} style={{ color: "var(--text-muted)", margin: "0 auto 12px" }} />
          <h3>No projects yet</h3>
          <p style={{ color: "var(--text-muted)", marginTop: 6 }}>Create your first project, then open Import / Export to upload its workbook.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
          {projects.map(project => {
            const selected = project.id === selectedProjectId;
            const activeImport = project.active_import;
            return (
              <button
                key={project.id}
                onClick={() => onSelectProject(project.id)}
                onDoubleClick={() => { onSelectProject(project.id); onOpenDashboard(); }}
                className="card"
                style={{ textAlign: "left", cursor: "pointer", borderColor: selected ? "var(--accent)" : "var(--border)", background: selected ? "var(--accent-light)" : "var(--bg-panel)" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <h3 title={project.project_name} style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:260}}>{project.project_name}</h3>
                    <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{project.contractor || "No contractor"} · {project.client || "No client"}</p>
                  </div>
                  {selected && <span className="badge badge-indigo">Selected</span>}
                </div>
                <div style={{ marginTop: 18, padding: 12, borderRadius: 8, background: "var(--bg-app)", border: "1px solid var(--border)" }}>
                  {activeImport ? (
                    <>
                      <div style={{ display: "flex", gap: 7, alignItems: "center" }}><FileSpreadsheet size={14} style={{ color: "var(--accent)" }} /><strong title={activeImport.display_name || activeImport.original_filename} style={{ fontSize: 12, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", display:"block", maxWidth:240 }}>{activeImport.display_name || activeImport.original_filename}</strong></div>
                      <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 5 }}>{activeImport.row_count || 0} rows · version {activeImport.version_number || 1}</p>
                    </>
                  ) : <p style={{ fontSize: 12, color: "var(--text-muted)" }}>No workbook imported yet</p>}
                </div>
                <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 10 }}>Review period: {project.review_period_days || 21} days · Double-click to open dashboard</p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
