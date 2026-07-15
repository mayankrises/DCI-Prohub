"use client";
import React, { useState } from "react";
import Sidebar from "@/components/Sidebar";
import TopNav from "@/components/TopNav";
import DocumentLibrary from "@/components/DocumentLibrary";
import DocumentViewer from "@/components/DocumentViewer";
import TaskBoard from "@/components/TaskBoard";
import ApprovalStatus from "@/components/dci/ApprovalStatus";
import VendorAnalysis from "@/components/dci/VendorAnalysis";
import DocumentRegister from "@/components/dci/DocumentRegister";
import DelaysAging from "@/components/dci/DelaysAging";
import ImportExport from "@/components/dci/ImportExport";
import DocumentTimeline from "@/components/dci/DocumentTimeline";
import { MOCK_USERS, type MockUser } from "@/lib/auth";

export type TabId =
  | "approval"
  | "vendor"
  | "delays"
  | "register"
  | "timeline"
  | "import-export"
  | "library"
  | "viewer"
  | "tasks";

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<TabId>("approval");
  const [user, setUser] = useState<MockUser | null>(null);
  const [viewerFileId, setViewerFileId] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [isResizing, setIsResizing] = useState(false);

  const startResizing = React.useCallback(() => {
    setIsResizing(true);
  }, []);

  const stopResizing = React.useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = React.useCallback(
    (e: MouseEvent) => {
      if (isResizing) {
        // Constrain width between 180 and 420
        const newWidth = Math.max(180, Math.min(420, e.clientX));
        setSidebarWidth(newWidth);
      }
    },
    [isResizing]
  );

  React.useEffect(() => {
    if (isResizing) {
      window.addEventListener("mousemove", resize);
      window.addEventListener("mouseup", stopResizing);
    }
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  const handleView = (fileId: string) => {
    setViewerFileId(fileId);
    setActiveTab("viewer");
  };

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "var(--bg-app)" }}>
      {/* Sidebar Navigation */}
      <Sidebar
        user={user}
        setUser={setUser}
        users={MOCK_USERS}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        width={sidebarWidth}
      />

      {/* Resizer Splitter Bar */}
      <div
        onMouseDown={startResizing}
        title="Drag to resize sidebar"
        style={{
          width: "4px",
          cursor: "col-resize",
          background: isResizing ? "var(--accent)" : "var(--border)",
          transition: "background 0.15s",
          zIndex: 10,
          flexShrink: 0,
          position: "relative",
        }}
      >
        {/* Visual handle hint */}
        <div style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 4,
          height: 36,
          borderRadius: 999,
          background: isResizing ? "var(--accent)" : "rgba(0,0,0,0.15)",
          transition: "background 0.15s",
        }} />
      </div>

      {/* Main Container */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <TopNav activeTab={activeTab} user={user} />

        <main style={{ flex: 1, overflow: "auto", padding: "24px" }}>
          {activeTab === "approval"      && <ApprovalStatus />}
          {activeTab === "vendor"        && <VendorAnalysis />}
          {activeTab === "delays"        && <DelaysAging />}
          {activeTab === "register"      && <DocumentRegister />}
          {activeTab === "timeline"      && <DocumentTimeline />}
          {activeTab === "import-export" && <ImportExport />}
          {activeTab === "library"       && <DocumentLibrary user={user} onView={handleView} />}
          {activeTab === "viewer"        && <DocumentViewer user={user} fileId={viewerFileId} />}
          {activeTab === "tasks"         && <TaskBoard user={user} />}
        </main>
      </div>
    </div>
  );
}
