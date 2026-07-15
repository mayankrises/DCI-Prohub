"use client";
import React, { useEffect, useState } from "react";
import { FilePlus2, Loader2, Plus } from "lucide-react";
import { createDCIDocument, getMasterData, type MasterData } from "@/lib/api";

const EMPTY: MasterData = { vendors: [], disciplines: [], revisions: ["0"], code_labels: {} };
export default function NewDocument({ projectId, actorUserId = "system", onCreated }: { projectId: number; actorUserId?: string; onCreated?: () => void }) {
  const [master, setMaster] = useState(EMPTY);
  const [form, setForm] = useState({ document_number: "", document_title: "", vendor: "", discipline: "", document_type: "", revision: "0", revision_date: new Date().toISOString().slice(0,10), remarks: "" });
  const [saving, setSaving] = useState(false); const [message, setMessage] = useState("");
  useEffect(() => { getMasterData(projectId).then(setMaster).catch(() => setMaster(EMPTY)); }, [projectId]);
  const submit = async (e: React.FormEvent) => { e.preventDefault(); setSaving(true); setMessage(""); try { await createDCIDocument(projectId, { ...form, returned_code: null, actor_user_id: actorUserId }); setMessage("New document created. Upload its original file from Document Library when available."); setForm(v => ({ ...v, document_number: "", document_title: "", remarks: "" })); onCreated?.(); } catch (error: any) { setMessage(error?.response?.data?.detail || "Document could not be created."); } finally { setSaving(false); } };
  return <div className="fade-in"><div className="page-header"><div className="page-icon"><FilePlus2 size={18} style={{color:"var(--accent)"}}/></div><div><h1 className="page-title">New Document</h1><p className="page-subtitle">Register a newly received task before its original file is available.</p></div></div><form className="card" onSubmit={submit}><div style={{display:"grid",gridTemplateColumns:"1fr 2fr",gap:12}}>
    <label style={{fontSize:12}}>Document number *<input required className="input" value={form.document_number} onChange={e=>setForm(v=>({...v,document_number:e.target.value}))}/></label>
    <label style={{fontSize:12}}>Title *<input required className="input" value={form.document_title} onChange={e=>setForm(v=>({...v,document_title:e.target.value}))}/></label>
    <label style={{fontSize:12}}>Vendor<select className="input" value={form.vendor} onChange={e=>setForm(v=>({...v,vendor:e.target.value}))}><option value="">Select vendor</option>{master.vendors.map(x=><option key={x}>{x}</option>)}</select></label>
    <label style={{fontSize:12}}>Discipline<select className="input" value={form.discipline} onChange={e=>setForm(v=>({...v,discipline:e.target.value}))}><option value="">Select discipline</option>{master.disciplines.map(x=><option key={x}>{x}</option>)}</select></label>
    <label style={{fontSize:12}}>Initial revision<select className="input" value={form.revision} onChange={e=>setForm(v=>({...v,revision:e.target.value}))}>{master.revisions.slice(0,1).map(x=><option key={x}>{x}</option>)}</select></label>
    <label style={{fontSize:12}}>Received / revision date<input className="input" type="date" value={form.revision_date} onChange={e=>setForm(v=>({...v,revision_date:e.target.value}))}/></label>
    <label style={{fontSize:12,gridColumn:"1/-1"}}>Remarks<textarea className="input" rows={5} value={form.remarks} onChange={e=>setForm(v=>({...v,remarks:e.target.value}))}/></label>
  </div>{message&&<p style={{marginTop:12,fontSize:12,color:message.startsWith("New")?"#16A34A":"var(--error)"}}>{message}</p>}<div style={{display:"flex",justifyContent:"flex-end",marginTop:16}}><button className="btn-primary" disabled={saving}>{saving?<Loader2 size={14} className="animate-spin"/>:<Plus size={14}/>}Create Document</button></div></form></div>;
}
