"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import ScreenHeader from "@/components/ScreenHeader";
import { supabase } from "@/lib/supabase";
import { canManageFriendly, ukToday, type Friendly } from "@/lib/friendlies";
type Board = { teams: {id:string;name:string;season_id:string}[]; seasons:{id:string;name:string}[]; managedIds:string[]; friendlies:Friendly[] };
type DraftFrame = {home:string;away:string;homeScore:string;awayScore:string};
const emptyFrame = ():DraftFrame=>({home:"",away:"",homeScore:"",awayScore:""});
const field = "w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-900";
const button = "rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white disabled:opacity-50";
const secondary = "rounded-lg border border-slate-300 px-4 py-2 font-semibold disabled:opacity-50";
async function request(body?:unknown) {
  const session = await supabase?.auth.getSession();
  const token = session?.data.session?.access_token;
  if (!token) throw new Error("Please sign in again.");
  const res = await fetch('/api/league/friendlies',{method:body ? 'POST':'GET',headers:{Authorization:`Bearer ${token}`,...(body ? {'Content-Type':'application/json'}:{})},...(body ? {body:JSON.stringify(body)}:{}),cache:'no-store'});
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Unable to load friendlies.');
  return data;
}
function FriendlyBoard() {
  const [board,setBoard]=useState<Board | null>(null), [error,setError]=useState(''), [notice,setNotice]=useState(''), [busy,setBusy]=useState(false);
  const [team,setTeam]=useState(''),[date,setDate]=useState(''),[time,setTime]=useState('19:00'),[venue,setVenue]=useState(''),[notes,setNotes]=useState('');
  const [view,setView]=useState('available'),[editor,setEditor]=useState<Friendly|null>(null),[frames,setFrames]=useState<DraftFrame[]>([emptyFrame()]);
  const scorecardRef=useRef<HTMLElement>(null);
  useEffect(()=>{if(editor) scorecardRef.current?.scrollIntoView({behavior:'smooth',block:'start'});},[editor]);
  const [confirmation,setConfirmation]=useState<{row:Friendly;action:'claim'|'cancel';team_id?:string}|null>(null);
  const reload=useCallback(async()=>{const data:Board=await request();setBoard(data);setTeam(current=>data.managedIds.includes(current)?current:data.managedIds[0]??'');},[]);
  useEffect(()=>{void reload().catch(e=>setError(e.message));},[reload]);
  async function act(body:unknown, message:string) {
    setBusy(true);setError('');setNotice('');
    try {await request(body);setEditor(null);setConfirmation(null);setNotice(message);await reload();return true;} catch(e){setError((e as Error).message);return false;} finally{setBusy(false);}
  }
  const name=(id:string|null)=>board?.teams.find(t=>t.id===id)?.name ?? (id?'Team no longer active':'Awaiting opponent');
  const dateLabel=(d:string)=>new Intl.DateTimeFormat('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'Europe/London'}).format(new Date(`${d}T12:00:00Z`));
  const today=ukToday();
  const rows=(board?.friendlies??[]).filter(r=>view==='available'?r.status==='open'&&r.match_date>=today:view==='mine'?canManageFriendly(r,board?.managedIds??[]):true).sort((a,b)=>a.match_date.localeCompare(b.match_date));
  return <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
    <ScreenHeader title="Team friendlies" eyebrow="Play for the enjoyment" subtitle="Offer a date, find an opponent and play on any day of the week." />
    <div className="rounded-2xl border border-teal-200 bg-teal-50 p-5"><h2 className="font-semibold text-teal-950">Friendly games — always unrated</h2><p className="mt-1 text-teal-950">No Elo, handicap, league-table or ranked high-break changes. Recording frames is optional. Agree the format and any starts between yourselves; the offering team is listed first on the scorecard.</p><p className="mt-2 text-sm">All dates and start times are UK time. Confirm table availability with the venue before posting or accepting. Captains should contact each other if plans change; this board does not send emails.</p></div>
    {error&&<div role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</div>}
    {notice&&<div role="status" className="rounded-xl bg-green-50 p-4 text-green-900">{notice}</div>}
    {!board&&!error&&<p>Loading friendlies…</p>}
    {board&&board.managedIds.length>0&&<form className="space-y-4 rounded-2xl border bg-white p-5" onSubmit={async e=>{e.preventDefault();const saved=await act({action:'offer',team_id:team,match_date:date,start_time:time,venue,notes},'Your team is available for a friendly. Other captains can now accept.');if(saved){setNotes('');setDate('');}}}>
      <h2 className="text-xl font-semibold">Make your team available</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label>Your team<select required className={field} value={team} onChange={e=>setTeam(e.target.value)}>{board.teams.filter(t=>board.managedIds.includes(t.id)).map(t=><option key={t.id} value={t.id}>{t.name} — {board.seasons.find(s=>s.id===t.season_id)?.name}</option>)}</select></label>
        <label>Date (any day)<input required className={field} type="date" min={today} value={date} onChange={e=>setDate(e.target.value)} /></label>
        <label>Start time<input required className={field} type="time" value={time} onChange={e=>setTime(e.target.value)} /></label>
        <label>Venue<input required maxLength={200} className={field} value={venue} onChange={e=>setVenue(e.target.value)} placeholder="Club / venue name" /></label>
      </div>
      <label className="block">Format / arrangements (optional)<textarea className={field} maxLength={1000} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="For example: six singles frames, scratch, visitors welcome." /></label>
      <button disabled={busy} className={button}>Post availability</button>
    </form>}
    {board&&board.managedIds.length===0&&<p className="rounded-xl border p-4">You can view the board. Your team’s captain or vice-captain can post or accept a friendly.</p>}
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3"><h2 className="mr-auto text-xl font-semibold">Friendly board</h2><label>Show <select className="rounded-lg border p-2" value={view} onChange={e=>setView(e.target.value)}><option value="available">Available dates</option><option value="mine">My teams</option><option value="all">All arrangements</option></select></label><button disabled={busy} className={secondary} onClick={()=>{setError('');void reload().catch(e=>setError(e.message));}}>Refresh board</button></div>
      {board&&rows.length===0&&<p className="rounded-xl border bg-white p-5">No friendlies in this view yet.</p>}
      {rows.map(row=>{const own=canManageFriendly(row,board?.managedIds??[]); const available=row.status==='open'&&row.match_date>=today; return <article key={row.id} className="space-y-3 rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap justify-between gap-2"><h3 className="text-lg font-semibold">{name(row.host_team_id)}{row.guest_team_id?` v ${name(row.guest_team_id)}`:' — looking for an opponent'}</h3><span className="rounded-full bg-slate-100 px-3 py-1 text-sm capitalize">{row.status==='open'&&!available?'Expired':row.status==='booked'?'Arranged':row.status==='played'?'Result recorded':row.status}</span></div>
        <p className="font-medium">{dateLabel(row.match_date)} · {row.start_time.slice(0,5)} · {row.venue}</p>
        {row.notes&&<p className="whitespace-pre-wrap text-slate-600">{row.notes}</p>}
        {row.frames.length>0&&<details><summary className="cursor-pointer font-semibold">Unrated result: {row.frames.filter(f=>f.homeScore>f.awayScore).length}–{row.frames.filter(f=>f.awayScore>f.homeScore).length} · View frames</summary><ol className="mt-2 space-y-2">{row.frames.map((f,i)=><li key={i}>Frame {i+1}: {f.home} {f.homeScore}–{f.awayScore} {f.away}</li>)}</ol></details>}
        <div className="flex flex-wrap gap-3">
          {available&&team&&team!==row.host_team_id&&<button disabled={busy} className={button} onClick={()=>setConfirmation({row,action:'claim',team_id:team})}>Accept for {name(team)}</button>}
          {own&&['open','booked'].includes(row.status)&&<button disabled={busy} className={secondary} onClick={()=>setConfirmation({row,action:'cancel'})}>{row.status==='open'?'Withdraw offer':'Cancel friendly'}</button>}
          {own&&['booked','played'].includes(row.status)&&row.match_date<=today&&<button disabled={busy} className={secondary} onClick={()=>{setEditor(row);setFrames(row.frames.length?row.frames.map(f=>({...f,homeScore:String(f.homeScore),awayScore:String(f.awayScore)})):[emptyFrame()]);}}>{row.frames.length?'Edit scorecard':'Record frames (optional)'}</button>}
        </div>
      </article>;})}
    </section>
    {confirmation&&<div role="dialog" aria-modal="true" aria-label="Confirm friendly arrangement" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="max-w-lg space-y-4 rounded-2xl bg-white p-6"><h2 className="text-xl font-semibold">{confirmation.action==='claim'?'Accept this friendly?':'Cancel this arrangement?'}</h2><p>{name(confirmation.row.host_team_id)} · {dateLabel(confirmation.row.match_date)} · {confirmation.row.start_time.slice(0,5)} · {confirmation.row.venue}</p><p>{confirmation.action==='claim'?`You are accepting for ${name(confirmation.team_id??null)}. This reserves the offer for your team.`:'The offer will be removed from available dates. If already arranged, please let the other captain know.'}</p><div className="flex gap-3"><button disabled={busy} className={button} onClick={()=>void act({action:confirmation.action,id:confirmation.row.id,version:confirmation.row.version,team_id:confirmation.team_id},confirmation.action==='claim'?'Friendly arranged. You can find it under My teams.':'Friendly cancelled.')}>Confirm</button><button disabled={busy} className={secondary} onClick={()=>setConfirmation(null)}>Go back</button></div></div></div>}
    {editor&&<section ref={scorecardRef} className="space-y-4 rounded-2xl border-2 border-teal-500 bg-white p-5" aria-label="Friendly scorecard"><h2 className="text-xl font-semibold">Scorecard: {name(editor.host_team_id)} v {name(editor.guest_team_id)}</h2><p>Enter names (or both names for doubles) and final points including any agreed start. These are friendly records only. Save once all listed frames are finished.</p>{error&&<p role="alert" className="text-red-800">{error}</p>}<form className="space-y-4" onSubmit={e=>{e.preventDefault();void act({action:'score',id:editor.id,version:editor.version,frames:frames.map(f=>({...f,homeScore:Number(f.homeScore),awayScore:Number(f.awayScore)}))},'Friendly scorecard saved. No ratings or league records changed.');}}>
      {frames.map((f,i)=><fieldset key={i} className="rounded-xl border p-3"><legend>Frame {i+1}</legend><div className="grid gap-3 sm:grid-cols-4">{(['home','homeScore','away','awayScore'] as const).map(key=><label key={key}>{key==='home'?name(editor.host_team_id):key==='away'?name(editor.guest_team_id):key==='homeScore'?'Offering team points':'Opponent points'}<input required className={field} type={key.endsWith('Score')?'number':'text'} min={0} max={999} step={1} maxLength={120} value={f[key]} onChange={e=>setFrames(old=>old.map((row,n)=>n===i?{...row,[key]:e.target.value}:row))} /></label>)}</div><button type="button" className="mt-2 text-sm text-red-700" disabled={busy||frames.length===1} onClick={()=>setFrames(old=>old.filter((_,n)=>n!==i))}>Remove frame</button></fieldset>)}
      <div className="flex flex-wrap gap-3"><button type="button" disabled={busy||frames.length>=30} className={secondary} onClick={()=>setFrames(old=>[...old,emptyFrame()])}>Add frame</button><button disabled={busy} className={button}>Save finished scorecard</button><button disabled={busy} type="button" className={secondary} onClick={()=>setEditor(null)}>Close without saving</button></div></form></section>}
  </main>;
}
export default function FriendliesPage(){return <RequireAuth><FriendlyBoard /></RequireAuth>;}
