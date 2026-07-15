"use client";
import React from "react";
import type { TabId } from "@/app/page";
import type { MockUser } from "@/lib/auth";
import { ROLE_LABELS, ROLE_COLORS } from "@/lib/auth";

interface Props {
  activeTab: TabId;
  user: MockUser | null;
}

const TAB_TITLES: Record<TabId, string> = {
  approval: "Approval Status",
  vendor: "Vendor Analysis",
  delays: "Delays & Aging",
  register: "Document Register",
  timeline: "Document Timeline",
  "import-export": "Import / Export",
  library: "Document Library",
  viewer: "Document Viewer",
  tasks: "Task Board",
};

export default function TopNav({ activeTab, user }: Props) {
  return (
    <div className="topnav" style={{ justifyContent: "space-between" }}>
      {/* Current page location indicator */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 500 }}>Workspace</span>
        <span style={{ fontSize: 13, color: "var(--border-strong)" }}>/</span>
        <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 600 }}>{TAB_TITLES[activeTab]}</span>
      </div>

      {/* User display */}
      {user ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div style={{
            width: 26, height: 26, borderRadius: "50%",
            background: "var(--accent)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 10, fontWeight: 700, color: "white"
          }}>
            {user.initials}
          </div>
          <span style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 500 }}>{user.name}</span>
          <span className={`badge ${ROLE_COLORS[user.role]}`} style={{ fontSize: 10, padding: "2px 6px" }}>{ROLE_LABELS[user.role]}</span>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <div className="status-dot" style={{ background: "var(--border-strong)" }} />
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Not logged in to collaboration</span>
        </div>
      )}
    </div>
  );
}
