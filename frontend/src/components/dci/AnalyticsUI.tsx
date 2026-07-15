"use client";
import React from "react";
import { Bar } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from "chart.js";
ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

export const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
export const COLORS = ["#8B5CF6", "#F97316", "#14B8A6", "#0EA5E9"];

export function Kpi({label,value,sub}:{label:string;value:number|string;sub?:string}) {
 return <div className="stat-card"><p style={{fontSize:12,color:"var(--text-muted)"}}>{label}</p><p style={{fontSize:30,fontWeight:750,marginTop:8,color:"var(--text-primary)"}}>{value}</p>{sub&&<p style={{fontSize:11,color:"var(--text-muted)",marginTop:5}}>{sub}</p>}</div>
}

export function MultiYearChart({title,rows}:{title:string;rows:{year:number;months:number[]}[]}) {
 const data={labels:MONTHS,datasets:rows.map((r,i)=>({label:String(r.year),data:r.months,backgroundColor:COLORS[i%COLORS.length],borderRadius:4,borderSkipped:false}))};
 return <div className="card"><h2 style={{marginBottom:16}}>{title}</h2><div style={{height:360}}><Bar data={data} options={{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:"bottom" as const}},scales:{x:{grid:{display:false}},y:{beginAtZero:true,ticks:{precision:0}}}}}/></div><div style={{overflowX:"auto",marginTop:18}}><table className="data-table"><thead><tr><th>Year</th>{MONTHS.map(m=><th key={m}>{m}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.year}><td><b>{r.year}</b></td>{r.months.map((n,i)=><td key={i}>{n}</td>)}</tr>)}</tbody></table></div></div>
}

export function SimpleBar({title,labels,values}:{title:string;labels:string[];values:number[]}) {
 return <div className="card"><h2 style={{marginBottom:16}}>{title}</h2><div style={{height:300}}><Bar data={{labels,datasets:[{label:"Documents",data:values,backgroundColor:labels.map((_,i)=>COLORS[i%COLORS.length]),borderRadius:5,borderSkipped:false}]}} options={{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false}},y:{beginAtZero:true,ticks:{precision:0}}}}}/></div></div>
}
