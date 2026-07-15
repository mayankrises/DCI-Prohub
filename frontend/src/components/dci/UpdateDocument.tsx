"use client";

import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle, Edit3, Loader2, Save } from "lucide-react";
import {
  getDCIDocument,
  getDCIDocumentChoices,
  getMasterData,
  updateDCIDocument,
  type MasterData,
} from "@/lib/api";

type Choice = { id: number; document_number?: string; document_title?: string };
type DocumentRow = Record<string, unknown> & { id: number; document_number?: string; document_title?: string };

const EMPTY_MASTER: MasterData = {
  vendors: [],
  disciplines: [],
  revisions: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
  code_labels: { "1": "Approved", "2": "Commented", "3": "Resubmission", R: "Retained for Records", V: "Void" },
};

function nextRevision(current: string, allowed: string[]): string {
  const normalized = current.trim();
  const index = allowed.indexOf(normalized);
  if (index >= 0 && index + 1 < allowed.length) return allowed[index + 1];
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? String(numeric + 1) : normalized;
}

export default function UpdateDocument({ projectId, actorUserId = "system" }: { projectId: number; actorUserId?: string }) {
  const [choices, setChoices] = useState<Choice[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [document, setDocument] = useState<DocumentRow | null>(null);
  const [master, setMaster] = useState<MasterData>(EMPTY_MASTER);
  const [form, setForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setChoices([]); setSelectedId(null); setDocument(null);
    Promise.all([getDCIDocumentChoices(projectId), getMasterData(projectId)])
      .then(([rows, data]) => {
        setChoices(rows || []);
        setMaster(data || EMPTY_MASTER);
        if (rows?.[0]) setSelectedId(rows[0].id);
      })
      .catch(() => setChoices([]));
  }, [projectId]);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true); setMessage("");
    getDCIDocument(selectedId).then((row: DocumentRow) => {
      setDocument(row);
      const currentRevision = String(row.revision || "0");
      setForm({
        document_title: String(row.document_title || ""),
        discipline: String(row.discipline || ""),
        vendor: String(row.vendor || ""),
        revision: nextRevision(currentRevision, master.revisions),
        returned_code: String(row.returned_code || ""),
        revision_date: String(row.actual_submission_date || "").slice(0, 10),
        review_date: String(row.review_date || "").slice(0, 10),
        remarks: String(row.remarks || ""),
      });
    }).finally(() => setLoading(false));
  }, [selectedId, master.revisions]);

  const selectedLabel = useMemo(() => choices.find(choice => choice.id === selectedId), [choices, selectedId]);
  const automaticStatus = form.returned_code ? (master.code_labels[form.returned_code] || "Configured code") : (form.revision_date ? "With EIL / Client" : "Fresh Submission");

  const save = async () => {
    if (!selectedId) return;
    setSaving(true); setMessage("");
    try {
      const payload = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value === "" && key.endsWith("_date") ? null : value]));
      const updated = await updateDCIDocument(selectedId, { ...payload, actor_user_id: actorUserId, event_type: "revision_update" });
      setDocument(updated);
      setMessage("Document updated and added to the timeline.");
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      setMessage(err.response?.data?.detail || "The document could not be updated.");
    } finally { setSaving(false); }
  };

  return <div className="fade-in">
    <div className="page-header"><div className="page-icon"><Edit3 size={18} style={{ color: "var(--accent)" }} /></div><div><h1 className="page-title">Update Document</h1><p className="page-subtitle">Create the next revision, record the EIL return and derive status automatically.</p></div></div>
    <div className="card" style={{ marginBottom: 16 }}><label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>Select document</label><select className="input" value={selectedId || ""} onChange={e => setSelectedId(Number(e.target.value))}>{choices.map(choice => <option key={choice.id} value={choice.id}>{choice.document_number} — {choice.document_title}</option>)}</select></div>
    {loading ? <div style={{ padding: 50, display: "flex", justifyContent: "center" }}><Loader2 className="animate-spin" /></div> : document ? <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 18 }}><div><h3>{selectedLabel?.document_number}</h3><p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 4 }}>Current revision: {String(document.revision || "Fresh")}</p></div>{message && <span style={{ fontSize: 12, color: message.startsWith("Document updated") ? "#16A34A" : "var(--error)" }}>{message}</span>}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label style={{ fontSize: 12 }}>Title<input className="input" value={form.document_title || ""} onChange={e => setForm(v => ({ ...v, document_title: e.target.value }))} /></label>
        <label style={{ fontSize: 12 }}>Vendor<select className="input" value={form.vendor || ""} onChange={e => setForm(v => ({ ...v, vendor: e.target.value }))}><option value="">Select vendor</option>{master.vendors.map(value => <option key={value}>{value}</option>)}</select></label>
        <label style={{ fontSize: 12 }}>Discipline<select className="input" value={form.discipline || ""} onChange={e => setForm(v => ({ ...v, discipline: e.target.value }))}><option value="">Select discipline</option>{master.disciplines.map(value => <option key={value}>{value}</option>)}</select></label>
        <label style={{ fontSize: 12 }}>Next revision<select className="input" value={form.revision || ""} onChange={e => setForm(v => ({ ...v, revision: e.target.value }))}><option value={form.revision}>{form.revision}</option></select></label>
        <label style={{ fontSize: 12 }}>Review code<select className="input" value={form.returned_code || ""} onChange={e => setForm(v => ({ ...v, returned_code: e.target.value }))}><option value="">No code yet</option>{Object.entries(master.code_labels).map(([code, label]) => <option key={code} value={code}>{code} — {label}</option>)}</select></label>
        <label style={{ fontSize: 12 }}>Automatic status<input className="input" value={automaticStatus} readOnly style={{ background: "var(--bg-subtle)", cursor: "not-allowed" }} /></label>
        <label style={{ fontSize: 12 }}>Submission date<input className="input" type="date" value={form.revision_date || ""} onChange={e => setForm(v => ({ ...v, revision_date: e.target.value }))} /></label>
        <label style={{ fontSize: 12 }}>EIL return date<input className="input" type="date" value={form.review_date || ""} onChange={e => setForm(v => ({ ...v, review_date: e.target.value }))} /></label>
        <label style={{ fontSize: 12, gridColumn: "1 / -1" }}>Remarks<textarea className="input" rows={4} value={form.remarks || ""} onChange={e => setForm(v => ({ ...v, remarks: e.target.value }))} /></label>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}><button className="btn-primary" disabled={saving} onClick={save}>{saving ? <Loader2 size={14} className="animate-spin" /> : message.startsWith("Document updated") ? <CheckCircle size={14} /> : <Save size={14} />} Save Changes</button></div>
    </div> : <div className="card" style={{ textAlign: "center", color: "var(--text-muted)" }}>Import a workbook before updating documents.</div>}
  </div>;
}
