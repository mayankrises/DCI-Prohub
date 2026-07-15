"use client";
import React, { useEffect, useState } from "react";
import { Filter, RotateCcw } from "lucide-react";
import { getDCIFilters, type DashboardFilters } from "@/lib/api";
export default function DashboardFilters({projectId,value,onChange}:{projectId:number;value:DashboardFilters;onChange:(v:DashboardFilters)=>void}){
 const [options,setOptions]=useState<any>({});
 useEffect(()=>{getDCIFilters(projectId).then(setOptions).catch(()=>setOptions({}));},[projectId]);
 const set=(k:string,v:string)=>onChange({...value,[k]:v||undefined});
 return <div className="card" style={{marginBottom:16}}><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}><div style={{display:"flex",gap:8,alignItems:"center"}}><Filter size={16}/><h3>Filters</h3></div><button className="btn-ghost" onClick={()=>onChange({})}><RotateCcw size={13}/> Reset</button></div><div className="filter-grid">
 {[["discipline","Discipline",options.disciplines],["vendor","Vendor / Consultant",options.vendors],["status","Status",options.statuses],["code","Approval code",options.codes],["revision","Revision",options.revisions]].map(([k,l,vals]:any)=><label key={k}><span>{l}</span><select className="input" value={(value as any)[k]||""} onChange={e=>set(k,e.target.value)}><option value="">All</option>{(vals||[]).map((x:string)=><option key={x}>{x}</option>)}</select></label>)}
 <label className="filter-search"><span>Search document number / title</span><input className="input" value={value.search||""} onChange={e=>set("search",e.target.value)} placeholder="Search…"/></label>
 </div></div>
}
