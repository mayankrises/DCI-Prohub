"use client";
import React, { useState, useEffect, useCallback } from "react";
import { CheckSquare, Plus, Loader2, User, Clock, AlertCircle, CheckCircle, Circle } from "lucide-react";
import type { MockUser } from "@/lib/auth";
import { hasPermission } from "@/lib/auth";
import { getTasks, createTask, updateTask } from "@/lib/api";

interface Task {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  task_type: string;
  created_at: string;
}

interface Props { user: MockUser | null; projectId?: number; }

const STATUS_COLUMNS = [
  { id: "unassigned",  label: "Unassigned",   color: "#475569", icon: <Circle size={13} /> },
  { id: "assigned",    label: "Assigned",     color: "#6366f1", icon: <User size={13} /> },
  { id: "in_review",  label: "In Review",    color: "#f59e0b", icon: <AlertCircle size={13} /> },
  { id: "completed",  label: "Completed",    color: "#22c55e", icon: <CheckCircle size={13} /> },
];

const PRIORITY_BADGE: Record<string, string> = {
  low: "badge-gray", normal: "badge-indigo", high: "badge-yellow", critical: "badge-red"
};


export default function TaskBoard({ user, projectId = 1 }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("normal");
  const [taskType, setTaskType] = useState("general");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getTasks(projectId);
      setTasks(data || []);
    } catch { setTasks([]); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const handleCreate = async () => {
    if (!title.trim() || !user) return;
    setSaving(true);
    try {
      await createTask({
        project_id: projectId,
        title: title.trim(),
        description,
        priority,
        task_type: taskType,
        actor_user_id: user.id
      });
      setTitle(""); setDescription(""); setPriority("normal"); setTaskType("general");
      setShowForm(false);
      fetchTasks();
    } catch { /* show error */ }
    finally { setSaving(false); }
  };

  const handleDrop = async (taskId: string, newStatus: string) => {
    try {
      await updateTask(taskId, { status: newStatus, actor_user_id: user?.id });
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
    } catch { fetchTasks(); }
    setDragging(null);
  };

  const tasksByStatus = (status: string) => tasks.filter(t => t.status === status);

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: "linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.1))",
            border: "1px solid rgba(99,102,241,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center"
          }}>
            <CheckSquare size={20} color="var(--accent)" />
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)" }}>Task Board</h1>
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Manage review tasks and assignments. Drag cards to update status.</p>
          </div>
        </div>
        {hasPermission(user, "assign_task") && (
          <button className="btn-primary"
            style={{ display: "flex", alignItems: "center", gap: 6 }}
            onClick={() => setShowForm(!showForm)}>
            <Plus size={15} /> New Task
          </button>
        )}
      </div>

      {/* Create Task Form */}
      {showForm && (
        <div className="card" style={{ marginBottom: 20, padding: 16, border: "1px solid rgba(99,102,241,0.3)" }}>
          <p style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: 12, fontSize: 13 }}>Create New Task</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
            <input className="input" placeholder="Task title *" value={title} onChange={e => setTitle(e.target.value)} style={{ gridColumn: "1 / -1" }} />
            <select className="input" value={priority} onChange={e => setPriority(e.target.value)} style={{ fontSize: 12 }}>
              <option value="low">Low Priority</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
            <select className="input" value={taskType} onChange={e => setTaskType(e.target.value)} style={{ fontSize: 12 }}>
              <option value="general">General</option>
              <option value="review">Review</option>
              <option value="approval">Approval</option>
              <option value="rework">Rework</option>
              <option value="comment_response">Comment Response</option>
            </select>
          </div>
          <textarea className="input" rows={2} placeholder="Description (optional)" value={description}
            onChange={e => setDescription(e.target.value)} style={{ resize: "none", marginBottom: 10, display: "block" }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn-primary" onClick={handleCreate} disabled={!title.trim() || saving}
              style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Create
            </button>
            <button className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Kanban Board */}
      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 48 }}>
          <Loader2 size={24} color="var(--accent)" className="animate-spin" />
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {STATUS_COLUMNS.map(col => (
            <div key={col.id}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); if (dragging) handleDrop(dragging, col.id); }}
              style={{
                background: "var(--bg-card)", borderRadius: 12,
                border: "1px solid var(--border)", overflow: "hidden",
                minHeight: 300
              }}>
              {/* Column header */}
              <div style={{
                padding: "12px 14px", borderBottom: "1px solid var(--border)",
                display: "flex", alignItems: "center", gap: 8
              }}>
                <div style={{ color: col.color }}>{col.icon}</div>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>{col.label}</span>
                <span className="badge badge-gray" style={{ marginLeft: "auto" }}>
                  {tasksByStatus(col.id).length}
                </span>
              </div>

              {/* Task cards */}
              <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                {tasksByStatus(col.id).length === 0 ? (
                  <div style={{ textAlign: "center", padding: "24px 0" }}>
                    <p style={{ fontSize: 11, color: "var(--text-muted)" }}>No tasks</p>
                  </div>
                ) : (
                  tasksByStatus(col.id).map(task => (
                    <div key={task.id}
                      draggable
                      onDragStart={() => setDragging(task.id)}
                      onDragEnd={() => setDragging(null)}
                      style={{
                        background: dragging === task.id ? "var(--accent-glow)" : "var(--bg-primary)",
                        border: `1px solid ${dragging === task.id ? "var(--accent)" : "var(--border)"}`,
                        borderRadius: 8, padding: 10, cursor: "grab",
                        transition: "all 0.15s"
                      }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6, lineHeight: 1.4 }}>
                        {task.title}
                      </p>
                      {task.description && (
                        <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6, lineHeight: 1.4,
                          overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box",
                          WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>
                          {task.description}
                        </p>
                      )}
                      <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                        <span className={`badge ${PRIORITY_BADGE[task.priority] || "badge-gray"}`}>{task.priority}</span>
                        <span className="badge badge-gray">{task.task_type}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6 }}>
                        <Clock size={10} color="var(--text-muted)" />
                        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                          {task.created_at?.slice(0, 10) || "–"}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}