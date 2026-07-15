"use client";

import React, { useEffect, useState } from "react";
import {
  BarChart2,
  Building2,
  CheckSquare,
  Clock,
  Eye,
  FileText,
  FolderOpen,
  History,
  Home,
  LogIn,
  LogOut,
  PencilLine, FilePlus2,
  UploadCloud,
  Send,
  MessageSquareReply,
} from "lucide-react";

import type { TabId } from "@/app/page";
import type { MockUser } from "@/lib/auth";
import { ROLE_COLORS, ROLE_LABELS } from "@/lib/auth";

interface Props {
  user: MockUser | null;
  setUser: (user: MockUser | null) => void;
  users: MockUser[];
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  width: number;
}

const DEFAULT_SIDEBAR_WIDTH = 240;

interface NavButtonProps {
  tab: TabId;
  label: string;
  icon: React.ReactNode;
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
}

function NavButton({
  tab,
  label,
  icon,
  activeTab,
  setActiveTab,
}: NavButtonProps) {
  return (
    <button
      type="button"
      className={`nav-item ${activeTab === tab ? "active" : ""}`}
      onClick={() => setActiveTab(tab)}
    >
      {icon}
      {label}
    </button>
  );
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  padding: "4px 8px 6px",
};

const sectionStyle: React.CSSProperties = {
  padding: "12px 8px 4px",
  borderBottom: "1px solid var(--border)",
};

export default function Sidebar({
  user,
  setUser,
  users,
  activeTab,
  setActiveTab,
  width,
}: Props) {
  /*
   * Important hydration fix:
   * The server and the browser's first render both use 240px.
   * The width received from the parent is applied only after mounting.
   */
  const [mounted, setMounted] = useState(false);
  const [selected, setSelected] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!selected && users.length > 0) {
      setSelected(users[0].id);
    }

    if (selected && !users.some((candidate) => candidate.id === selected)) {
      setSelected(users[0]?.id ?? "");
    }
  }, [selected, users]);

  const renderedWidth = mounted ? width : DEFAULT_SIDEBAR_WIDTH;

  const handleLogin = () => {
    const found = users.find((candidate) => candidate.id === selected);

    if (found) {
      setUser(found);
    }
  };

  const handleLogout = () => {
    setUser(null);
  };

  return (
    <aside
      className="sidebar"
      style={{
        width: renderedWidth,
        minWidth: renderedWidth,
      }}
    >
      {/* Brand */}
      <div
        style={{
          padding: 16,
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              background: "var(--accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>

          <div>
            <p
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "var(--text-primary)",
                lineHeight: 1,
              }}
            >
              DCI ProHub
            </p>
            <p
              style={{
                fontSize: 10,
                color: "var(--text-muted)",
                marginTop: 1,
              }}
            >
              Document Control
            </p>
          </div>
        </div>
      </div>

      {/* Workspace */}
      <nav style={sectionStyle}>
        <p style={sectionTitleStyle}>Workspace</p>
        <NavButton
          tab="home"
          label="Project Home"
          icon={<Home size={13} />}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
        />
      </nav>

      {/* DCI Dashboard */}
      <nav style={sectionStyle}>
        <p style={sectionTitleStyle}>DCI Dashboard</p>

        <NavButton
          tab="submission"
          label="Submission Progress"
          icon={<Send size={13} />}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
        />
        <NavButton
          tab="review"
          label="Review Progress"
          icon={<MessageSquareReply size={13} />}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
        />
        <NavButton
          tab="approval"
          label="Approval Status"
          icon={<BarChart2 size={13} />}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
        />
        <NavButton
          tab="vendor"
          label="Vendor Analysis"
          icon={<Building2 size={13} />}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
        />
        <NavButton
          tab="delays"
          label="Delays & Aging"
          icon={<Clock size={13} />}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
        />
        <NavButton
          tab="register"
          label="Document Register"
          icon={<FileText size={13} />}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
        />
        <NavButton
          tab="update"
          label="Update Document"
          icon={<PencilLine size={13} />}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
        />
        <NavButton
          tab="new-document"
          label="New Document"
          icon={<FilePlus2 size={13} />}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
        />
        <NavButton
          tab="timeline"
          label="Document Timeline"
          icon={<History size={13} />}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
        />
        <NavButton
          tab="import-export"
          label="Import / Export"
          icon={<UploadCloud size={13} />}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
        />
      </nav>

      {/* Collaboration */}
      <nav style={sectionStyle}>
        <p style={sectionTitleStyle}>Collaboration</p>

        <NavButton
          tab="library"
          label="Doc Library"
          icon={<FolderOpen size={13} />}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
        />
        <NavButton
          tab="viewer"
          label="Doc Viewer"
          icon={<Eye size={13} />}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
        />
        <NavButton
          tab="tasks"
          label="Task Board"
          icon={<CheckSquare size={13} />}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
        />
      </nav>

      {/* Persona login */}
      <div
        style={{
          padding: "12px 10px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <p
          style={{
            ...sectionTitleStyle,
            padding: "4px 6px 8px",
          }}
        >
          Workspace Role
        </p>

        {user ? (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 8px",
                borderRadius: "var(--radius-md)",
                background: "var(--bg-subtle)",
                marginBottom: 6,
              }}
            >
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  background: "var(--accent)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  fontWeight: 700,
                  color: "white",
                  flexShrink: 0,
                }}
              >
                {user.initials}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    fontWeight: 600,
                    fontSize: 11,
                    color: "var(--text-primary)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {user.name}
                </p>

                <span
                  className={`badge ${ROLE_COLORS[user.role]}`}
                  style={{
                    fontSize: 9,
                    padding: "1px 5px",
                    display: "inline-flex",
                    marginTop: 1,
                  }}
                >
                  {ROLE_LABELS[user.role]}
                </span>
              </div>
            </div>

            <button
              type="button"
              className="nav-item"
              onClick={handleLogout}
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                padding: "4px 8px",
              }}
            >
              <LogOut size={11} />
              Sign out
            </button>
          </>
        ) : (
          <div style={{ padding: "0 2px" }}>
            <select
              className="input"
              value={selected}
              disabled={users.length === 0}
              onChange={(event) => setSelected(event.target.value)}
              style={{
                marginBottom: 6,
                fontSize: 11,
                padding: "5px 8px",
              }}
            >
              {users.length === 0 ? (
                <option value="">No users available</option>
              ) : (
                users.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name} (
                    {ROLE_LABELS[candidate.role].split(" ")[0]})
                  </option>
                ))
              )}
            </select>

            <button
              type="button"
              className="btn-primary"
              disabled={!selected}
              style={{
                width: "100%",
                fontSize: 11,
                padding: 6,
                justifyContent: "center",
              }}
              onClick={handleLogin}
            >
              <LogIn size={11} />
              Sign In
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "8px 12px",
          borderTop: "1px solid var(--border)",
        }}
      >
        <p
          style={{
            fontSize: 9,
            color: "var(--text-muted)",
            textAlign: "center",
          }}
        >
          ProHub v2 · FastAPI + Next.js
        </p>
      </div>
    </aside>
  );
}
