"use client";
import React, { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileText, Eye, Download, Loader2, FolderOpen, Link } from "lucide-react";
import type { MockUser } from "@/lib/auth";
import { hasPermission } from "@/lib/auth";
import { uploadDocument, getDocuments, getDCIDocumentChoices } from "@/lib/api";

interface DocFile {
  id: string;
  original_filename: string;
  size_bytes: number;
  uploaded_at: string;
  document_id: number;
  version_id: string;
}

interface Version {
  version_number: number;
  revision_label: string;
}

interface DocGroup {
  id: number;
  display_name: string;
  files: DocFile[];
  versions: Version[];
}

interface Props {
  user: MockUser | null;
  onView: (fileId: string) => void;
}

const DEMO_PROJECT_ID = 1;

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentLibrary({ user, onView }: Props) {
  const [docs, setDocs] = useState<DocGroup[]>([]);
  const [choices, setChoices] = useState<{ id: number; document_number: string; document_title: string }[]>([]);
  const [linkedDocId, setLinkedDocId] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [docName, setDocName] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getDocuments(DEMO_PROJECT_ID);
      setDocs(data || []);
    } catch {
      // API not running yet: show empty state
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchDocs();
    getDCIDocumentChoices(DEMO_PROJECT_ID)
      .then(setChoices)
      .catch(() => setChoices([]));
  }, [fetchDocs]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles[0]) {
      setPendingFile(acceptedFiles[0]);
      if (!docName) setDocName(acceptedFiles[0].name.replace(/\.[^.]+$/, ""));
    }
  }, [docName]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"], "image/png": [".png"], "image/jpeg": [".jpg", ".jpeg"] },
    maxSize: 25 * 1024 * 1024,
    disabled: !hasPermission(user, "upload_document"),
  });

  const handleUpload = async () => {
    if (!pendingFile || !user) return;
    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);
    try {
      const form = new FormData();
      form.append("file", pendingFile);
      form.append("project_id", String(DEMO_PROJECT_ID));
      form.append("document_name", docName || pendingFile.name);
      form.append("actor_user_id", user.id);
      if (linkedDocId) {
        form.append("document_id", linkedDocId);
      }
      await uploadDocument(form);
      setUploadSuccess(`✅ "${docName || pendingFile.name}" uploaded successfully!`);
      setPendingFile(null);
      setDocName("");
      setLinkedDocId("");
      fetchDocs();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Upload failed. Is the backend running?";
      setUploadError(msg);
    } finally {
      setUploading(false);
    }
  };

  const canUpload = hasPermission(user, "upload_document");

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: "linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.1))",
          border: "1px solid rgba(99,102,241,0.2)",
          display: "flex", alignItems: "center", justifyContent: "center"
        }}>
          <FolderOpen size={20} color="var(--accent)" />
        </div>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)" }}>Document Library</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Upload and manage project documents. Stored in Supabase private storage.</p>
        </div>
      </div>

      {/* Upload Zone */}
      {canUpload ? (
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <Upload size={16} color="var(--accent)" />
            <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>Upload New Document</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            {/* Dropzone */}
            <div
              {...getRootProps()}
              style={{
                border: `2px dashed ${isDragActive ? "var(--accent)" : "var(--border)"}`,
                borderRadius: 10, padding: 24,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                gap: 8, cursor: "pointer", transition: "all 0.2s",
                background: isDragActive ? "var(--accent-glow)" : "var(--bg-primary)",
              }}
            >
              <input {...getInputProps()} />
              <Upload size={28} color={isDragActive ? "var(--accent)" : "var(--text-muted)"} />
              {pendingFile ? (
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)" }}>{pendingFile.name}</p>
                  <p style={{ fontSize: 11, color: "var(--text-muted)" }}>{formatBytes(pendingFile.size)}</p>
                </div>
              ) : (
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                    {isDragActive ? "Drop it here!" : "Drag & drop or click to browse"}
                  </p>
                  <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>PDF, PNG, JPG · max 25 MB</p>
                </div>
              )}
            </div>

            {/* Options */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, display: "block", marginBottom: 4 }}>
                  Document Name (optional)
                </label>
                <input
                  className="input"
                  placeholder="Custom document name..."
                  value={docName}
                  onChange={e => setDocName(e.target.value)}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                  <Link size={11} /> Link to DCI Document
                </label>
                <select
                  className="input"
                  style={{ fontSize: 12 }}
                  value={linkedDocId}
                  onChange={e => setLinkedDocId(e.target.value)}
                >
                  <option value="">None (standalone)</option>
                  {choices.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.document_number} — {c.document_title}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {uploadError && (
            <div style={{
              background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
              borderRadius: 8, padding: "10px 14px", marginBottom: 10, fontSize: 13, color: "#f87171"
            }}>
              {uploadError}
            </div>
          )}
          {uploadSuccess && (
            <div style={{
              background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)",
              borderRadius: 8, padding: "10px 14px", marginBottom: 10, fontSize: 13, color: "#4ade80"
            }}>
              {uploadSuccess}
            </div>
          )}

          <button
            className="btn-primary"
            style={{ width: "100%", padding: "12px", fontSize: 14 }}
            onClick={handleUpload}
            disabled={!pendingFile || uploading}
          >
            {uploading ? (
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <Loader2 size={16} className="animate-spin" /> Uploading...
              </span>
            ) : (
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <Upload size={16} /> Upload Document
              </span>
            )}
          </button>
        </div>
      ) : (
        <div className="card" style={{ marginBottom: 24, textAlign: "center", padding: 32 }}>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            {user ? "You don't have permission to upload documents." : "Log in to upload documents."}
          </p>
        </div>
      )}

      {/* Document List */}
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <FolderOpen size={16} color="var(--accent)" /> Uploaded Documents
          {docs.length > 0 && (
            <span className="badge badge-indigo">{docs.length}</span>
          )}
        </h2>

        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 48 }}>
            <Loader2 size={24} color="var(--accent)" className="animate-spin" />
          </div>
        ) : docs.length === 0 ? (
          <div className="card" style={{ textAlign: "center", padding: 48 }}>
            <FileText size={32} color="var(--text-muted)" style={{ margin: "0 auto 12px" }} />
            <p style={{ color: "var(--text-secondary)", fontWeight: 500 }}>No documents yet.</p>
            <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 4 }}>
              {canUpload ? "Use the upload form above to add your first document." : "Documents will appear here once uploaded."}
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {docs.map(group => (
              <div key={group.id} className="card" style={{ padding: "14px 18px" }}>
                {group.files.map((file) => (
                  <div key={file.id} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "10px 0",
                    borderBottom: "1px solid var(--border)"
                  }}>
                    {/* Icon */}
                    <div style={{
                      width: 36, height: 36, borderRadius: 8,
                      background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.15)",
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
                    }}>
                      <FileText size={16} color="var(--accent)" />
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {file.original_filename}
                      </p>
                      <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                        Doc ID: {file.document_id} · {formatBytes(file.size_bytes)} · {file.uploaded_at?.slice(0, 10)}
                      </p>
                    </div>

                    {/* Actions */}
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button className="btn-ghost" style={{ padding: "6px 14px", fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}
                        onClick={() => onView(file.id)}>
                        <Eye size={13} /> View
                      </button>
                      <button className="btn-ghost" style={{ padding: "6px 14px", fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}>
                        <Download size={13} /> Download
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
