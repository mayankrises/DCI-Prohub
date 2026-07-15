"use client";
import React, { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import {
  Upload, Download, FileSpreadsheet, CheckCircle, AlertTriangle,
  Loader2, RefreshCw, Eye, ChevronRight, Database
} from "lucide-react";
import { listImports, uploadWorkbook, previewImport, exportDocuments } from "@/lib/api";

const PROJECT_ID = 1;

interface ImportRecord {
  id: number;
  display_name: string;
  row_count: number;
  import_status: string;
  version_number: number;
  uploaded_at: string;
  project_name: string;
  contractor: string;
}

interface PreviewRow {
  document_number: string;
  document_title: string;
  discipline: string;
  vendor: string;
  status: string;
  approval_code: string;
  revision: string;
  uploaded_date: string;
}

export default function ImportExport() {
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ status: string; row_count?: number; warnings?: string[]; errors?: string[]; message?: string } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [previewImportId, setPreviewImportId] = useState<number | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingList, setLoadingList] = useState(true);

  const fetchImports = useCallback(async () => {
    setLoadingList(true);
    try {
      const data = await listImports(PROJECT_ID);
      setImports(data || []);
    } catch {
      setImports([]);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => { fetchImports(); }, [fetchImports]);

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) {
      setPendingFile(accepted[0]);
      setUploadResult(null);
      setUploadError(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] },
    maxFiles: 1,
  });

  const handleUpload = async () => {
    if (!pendingFile) return;
    setUploading(true);
    setUploadError(null);
    setUploadResult(null);
    try {
      const form = new FormData();
      form.append("file", pendingFile);
      form.append("project_id", String(PROJECT_ID));
      const result = await uploadWorkbook(form);
      setUploadResult(result);
      setPendingFile(null);
      fetchImports();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string | { errors?: string[] } } } };
      const detail = err?.response?.data?.detail;
      if (typeof detail === "object" && detail?.errors) {
        setUploadError(detail.errors.join("\n"));
      } else {
        setUploadError(String(detail || "Upload failed. Is the backend running?"));
      }
    } finally {
      setUploading(false);
    }
  };

  const handlePreview = async (importId: number) => {
    if (previewImportId === importId) {
      setPreviewImportId(null);
      setPreview([]);
      return;
    }
    setLoadingPreview(true);
    setPreviewImportId(importId);
    try {
      const data = await previewImport(importId, 15);
      setPreview(data || []);
    } catch {
      setPreview([]);
    } finally {
      setLoadingPreview(false);
    }
  };

  const exportUrl = exportDocuments(PROJECT_ID);

  return (
    <div className="fade-in">
      {/* Header */}
      <div className="page-header">
        <div className="page-icon">
          <FileSpreadsheet size={18} style={{ color: "var(--accent)" }} />
        </div>
        <div>
          <h1 className="page-title">Import / Export</h1>
          <p className="page-subtitle">Upload DCI workbooks (.xlsx) and export the document register</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        {/* Upload Card */}
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <Upload size={15} style={{ color: "var(--accent)" }} />
            <h3>Import Workbook</h3>
          </div>

          {/* Dropzone */}
          <div
            {...getRootProps()}
            style={{
              border: `2px dashed ${isDragActive ? "var(--accent)" : "var(--border)"}`,
              borderRadius: "var(--radius-md)", padding: 32,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: 8, cursor: "pointer", transition: "all 0.15s",
              background: isDragActive ? "var(--accent-light)" : "var(--bg-app)",
              marginBottom: 14,
              textAlign: "center"
            }}
          >
            <input {...getInputProps()} />
            <FileSpreadsheet size={28} style={{ color: isDragActive ? "var(--accent)" : "var(--text-muted)" }} />
            {pendingFile ? (
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)" }}>{pendingFile.name}</p>
                <p style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {(pendingFile.size / 1024).toFixed(1)} KB · Ready to import
                </p>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 500 }}>
                  {isDragActive ? "Drop the .xlsx file here" : "Drag & drop or click to select"}
                </p>
                <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                  Accepts .xlsx DCI workbooks only
                </p>
              </div>
            )}
          </div>

          {uploadError && (
            <div style={{
              background: "rgba(225,29,72,0.06)", border: "1px solid rgba(225,29,72,0.2)",
              borderRadius: "var(--radius-md)", padding: "10px 14px", marginBottom: 10,
              fontSize: 12, color: "var(--accent)", whiteSpace: "pre-wrap"
            }}>
              <AlertTriangle size={12} style={{ marginRight: 6 }} />
              {uploadError}
            </div>
          )}

          {uploadResult && (
            <div style={{
              background: uploadResult.status === "complete" ? "rgba(16,185,129,0.06)" : "rgba(245,158,11,0.06)",
              border: `1px solid ${uploadResult.status === "complete" ? "rgba(16,185,129,0.2)" : "rgba(245,158,11,0.2)"}`,
              borderRadius: "var(--radius-md)", padding: "10px 14px", marginBottom: 10, fontSize: 12
            }}>
              <CheckCircle size={12} style={{ marginRight: 6, color: "#10B981" }} />
              {uploadResult.status === "complete"
                ? `✅ Imported ${uploadResult.row_count?.toLocaleString()} documents successfully`
                : uploadResult.message}
              {uploadResult.warnings && uploadResult.warnings.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <p style={{ fontWeight: 600, color: "#D97706" }}>⚠ {uploadResult.warnings.length} warnings</p>
                  {uploadResult.warnings.slice(0, 3).map((w, i) => <p key={i} style={{ color: "#92400E" }}>{w}</p>)}
                </div>
              )}
            </div>
          )}

          <button
            className="btn-primary"
            style={{ width: "100%", justifyContent: "center", fontSize: 13 }}
            disabled={!pendingFile || uploading}
            onClick={handleUpload}
          >
            {uploading
              ? <><Loader2 size={14} className="animate-spin" /> Uploading...</>
              : <><Upload size={14} /> Import Workbook</>
            }
          </button>
        </div>

        {/* Export Card */}
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <Download size={15} style={{ color: "var(--accent)" }} />
            <h3>Export Register</h3>
          </div>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20, lineHeight: 1.6 }}>
            Download all documents from the latest active import as a formatted Excel file (.xlsx). 
            Includes doc number, title, discipline, vendor, status, revision, and dates.
          </p>
          <div style={{
            background: "var(--bg-app)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)", padding: 14, marginBottom: 14
          }}>
            {imports.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
                  📄 {imports[0].display_name}
                </p>
                <p style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {imports[0].row_count?.toLocaleString()} documents · {imports[0].uploaded_at?.slice(0, 10)}
                </p>
              </div>
            ) : (
              <p style={{ fontSize: 12, color: "var(--text-muted)" }}>No imports found for this project.</p>
            )}
          </div>
          <a
            href={exportUrl}
            download
            style={{ textDecoration: "none" }}
          >
            <button
              className="btn-primary"
              style={{ width: "100%", justifyContent: "center", fontSize: 13 }}
              disabled={imports.length === 0}
            >
              <Download size={14} /> Download as Excel
            </button>
          </a>
        </div>
      </div>

      {/* Import History */}
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Database size={15} style={{ color: "var(--accent)" }} />
            <h3>Import History</h3>
            <span className="badge badge-gray">{imports.length}</span>
          </div>
          <button className="btn-ghost" style={{ fontSize: 12, padding: "5px 10px" }} onClick={fetchImports}>
            <RefreshCw size={12} /> Refresh
          </button>
        </div>

        {loadingList ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 32, gap: 8 }}>
            <Loader2 size={18} className="animate-spin" style={{ color: "var(--accent)" }} />
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Loading imports...</span>
          </div>
        ) : imports.length === 0 ? (
          <div style={{ textAlign: "center", padding: 48 }}>
            <FileSpreadsheet size={32} style={{ color: "var(--text-muted)", margin: "0 auto 12px" }} />
            <p style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 500 }}>No workbooks imported yet</p>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Upload a DCI Excel workbook above to get started</p>
          </div>
        ) : (
          <div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Filename</th>
                  <th>Project</th>
                  <th>Contractor</th>
                  <th>Rows</th>
                  <th>Status</th>
                  <th>Imported At</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {imports.map(imp => (
                  <React.Fragment key={imp.id}>
                    <tr>
                      <td style={{ fontWeight: 500 }}>{imp.display_name}</td>
                      <td>{imp.project_name || "—"}</td>
                      <td>{imp.contractor || "—"}</td>
                      <td>{imp.row_count?.toLocaleString()}</td>
                      <td>
                        <span className={`badge ${imp.import_status === "complete" ? "badge-green" : "badge-yellow"}`}>
                          {imp.import_status}
                        </span>
                      </td>
                      <td>{imp.uploaded_at?.slice(0, 16).replace("T", " ")}</td>
                      <td>
                        <button
                          className="btn-ghost"
                          style={{ fontSize: 11, padding: "3px 8px", display: "flex", alignItems: "center", gap: 4 }}
                          onClick={() => handlePreview(imp.id)}
                        >
                          <Eye size={11} />
                          {previewImportId === imp.id ? "Hide" : "Preview"}
                        </button>
                      </td>
                    </tr>
                    {previewImportId === imp.id && (
                      <tr>
                        <td colSpan={7} style={{ padding: 0 }}>
                          <div style={{ background: "var(--bg-subtle)", borderTop: "1px solid var(--border)", padding: 16 }}>
                            {loadingPreview ? (
                              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <Loader2 size={14} className="animate-spin" style={{ color: "var(--accent)" }} />
                                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Loading preview...</span>
                              </div>
                            ) : (
                              <div style={{ overflow: "auto" }}>
                                <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>
                                  Showing first 15 rows
                                </p>
                                <table className="data-table" style={{ fontSize: 11 }}>
                                  <thead>
                                    <tr>
                                      <th>Doc No</th><th>Title</th><th>Discipline</th>
                                      <th>Vendor</th><th>Status</th><th>Code</th><th>Rev</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {preview.map((row, i) => (
                                      <tr key={i}>
                                        <td className="mono">{row.document_number}</td>
                                        <td style={{ maxWidth: 200 }} className="truncate">{row.document_title}</td>
                                        <td>{row.discipline}</td>
                                        <td>{row.vendor}</td>
                                        <td>{row.status}</td>
                                        <td>{row.approval_code}</td>
                                        <td>{row.revision}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
