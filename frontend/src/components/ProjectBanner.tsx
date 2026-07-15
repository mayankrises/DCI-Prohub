"use client";

import React, { useEffect, useState } from "react";
import { Building2 } from "lucide-react";

interface ProjectSummary {
  id: number;
  project_name: string;
  contractor?: string | null;
  client?: string | null;
  review_period_days?: number | null;
}

interface ProjectBannerProps {
  projectId: number;
}

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
  "http://127.0.0.1:8000";

export default function ProjectBanner({ projectId }: ProjectBannerProps) {
  const [project, setProject] = useState<ProjectSummary | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`${API_BASE}/projects`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Projects request failed: ${response.status}`);
        }

        return (await response.json()) as ProjectSummary[];
      })
      .then((projects) => {
        if (cancelled) return;

        setProject(
          projects.find(
            (candidate) => Number(candidate.id) === Number(projectId),
          ) ?? null,
        );
      })
      .catch((error) => {
        console.error("Failed to load selected project:", error);
        if (!cancelled) setProject(null);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return (
    <section
      style={{
        position: "relative",
        overflow: "hidden",
        // Tight spacing below TopNav; content pages supply their own padding.
        margin: "8px 24px 0",
        padding: "13px 18px",
        borderRadius: 14,
        border: "1px solid rgba(99,102,241,0.18)",
        background:
          "linear-gradient(135deg, rgba(99,102,241,0.13), rgba(236,72,153,0.06) 55%, rgba(255,255,255,0.02))",
        boxShadow: "0 7px 24px rgba(15,23,42,0.05)",
        flexShrink: 0,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          width: 150,
          height: 150,
          borderRadius: "50%",
          right: -45,
          top: -82,
          background: "rgba(99,102,241,0.10)",
        }}
      />

      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: 12,
          minWidth: 0,
        }}
      >
        <div
          style={{
            width: 42,
            height: 42,
            flexShrink: 0,
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            background: "linear-gradient(135deg, var(--accent), #8b5cf6)",
            boxShadow: "0 7px 18px rgba(99,102,241,0.24)",
          }}
        >
          <Building2 size={20} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              margin: 0,
              fontSize: 10,
              fontWeight: 750,
              letterSpacing: "0.11em",
              textTransform: "uppercase",
              color: "var(--accent)",
            }}
          >
            Current project
          </p>

          <h2
            title={project?.project_name}
            style={{
              margin: "2px 0 0",
              fontSize: 18,
              lineHeight: 1.2,
              fontWeight: 750,
              color: "var(--text-primary)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {project?.project_name || `Project ${projectId}`}
          </h2>

          <p
            style={{
              margin: "4px 0 0",
              fontSize: 11.5,
              color: "var(--text-muted)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {[project?.contractor, project?.client]
              .filter(Boolean)
              .join("  •  ") || "Document workspace"}
            {project?.review_period_days
              ? `  •  ${project.review_period_days}-day review period`
              : ""}
          </p>
        </div>

        <div
          style={{
            flexShrink: 0,
            padding: "5px 9px",
            borderRadius: 999,
            border: "1px solid rgba(99,102,241,0.2)",
            color: "var(--accent)",
            background: "rgba(255,255,255,0.58)",
            fontSize: 10.5,
            fontWeight: 700,
          }}
        >
          Project #{projectId}
        </div>
      </div>
    </section>
  );
}
