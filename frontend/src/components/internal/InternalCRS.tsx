"use client";

import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileUp, Loader2, PackageCheck } from "lucide-react";
import type { MockUser } from "@/lib/auth";
import { acceptInternalPackage, getInternalComments, getInternalDocuments, getInternalPackages, submitInternalResponsePackage } from "@/lib/api";

interface Props {
  projectId: number;
  user: MockUser | null;
}

export default function InternalCRS({ projectId, user }: Props) {
  const [documents, setDocuments] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [documentId, setDocumentId] = useState<number>(0);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [file, setFile] = useState<File | null>(null);
  const [revisionDate, setRevisionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const selectedDocument = documents.find((document) => Number(document.id) === Number(documentId));
  const currentVersion = selectedDocument?.current_version;
  const isConsultant = user?.role.startsWith("consultant");
  const isContractor = user?.role.startsWith("contractor");

  const load = async () => {
    const documentRows = await getInternalDocuments(projectId);
    setDocuments(documentRows);
    const selected = documentId || Number(documentRows[0]?.id || 0);
    if (!documentId && selected) setDocumentId(selected);
    if (selected) {
      const [commentRows, packageRows] = await Promise.all([
        getInternalComments(projectId, { internal_document_id: selected }),
        getInternalPackages(projectId, selected),
      ]);
      setComments(commentRows);
      setPackages(packageRows);
    }
  };
  useEffect(() => { void load().catch(console.error); }, [projectId, documentId]);

  const actionable = useMemo(
    () => comments.filter((comment) => comment.status !== "resolved"),
    [comments],
  );

  async function acceptPackage(packageId: string) {
    if (!user) return;
    setSaving(true);
    setMessage("");
    try {
      await acceptInternalPackage(packageId, {
        actor_user_id: user.id,
        remarks: "Accepted after contractor verification.",
      });
      setMessage("Package accepted. Comments were resolved and the document is ready for External DCI.");
      await load();
    } catch (error: any) {
      setMessage(error?.response?.data?.detail || "Could not accept the response package.");
    } finally {
      setSaving(false);
    }
  }

  async function submitPackage() {
    if (!user || !selectedDocument || !currentVersion) return;
    const unanswered = actionable.filter((comment) => !responses[comment.id]?.trim());
    if (unanswered.length) {
      setMessage(`Add responses for ${unanswered.map((comment) => comment.comment_code).join(", ")}.`);
      return;
    }
    const form = new FormData();
    form.append("project_id", String(projectId));
    form.append("internal_document_id", String(selectedDocument.id));
    form.append("source_version_id", String(currentVersion.id));
    form.append("responses_json", JSON.stringify(Object.fromEntries(actionable.map((comment) => [comment.id, responses[comment.id]]))));
    form.append("package_remarks", remarks);
    form.append("actor_user_id", user.id);
    if (file) {
      form.append("revised_file", file);
      form.append("revision_date", revisionDate);
      form.append("version_number", String(Number(selectedDocument.current_version_number || 0) + 1));
    }
    setSaving(true);
    setMessage("");
    try {
      const result = await submitInternalResponsePackage(form);
      setMessage(result.closure_remarks || "Response package submitted.");
      setResponses({}); setFile(null); setRemarks("");
      await load();
    } catch (error: any) {
      setMessage(error?.response?.data?.detail || "Could not submit the response package.");
    } finally { setSaving(false); }
  }

  return <div className="fade-in">
    <div style={{ marginBottom: 18 }}><p style={{ margin: 0, color: "var(--accent)", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".12em" }}>Inner Circle</p><h1 style={{ margin: "4px 0 0", fontSize: 24 }}>Comment Resolution Sheet</h1><p style={{ margin: "5px 0 0", fontSize: 13, color: "var(--text-muted)" }}>CRS replies stay as history. Visual annotations remain only on the version where they were raised.</p></div>
    <div className="card" style={{ padding: 14, marginBottom: 12 }}><select className="input" value={documentId} onChange={(event) => setDocumentId(Number(event.target.value))}>{documents.map((document) => <option key={document.id} value={document.id}>{document.document_number} — {document.document_title}</option>)}</select></div>
    {message && <div className="card" style={{ padding: 10, marginBottom: 12, fontSize: 12 }}>{message}</div>}
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 340px", gap: 14 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {comments.map((comment) => <div className="card" key={comment.id} style={{ padding: 14 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}><span className="badge badge-indigo">{comment.comment_code}</span><div style={{ flex: 1 }}><strong style={{ fontSize: 12 }}>{comment.comment_text}</strong><p style={{ margin: "4px 0 0", fontSize: 10, color: "var(--text-muted)" }}>Raised on version {comment.internal_version_id ? "linked" : "legacy"} · Page {comment.page_number}</p></div><span className={`badge ${comment.status === "resolved" ? "badge-green" : "badge-yellow"}`}>{comment.status.replaceAll("_", " ")}</span></div>
          {(comment.responses || []).map((response: any) => <div key={response.id} style={{ marginTop: 8, padding: "8px 10px", borderLeft: "3px solid var(--accent)", background: "var(--bg-subtle)", fontSize: 11 }}><strong>{response.created_by_org || "User"}</strong><p style={{ margin: "3px 0 0" }}>{response.response_text}</p></div>)}
          {isConsultant && comment.status !== "resolved" && <label style={{ display: "block", marginTop: 10 }}>CRS response<textarea className="input" rows={3} value={responses[comment.id] || ""} onChange={(event) => setResponses((current) => ({ ...current, [comment.id]: event.target.value }))} placeholder={`Response for ${comment.comment_code}`} /></label>}
        </div>)}
      </div>
      <aside className="card" style={{ padding: 15, height: "fit-content", position: "sticky", top: 0 }}>
        <h2 style={{ margin: 0, fontSize: 15 }}>Response package</h2><p style={{ margin: "5px 0 14px", fontSize: 11, color: "var(--text-muted)" }}>Submit all manual CRS responses together. Uploading the corrected file is optional.</p>
        {isConsultant ? <><label>Optional corrected file<input className="input" type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>{file && <label>Revision date<input className="input" type="date" value={revisionDate} onChange={(event) => setRevisionDate(event.target.value)} /></label>}<label>Package remarks<textarea className="input" rows={4} value={remarks} onChange={(event) => setRemarks(event.target.value)} /></label><div style={{ padding: 10, borderRadius: 8, background: "var(--bg-subtle)", fontSize: 11, marginTop: 10 }}>{file ? `Closure: Closed with uploading of V${Number(selectedDocument?.current_version_number || 0) + 1}.` : "Closure: Closed with comment."}</div><button className="btn-primary" style={{ width: "100%", marginTop: 12, justifyContent: "center" }} onClick={() => void submitPackage()} disabled={saving || actionable.length === 0}>{saving ? <Loader2 size={14} className="animate-spin" /> : <PackageCheck size={14} />} Submit package</button></> : <div style={{ fontSize: 12, color: "var(--text-muted)" }}><CheckCircle2 size={17} color="#16a34a" /><p>Verify submitted packages. Accepting a package resolves its CRS block and marks the document ready for External DCI.</p>{packages.filter((item) => item.status === "submitted").map((item) => <div key={item.id} style={{ marginTop: 10, padding: 10, border: "1px solid var(--border)", borderRadius: 8 }}><strong>Package {item.package_number}</strong><p style={{ margin: "3px 0 7px", fontSize: 10 }}>{item.closure_remarks}</p><button className="btn-primary" style={{ width: "100%", justifyContent: "center", fontSize: 11 }} disabled={saving} onClick={() => void acceptPackage(item.id)}>Accept package</button></div>)}</div>}
      </aside>
    </div>
  </div>;
}
