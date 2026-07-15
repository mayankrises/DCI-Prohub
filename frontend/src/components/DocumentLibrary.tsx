"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  Download,
  Eye,
  FileText,
  FolderOpen,
  Link,
  Loader2,
  Upload,
} from "lucide-react";

import type { MockUser } from "@/lib/auth";
import { hasPermission } from "@/lib/auth";
import {
  getDCIDocumentChoices,
  getDocuments,
  getSignedUrl,
  uploadDocument,
} from "@/lib/api";

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

interface DocumentChoice {
  id: number;
  document_number: string;
  document_title: string;
}


interface Props {
  user: MockUser | null;
  onView: (fileId: string) => void;
  projectId?: number;
}

type FlatDocumentFile = DocFile & {
  version_number?: number;
  revision_label?: string;
  display_name?: string;
};


function normalizeDocuments(data: unknown): DocGroup[] {
  if (!Array.isArray(data)) return [];

  if (
    data.every(
      (item) =>
        item &&
        typeof item === "object" &&
        Array.isArray((item as DocGroup).files),
    )
  ) {
    return data as DocGroup[];
  }

  const grouped = new Map<number, DocGroup>();

  for (const raw of data as FlatDocumentFile[]) {
    const documentId = Number(raw.document_id);
    if (!Number.isFinite(documentId)) continue;

    const current = grouped.get(documentId) ?? {
      id: documentId,
      display_name:
        raw.display_name ||
        raw.original_filename ||
        `Document ${documentId}`,
      files: [],
      versions: [],
    };

    current.files.push(raw);

    if (raw.version_number !== undefined) {
      const versionNumber = Number(raw.version_number);
      const alreadyAdded = current.versions.some(
        (version) => version.version_number === versionNumber,
      );

      if (!alreadyAdded) {
        current.versions.push({
          version_number: versionNumber,
          revision_label:
            raw.revision_label || `Rev-${Math.max(0, versionNumber - 1)}`,
        });
      }
    }

    grouped.set(documentId, current);
  }

  return Array.from(grouped.values());
}

function formatBytes(bytes: number): string {
  const safeBytes = Number(bytes) || 0;
  if (safeBytes < 1024) return `${safeBytes} B`;
  if (safeBytes < 1024 * 1024) {
    return `${(safeBytes / 1024).toFixed(1)} KB`;
  }
  return `${(safeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function latestVersionLabel(group: DocGroup): string | null {
  if (!group.versions.length) return null;

  const latest = [...group.versions].sort(
    (left, right) => right.version_number - left.version_number,
  )[0];

  return latest?.revision_label || `Version ${latest?.version_number}`;
}

export default function DocumentLibrary({
  user,
  onView,
  projectId = 1,
}: Props) {
  const [docs, setDocs] = useState<DocGroup[]>([]);
  const [choices, setChoices] = useState<DocumentChoice[]>([]);

  const [linkedDocId, setLinkedDocId] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [docName, setDocName] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const choicesById = useMemo(() => {
    return new Map(choices.map((choice) => [Number(choice.id), choice]));
  }, [choices]);

  const fetchDocs = useCallback(async () => {
    setLoading(true);

    try {
      const data = await getDocuments(projectId);
      setDocs(normalizeDocuments(data));
    } catch (error) {
      console.error("Failed to load document library:", error);
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);


  useEffect(() => {
    void fetchDocs();
    getDCIDocumentChoices(projectId)
      .then((data) => setChoices(Array.isArray(data) ? data : []))
      .catch((error) => {
        console.error("Failed to load document choices:", error);
        setChoices([]);
      });
  }, [fetchDocs, projectId]);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const selectedFile = acceptedFiles[0];
      if (!selectedFile) return;

      setPendingFile(selectedFile);

      if (!docName) {
        setDocName(selectedFile.name.replace(/\.[^.]+$/, ""));
      }
    },
    [docName],
  );

  const canUpload = hasPermission(user, "upload_document");

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "image/png": [".png"],
      "image/jpeg": [".jpg", ".jpeg"],
    },
    maxSize: 25 * 1024 * 1024,
    disabled: !canUpload,
  });

  const handleUpload = async () => {
    if (!pendingFile || !user) return;

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      const form = new FormData();
      form.append("file", pendingFile);
      form.append("project_id", String(projectId));
      form.append("document_name", docName || pendingFile.name);
      form.append("actor_user_id", user.id);

      if (linkedDocId) {
        form.append("document_id", linkedDocId);
      }

      await uploadDocument(form);

      setUploadSuccess(
        `"${docName || pendingFile.name}" uploaded successfully.`,
      );
      setPendingFile(null);
      setDocName("");
      setLinkedDocId("");

      await fetchDocs();
    } catch (error: unknown) {
      const detail = (
        error as {
          response?: {
            data?: {
              detail?: string;
            };
          };
        }
      )?.response?.data?.detail;

      setUploadError(
        detail || "Upload failed. Check that the backend is running.",
      );
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = useCallback(
    async (file: DocFile) => {
      if (downloadingFileId) return;

      setDownloadingFileId(file.id);

      try {
        const data = await getSignedUrl(file.id, user?.id ?? "system");
        const signedUrl = data?.signed_url;

        if (!signedUrl) {
          throw new Error("A download URL was not returned.");
        }

        // Opening the short-lived signed URL is more reliable than the HTML
        // download attribute for cross-origin Supabase Storage URLs.
        window.open(signedUrl, "_blank", "noopener,noreferrer");
      } catch (error) {
        console.error("Failed to download document:", error);
        setUploadError("Could not prepare the document download.");
      } finally {
        setDownloadingFileId(null);
      }
    },
    [downloadingFileId, user?.id],
  );

  return (
    <div className="fade-in">
      {/* Page heading */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background:
              "linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.1))",
            border: "1px solid rgba(99,102,241,0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <FolderOpen size={20} color="var(--accent)" />
        </div>

        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 700,
              color: "var(--text-primary)",
            }}
          >
            Document Library
          </h1>
          <p
            style={{
              margin: "3px 0 0",
              fontSize: 13,
              color: "var(--text-muted)",
            }}
          >
            Upload and manage project documents stored in private storage.
          </p>
        </div>
      </div>

      {/* Upload zone */}
      {canUpload ? (
        <div className="card" style={{ marginBottom: 24 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 16,
            }}
          >
            <Upload size={16} color="var(--accent)" />
            <span
              style={{
                fontWeight: 600,
                color: "var(--text-primary)",
              }}
            >
              Upload New Document
            </span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
              gap: 12,
              marginBottom: 12,
            }}
          >
            <div
              {...getRootProps()}
              style={{
                border: `2px dashed ${
                  isDragActive ? "var(--accent)" : "var(--border)"
                }`,
                borderRadius: 10,
                padding: 24,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                cursor: "pointer",
                transition: "all 0.2s",
                background: isDragActive
                  ? "var(--accent-glow)"
                  : "var(--bg-primary)",
              }}
            >
              <input {...getInputProps()} />
              <Upload
                size={28}
                color={
                  isDragActive ? "var(--accent)" : "var(--text-muted)"
                }
              />

              {pendingFile ? (
                <div style={{ textAlign: "center", minWidth: 0 }}>
                  <p
                    title={pendingFile.name}
                    style={{
                      margin: 0,
                      maxWidth: 360,
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--accent)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {pendingFile.name}
                  </p>
                  <p
                    style={{
                      margin: "3px 0 0",
                      fontSize: 11,
                      color: "var(--text-muted)",
                    }}
                  >
                    {formatBytes(pendingFile.size)}
                  </p>
                </div>
              ) : (
                <div style={{ textAlign: "center" }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13,
                      color: "var(--text-secondary)",
                    }}
                  >
                    {isDragActive
                      ? "Drop it here"
                      : "Drag and drop or click to browse"}
                  </p>
                  <p
                    style={{
                      margin: "4px 0 0",
                      fontSize: 11,
                      color: "var(--text-muted)",
                    }}
                  >
                    PDF, PNG, JPG · maximum 25 MB
                  </p>
                </div>
              )}
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: 4,
                    fontSize: 11,
                    color: "var(--text-muted)",
                    fontWeight: 600,
                  }}
                >
                  Upload display name
                </label>
                <input
                  className="input"
                  placeholder="Optional file display name"
                  value={docName}
                  onChange={(event) => setDocName(event.target.value)}
                />
              </div>

              <div>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    marginBottom: 4,
                    fontSize: 11,
                    color: "var(--text-muted)",
                    fontWeight: 600,
                  }}
                >
                  <Link size={11} />
                  Attach to DCI document
                </label>

                <select
                  className="input"
                  style={{ fontSize: 12 }}
                  value={linkedDocId}
                  onChange={(event) => setLinkedDocId(event.target.value)}
                >
                  <option value="">None — standalone upload</option>
                  {choices.map((choice) => (
                    <option key={choice.id} value={choice.id}>
                      {choice.document_number} — {choice.document_title}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {uploadError && (
            <div
              style={{
                marginBottom: 10,
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid rgba(239,68,68,0.2)",
                background: "rgba(239,68,68,0.08)",
                color: "#ef4444",
                fontSize: 13,
              }}
            >
              {uploadError}
            </div>
          )}

          {uploadSuccess && (
            <div
              style={{
                marginBottom: 10,
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid rgba(34,197,94,0.2)",
                background: "rgba(34,197,94,0.08)",
                color: "#16a34a",
                fontSize: 13,
              }}
            >
              {uploadSuccess}
            </div>
          )}

          <button
            type="button"
            className="btn-primary"
            style={{
              width: "100%",
              padding: 12,
              fontSize: 14,
            }}
            onClick={() => void handleUpload()}
            disabled={!pendingFile || uploading}
          >
            {uploading ? (
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <Loader2 size={16} className="animate-spin" />
                Uploading…
              </span>
            ) : (
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <Upload size={16} />
                Upload Document
              </span>
            )}
          </button>
        </div>
      ) : (
        <div
          className="card"
          style={{
            marginBottom: 24,
            padding: 32,
            textAlign: "center",
          }}
        >
          <p
            style={{
              margin: 0,
              color: "var(--text-muted)",
              fontSize: 13,
            }}
          >
            {user
              ? "You do not have permission to upload documents."
              : "Sign in to upload documents."}
          </p>
        </div>
      )}

      {/* Document list */}
      <div>
        <h2
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 14,
            fontSize: 16,
            fontWeight: 600,
            color: "var(--text-primary)",
          }}
        >
          <FolderOpen size={16} color="var(--accent)" />
          Uploaded Documents
          {docs.length > 0 && (
            <span className="badge badge-indigo">{docs.length}</span>
          )}
        </h2>

        {loading ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 48,
            }}
          >
            <Loader2
              size={24}
              color="var(--accent)"
              className="animate-spin"
            />
          </div>
        ) : docs.length === 0 ? (
          <div
            className="card"
            style={{
              padding: 48,
              textAlign: "center",
            }}
          >
            <FileText
              size={32}
              color="var(--text-muted)"
              style={{ margin: "0 auto 12px" }}
            />
            <p
              style={{
                margin: 0,
                color: "var(--text-secondary)",
                fontWeight: 500,
              }}
            >
              No documents yet.
            </p>
            <p
              style={{
                margin: "4px 0 0",
                color: "var(--text-muted)",
                fontSize: 12,
              }}
            >
              {canUpload
                ? "Use the upload form above to add the first document."
                : "Documents will appear here after they are uploaded."}
            </p>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {docs.map((group) => {
              const linkedDocument = choicesById.get(Number(group.id));
              const prominentNumber =
                linkedDocument?.document_number ||
                group.display_name ||
                `Document ${group.id}`;
              const prominentTitle =
                linkedDocument?.document_title || "Standalone document";
              const versionLabel = latestVersionLabel(group);

              return (
                <article
                  key={group.id}
                  className="card"
                  style={{
                    padding: "15px 18px",
                  }}
                >
                  {group.files.map((file, fileIndex) => (
                    <div
                      key={file.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 14,
                        padding: "10px 0",
                        borderBottom:
                          fileIndex < group.files.length - 1
                            ? "1px solid var(--border)"
                            : "none",
                      }}
                    >
                      <div
                        style={{
                          width: 42,
                          height: 42,
                          flexShrink: 0,
                          borderRadius: 10,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          border: "1px solid rgba(99,102,241,0.16)",
                          background: "rgba(99,102,241,0.09)",
                        }}
                      >
                        <FileText size={18} color="var(--accent)" />
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Linked document is intentionally the prominent label. */}
                        <p
                          title={prominentNumber}
                          style={{
                            margin: 0,
                            color: "var(--text-primary)",
                            fontSize: 14,
                            lineHeight: 1.35,
                            fontWeight: 750,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {prominentNumber}
                        </p>

                        <p
                          title={prominentTitle}
                          style={{
                            margin: "3px 0 0",
                            color: "var(--text-secondary)",
                            fontSize: 12,
                            lineHeight: 1.35,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {prominentTitle}
                        </p>

                        {/* The physical uploaded filename is secondary metadata. */}
                        <p
                          title={file.original_filename}
                          style={{
                            margin: "6px 0 0",
                            color: "var(--text-muted)",
                            fontSize: 10.5,
                            lineHeight: 1.35,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          File: {file.original_filename}
                          {versionLabel ? `  •  ${versionLabel}` : ""}
                          {"  •  "}
                          {formatBytes(file.size_bytes)}
                          {"  •  "}
                          {file.uploaded_at?.slice(0, 10) || "Unknown date"}
                        </p>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: 7,
                          flexShrink: 0,
                        }}
                      >
                        <button
                          type="button"
                          className="btn-ghost"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "7px 14px",
                            fontSize: 12,
                          }}
                          onClick={() => onView(file.id)}
                        >
                          <Eye size={13} />
                          View
                        </button>

                        <button
                          type="button"
                          className="btn-ghost"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "7px 14px",
                            fontSize: 12,
                          }}
                          onClick={() => void handleDownload(file)}
                          disabled={downloadingFileId === file.id}
                        >
                          {downloadingFileId === file.id ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Download size={13} />
                          )}
                          {downloadingFileId === file.id
                            ? "Preparing…"
                            : "Download"}
                        </button>
                      </div>
                    </div>
                  ))}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
