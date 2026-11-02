"use client";
import React,{useEffect,useState} from "react";
import { getDashboardAnalytics, type DashboardFilters as DashboardFiltersType } from "@/lib/api";
import DashboardFilters from "./DashboardFilters"; import {Kpi,MultiYearChart} from "./AnalyticsUI";
export default function SubmissionProgress({projectId}:{projectId:number}){const [f,setF]=useState<DashboardFiltersType>({});const [d,setD]=useState<any>(null);useEffect(()=>{getDashboardAnalytics(projectId,f).then(setD)},[projectId,f]);if(!d)return <p>Loading…</p>;return <div className="fade-in"><div className="page-header"><div><h1 className="page-title">Submission Progress</h1><p className="page-subtitle">Monthly consultant submissions across workbook years.</p></div></div><DashboardFilters projectId={projectId} value={f} onChange={setF}/><div className="kpi-grid"><Kpi label="Pending with consultant" value={d.kpis.pending_consultant}/><Kpi label="Pending with client / EIL" value={d.kpis.pending_client}/><Kpi label="Open lifecycle" value={d.kpis.open}/><Kpi label="Closed lifecycle" value={d.kpis.closed}/></div><MultiYearChart title="Monthly Submission Chart" rows={d.submission_progress}/></div>}

