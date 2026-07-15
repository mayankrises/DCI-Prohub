"use client";

import React, { useCallback, useEffect, useState } from "react";

import Sidebar from "@/components/Sidebar";
import TopNav from "@/components/TopNav";
import DocumentLibrary from "@/components/DocumentLibrary";
import DocumentViewer from "@/components/DocumentViewer";
import TaskBoard from "@/components/TaskBoard";
import ApprovalStatus from "@/components/dci/ApprovalStatus";
import SubmissionProgress from "@/components/dci/SubmissionProgress";
import ReviewProgress from "@/components/dci/ReviewProgress";
import VendorAnalysis from "@/components/dci/VendorAnalysis";
import DocumentRegister from "@/components/dci/DocumentRegister";
import DelaysAging from "@/components/dci/DelaysAging";
import ImportExport from "@/components/dci/ImportExport";
import DocumentTimeline from "@/components/dci/DocumentTimeline";
import ProjectHome from "@/components/dci/ProjectHome";
import UpdateDocument from "@/components/dci/UpdateDocument";
import NewDocument from "@/components/dci/NewDocument";

import { MOCK_USERS, type MockUser } from "@/lib/auth";

export type TabId =
  | "home"
  | "submission"
  | "review"
  | "approval"
  | "vendor"
  | "delays"
  | "register"
  | "update"
  | "new-document"
  | "timeline"
  | "import-export"
  | "library"
  | "viewer"
  | "tasks";

const DEFAULT_PROJECT_ID = Number(
  process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID || 1,
);

const DEFAULT_SIDEBAR_WIDTH = 240;
const MIN_SIDEBAR_WIDTH = 180;
const MAX_SIDEBAR_WIDTH = 420;

function clampSidebarWidth(value: number): number {
  return Math.max(
    MIN_SIDEBAR_WIDTH,
    Math.min(MAX_SIDEBAR_WIDTH, value),
  );
}

export default function DashboardPage() {
  /*
   * Hydration-safe defaults:
   * The server and browser's first render use exactly the same values.
   * Saved localStorage values are restored only after the component mounts.
   */
  const [hydrated, setHydrated] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [projectId, setProjectId] =
    useState<number>(DEFAULT_PROJECT_ID);
  const [user, setUserState] = useState<MockUser | null>(null);
  const [viewerFileId, setViewerFileId] =
    useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(
    DEFAULT_SIDEBAR_WIDTH,
  );
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    try {
      const savedUserId =
        window.localStorage.getItem("dci.userId");
      const savedUser =
        MOCK_USERS.find(
          (candidate) => candidate.id === savedUserId,
        ) ?? null;

      const savedProjectId = Number(
        window.localStorage.getItem("dci.projectId"),
      );

      const savedSidebarWidth = Number(
        window.localStorage.getItem("dci.sidebarWidth"),
      );

      setUserState(savedUser);

      if (
        Number.isFinite(savedProjectId) &&
        savedProjectId > 0
      ) {
        setProjectId(savedProjectId);
      }

      if (Number.isFinite(savedSidebarWidth)) {
        setSidebarWidth(
          clampSidebarWidth(savedSidebarWidth),
        );
      }
    } catch (error) {
      console.error(
        "Failed to restore saved dashboard state:",
        error,
      );
    } finally {
      setHydrated(true);
    }
  }, []);

  const setUser = useCallback(
    (nextUser: MockUser | null) => {
      setUserState(nextUser);

      try {
        if (nextUser) {
          window.localStorage.setItem(
            "dci.userId",
            nextUser.id,
          );
        } else {
          window.localStorage.removeItem("dci.userId");
        }
      } catch (error) {
        console.error(
          "Failed to persist selected user:",
          error,
        );
      }
    },
    [],
  );

  const selectProject = useCallback(
    (nextProjectId: number) => {
      if (
        !Number.isFinite(nextProjectId) ||
        nextProjectId <= 0
      ) {
        return;
      }

      setProjectId(nextProjectId);

      try {
        window.localStorage.setItem(
          "dci.projectId",
          String(nextProjectId),
        );
      } catch (error) {
        console.error(
          "Failed to persist selected project:",
          error,
        );
      }
    },
    [],
  );

  const startResizing = useCallback(() => {
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback(
    (event: MouseEvent) => {
      if (!isResizing) {
        return;
      }

      const nextWidth = clampSidebarWidth(event.clientX);
      setSidebarWidth(nextWidth);

      try {
        window.localStorage.setItem(
          "dci.sidebarWidth",
          String(nextWidth),
        );
      } catch (error) {
        console.error(
          "Failed to persist sidebar width:",
          error,
        );
      }
    },
    [isResizing],
  );

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", stopResizing);

    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener(
        "mouseup",
        stopResizing,
      );
    };
  }, [isResizing, resize, stopResizing]);

  const handleView = useCallback((fileId: string) => {
    setViewerFileId(fileId);
    setActiveTab("viewer");
  }, []);

  /*
   * Rendering the same loading state on the server and first client pass
   * prevents localStorage-based hydration mismatches.
   */
  if (!hydrated) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-app)",
          color: "var(--text-secondary)",
          fontFamily: "inherit",
          fontSize: 14,
        }}
      >
        Loading DCI ProHub…
      </div>
    );
  }

  const actorUserId = user?.id ?? "system";

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        overflow: "hidden",
        background: "var(--bg-app)",
      }}
    >
      <Sidebar
        user={user}
        setUser={setUser}
        users={MOCK_USERS}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        width={sidebarWidth}
      />

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        onMouseDown={startResizing}
        title="Drag to resize sidebar"
        style={{
          width: 4,
          cursor: "col-resize",
          background: isResizing
            ? "var(--accent)"
            : "var(--border)",
          transition: "background 0.15s",
          zIndex: 10,
          flexShrink: 0,
          position: "relative",
          userSelect: "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 4,
            height: 36,
            borderRadius: 999,
            background: isResizing
              ? "var(--accent)"
              : "rgba(0,0,0,0.15)",
            transition: "background 0.15s",
          }}
        />
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          minWidth: 0,
        }}
      >
        <TopNav
          activeTab={activeTab}
          user={user}
          projectId={projectId}
        />

        <main
          style={{
            flex: 1,
            overflow: "auto",
            padding: 24,
          }}
        >
          {activeTab === "home" && (
            <ProjectHome
              selectedProjectId={projectId}
              onSelectProject={selectProject}
              onOpenDashboard={() =>
                setActiveTab("approval")
              }
            />
          )}

          {activeTab === "submission" && <SubmissionProgress projectId={projectId} />}

          {activeTab === "review" && <ReviewProgress projectId={projectId} />}

          {activeTab === "approval" && (
            <ApprovalStatus projectId={projectId} />
          )}

          {activeTab === "vendor" && (
            <VendorAnalysis projectId={projectId} />
          )}

          {activeTab === "delays" && (
            <DelaysAging projectId={projectId} />
          )}

          {activeTab === "register" && (
            <DocumentRegister projectId={projectId} />
          )}

          {activeTab === "new-document" && (<NewDocument projectId={projectId} actorUserId={actorUserId} onCreated={() => setActiveTab("update")} />)}

          {activeTab === "update" && (
            <UpdateDocument
              projectId={projectId}
              actorUserId={actorUserId}
            />
          )}

          {activeTab === "timeline" && (
            <DocumentTimeline projectId={projectId} />
          )}

          {activeTab === "import-export" && (
            <ImportExport
              projectId={projectId}
              actorUserId={actorUserId}
            />
          )}

          {activeTab === "library" && (
            <DocumentLibrary
              user={user}
              onView={handleView}
              projectId={projectId}
            />
          )}

          {activeTab === "viewer" && (
            <DocumentViewer
              user={user}
              fileId={viewerFileId}
            />
          )}

          {activeTab === "tasks" && (
            <TaskBoard
              user={user}
              projectId={projectId}
            />
          )}
        </main>
      </div>
    </div>
  );
}
