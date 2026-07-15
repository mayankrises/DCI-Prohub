"use client";
import React, { useState } from "react";
import {
  Bell, Settings, LogIn, LogOut, ChevronDown, Check, Info, X,
  BarChart2, Building2, Clock, FileText, FolderOpen, Eye, CheckSquare,
  FileSpreadsheet, Calendar, Filter, SlidersHorizontal, RefreshCw
} from "lucide-react";
import type { TabId } from "@/app/page";
import type { MockUser } from "@/lib/auth";
import { ROLE_LABELS, ROLE_COLORS } from "@/lib/auth";

interface Props {
  user: MockUser | null;
  setUser: (u: MockUser | null) => void;
  users: MockUser[];
  activeTab: TabId;
  setActiveTab: (t: TabId) => void;
  width: number;
}

const SAMPLE_NOTIFICATIONS = [
  { id: 1, type: "error",   text: "cow.pdf uploaded to Document Library",   time: "2 min ago",  read: false },
  { id: 2, type: "warning", text: "5 documents are overdue for review",      time: "1 hr ago",   read: false },
  { id: 3, type: "success", text: "Annotation resolved by Anita Verma",      time: "3 hr ago",   read: true  },
  { id: 4, type: "info",    text: "Task Board — 2 new tasks assigned",       time: "Yesterday",  read: true  },
];

interface NavGroupProps {
  label: string;
  children: React.ReactNode;
}
function NavGroup({ label, children }: NavGroupProps) {
  return (
    <div style={{ padding: "10px 8px 4px" }}>
      <p style={{
        fontSize: 9, fontWeight: 700, color: "var(--text-muted)",
        textTransform: "uppercase", letterSpacing: "0.1em",
        padding: "2px 8px 6px"
      }}>{label}</p>
      {children}
    </div>
  );
}

interface NavBtnProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  badge?: number;
  onClick: () => void;
}
function NavBtn({ icon, label, active, badge, onClick }: NavBtnProps) {
  return (
    <button
      className={`nav-item${active ? " active" : ""}`}
      onClick={onClick}
    >
      {icon}
      <span style={{ flex: 1, textAlign: "left" }}>{label}</span>
      {badge != null && badge > 0 && (
        <span style={{
          minWidth: 16, height: 16, borderRadius: 999,
          background: active ? "rgba(255,255,255,0.3)" : "var(--accent)",
          color: "white", fontSize: 9, fontWeight: 700,
          display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px"
        }}>{badge}</span>
      )}
    </button>
  );
}

export default function Sidebar({ user, setUser, users, activeTab, setActiveTab, width }: Props) {
  const [selected, setSelected]       = useState(users[0].id);
  const [notifOpen, setNotifOpen]     = useState(false);
  const [settOpen,  setSettOpen]      = useState(false);
  const [filterOpen, setFilterOpen]   = useState(false);
  const [notifs, setNotifs]           = useState(SAMPLE_NOTIFICATIONS);
  const [pageSize, setPageSize]       = useState("50");

  const unread = notifs.filter(n => !n.read).length;

  const handleLogin = () => {
    const found = users.find(u => u.id === selected);
    if (found) setUser(found);
  };

  const toggle = (panel: "notif" | "sett" | "filter") => {
    if (panel === "notif")  { setNotifOpen(v => !v); setSettOpen(false); setFilterOpen(false); }
    if (panel === "sett")   { setSettOpen(v => !v);  setNotifOpen(false); setFilterOpen(false); }
    if (panel === "filter") { setFilterOpen(v => !v); setNotifOpen(false); setSettOpen(false); }
  };

  return (
    <aside className="sidebar" style={{ width, minWidth: width, display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* ── Brand ── */}
      <div style={{ padding: "14px 14px 12px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7, background: "var(--accent)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1 }}>DCI ProHub</p>
            <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>Document Control Intelligence</p>
          </div>
        </div>
      </div>

      {/* ── Scrollable nav body ── */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>

        {/* DCI Dashboard */}
        <div style={{ borderBottom: "1px solid var(--border)" }}>
          <NavGroup label="DCI Dashboard">
            <NavBtn icon={<BarChart2 size={13} />}     label="Approval Status"    active={activeTab === "approval"}  onClick={() => setActiveTab("approval")} />
            <NavBtn icon={<Building2 size={13} />}     label="Vendor Analysis"    active={activeTab === "vendor"}    onClick={() => setActiveTab("vendor")} />
            <NavBtn icon={<Clock size={13} />}         label="Delays & Aging"     active={activeTab === "delays"}    onClick={() => setActiveTab("delays")} />
            <NavBtn icon={<FileText size={13} />}      label="Document Register"  active={activeTab === "register"}  onClick={() => setActiveTab("register")} />
            <NavBtn icon={<Calendar size={13} />}      label="Doc Timeline"       active={activeTab === "timeline"}  onClick={() => setActiveTab("timeline")} />
          </NavGroup>
        </div>

        {/* Data Management */}
        <div style={{ borderBottom: "1px solid var(--border)" }}>
          <NavGroup label="Data Management">
            <NavBtn icon={<FileSpreadsheet size={13} />} label="Import / Export"  active={activeTab === "import-export"} onClick={() => setActiveTab("import-export")} />
          </NavGroup>
        </div>

        {/* Collaboration */}
        <div style={{ borderBottom: "1px solid var(--border)" }}>
          <NavGroup label="Collaboration">
            <NavBtn icon={<FolderOpen size={13} />}   label="Doc Library"        active={activeTab === "library"}   onClick={() => setActiveTab("library")} />
            <NavBtn icon={<Eye size={13} />}           label="Doc Viewer"         active={activeTab === "viewer"}    onClick={() => setActiveTab("viewer")} />
            <NavBtn icon={<CheckSquare size={13} />}  label="Task Board"         active={activeTab === "tasks"}     onClick={() => setActiveTab("tasks")} />
          </NavGroup>
        </div>

        {/* Workspace Role */}
        <div style={{ padding: "10px 10px", borderBottom: "1px solid var(--border)" }}>
          <p style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", padding: "2px 6px 8px" }}>
            Workspace Role
          </p>
          {user ? (
            <>
              <div style={{
                display: "flex", alignItems: "center", gap: 8, padding: "6px 8px",
                borderRadius: "var(--radius-md)", background: "var(--bg-subtle)", marginBottom: 6
              }}>
                <div style={{
                  width: 26, height: 26, borderRadius: "50%", background: "var(--accent)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 700, color: "white", flexShrink: 0
                }}>
                  {user.initials}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 600, fontSize: 11, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {user.name}
                  </p>
                  <span className={`badge ${ROLE_COLORS[user.role]}`} style={{ fontSize: 9, padding: "1px 5px", display: "inline-flex", marginTop: 1 }}>
                    {ROLE_LABELS[user.role]}
                  </span>
                </div>
              </div>
              <button className="nav-item" onClick={() => setUser(null)} style={{ fontSize: 11, color: "var(--text-muted)", padding: "4px 8px" }}>
                <LogOut size={11} /> Sign out
              </button>
            </>
          ) : (
            <div style={{ padding: "0 2px" }}>
              <select className="input" value={selected} onChange={e => setSelected(e.target.value)} style={{ marginBottom: 6, fontSize: 11, padding: "5px 8px" }}>
                {users.map(u => <option key={u.id} value={u.id}>{u.name} ({ROLE_LABELS[u.role].split(" ")[0]})</option>)}
              </select>
              <button className="btn-primary" style={{ width: "100%", fontSize: 11, padding: "6px", justifyContent: "center" }} onClick={handleLogin}>
                <LogIn size={11} /> Sign In
              </button>
            </div>
          )}
        </div>

        {/* System / Utilities */}
        <NavGroup label="System">

          {/* Filter Panel */}
          <button
            style={{
              display: "flex", alignItems: "center", gap: 8, width: "100%",
              padding: "7px 10px", borderRadius: "var(--radius-md)",
              background: filterOpen ? "var(--accent-light)" : "transparent",
              color: filterOpen ? "var(--accent)" : "var(--text-secondary)",
              border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500,
              fontFamily: "inherit", transition: "all 0.12s"
            }}
            onClick={() => toggle("filter")}
          >
            <SlidersHorizontal size={13} />
            <span style={{ flex: 1, textAlign: "left" }}>Filters</span>
            <ChevronDown size={12} style={{ transform: filterOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s", opacity: 0.5 }} />
          </button>
          {filterOpen && (
            <div style={{
              margin: "4px 0 8px", background: "var(--bg-app)",
              border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 10,
              fontSize: 11, color: "var(--text-secondary)"
            }}>
              <p style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8 }}>GLOBAL FILTERS</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 3 }}>Date From</label>
                  <input type="date" className="input" style={{ fontSize: 11, padding: "4px 8px", width: "100%" }} />
                </div>
                <div>
                  <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 3 }}>Date To</label>
                  <input type="date" className="input" style={{ fontSize: 11, padding: "4px 8px", width: "100%" }} />
                </div>
                <div>
                  <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 3 }}>Discipline</label>
                  <select className="input" style={{ fontSize: 11, padding: "4px 8px" }}>
                    <option value="">All</option>
                    <option>Civil</option>
                    <option>Mechanical</option>
                    <option>Electrical</option>
                    <option>Instrumentation</option>
                    <option>Piping</option>
                    <option>Process</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 3 }}>Approval Code</label>
                  <select className="input" style={{ fontSize: 11, padding: "4px 8px" }}>
                    <option value="">All</option>
                    <option>A1</option>
                    <option>A2</option>
                    <option>A3</option>
                    <option>B1</option>
                    <option>C1</option>
                  </select>
                </div>
                <button
                  className="btn-ghost"
                  style={{ width: "100%", justifyContent: "center", fontSize: 11, padding: "5px" }}
                >
                  <RefreshCw size={11} /> Reset Filters
                </button>
              </div>
            </div>
          )}

          {/* Notifications */}
          <button
            style={{
              display: "flex", alignItems: "center", gap: 8, width: "100%",
              padding: "7px 10px", borderRadius: "var(--radius-md)",
              background: notifOpen ? "var(--accent-light)" : "transparent",
              color: notifOpen ? "var(--accent)" : "var(--text-secondary)",
              border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500,
              fontFamily: "inherit", transition: "all 0.12s"
            }}
            onClick={() => toggle("notif")}
          >
            <Bell size={13} />
            <span style={{ flex: 1, textAlign: "left" }}>Notifications</span>
            {unread > 0 && (
              <span style={{
                minWidth: 18, height: 18, borderRadius: 999, background: "var(--accent)",
                color: "white", fontSize: 10, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px"
              }}>{unread}</span>
            )}
            <ChevronDown size={12} style={{ transform: notifOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s", opacity: 0.5 }} />
          </button>
          {notifOpen && (
            <div style={{
              margin: "4px 0 8px", background: "var(--bg-app)",
              border: "1px solid var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden"
            }}>
              <div style={{ padding: "6px 10px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)" }}>Recent</span>
                {unread > 0 && (
                  <button
                    style={{ fontSize: 10, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
                    onClick={() => setNotifs(p => p.map(n => ({ ...n, read: true })))}
                  >
                    Mark all read
                  </button>
                )}
              </div>
              {notifs.map(n => (
                <div
                  key={n.id}
                  onClick={() => setNotifs(p => p.map(x => x.id === n.id ? { ...x, read: true } : x))}
                  style={{
                    padding: "8px 10px", cursor: "pointer",
                    background: n.read ? "transparent" : "var(--accent-light)",
                    borderBottom: "1px solid var(--border)"
                  }}
                >
                  <p style={{ fontSize: 11, color: "var(--text-primary)", lineHeight: 1.4 }}>{n.text}</p>
                  <p style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>{n.time}</p>
                </div>
              ))}
            </div>
          )}

          {/* Settings */}
          <button
            style={{
              display: "flex", alignItems: "center", gap: 8, width: "100%",
              padding: "7px 10px", borderRadius: "var(--radius-md)",
              background: settOpen ? "var(--accent-light)" : "transparent",
              color: settOpen ? "var(--accent)" : "var(--text-secondary)",
              border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500,
              fontFamily: "inherit", transition: "all 0.12s"
            }}
            onClick={() => toggle("sett")}
          >
            <Settings size={13} />
            <span style={{ flex: 1, textAlign: "left" }}>Settings</span>
            <ChevronDown size={12} style={{ transform: settOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s", opacity: 0.5 }} />
          </button>
          {settOpen && (
            <div style={{
              margin: "4px 0 8px", background: "var(--bg-app)",
              border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 10
            }}>
              <div style={{ marginBottom: 10 }}>
                <p style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 3 }}>Table rows per page</p>
                <select className="input" style={{ fontSize: 11, padding: "4px 8px" }} value={pageSize} onChange={e => setPageSize(e.target.value)}>
                  <option value="25">25 rows</option>
                  <option value="50">50 rows</option>
                  <option value="100">100 rows</option>
                </select>
              </div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", paddingTop: 8, borderTop: "1px solid var(--border)" }}>
                <p style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <Info size={10} /> ProHub v2 · FastAPI + Next.js
                </p>
              </div>
            </div>
          )}
        </NavGroup>
      </div>

      {/* Footer */}
      <div style={{ padding: "8px 12px", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
        <p style={{ fontSize: 9, color: "var(--text-muted)", textAlign: "center" }}>DCI ProHub v2.0 · Document Control Intelligence</p>
      </div>
    </aside>
  );
}
