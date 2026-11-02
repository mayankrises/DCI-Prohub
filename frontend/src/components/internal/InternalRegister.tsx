"use client";

import React, { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Eye, FileCheck2, Send, UploadCloud } from "lucide-react";
import type { MockUser } from "@/lib/auth";
import { getInternalDocuments, sendInternalDocumentToExternal } from "@/lib/api";

interface Props {
  projectId: number;
  user: MockUser | null;
  onView: (fileId: string) => void;
  onOpenCRS: () => void;
}

function human(value: string): string {
  return value.replaceAll("_", " ");
}

export default function InternalRegister({ projectId, user, onView, onOpenCRS }: Props) {
  const [rows, setRows] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  const load = () => getInternalDocuments(projectId).then(setRows).catch((error) => {
    console.error(error);
    setRows([]);
  });
  useEffect(() => { void load(); }, [projectId]);

  async function sendExternal(documentId: number) {
    if (!user) return;
    try {
      await sendInternalDocumentToExternal(documentId, { actor_user_id: user.id });
      setMessage("The latest clean version was added to the External DCI submission queue.");
      await load();
    } catch (error: any) {
      setMessage(error?.response?.data?.detail || "Could not send the document to External DCI.");
    }
  }

  return (
    <div className="fade-in">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div><p style={{ margin: 0, color: "var(--accent)", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".12em" }}>Inner Circle</p><h1 style={{ margin: "4px 0 0", fontSize: 24 }}>Internal Document Register</h1></div>
        <button className="btn-ghost" onClick={onOpenCRS}><FileCheck2 size={14} /> Open CRS</button>
      </div>
      {message && <div className="card" style={{ padding: 10, marginBottom: 12, fontSize: 12 }}>{message}</div>}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "44px 1.15fr 1.7fr .7fr .6fr 1fr .7fr", gap: 10, padding: "11px 14px", background: "var(--bg-subtle)", fontSize: 10, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase" }}>
          <span></span><span>Document</span><span>Title</span><span>Discipline</span><span>Version</span><span>Status</span><span>Comments</span>
        </div>
        {rows.map((document) => {
          const isExpanded = expanded === document.id;
          return <div key={document.id} style={{ borderTop: "1px solid var(--border)" }}>
            <button type="button" onDoubleClick={() => setExpanded(isExpanded ? null : document.id)} onClick={() => setExpanded(isExpanded ? null : document.id)} style={{ width: "100%", display: "grid", gridTemplateColumns: "44px 1.15fr 1.7fr .7fr .6fr 1fr .7fr", gap: 10, alignItems: "center", padding: "13px 14px", border: 0, background: "var(--bg-panel)", color: "var(--text-primary)", textAlign: "left", cursor: "pointer" }}>
              <span>{isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</span>
              <strong style={{ fontSize: 12 }}>{document.document_number}</strong>
              <span style={{ fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{document.document_title}</span>
              <span style={{ fontSize: 11 }}>{document.discipline}</span>
              <span className="badge badge-indigo">V{document.current_version_number}</span>
              <span style={{ fontSize: 10, textTransform: "capitalize" }}>{human(document.status)}</span>
              <span style={{ fontSize: 11 }}>{document.comment_counts?.open || 0} open</span>
            </button>
            {isExpanded && <div style={{ padding: "10px 16px 14px 58px", background: "var(--bg-primary)" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {(document.versions || []).map((version: any) => <div key={version.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", border: "1px solid var(--border)", borderRadius: 8 }}>
                  <span className="badge badge-gray">{version.version_label}</span>
                  <div style={{ flex: 1 }}><strong style={{ fontSize: 11 }}>{version.generated_filename}</strong><p style={{ margin: "2px 0 0", fontSize: 10, color: "var(--text-muted)" }}>{version.revision_date} · Clean original</p></div>
                  <button className="btn-ghost" onClick={() => onView(version.viewer_file_id)}><Eye size={13} /> Open clean</button>
                </div>)}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
                {document.status === "ready_for_external_submission" && <button className="btn-primary" onClick={() => void sendExternal(document.id)}><Send size={13} /> Send to External DCI</button>}
              </div>
            </div>}
          </div>;
        })}
      </div>
    </div>
  );
}
