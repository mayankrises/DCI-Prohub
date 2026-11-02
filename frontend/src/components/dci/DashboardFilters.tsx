
"use client";

import React, { useEffect, useState } from "react";
import { Filter, RotateCcw } from "lucide-react";
import {
  getDCIFilters,
  type DashboardFilters as DashboardFiltersType,
} from "@/lib/api";

export default function DashboardFilters({
  projectId,
  value,
  onChange,
}: {
  projectId: number;
  value: DashboardFiltersType;
  onChange: (v: DashboardFiltersType) => void;
}) {
  const [options, setOptions] = useState<any>({});

  useEffect(() => {
    getDCIFilters(projectId)
      .then(setOptions)
      .catch(() => setOptions({}));
  }, [projectId]);

  const set = (key: string, v: string) => {
    onChange({ ...value, [key]: v || undefined });
  };

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Filter size={16} />
          <h3>Filters</h3>
        </div>

        <button className="btn-ghost" onClick={() => onChange({})}>
          <RotateCcw size={13} /> Reset
        </button>
      </div>

      <div className="filter-grid">
        {[
          ["discipline", "Discipline", options.disciplines],
          ["vendor", "Vendor / Consultant", options.vendors],
          ["status", "Status", options.statuses],
          ["code", "Approval code", options.codes],
          ["revision", "Revision", options.revisions],
        ].map(([key, label, values]: any) => (
          <label key={key}>
            <span>{label}</span>
            <select
              className="input"
              value={(value as any)[key] || ""}
              onChange={(e) => set(key, e.target.value)}
            >
              <option value="">All</option>
              {(values || []).map((x: string) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
        ))}

        <label className="filter-search">
          <span>Search document number / title</span>
          <input
            className="input"
            value={value.search || ""}
            onChange={(e) => set("search", e.target.value)}
            placeholder="Search…"
          />
        </label>
      </div>
    </div>
  );
}
