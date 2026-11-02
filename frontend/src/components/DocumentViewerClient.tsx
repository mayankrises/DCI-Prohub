"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Eye,
  Highlighter,
  Loader2,
  Maximize2,
  MessageCircle,
  Minimize2,
  MousePointer2,
  RotateCw,
  PanelRightClose,
  PanelRightOpen,
  Pen,
  PinIcon,
  Square,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Document, pdfjs } from "react-pdf";
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();
import PDFPageSurface from "@/components/PDFPageSurface";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";


import type { MockUser } from "@/lib/auth";
import { hasPermission, MOCK_USERS } from "@/lib/auth";
import {
  acquireDocumentLock,
  addReply,
  addReviewResponse,
  createAnnotation,
  createReviewComment,
  getAnnotations,
  getReviewComments,
  getSignedUrl,
  heartbeatDocumentLock,
  releaseDocumentLock,
  resolveAnnotation,
  resolveReviewComment,
} from "@/lib/api";

type AnnotationType =
  | "pin"
  | "rectangle"
  | "highlight"
  | "freehand"
  | "arrow_comment";

type AnnotationStatus = "open" | "resolved";
type ReviewCommentStatus =
  | "open"
  | "responded"
  | "awaiting_verification"
  | "resolved"
  | "reopened";

interface Reply {
  id: string;
  reply_text: string;
  created_by: string;
  created_at: string;
}

interface Annotation {
  id: string;
  annotation_type: AnnotationType;
  page_number: number;
  geometry: Record<string, unknown>;
  comment_text: string;
  status: AnnotationStatus;
  created_by: string;
  created_at: string;
  style?: Record<string, unknown>;
  replies?: Reply[];
}

interface ReviewResponse {
  id: string;
  response_text: string;
  created_by: string;
  created_at: string;
  response_type?: string;
}

interface ReviewComment {
  id: string;
  comment_code: string;
  comment_text: string;
  page_number: number;
  geometry: Record<string, unknown>;
  style?: Record<string, unknown>;
  status: ReviewCommentStatus;
  assigned_to?: string | null;
  raised_by?: string | null;
  responses?: ReviewResponse[];
}

interface LockLease {
  acquired: boolean;
  lock_id?: string;
  lock_token?: string;
  owner?: string;
  expires_at?: string;
}

interface ViewerMeta {
  document_id: number;
  version_id: string;
}

interface Props {
  user: MockUser | null;
  fileId: string | null;
  projectId: number;
}

interface Point {
  x: number;
  y: number;
}

const TOOL_OPTIONS = [
  {
    id: "arrow_comment" as AnnotationType,
    icon: <MousePointer2 size={16} />,
    label: "Arrow Comment",
  },
  {
    id: "pin" as AnnotationType,
    icon: <PinIcon size={16} />,
    label: "Pin",
  },
  {
    id: "rectangle" as AnnotationType,
    icon: <Square size={16} />,
    label: "Rectangle",
  },
  {
    id: "highlight" as AnnotationType,
    icon: <Highlighter size={16} />,
    label: "Highlight",
  },
  {
    id: "freehand" as AnnotationType,
    icon: <Pen size={16} />,
    label: "Draw",
  },
];

const ANN_COLORS = [
  "#6366f1",
  "#ef4444",
  "#f59e0b",
  "#22c55e",
  "#06b6d4",
  "#ec4899",
];

const DEFAULT_ARROW_COLOR = "#ef4444";

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function commentStatusLabel(status: ReviewCommentStatus): string {
  return status.replaceAll("_", " ");
}

export default function DocumentViewer({ user, fileId, projectId }: Props) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [reviewComments, setReviewComments] = useState<ReviewComment[]>([]);
  const [viewerMeta, setViewerMeta] = useState<ViewerMeta | null>(null);

  const [activeTool, setActiveTool] = useState<AnnotationType>("arrow_comment");
  const [activeColor, setActiveColor] = useState(DEFAULT_ARROW_COLOR);
  const [fontSize, setFontSize] = useState(12);
  const [fontFamily, setFontFamily] = useState("Arial");

  const consultantUsers = useMemo(
    () =>
      MOCK_USERS.filter((candidate) => candidate.role.startsWith("consultant")),
    [],
  );
  const [assignedTo, setAssignedTo] = useState(consultantUsers[0]?.id ?? "");

  const [selectedAnn, setSelectedAnn] = useState<Annotation | null>(null);
  const [selectedReviewComment, setSelectedReviewComment] =
    useState<ReviewComment | null>(null);
  const [commentText, setCommentText] = useState("");
  const [replyText, setReplyText] = useState("");
  const [pendingGeo, setPendingGeo] = useState<Record<string, unknown> | null>(
    null,
  );
  const [drawing, setDrawing] = useState(false);
  const [drawPoints, setDrawPoints] = useState<Point[]>([]);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [dragCurrent, setDragCurrent] = useState<Point | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");

  const [lockLease, setLockLease] = useState<LockLease | null>(null);
  const [lockMessage, setLockMessage] = useState("");
  const [annotationMode, setAnnotationMode] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(true);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageIntrinsicSize, setPageIntrinsicSize] = useState({
    width: 612,
    height: 792,
  });
  const [numPages, setNumPages] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pageViewportWidth, setPageViewportWidth] = useState(0);

  const canvasRef = useRef<HTMLDivElement>(null);
  const pageViewportRef = useRef<HTMLDivElement>(null);
  const lockLeaseRef = useRef<LockLease | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const element = pageViewportRef.current;
    if (!element) return;

    const updateWidth = () => {
      setPageViewportWidth(Math.max(320, element.clientWidth));
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, [commentsOpen, fullscreen]);

  const fetchAnnotations = useCallback(async () => {
    if (!fileId) {
      setAnnotations([]);
      return;
    }

    try {
      const data = await getAnnotations(fileId);
      setAnnotations(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to load annotations:", error);
      setAnnotations([]);
    }
  }, [fileId]);

  const fetchReviewComments = useCallback(
    async (documentId?: number) => {
      const resolvedDocumentId = documentId ?? viewerMeta?.document_id;
      if (!resolvedDocumentId) {
        setReviewComments([]);
        return;
      }

      try {
        const data = await getReviewComments(projectId, {
          document_id: resolvedDocumentId,
          version_id: viewerMeta?.version_id,
        });
        setReviewComments(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Failed to load review comments:", error);
        setReviewComments([]);
      }
    },
    [projectId, viewerMeta?.document_id, viewerMeta?.version_id],
  );

  useEffect(() => {
    if (!fileId) {
      setSignedUrl(null);
      setViewerMeta(null);
      setReviewComments([]);
      setAnnotations([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError("");
    setPageNumber(1);
    setNumPages(0);

    getSignedUrl(fileId, user?.id ?? "system")
      .then(async (data) => {
        if (cancelled) return;

        const documentId = Number(data.document_id);
        const meta: ViewerMeta = {
          document_id: documentId,
          version_id: String(data.version_id),
        };

        setSignedUrl(data.signed_url);
        setViewerMeta(meta);

        const comments = await getReviewComments(projectId, {
          document_id: documentId,
          version_id: meta.version_id,
        });
        if (!cancelled) {
          setReviewComments(Array.isArray(comments) ? comments : []);
        }
      })
      .catch((error) => {
        console.error("Failed to load document:", error);
        if (!cancelled) {
          setSignedUrl(null);
          setViewerMeta(null);
          setLoadError(
            "Could not load the document. Check that the backend and storage configuration are available.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    void fetchAnnotations();

    return () => {
      cancelled = true;
    };
  }, [fileId, fetchAnnotations, projectId, user?.id]);

  const clearDraft = useCallback(() => {
    setPendingGeo(null);
    setCommentText("");
    setDragStart(null);
    setDragCurrent(null);
    setDrawing(false);
    setDrawPoints([]);
    setActionError("");
  }, []);

  const releaseCurrentLock = useCallback(async () => {
    const lease = lockLeaseRef.current;

    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }

    lockLeaseRef.current = null;
    setLockLease(null);

    if (lease?.acquired && lease.lock_id && lease.lock_token && user?.id) {
      try {
        await releaseDocumentLock(lease.lock_id, lease.lock_token, user.id);
      } catch (error) {
        console.error("Failed to release document lock:", error);
      }
    }
  }, [user?.id]);

  const finishAnnotating = useCallback(async () => {
    setAnnotationMode(false);
    clearDraft();
    setLockMessage("");
    await releaseCurrentLock();
  }, [clearDraft, releaseCurrentLock]);

  const startAnnotating = useCallback(async () => {
    if (!fileId || !user || !hasPermission(user, "add_annotation")) {
      setLockMessage("Sign in with annotation permission to edit this file.");
      return;
    }

    setActionError("");
    setLockMessage("Acquiring edit lock…");

    try {
      const lease = (await acquireDocumentLock(fileId, user.id)) as LockLease;

      lockLeaseRef.current = lease;
      setLockLease(lease);

      if (!lease.acquired) {
        setAnnotationMode(false);
        setLockMessage(
          `Locked by ${lease.owner ?? "another user"}. The PDF remains available in read-only mode.`,
        );
        return;
      }

      setAnnotationMode(true);
      setLockMessage("Edit lock acquired. Annotation mode is active.");

      if (lease.lock_id && lease.lock_token) {
        heartbeatRef.current = setInterval(() => {
          void heartbeatDocumentLock(
            lease.lock_id!,
            lease.lock_token!,
            user.id,
          ).catch((error) => {
            console.error("Lock heartbeat failed:", error);
            setAnnotationMode(false);
            setLockLease(null);
            lockLeaseRef.current = null;
            setLockMessage(
              "The edit lock expired. Click Annotate to acquire it again.",
            );
          });
        }, 30000);
      }
    } catch (error) {
      console.error("Could not acquire document lock:", error);
      setAnnotationMode(false);
      setLockLease(null);
      lockLeaseRef.current = null;
      setLockMessage("Could not acquire the edit lock.");
    }
  }, [fileId, user]);

  useEffect(() => {
    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
      }

      const lease = lockLeaseRef.current;
      if (lease?.acquired && lease.lock_id && lease.lock_token && user?.id) {
        void releaseDocumentLock(
          lease.lock_id,
          lease.lock_token,
          user.id,
        ).catch(() => undefined);
      }
    };
  }, [user?.id]);

  useEffect(() => {
    if (!fileId) return;
    void finishAnnotating();
    // fileId intentionally triggers cleanup when switching files.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId]);

  const getRelativeCoords = (event: React.MouseEvent): Point => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return { x: 0, y: 0 };
    }

    return {
      x: clamp01((event.clientX - rect.left) / rect.width),
      y: clamp01((event.clientY - rect.top) / rect.height),
    };
  };

  const canDraw =
    annotationMode &&
    Boolean(lockLease?.acquired) &&
    hasPermission(user, "add_annotation");

  const handleCanvasMouseDown = (event: React.MouseEvent) => {
    if (!canDraw) return;

    event.preventDefault();
    const coords = getRelativeCoords(event);

    if (activeTool === "pin") {
      setPendingGeo({ x: coords.x, y: coords.y });
      return;
    }

    if (
      activeTool === "arrow_comment" ||
      activeTool === "rectangle" ||
      activeTool === "highlight"
    ) {
      setDragStart(coords);
      setDragCurrent(coords);
      return;
    }

    if (activeTool === "freehand") {
      setDrawing(true);
      setDrawPoints([coords]);
    }
  };

  const handleCanvasMouseMove = (event: React.MouseEvent) => {
    if (!canDraw) return;

    const coords = getRelativeCoords(event);

    if (dragStart) {
      setDragCurrent(coords);
    }

    if (activeTool === "freehand" && drawing) {
      setDrawPoints((previous) => [...previous, coords]);
    }
  };

  const handleCanvasMouseUp = (event: React.MouseEvent) => {
    if (!canDraw) return;

    const coords = getRelativeCoords(event);

    if (activeTool === "arrow_comment" && dragStart) {
      const distance = Math.hypot(
        coords.x - dragStart.x,
        coords.y - dragStart.y,
      );

      if (distance > 0.015) {
        setPendingGeo({
          start_x: dragStart.x,
          start_y: dragStart.y,
          end_x: coords.x,
          end_y: coords.y,
          box_x: clamp01(coords.x + 0.015),
          box_y: clamp01(coords.y - 0.02),
          box_width: 0.28,
          box_height: 0.1,
        });
      }

      setDragStart(null);
      setDragCurrent(null);
      return;
    }

    if (
      (activeTool === "rectangle" || activeTool === "highlight") &&
      dragStart
    ) {
      const x = Math.min(dragStart.x, coords.x);
      const y = Math.min(dragStart.y, coords.y);
      const width = Math.abs(coords.x - dragStart.x);
      const height = Math.abs(coords.y - dragStart.y);

      if (width > 0.01 && height > 0.01) {
        setPendingGeo({ x, y, width, height });
      }

      setDragStart(null);
      setDragCurrent(null);
      return;
    }

    if (activeTool === "freehand" && drawing) {
      const finalPoints = [...drawPoints, coords];
      if (finalPoints.length > 2) {
        setPendingGeo({ points: finalPoints });
      }
      setDrawing(false);
      setDrawPoints([]);
    }
  };

  const saveAnnotation = async () => {
    if (!pendingGeo || !user || !fileId) return;

    const lease = lockLeaseRef.current;
    if (!lease?.acquired || !lease.lock_token) {
      setActionError("The edit lock is not active.");
      return;
    }

    if (!commentText.trim()) {
      setActionError("Enter a professional comment before saving.");
      return;
    }

    setSaving(true);
    setActionError("");

    try {
      if (activeTool === "arrow_comment") {
        if (!viewerMeta) {
          throw new Error("Document metadata is unavailable.");
        }

        await createReviewComment({
          project_id: projectId,
          document_id: viewerMeta.document_id,
          version_id: viewerMeta.version_id,
          document_file_id: fileId,
          page_number: pageNumber,
          comment_text: commentText.trim(),
          geometry: pendingGeo,
          style: {
            stroke: activeColor,
            stroke_width: 2,
            font_size: fontSize,
            font_family: fontFamily,
          },
          visibility: "internal",
          priority: "normal",
          raised_by: user.id,
          raised_by_org: user.organisation?.toLowerCase() ?? "contractor",
          assigned_to: assignedTo || null,
          assigned_org: "consultant",
        });

        await fetchReviewComments(viewerMeta.document_id);
      } else {
        await createAnnotation({
          file_id: fileId,
          annotation_type: activeTool,
          page_number: pageNumber,
          geometry: pendingGeo,
          comment_text: commentText.trim(),
          actor_user_id: user.id,
          lock_token: lease.lock_token,
          style: {
            stroke: activeColor,
            stroke_width: 2,
          },
        });

        await fetchAnnotations();
      }

      clearDraft();
    } catch (error) {
      console.error("Failed to save annotation:", error);
      setActionError("Could not save the annotation. Check the backend logs.");
    } finally {
      setSaving(false);
    }
  };

  const handleResolveAnnotation = async (annotation: Annotation) => {
    if (!user) return;

    try {
      await resolveAnnotation(annotation.id, user.id);
      await fetchAnnotations();
      setSelectedAnn(null);
    } catch (error) {
      console.error("Failed to resolve annotation:", error);
      setActionError("Could not resolve the annotation.");
    }
  };

  const handleAddAnnotationReply = async () => {
    if (!selectedAnn || !user || !replyText.trim()) return;

    try {
      await addReply(selectedAnn.id, {
        reply_text: replyText.trim(),
        actor_user_id: user.id,
      });
      setReplyText("");
      await fetchAnnotations();
    } catch (error) {
      console.error("Failed to add annotation reply:", error);
      setActionError("Could not add the reply.");
    }
  };

  const handleAddReviewReply = async () => {
    if (!selectedReviewComment || !user || !replyText.trim()) return;

    try {
      await addReviewResponse(selectedReviewComment.id, {
        response_text: replyText.trim(),
        created_by: user.id,
        response_type: "reply",
      });
      setReplyText("");
      await fetchReviewComments();
    } catch (error) {
      console.error("Failed to add CRS response:", error);
      setActionError("Could not add the CRS response.");
    }
  };

  const handleResolveReviewComment = async (comment: ReviewComment) => {
    if (!user) return;

    try {
      await resolveReviewComment(comment.id, {
        resolved_by: user.id,
        resolution_message: replyText.trim() || "Resolved after verification.",
      });
      setReplyText("");
      await fetchReviewComments();
      setSelectedReviewComment(null);
    } catch (error) {
      console.error("Failed to resolve review comment:", error);
      setActionError("Could not resolve the review comment.");
    }
  };

  if (!fileId) {
    return (
      <div
        className="fade-in"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "60vh",
          gap: 16,
        }}
      >
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 20,
            background: "rgba(99,102,241,0.08)",
            border: "1px solid rgba(99,102,241,0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Eye size={36} color="var(--accent)" />
        </div>
        <h2
          style={{
            fontSize: 20,
            fontWeight: 600,
            color: "var(--text-primary)",
          }}
        >
          Document Viewer
        </h2>
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
          Open a file from Document Library to view or annotate it.
        </p>
      </div>
    );
  }

  const openAnnotations = annotations.filter(
    (annotation) => annotation.status === "open",
  );
  const resolvedAnnotations = annotations.filter(
    (annotation) => annotation.status === "resolved",
  );
  const openReviewComments = reviewComments.filter(
    (comment) => comment.status !== "resolved",
  );
  const resolvedReviewComments = reviewComments.filter(
    (comment) => comment.status === "resolved",
  );
  const visibleAnnotations = annotations.filter(
    (annotation) => Number(annotation.page_number) === pageNumber,
  );
  const visibleReviewComments = reviewComments.filter(
    (comment) => Number(comment.page_number) === pageNumber,
  );
  const pageRenderWidth = Math.max(
    320,
    Math.floor((pageViewportWidth - 32) * zoom),
  );

  const renderArrow = (
    key: string,
    geometry: Record<string, unknown>,
    color: string,
    label?: string,
    text?: string,
    font?: string,
    size?: number,
  ) => {
    const startX = numberValue(geometry.start_x);
    const startY = numberValue(geometry.start_y);
    const endX = numberValue(geometry.end_x);
    const endY = numberValue(geometry.end_y);
    const boxX = numberValue(geometry.box_x, endX);
    const boxY = numberValue(geometry.box_y, endY);
    const boxWidth = numberValue(geometry.box_width, 0.28);

    return (
      <React.Fragment key={key}>
        <svg
          viewBox="0 0 1000 1000"
          preserveAspectRatio="none"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            overflow: "visible",
          }}
        >
          <defs>
            <marker
              id={`arrowhead-${key}`}
              markerWidth="10"
              markerHeight="10"
              refX="8"
              refY="3"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M0,0 L0,6 L9,3 z" fill={color} />
            </marker>
          </defs>
          <line
            x1={startX * 1000}
            y1={startY * 1000}
            x2={endX * 1000}
            y2={endY * 1000}
            stroke={color}
            strokeWidth="3"
            vectorEffect="non-scaling-stroke"
            markerEnd={`url(#arrowhead-${key})`}
          />
        </svg>

        {label && (
          <div
            style={{
              position: "absolute",
              left: `${boxX * 100}%`,
              top: `${boxY * 100}%`,
              width: `${boxWidth * 100}%`,
              minWidth: 110,
              maxWidth: 320,
              minHeight: 42,
              padding: "7px 9px",
              border: `2px solid ${color}`,
              borderRadius: 6,
              background: "rgba(255,255,245,0.96)",
              color: "#111827",
              fontSize: size ?? 12,
              fontFamily: font ?? "Arial",
              lineHeight: 1.35,
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              boxShadow: "0 4px 14px rgba(15,23,42,0.15)",
              pointerEvents: "none",
            }}
          >
            <strong style={{ color }}>{label}</strong>
            {text ? <div style={{ marginTop: 2 }}>{text}</div> : null}
          </div>
        )}
      </React.Fragment>
    );
  };

  return (
    <div
      className="fade-in"
      style={{
        display: "grid",
        gridTemplateColumns: commentsOpen
          ? "minmax(0,1fr) 340px"
          : "minmax(0,1fr)",
        gap: 16,
        height: fullscreen ? "100vh" : "calc(100vh - 104px)",
        position: fullscreen ? "fixed" : "relative",
        inset: fullscreen ? 0 : undefined,
        zIndex: fullscreen ? 1000 : undefined,
        background: "var(--bg-app)",
        padding: fullscreen ? 16 : 0,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          overflow: "hidden",
          minWidth: 0,
        }}
      >
        {lockMessage && (
          <div
            className="card"
            style={{
              padding: "8px 12px",
              fontSize: 12,
              color: lockLease?.acquired ? "#16A34A" : "#D97706",
            }}
          >
            {lockMessage}
          </div>
        )}

        <div
          className="card"
          style={{
            padding: "10px 14px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              fontWeight: 600,
            }}
          >
            Tool:
          </span>

          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {TOOL_OPTIONS.map((tool) => (
              <button
                key={tool.id}
                type="button"
                disabled={!annotationMode}
                onClick={() => {
                  clearDraft();
                  setActiveTool(tool.id);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "5px 10px",
                  borderRadius: 6,
                  border: "1px solid",
                  borderColor:
                    activeTool === tool.id ? "var(--accent)" : "var(--border)",
                  background:
                    activeTool === tool.id
                      ? "var(--accent-glow)"
                      : "transparent",
                  color:
                    activeTool === tool.id
                      ? "var(--accent)"
                      : "var(--text-muted)",
                  cursor: annotationMode ? "pointer" : "not-allowed",
                  opacity: annotationMode ? 1 : 0.55,
                  fontSize: 12,
                  fontWeight: 500,
                  fontFamily: "inherit",
                }}
              >
                {tool.icon}
                {tool.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            className={annotationMode ? "btn-primary" : "btn-ghost"}
            style={{ fontSize: 12 }}
            onClick={() => {
              if (annotationMode) {
                void finishAnnotating();
              } else {
                void startAnnotating();
              }
            }}
          >
            {annotationMode ? "Finish annotating" : "Annotate"}
          </button>

          <div style={{ width: 1, height: 20, background: "var(--border)" }} />

          <span
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              fontWeight: 600,
            }}
          >
            Color:
          </span>

          <div style={{ display: "flex", gap: 5 }}>
            {ANN_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                disabled={!annotationMode}
                onClick={() => setActiveColor(color)}
                aria-label={`Use ${color}`}
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: color,
                  border:
                    activeColor === color
                      ? "2px solid white"
                      : "2px solid transparent",
                  outline:
                    activeColor === color ? `1px solid ${color}` : "none",
                  cursor: annotationMode ? "pointer" : "not-allowed",
                  opacity: annotationMode ? 1 : 0.55,
                }}
              />
            ))}
          </div>

          {activeTool === "arrow_comment" && (
            <>
              <select
                className="input"
                disabled={!annotationMode}
                value={assignedTo}
                onChange={(event) => setAssignedTo(event.target.value)}
                style={{ width: 175, padding: "4px 6px" }}
              >
                {consultantUsers.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    Assign: {candidate.name}
                  </option>
                ))}
              </select>

              <select
                className="input"
                disabled={!annotationMode}
                value={fontFamily}
                onChange={(event) => setFontFamily(event.target.value)}
                style={{ width: 120, padding: "4px 6px" }}
              >
                <option value="Arial">Arial</option>
                <option value="Helvetica">Helvetica</option>
                <option value="Times New Roman">Times New Roman</option>
                <option value="Courier New">Courier New</option>
              </select>

              <input
                className="input"
                disabled={!annotationMode}
                type="number"
                min={8}
                max={28}
                value={fontSize}
                onChange={(event) => setFontSize(Number(event.target.value))}
                style={{ width: 66, padding: "4px 6px" }}
                aria-label="Comment font size"
              />
            </>
          )}

          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              gap: 6,
            }}
          >
            <button
              type="button"
              className="icon-button"
              title={commentsOpen ? "Hide comments" : "Show comments"}
              onClick={() => setCommentsOpen((open) => !open)}
            >
              {commentsOpen ? (
                <PanelRightClose size={16} />
              ) : (
                <PanelRightOpen size={16} />
              )}
            </button>
            <button
              type="button"
              className="icon-button"
              title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
              onClick={() => setFullscreen((enabled) => !enabled)}
            >
              {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            position: "relative",
            borderRadius: 12,
            overflow: "hidden",
            border: "1px solid var(--border)",
            background: "var(--bg-primary)",
          }}
        >
          {loading ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                gap: 10,
              }}
            >
              <Loader2
                size={24}
                color="var(--accent)"
                className="animate-spin"
              />
              <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
                Loading document…
              </span>
            </div>
          ) : signedUrl ? (
            <div
              ref={pageViewportRef}
              style={{
                position: "absolute",
                inset: 0,
                overflow: "auto",
                background: "#2f3136",
                padding: 16,
              }}
            >
              <div
                style={{
                  position: "sticky",
                  top: 0,
                  zIndex: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  width: "fit-content",
                  margin: "0 auto 12px",
                  padding: "7px 10px",
                  borderRadius: 10,
                  background: "rgba(17,24,39,0.92)",
                  color: "white",
                  boxShadow: "0 4px 16px rgba(0,0,0,.25)",
                }}
              >
                <button
                  type="button"
                  className="icon-button"
                  disabled={pageNumber <= 1}
                  onClick={() => {
                    clearDraft();
                    setPageNumber((current) => Math.max(1, current - 1));
                  }}
                  title="Previous page"
                >
                  <ChevronLeft size={16} />
                </button>
                <span
                  style={{ minWidth: 72, textAlign: "center", fontSize: 12 }}
                >
                  {pageNumber} / {numPages || "–"}
                </span>
                <button
                  type="button"
                  className="icon-button"
                  disabled={!numPages || pageNumber >= numPages}
                  onClick={() => {
                    clearDraft();
                    setPageNumber((current) => Math.min(numPages, current + 1));
                  }}
                  title="Next page"
                >
                  <ChevronRight size={16} />
                </button>
                <div
                  style={{
                    width: 1,
                    height: 20,
                    background: "rgba(255,255,255,.2)",
                  }}
                />
                <button
                  type="button"
                  className="icon-button"
                  onClick={() =>
                    setZoom((value) =>
                      Math.max(0.5, Number((value - 0.1).toFixed(2))),
                    )
                  }
                  title="Zoom out"
                >
                  <ZoomOut size={16} />
                </button>
                <span
                  style={{ minWidth: 48, textAlign: "center", fontSize: 12 }}
                >
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() =>
                    setZoom((value) =>
                      Math.min(2.5, Number((value + 0.1).toFixed(2))),
                    )
                  }
                  title="Zoom in"
                >
                  <ZoomIn size={16} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => {
                    clearDraft();
                    setRotation((value) => (value + 90) % 360);
                  }}
                  title="Rotate page"
                >
                  <RotateCw size={16} />
                </button>
              </div>

              <Document
                file={signedUrl}
                onLoadSuccess={({ numPages: loadedPages }) => {
                  setNumPages(loadedPages);
                  setPageNumber((current) =>
                    Math.min(Math.max(current, 1), loadedPages),
                  );
                }}
                onLoadError={(error) => {
                  console.error("PDF.js failed to load the document:", error);
                  setLoadError("PDF.js could not render this document.");
                }}
                loading={
                  <div
                    style={{ color: "white", textAlign: "center", padding: 40 }}
                  >
                    Loading PDF…
                  </div>
                }
                error={
                  <div
                    style={{
                      color: "#fecaca",
                      textAlign: "center",
                      padding: 40,
                    }}
                  >
                    {loadError || "Could not render the PDF."}
                  </div>
                }
              >
                <PDFPageSurface
                  ref={canvasRef}
                  pageNumber={pageNumber}
                  width={pageRenderWidth}
                  intrinsicWidth={pageIntrinsicSize.width}
                  intrinsicHeight={pageIntrinsicSize.height}
                  rotation={rotation}
                  annotationMode={annotationMode}
                  onPageLoad={(width, height) =>
                    setPageIntrinsicSize({ width, height })
                  }
                  onMouseDown={handleCanvasMouseDown}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseUp={handleCanvasMouseUp}
                  onMouseLeave={(event) => {
                    if (dragStart || drawing) handleCanvasMouseUp(event);
                  }}
                  persistedLayer={
                    <>
                      {visibleAnnotations.map((annotation, index) => {
                        const geometry = annotation.geometry;
                        const color =
                          annotation.status === "resolved"
                            ? "#22c55e"
                            : String(annotation.style?.stroke ?? "#6366f1");

                        if (annotation.annotation_type === "pin") {
                          return (
                            <div
                              key={annotation.id}
                              style={{
                                position: "absolute",
                                left: `${numberValue(geometry.x) * 100}%`,
                                top: `${numberValue(geometry.y) * 100}%`,
                                transform: "translate(-50%, -50%)",
                                width: 24,
                                height: 24,
                                borderRadius: "50%",
                                background: color,
                                color: "white",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 10,
                                fontWeight: 700,
                                boxShadow: "0 2px 8px rgba(15,23,42,.25)",
                              }}
                            >
                              {index + 1}
                            </div>
                          );
                        }

                        if (
                          annotation.annotation_type === "rectangle" ||
                          annotation.annotation_type === "highlight"
                        ) {
                          return (
                            <div
                              key={annotation.id}
                              style={{
                                position: "absolute",
                                left: `${numberValue(geometry.x) * 100}%`,
                                top: `${numberValue(geometry.y) * 100}%`,
                                width: `${numberValue(geometry.width) * 100}%`,
                                height: `${numberValue(geometry.height) * 100}%`,
                                border: `2px solid ${color}`,
                                background:
                                  annotation.annotation_type === "highlight"
                                    ? `${color}22`
                                    : "transparent",
                              }}
                            />
                          );
                        }

                        if (annotation.annotation_type === "freehand") {
                          const points =
                            (geometry.points as Point[] | undefined) ?? [];
                          if (points.length < 2) return null;
                          return (
                            <svg
                              key={annotation.id}
                              viewBox="0 0 1000 1000"
                              preserveAspectRatio="none"
                              style={{
                                position: "absolute",
                                inset: 0,
                                width: "100%",
                                height: "100%",
                              }}
                            >
                              <polyline
                                points={points
                                  .map(
                                    (point) =>
                                      `${point.x * 1000},${point.y * 1000}`,
                                  )
                                  .join(" ")}
                                fill="none"
                                stroke={color}
                                strokeWidth={3}
                                vectorEffect="non-scaling-stroke"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          );
                        }

                        if (annotation.annotation_type === "arrow_comment") {
                          return renderArrow(
                            `annotation-${annotation.id}`,
                            geometry,
                            color,
                            `C-${String(index + 1).padStart(3, "0")}`,
                            annotation.comment_text,
                            String(annotation.style?.font_family ?? "Arial"),
                            numberValue(annotation.style?.font_size, 12),
                          );
                        }

                        return null;
                      })}

                      {visibleReviewComments.map((comment) =>
                        renderArrow(
                          `review-${comment.id}`,
                          comment.geometry ?? {},
                          String(comment.style?.stroke ?? DEFAULT_ARROW_COLOR),
                          comment.comment_code,
                          comment.comment_text,
                          String(comment.style?.font_family ?? "Arial"),
                          numberValue(comment.style?.font_size, 12),
                        ),
                      )}
                    </>
                  }
                  interactiveLayer={
                    <>
                      {dragStart &&
                      dragCurrent &&
                      activeTool === "arrow_comment"
                        ? renderArrow(
                            "draft-arrow",
                            {
                              start_x: dragStart.x,
                              start_y: dragStart.y,
                              end_x: dragCurrent.x,
                              end_y: dragCurrent.y,
                            },
                            activeColor,
                          )
                        : null}

                      {dragStart &&
                        dragCurrent &&
                        (activeTool === "rectangle" ||
                          activeTool === "highlight") && (
                          <div
                            style={{
                              position: "absolute",
                              left: `${Math.min(dragStart.x, dragCurrent.x) * 100}%`,
                              top: `${Math.min(dragStart.y, dragCurrent.y) * 100}%`,
                              width: `${Math.abs(dragCurrent.x - dragStart.x) * 100}%`,
                              height: `${Math.abs(dragCurrent.y - dragStart.y) * 100}%`,
                              border: `2px solid ${activeColor}`,
                              background:
                                activeTool === "highlight"
                                  ? `${activeColor}22`
                                  : "transparent",
                              pointerEvents: "none",
                            }}
                          />
                        )}

                      {activeTool === "freehand" && drawPoints.length > 1 && (
                        <svg
                          viewBox="0 0 1000 1000"
                          preserveAspectRatio="none"
                          style={{
                            position: "absolute",
                            inset: 0,
                            width: "100%",
                            height: "100%",
                            pointerEvents: "none",
                          }}
                        >
                          <polyline
                            points={drawPoints
                              .map(
                                (point) =>
                                  `${point.x * 1000},${point.y * 1000}`,
                              )
                              .join(" ")}
                            fill="none"
                            stroke={activeColor}
                            strokeWidth={3}
                            vectorEffect="non-scaling-stroke"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}

                      {pendingGeo && activeTool === "arrow_comment"
                        ? renderArrow(
                            "pending-arrow",
                            pendingGeo,
                            activeColor,
                            "Draft",
                            commentText || "Enter comment in the right panel",
                            fontFamily,
                            fontSize,
                          )
                        : null}

                      {pendingGeo &&
                        activeTool !== "arrow_comment" &&
                        activeTool !== "freehand" &&
                        activeTool !== "pin" && (
                          <div
                            style={{
                              position: "absolute",
                              left: `${numberValue(pendingGeo.x) * 100}%`,
                              top: `${numberValue(pendingGeo.y) * 100}%`,
                              width: `${numberValue(pendingGeo.width) * 100}%`,
                              height: `${numberValue(pendingGeo.height) * 100}%`,
                              border: `2px solid ${activeColor}`,
                              borderRadius: 4,
                              background:
                                activeTool === "highlight"
                                  ? `${activeColor}22`
                                  : "transparent",
                              pointerEvents: "none",
                            }}
                          />
                        )}
                    </>
                  }
                />
              </Document>
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                flexDirection: "column",
                gap: 10,
                padding: 24,
                textAlign: "center",
              }}
            >
              <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
                {loadError || "Could not load the document."}
              </p>
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          display: commentsOpen ? "flex" : "none",
          flexDirection: "column",
          gap: 12,
          overflow: "auto",
          minWidth: 0,
        }}
      >
        {pendingGeo && (
          <div
            className="card"
            style={{
              padding: 14,
              border: "1px solid rgba(99,102,241,0.3)",
            }}
          >
            <p
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--accent)",
                marginBottom: 8,
              }}
            >
              Add professional comment
            </p>
            <textarea
              className="input"
              rows={4}
              placeholder="Describe the issue clearly…"
              value={commentText}
              onChange={(event) => setCommentText(event.target.value)}
              style={{ resize: "vertical", marginBottom: 8 }}
            />
            {actionError && (
              <p
                style={{
                  color: "#dc2626",
                  fontSize: 11,
                  marginBottom: 8,
                }}
              >
                {actionError}
              </p>
            )}
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                className="btn-primary"
                style={{ flex: 1, fontSize: 12 }}
                onClick={() => void saveAnnotation()}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  "Save comment"
                )}
              </button>
              <button
                type="button"
                className="btn-ghost"
                style={{ fontSize: 12 }}
                onClick={clearDraft}
              >
                <X size={13} />
              </button>
            </div>
          </div>
        )}

        <div className="card" style={{ padding: 14 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 10,
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--text-primary)",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <MessageCircle size={14} color="var(--accent)" />
              CRS comments
            </span>
            <div style={{ display: "flex", gap: 4 }}>
              <span className="badge badge-red">
                {openReviewComments.length} open
              </span>
              <span className="badge badge-green">
                {resolvedReviewComments.length} resolved
              </span>
            </div>
          </div>

          {reviewComments.length === 0 ? (
            <p
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                textAlign: "center",
                padding: "18px 0",
              }}
            >
              No arrow comments have been issued for this document.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {reviewComments.map((comment) => {
                const selected = selectedReviewComment?.id === comment.id;
                return (
                  <div
                    key={comment.id}
                    onClick={() => {
                      setSelectedAnn(null);
                      setPageNumber(
                        Math.max(1, Number(comment.page_number) || 1),
                      );
                      setSelectedReviewComment(selected ? null : comment);
                      setReplyText("");
                    }}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 8,
                      cursor: "pointer",
                      border: `1px solid ${
                        selected ? "var(--accent)" : "var(--border)"
                      }`,
                      background: selected
                        ? "var(--accent-glow)"
                        : "var(--bg-primary)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 7,
                      }}
                    >
                      <span
                        style={{
                          minWidth: 48,
                          fontSize: 11,
                          fontWeight: 700,
                          color: "var(--accent)",
                        }}
                      >
                        {comment.comment_code}
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          color: "var(--text-secondary)",
                          flex: 1,
                          lineHeight: 1.4,
                        }}
                      >
                        {comment.comment_text}
                      </span>
                      <span
                        className={`badge ${
                          comment.status === "resolved"
                            ? "badge-green"
                            : "badge-red"
                        }`}
                        style={{ fontSize: 9 }}
                      >
                        {commentStatusLabel(comment.status)}
                      </span>
                    </div>

                    {selected && (
                      <div
                        style={{ marginTop: 10 }}
                        onClick={(event) => event.stopPropagation()}
                      >
                        {(comment.responses ?? []).map((response) => (
                          <div
                            key={response.id}
                            style={{
                              marginBottom: 6,
                              padding: "6px 8px",
                              borderLeft: "2px solid var(--border)",
                            }}
                          >
                            <p
                              style={{
                                fontSize: 11,
                                color: "var(--text-secondary)",
                              }}
                            >
                              {response.response_text}
                            </p>
                            <p
                              style={{
                                fontSize: 9,
                                color: "var(--text-muted)",
                                marginTop: 2,
                              }}
                            >
                              {response.created_at?.slice(0, 10)}
                            </p>
                          </div>
                        ))}

                        <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                          <input
                            className="input"
                            style={{ fontSize: 11, padding: "5px 8px" }}
                            placeholder="Reply or resolution message…"
                            value={replyText}
                            onChange={(event) =>
                              setReplyText(event.target.value)
                            }
                          />
                          <button
                            type="button"
                            className="btn-ghost"
                            style={{ fontSize: 11, padding: "5px 8px" }}
                            onClick={() => void handleAddReviewReply()}
                          >
                            <ChevronRight size={12} />
                          </button>
                        </div>

                        {comment.status !== "resolved" &&
                          hasPermission(user, "resolve_annotation") && (
                            <button
                              type="button"
                              className="btn-ghost"
                              style={{
                                marginTop: 8,
                                width: "100%",
                                fontSize: 11,
                                display: "flex",
                                alignItems: "center",
                                gap: 5,
                                justifyContent: "center",
                                color: "#16a34a",
                                borderColor: "rgba(34,197,94,0.3)",
                              }}
                              onClick={() =>
                                void handleResolveReviewComment(comment)
                              }
                            >
                              <CheckCircle size={12} />
                              Resolve comment
                            </button>
                          )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card" style={{ padding: 14, flex: 1 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 10,
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--text-primary)",
              }}
            >
              General annotations
            </span>
            <div style={{ display: "flex", gap: 4 }}>
              <span className="badge badge-red">
                {openAnnotations.length} open
              </span>
              <span className="badge badge-green">
                {resolvedAnnotations.length} resolved
              </span>
            </div>
          </div>

          {annotations.length === 0 ? (
            <p
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                textAlign: "center",
                padding: "18px 0",
              }}
            >
              No pins, rectangles, highlights or drawings yet.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {annotations.map((annotation, index) => {
                const selected = selectedAnn?.id === annotation.id;
                return (
                  <div
                    key={annotation.id}
                    onClick={() => {
                      setSelectedReviewComment(null);
                      setPageNumber(
                        Math.max(1, Number(annotation.page_number) || 1),
                      );
                      setSelectedAnn(selected ? null : annotation);
                      setReplyText("");
                    }}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 8,
                      cursor: "pointer",
                      border: `1px solid ${
                        selected ? "var(--accent)" : "var(--border)"
                      }`,
                      background: selected
                        ? "var(--accent-glow)"
                        : "var(--bg-primary)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <span
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          background:
                            annotation.status === "resolved"
                              ? "#22c55e"
                              : String(
                                  annotation.style?.stroke ?? "var(--accent)",
                                ),
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 10,
                          fontWeight: 700,
                          color: "white",
                          flexShrink: 0,
                        }}
                      >
                        {index + 1}
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          color: "var(--text-secondary)",
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {annotation.comment_text}
                      </span>
                      <span
                        className={`badge ${
                          annotation.status === "resolved"
                            ? "badge-green"
                            : "badge-red"
                        }`}
                        style={{ fontSize: 9 }}
                      >
                        {annotation.status}
                      </span>
                    </div>

                    {selected && (
                      <div
                        style={{ marginTop: 10 }}
                        onClick={(event) => event.stopPropagation()}
                      >
                        {(annotation.replies ?? []).map((reply) => (
                          <div
                            key={reply.id}
                            style={{
                              marginBottom: 6,
                              padding: "6px 8px",
                              borderLeft: "2px solid var(--border)",
                            }}
                          >
                            <p
                              style={{
                                fontSize: 11,
                                color: "var(--text-secondary)",
                              }}
                            >
                              {reply.reply_text}
                            </p>
                          </div>
                        ))}

                        <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                          <input
                            className="input"
                            style={{ fontSize: 11, padding: "5px 8px" }}
                            placeholder="Reply…"
                            value={replyText}
                            onChange={(event) =>
                              setReplyText(event.target.value)
                            }
                          />
                          <button
                            type="button"
                            className="btn-ghost"
                            style={{ fontSize: 11, padding: "5px 8px" }}
                            onClick={() => void handleAddAnnotationReply()}
                          >
                            <ChevronRight size={12} />
                          </button>
                        </div>

                        {annotation.status === "open" &&
                          hasPermission(user, "resolve_annotation") && (
                            <button
                              type="button"
                              className="btn-ghost"
                              style={{
                                marginTop: 8,
                                width: "100%",
                                fontSize: 11,
                                display: "flex",
                                alignItems: "center",
                                gap: 5,
                                justifyContent: "center",
                                color: "#16a34a",
                                borderColor: "rgba(34,197,94,0.3)",
                              }}
                              onClick={() =>
                                void handleResolveAnnotation(annotation)
                              }
                            >
                              <CheckCircle size={12} />
                              Mark as resolved
                            </button>
                          )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
