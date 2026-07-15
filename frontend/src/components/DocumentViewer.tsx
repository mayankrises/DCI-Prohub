"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { Eye, PinIcon, Square, Highlighter, Pen, Loader2, CheckCircle, MessageCircle, X, ChevronRight, Maximize2, Minimize2, PanelRightClose, PanelRightOpen } from "lucide-react";
import type { MockUser } from "@/lib/auth";
import { hasPermission } from "@/lib/auth";
import {
  getSignedUrl, getAnnotations, createAnnotation, resolveAnnotation, addReply,
  acquireDocumentLock, heartbeatDocumentLock, releaseDocumentLock,
} from "@/lib/api";

type AnnotationType = "pin" | "rectangle" | "highlight" | "freehand";

interface Annotation {
  id: string;
  annotation_type: AnnotationType;
  page_number: number;
  geometry: Record<string, unknown>;
  comment_text: string;
  status: "open" | "resolved";
  created_by: string;
  created_at: string;
  style?: Record<string, unknown>;
  replies?: Reply[];
}

interface LockLease {
  acquired: boolean;
  lock_id?: string;
  lock_token?: string;
  owner?: string;
  expires_at?: string;
}

interface Reply {
  id: string;
  reply_text: string;
  created_by: string;
  created_at: string;
}

interface Props {
  user: MockUser | null;
  fileId: string | null;
}

const TOOL_OPTIONS = [
  { id: "pin" as AnnotationType, icon: <PinIcon size={16} />, label: "Pin" },
  { id: "rectangle" as AnnotationType, icon: <Square size={16} />, label: "Rectangle" },
  { id: "highlight" as AnnotationType, icon: <Highlighter size={16} />, label: "Highlight" },
  { id: "freehand" as AnnotationType, icon: <Pen size={16} />, label: "Draw" },
];

const ANN_COLORS = [
  "#6366f1", "#ef4444", "#f59e0b", "#22c55e", "#06b6d4", "#ec4899"
];

export default function DocumentViewer({ user, fileId }: Props) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [activeTool, setActiveTool] = useState<AnnotationType>("pin");
  const [activeColor, setActiveColor] = useState(ANN_COLORS[0]);
  const [selectedAnn, setSelectedAnn] = useState<Annotation | null>(null);
  const [commentText, setCommentText] = useState("");
  const [replyText, setReplyText] = useState("");
  const [pendingGeo, setPendingGeo] = useState<Record<string, unknown> | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [drawPoints, setDrawPoints] = useState<{x:number;y:number}[]>([]);
  const [dragStart, setDragStart] = useState<{x:number;y:number}|null>(null);
  const [saving, setSaving] = useState(false);
  const [lockLease, setLockLease] = useState<LockLease | null>(null);
  const [lockMessage, setLockMessage] = useState("");
  const [annotationMode, setAnnotationMode] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(true);
  const canvasRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const fetchAnnotations = useCallback(async () => {
    if (!fileId) return;
    try {
      const data = await getAnnotations(fileId);
      setAnnotations(data || []);
    } catch { setAnnotations([]); }
  }, [fileId]);

  useEffect(() => {
    if (!fileId) return;
    setLoading(true);
    getSignedUrl(fileId, user?.id || "system")
      .then(d => setSignedUrl(d.signed_url))
      .catch(() => setSignedUrl(null))
      .finally(() => setLoading(false));
    fetchAnnotations();
  }, [fileId, fetchAnnotations, user?.id]);

  useEffect(() => {
    if (!fileId || !user || !hasPermission(user, "add_annotation")) {
      setLockLease(null);
      return;
    }

    let active = true;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let acquiredLease: LockLease | null = null;

    acquireDocumentLock(fileId, user.id)
      .then((lease: LockLease) => {
        if (!active) return;
        acquiredLease = lease;
        setLockLease(lease);
        setLockMessage(lease.acquired ? "Edit lock acquired" : "This file is currently being edited by another user.");
        if (lease.acquired && lease.lock_id && lease.lock_token) {
          heartbeatTimer = setInterval(() => {
            void heartbeatDocumentLock(lease.lock_id!, lease.lock_token!, user.id).catch(() => {
              setLockLease(null);
              setLockMessage("Edit lock expired. Reopen the file to continue annotating.");
            });
          }, 60000);
        }
      })
      .catch(() => setLockMessage("Could not acquire the edit lock."));

    return () => {
      active = false;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (acquiredLease?.acquired && acquiredLease.lock_id && acquiredLease.lock_token) {
        void releaseDocumentLock(acquiredLease.lock_id, acquiredLease.lock_token, user.id).catch(() => undefined);
      }
    };
  }, [fileId, user]);

  const getRelativeCoords = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (!hasPermission(user, "add_annotation") || !lockLease?.acquired) return;
    const coords = getRelativeCoords(e);
    if (activeTool === "pin") {
      setPendingGeo({ x: coords.x, y: coords.y });
    } else if (activeTool === "rectangle" || activeTool === "highlight") {
      setDragStart(coords);
    } else if (activeTool === "freehand") {
      setDrawing(true);
      setDrawPoints([coords]);
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (activeTool === "freehand" && drawing) {
      setDrawPoints(prev => [...prev, getRelativeCoords(e)]);
    }
  };

  const handleCanvasMouseUp = (e: React.MouseEvent) => {
    const coords = getRelativeCoords(e);
    if ((activeTool === "rectangle" || activeTool === "highlight") && dragStart) {
      const x = Math.min(dragStart.x, coords.x);
      const y = Math.min(dragStart.y, coords.y);
      const width = Math.abs(coords.x - dragStart.x);
      const height = Math.abs(coords.y - dragStart.y);
      if (width > 0.01 && height > 0.01) {
        setPendingGeo({ x, y, width, height });
      }
      setDragStart(null);
    } else if (activeTool === "freehand" && drawing) {
      if (drawPoints.length > 2) {
        setPendingGeo({ points: drawPoints });
      }
      setDrawing(false);
      setDrawPoints([]);
    }
  };

  const saveAnnotation = async () => {
    if (!pendingGeo || !user || !fileId || !lockLease?.lock_token) return;
    setSaving(true);
    try {
      await createAnnotation({
        file_id: fileId,
        annotation_type: activeTool,
        page_number: 1,
        geometry: pendingGeo,
        comment_text: commentText,
        actor_user_id: user.id,
        lock_token: lockLease.lock_token,
        style: { stroke: activeColor, stroke_width: 2 }
      });
      setPendingGeo(null);
      setCommentText("");
      fetchAnnotations();
    } catch { /* show error */}
    finally { setSaving(false); }
  };

  const handleResolve = async (ann: Annotation) => {
    if (!user) return;
    await resolveAnnotation(ann.id, user.id);
    fetchAnnotations();
    setSelectedAnn(null);
  };

  const handleAddReply = async () => {
    if (!selectedAnn || !user || !replyText.trim()) return;
    await addReply(selectedAnn.id, { reply_text: replyText, actor_user_id: user.id });
    setReplyText("");
    fetchAnnotations();
  };

  if (!fileId) {
    return (
      <div className="fade-in" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh", gap: 16 }}>
        <div style={{
          width: 80, height: 80, borderRadius: 20,
          background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.15)",
          display: "flex", alignItems: "center", justifyContent: "center"
        }}>
          <Eye size={36} color="var(--accent)" />
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)" }}>Document Viewer</h2>
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
          Go to Document Library and click <strong style={{ color: "var(--text-secondary)" }}>View</strong> on any document to open it here.
        </p>
      </div>
    );
  }

  const openAnnotations = annotations.filter(a => a.status === "open");
  const resolvedAnnotations = annotations.filter(a => a.status === "resolved");

  return (
    <div className="fade-in" style={{ display: "grid", gridTemplateColumns: commentsOpen ? "minmax(0,1fr) 320px" : "minmax(0,1fr)", gap: 16, height: fullscreen ? "100vh" : "calc(100vh - 104px)", position: fullscreen ? "fixed" : "relative", inset: fullscreen ? 0 : undefined, zIndex: fullscreen ? 1000 : undefined, background: "var(--bg-app)", padding: fullscreen ? 16 : 0 }}>

      {/* Left: PDF + annotation canvas */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, overflow: "hidden" }}>
        {user && lockMessage && (
          <div className="card" style={{ padding: "8px 12px", fontSize: 12, color: lockLease?.acquired ? "#16A34A" : "#D97706" }}>
            {lockMessage}
          </div>
        )}
        {/* Toolbar */}
        <div className="card" style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Tool:</span>
          <div style={{ display: "flex", gap: 4 }}>
            {TOOL_OPTIONS.map(tool => (
              <button key={tool.id}
                onClick={() => setActiveTool(tool.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 5, padding: "5px 10px",
                  borderRadius: 6, border: "1px solid",
                  borderColor: activeTool === tool.id ? "var(--accent)" : "var(--border)",
                  background: activeTool === tool.id ? "var(--accent-glow)" : "transparent",
                  color: activeTool === tool.id ? "var(--accent)" : "var(--text-muted)",
                  cursor: "pointer", fontSize: 12, fontWeight: 500, fontFamily: "inherit",
                  transition: "all 0.15s"
                }}>
                {tool.icon} {tool.label}
              </button>
            ))}
          </div>
          <button className={annotationMode ? "btn-primary" : "btn-ghost"} style={{fontSize:12}} onClick={() => setAnnotationMode(v => !v)}>{annotationMode ? "Finish annotating" : "Annotate"}</button>
          <div style={{ width: 1, height: 20, background: "var(--border)" }} />
          <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Color:</span>
          <div style={{ display: "flex", gap: 5 }}>
            {ANN_COLORS.map(c => (
              <button key={c} onClick={() => setActiveColor(c)}
                style={{
                  width: 20, height: 20, borderRadius: "50%", background: c,
                  border: activeColor === c ? "2px solid white" : "2px solid transparent",
                  cursor: "pointer", transition: "all 0.15s"
                }} />
            ))}
          </div>
          <div style={{marginLeft:"auto",display:"flex",gap:6}}>
            <button className="icon-button" title={commentsOpen ? "Hide comments" : "Show comments"} onClick={() => setCommentsOpen(v => !v)}>{commentsOpen ? <PanelRightClose size={16}/> : <PanelRightOpen size={16}/>}</button>
            <button className="icon-button" title={fullscreen ? "Exit fullscreen" : "Fullscreen"} onClick={() => setFullscreen(v => !v)}>{fullscreen ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}</button>
          </div>
        </div>

        {/* Document area */}
        <div style={{ flex: 1, position: "relative", borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)" }}>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", gap: 10 }}>
              <Loader2 size={24} color="var(--accent)" className="animate-spin" />
              <span style={{ color: "var(--text-muted)", fontSize: 13 }}>Loading document...</span>
            </div>
          ) : signedUrl ? (
            <>
              <iframe
                ref={iframeRef}
                src={signedUrl}
                style={{ width: "100%", height: "100%", border: "none", display: "block" }}
                title="Document Viewer"
              />
              {/* Annotation overlay */}
              <div
                ref={canvasRef}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                style={{
                  position: "absolute", inset: 0,
                  cursor: activeTool === "freehand" ? "crosshair" : activeTool === "pin" ? "pointer" : "crosshair",
                  zIndex: 5,
                  pointerEvents: annotationMode ? "auto" : "none"
                }}
              >
                {/* Render existing annotations */}
                {annotations.map((ann, i) => {
                  const g = ann.geometry;
                  const color = ann.status === "resolved" ? "#22c55e" : (ann.style?.stroke as string || "#6366f1");
                  if (ann.annotation_type === "pin") {
                    return (
                      <button key={ann.id}
                        className="ann-pin"
                        onClick={() => setSelectedAnn(ann)}
                        style={{
                          left: `${(g.x as number) * 100}%`,
                          top: `${(g.y as number) * 100}%`,
                          background: color,
                          zIndex: 10
                        }}>
                        {i + 1}
                      </button>
                    );
                  }
                  if (ann.annotation_type === "rectangle" || ann.annotation_type === "highlight") {
                    return (
                      <div key={ann.id}
                        className="ann-highlight"
                        onClick={() => setSelectedAnn(ann)}
                        style={{
                          left: `${(g.x as number) * 100}%`, top: `${(g.y as number) * 100}%`,
                          width: `${(g.width as number) * 100}%`, height: `${(g.height as number) * 100}%`,
                          borderColor: color,
                          background: ann.annotation_type === "highlight" ? `${color}22` : "transparent"
                        }} />
                    );
                  }
                  return null;
                })}

                {/* Pending annotation preview */}
                {pendingGeo && activeTool !== "freehand" && activeTool !== "pin" && (
                  <div style={{
                    position: "absolute",
                    left: `${(pendingGeo.x as number) * 100}%`, top: `${(pendingGeo.y as number) * 100}%`,
                    width: `${(pendingGeo.width as number) * 100}%`, height: `${(pendingGeo.height as number) * 100}%`,
                    border: `2px solid ${activeColor}`, borderRadius: 4,
                    background: activeTool === "highlight" ? `${activeColor}22` : "transparent",
                    pointerEvents: "none"
                  }} />
                )}
              </div>
            </>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 10 }}>
              <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Could not load document. Is the FastAPI backend running?</p>
            </div>
          )}
        </div>
      </div>

      {/* Right: Annotation panel */}
      <div style={{ display: commentsOpen ? "flex" : "none", flexDirection: "column", gap: 12, overflow: "auto" }}>

        {/* Add annotation form */}
        {pendingGeo && (
          <div className="card" style={{ padding: 14, border: "1px solid rgba(99,102,241,0.3)" }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", marginBottom: 8 }}>
              💬 Add Comment
            </p>
            <textarea
              className="input"
              rows={3}
              placeholder="Describe the issue or comment..."
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              style={{ resize: "none", marginBottom: 8 }}
            />
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn-primary" style={{ flex: 1, fontSize: 12 }} onClick={saveAnnotation} disabled={saving}>
                {saving ? <Loader2 size={13} className="animate-spin" /> : "Save"}
              </button>
              <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setPendingGeo(null)}>
                <X size={13} />
              </button>
            </div>
          </div>
        )}

        {/* Annotation list */}
        <div className="card" style={{ padding: 14, flex: 1, overflow: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 6 }}>
              <MessageCircle size={14} color="var(--accent)" /> Comments
            </span>
            <div style={{ display: "flex", gap: 4 }}>
              <span className="badge badge-red">{openAnnotations.length} open</span>
              <span className="badge badge-green">{resolvedAnnotations.length} resolved</span>
            </div>
          </div>

          {annotations.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", padding: "20px 0" }}>
              Click on the document to add an annotation
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {annotations.map((ann, i) => (
                <div key={ann.id}
                  onClick={() => setSelectedAnn(selectedAnn?.id === ann.id ? null : ann)}
                  style={{
                    padding: "10px 12px", borderRadius: 8, cursor: "pointer",
                    border: `1px solid ${selectedAnn?.id === ann.id ? "var(--accent)" : "var(--border)"}`,
                    background: selectedAnn?.id === ann.id ? "var(--accent-glow)" : "var(--bg-primary)",
                    transition: "all 0.15s"
                  }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{
                      width: 20, height: 20, borderRadius: "50%",
                      background: ann.status === "resolved" ? "#22c55e" : (ann.style?.stroke as string || "var(--accent)"),
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 10, fontWeight: 700, color: "white", flexShrink: 0
                    }}>{i + 1}</span>
                    <span style={{ fontSize: 12, color: "var(--text-secondary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {ann.comment_text || <em>No comment</em>}
                    </span>
                    <span className={`badge ${ann.status === "resolved" ? "badge-green" : "badge-red"}`} style={{ fontSize: 9 }}>
                      {ann.status}
                    </span>
                  </div>

                  {selectedAnn?.id === ann.id && (
                    <div style={{ marginTop: 10 }} onClick={e => e.stopPropagation()}>
                      {/* Replies */}
                      {(ann.replies || []).map(r => (
                        <div key={r.id} style={{
                          marginBottom: 6, padding: "6px 8px",
                          borderLeft: "2px solid var(--border)", marginLeft: 4
                        }}>
                          <p style={{ fontSize: 11, color: "var(--text-secondary)" }}>{r.reply_text}</p>
                          <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{r.created_at?.slice(0,10)}</p>
                        </div>
                      ))}
                      {/* Add reply */}
                      <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                        <input className="input" style={{ fontSize: 11, padding: "5px 8px" }}
                          placeholder="Reply..." value={replyText} onChange={e => setReplyText(e.target.value)} />
                        <button className="btn-ghost" style={{ fontSize: 11, padding: "5px 8px" }} onClick={handleAddReply}>
                          <ChevronRight size={12} />
                        </button>
                      </div>
                      {/* Resolve */}
                      {ann.status === "open" && hasPermission(user, "resolve_annotation") && (
                        <button
                          className="btn-ghost"
                          style={{ marginTop: 8, width: "100%", fontSize: 11, display: "flex", alignItems: "center", gap: 5, justifyContent: "center", color: "#4ade80", borderColor: "rgba(34,197,94,0.3)" }}
                          onClick={() => handleResolve(ann)}>
                          <CheckCircle size={12} /> Mark as Resolved
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}