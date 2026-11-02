"use client";

import React, { useEffect, useMemo, useState } from "react";
import { FileUp, Loader2, Sparkles } from "lucide-react";
import type { MockUser } from "@/lib/auth";
import { MOCK_USERS } from "@/lib/auth";
import { createInternalDocument, getMasterData } from "@/lib/api";

interface Props {
  projectId: number;
  user: MockUser | null;
  onCreated: () => void;
}

export default function NewInternalDocument({ projectId, user, onCreated }: Props) {
  const [documentNumber, setDocumentNumber] = useState("");
  const [title, setTitle] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [disciplines, setDisciplines] = useState<string[]>([]);
  const [version, setVersion] = useState(0);
  const [revisionDate, setRevisionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [remarks, setRemarks] = useState("");
  const [contractorId, setContractorId] = useState("e5e5e5e5-e5e5-e5e5-e5e5-e5e5e5e5e5e5");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    getMasterData(projectId)
      .then((data) => {
        const values = data.disciplines || [];
        setDisciplines(values);
        setDiscipline((current) => current || values[0] || "General");
      })
      .catch(() => {
        setDisciplines(["General", "Civil", "Mechanical", "Electrical", "Instrumentation"]);
        setDiscipline("General");
      });
  }, [projectId]);

  const contractors = useMemo(
    () => MOCK_USERS.filter((candidate) => candidate.role.startsWith("contractor")),
    [],
  );
  const generatedFilename = `${(documentNumber || "DOCUMENT").replace(/[^A-Za-z0-9._-]+/g, "_")}_V${version}${file?.name.match(/\.[^.]+$/)?.[0] || ".pdf"}`;

  async function submit() {
    if (!user || !file || !documentNumber.trim() || !title.trim() || !discipline) {
      setMessage("Document number, title, discipline and file are required.");
      return;
    }
    const form = new FormData();
    form.append("file", file);
    form.append("project_id", String(projectId));
    form.append("document_number", documentNumber.trim());
    form.append("document_title", title.trim());
    form.append("discipline", discipline);
    form.append("version_number", String(version));
    form.append("revision_date", revisionDate);
    form.append("remarks", remarks);
    form.append("assigned_contractor_id", contractorId);
    form.append("assigned_consultant_id", user.id);
    form.append("actor_user_id", user.id);
    setSaving(true);
    setMessage("");
    try {
      await createInternalDocument(form);
      setMessage("Internal document created and contractor notified.");
      onCreated();
    } catch (error: any) {
      setMessage(error?.response?.data?.detail || "Could not create the internal document.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fade-in" style={{ maxWidth: 900, margin: "0 auto" }}>
      <div style={{ marginBottom: 18 }}>
        <p style={{ margin: 0, color: "var(--accent)", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".12em" }}>Inner Circle</p>
        <h1 style={{ margin: "4px 0 0", fontSize: 24 }}>Upload Internal Document</h1>
        <p style={{ margin: "5px 0 0", color: "var(--text-muted)", fontSize: 13 }}>The consultant uploads a clean version. The contractor receives a review notification.</p>
      </div>

      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <label>Document number<input className="input" value={documentNumber} onChange={(event) => setDocumentNumber(event.target.value)} placeholder="STS-2306-GA-001" /></label>
          <label>Document title<input className="input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="General Arrangement Drawing" /></label>
          <label>Discipline<select className="input" value={discipline} onChange={(event) => setDiscipline(event.target.value)}>{disciplines.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Assigned contractor<select className="input" value={contractorId} onChange={(event) => setContractorId(event.target.value)}>{contractors.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></label>
          <label>Version<input className="input" type="number" min={0} value={version} onChange={(event) => setVersion(Number(event.target.value))} /></label>
          <label>Revision date<input className="input" type="date" value={revisionDate} onChange={(event) => setRevisionDate(event.target.value)} /></label>
          <label style={{ gridColumn: "1/-1" }}>Remarks<textarea className="input" rows={3} value={remarks} onChange={(event) => setRemarks(event.target.value)} /></label>
          <label style={{ gridColumn: "1/-1" }}>Clean file<input className="input" type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>
        </div>

        <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: "var(--accent-light)", border: "1px solid rgba(99,102,241,.18)", display: "flex", gap: 9, alignItems: "center" }}>
          <Sparkles size={15} color="var(--accent)" />
          <div><p style={{ margin: 0, fontSize: 10, color: "var(--text-muted)" }}>Generated filename</p><strong style={{ fontSize: 12 }}>{generatedFilename}</strong></div>
        </div>

        {message && <p style={{ fontSize: 12, color: message.includes("created") ? "#16a34a" : "#dc2626", marginTop: 12 }}>{message}</p>}
        <button className="btn-primary" style={{ width: "100%", marginTop: 14, justifyContent: "center" }} disabled={saving} onClick={() => void submit()}>
          {saving ? <Loader2 size={15} className="animate-spin" /> : <FileUp size={15} />}
          {saving ? "Uploading…" : "Create and notify contractor"}
        </button>
      </div>
    </div>
  );
}
