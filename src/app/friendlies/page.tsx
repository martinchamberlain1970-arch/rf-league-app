"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import ScreenHeader from "@/components/ScreenHeader";
import { supabase } from "@/lib/supabase";
import { canManageFriendly, ukToday, FRIENDLY_FORMATS, frameTypes, frameHandicaps, type FriendlyFormat, type FriendlyPlayer, type FriendlySeason, type FriendlyTeam, type Friendly } from "@/lib/friendlies";
type Board = { teams: FriendlyTeam[]; seasons:FriendlySeason[]; players:FriendlyPlayer[]; managedIds:string[]; friendlies:Friendly[] };
type DraftFrame = {homeIds:string[];awayIds:string[];homeScore:string;awayScore:string};
const emptyFrame = (count=1):DraftFrame=>({homeIds:Array(count).fill(""),awayIds:Array(count).fill(""),homeScore:"",awayScore:""});
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
  const [team,setTeam]=useState(''),[date,setDate]=useState(''),[time,setTime]=useState('19:00'),[notes,setNotes]=useState('');
  const [format,setFormat]=useState<FriendlyFormat>('six_singles'),[useHandicaps,setUseHandicaps]=useState(false);
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
  const registeredVenue=board?.teams.find(t=>t.id===team)?.venue;
  const rows=(board?.friendlies??[]).filter(r=>view==='available'?r.status==='open'&&r.match_date>=today:view==='mine'?canManageFriendly(r,board?.managedIds??[]):true).sort((a,b)=>a.match_date.localeCompare(b.match_date));
  return <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
    <ScreenHeader title="Team friendlies" eyebrow="Play for the enjoyment" subtitle="Offer a date, find an opponent and play on any day of the week." />
    <div className="rounded-2xl border border-teal-200 bg-teal-50 p-5"><h2 className="font-semibold text-teal-950">Friendly games — always unrated</h2><p className="mt-1 text-teal-950">No Elo, handicap, league-table or ranked high-break changes. Recording frames is optional. The offering team chooses the format and whether to use handicaps; the offering team is listed first on the scorecard.</p><p className="mt-2 text-sm">All dates and start times are UK time. Confirm table availability with the venue before posting or accepting. Captains should contact each other if plans change; this board does not send emails.</p></div>
    {error&&<div role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</div>}
    {notice&&<div role="status" className="rounded-xl bg-green-50 p-4 text-green-900">{notice}</div>}
    {!board&&!error&&<p>Loading friendlies…</p>}
    {board&&board.managedIds.length>0&&<form className="space-y-4 rounded-2xl border bg-white p-5" onSubmit={async e=>{e.preventDefault();const saved=await act({action:'offer',team_id:team,match_date:date,start_time:time,notes,format,use_handicaps:useHandicaps},'Your team is available for a friendly. Other captains can now accept.');if(saved){setNotes('');setDate('');}}}>
      <h2 className="text-xl font-semibold">Make your team available</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label>Your team<select required className={field} value={team} onChange={e=>setTeam(e.target.value)}>{board.teams.filter(t=>board.managedIds.includes(t.id)).sort((a,b)=>a.name.localeCompare(b.name)).map(t=><option key={t.id} value={t.id}>{t.name}{board.teams.filter(other=>other.name===t.name&&board.managedIds.includes(other.id)).length>1?` (${board.seasons.find(s=>s.id===t.season_id)?.name??'Previous registration'})`:''}</option>)}</select></label>
        <label>Date (any day)<input required className={field} type="date" min={today} value={date} onChange={e=>setDate(e.target.value)} /></label>
        <label>Start time<input required className={field} type="time" value={time} onChange={e=>setTime(e.target.value)} /></label>
        <div><p className="font-medium">Venue — registered club address</p><p className="mt-1 whitespace-pre-line rounded-lg bg-slate-50 p-3">{registeredVenue || "No registered address. Ask a league officer to update the club record before posting."}</p></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2"><label>Match format<select className={field} value={format} onChange={e=>setFormat(e.target.value as FriendlyFormat)}>{Object.entries(FRIENDLY_FORMATS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label>Use current handicaps?<select className={field} value={useHandicaps?'yes':'no'} onChange={e=>setUseHandicaps(e.target.value==='yes')}><option value="no">No — play off scratch</option><option value="yes">Yes — use handicaps</option></select></label></div>
      {useHandicaps&&<p className="rounded-lg bg-teal-50 p-3 text-sm">Premier v Division One: Premier players use their current published handicap; Division One players use their suggested Elo handicap +20. Otherwise current published handicaps apply. Doubles use the average of each pair. The Premier league start cap applies to cross-division games; otherwise the offering league’s cap applies.</p>}
      <label className="block">Other arrangements (optional)<textarea className={field} maxLength={1000} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="For example: table booked, visitors welcome." /></label>
      <button disabled={busy||!registeredVenue} className={button}>Post availability</button>
    </form>}
    {board&&board.managedIds.length===0&&<p className="rounded-xl border p-4">You can view the board. Your team’s captain or vice-captain can post or accept a friendly.</p>}
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3"><h2 className="mr-auto text-xl font-semibold">Friendly board</h2><label>Show <select className="rounded-lg border p-2" value={view} onChange={e=>setView(e.target.value)}><option value="available">Available dates</option><option value="mine">My teams</option><option value="all">All arrangements</option></select></label><button disabled={busy} className={secondary} onClick={()=>{setError('');void reload().catch(e=>setError(e.message));}}>Refresh board</button></div>
      {board&&rows.length===0&&<p className="rounded-xl border bg-white p-5">No friendlies in this view yet.</p>}
      {rows.map(row=>{const own=canManageFriendly(row,board?.managedIds??[]); const available=row.status==='open'&&row.match_date>=today; return <article key={row.id} className="space-y-3 rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap justify-between gap-2"><h3 className="text-lg font-semibold">{name(row.host_team_id)}{row.guest_team_id?` v ${name(row.guest_team_id)}`:' — looking for an opponent'}</h3><span className="rounded-full bg-slate-100 px-3 py-1 text-sm capitalize">{row.status==='open'&&!available?'Expired':row.status==='booked'?'Arranged':row.status==='played'?'Result recorded':row.status}</span></div>
        <p className="font-medium">{dateLabel(row.match_date)} · {row.start_time.slice(0,5)} · {row.venue}</p>
        <p>{FRIENDLY_FORMATS[row.format]} · {row.use_handicaps?"Handicaps enabled (Division One suggested +20 against Premier)":"Scratch — no starts"}</p>
        {row.notes&&<p className="whitespace-pre-wrap text-slate-600">{row.notes}</p>}
        {row.frames.length>0&&<details><summary className="cursor-pointer font-semibold">Unrated result: {row.frames.filter(f=>f.homeScore>f.awayScore).length}–{row.frames.filter(f=>f.awayScore>f.homeScore).length} · View frames</summary><ol className="mt-2 space-y-2">{row.frames.map((f,i)=><li key={i}>Frame {i+1}: {f.home} {f.homeScore}–{f.awayScore} {f.away} (starts {f.homeStart ?? 0}–{f.awayStart ?? 0})</li>)}</ol></details>}
        <div className="flex flex-wrap gap-3">
          {available&&team&&team!==row.host_team_id&&<button disabled={busy} className={button} onClick={()=>setConfirmation({row,action:'claim',team_id:team})}>Accept for {name(team)}</button>}
          {own&&['open','booked'].includes(row.status)&&<button disabled={busy} className={secondary} onClick={()=>setConfirmation({row,action:'cancel'})}>{row.status==='open'?'Withdraw offer':'Cancel friendly'}</button>}
          {own&&['booked','played'].includes(row.status)&&row.match_date<=today&&<button disabled={busy} className={secondary} onClick={()=>{setEditor(row);setFrames(row.frames.length?row.frames.map(f=>({...f,homeScore:String(f.homeScore),awayScore:String(f.awayScore)})):frameTypes(row.format).map(n=>emptyFrame(n)));}}>{row.frames.length?'Edit scorecard':'Record frames (optional)'}</button>}
        </div>
      </article>;})}
    </section>
    {confirmation&&<div role="dialog" aria-modal="true" aria-label="Confirm friendly arrangement" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="max-w-lg space-y-4 rounded-2xl bg-white p-6"><h2 className="text-xl font-semibold">{confirmation.action==='claim'?'Accept this friendly?':'Cancel this arrangement?'}</h2><p>{name(confirmation.row.host_team_id)} · {dateLabel(confirmation.row.match_date)} · {confirmation.row.start_time.slice(0,5)} · {confirmation.row.venue}</p><p>{FRIENDLY_FORMATS[confirmation.row.format]} · {confirmation.row.use_handicaps?"Use current handicaps, with Division One suggested +20 against Premier":"Scratch — no starts"}</p><p>{confirmation.action==='claim'?`You are accepting for ${name(confirmation.team_id??null)}. This reserves the offer for your team.`:'The offer will be removed from available dates. If already arranged, please let the other captain know.'}</p><div className="flex gap-3"><button disabled={busy} className={button} onClick={()=>void act({action:confirmation.action,id:confirmation.row.id,version:confirmation.row.version,team_id:confirmation.team_id},confirmation.action==='claim'?'Friendly arranged. You can find it under My teams.':'Friendly cancelled.')}>Confirm</button><button disabled={busy} className={secondary} onClick={()=>setConfirmation(null)}>Go back</button></div></div></div>}
    {editor&&<section ref={scorecardRef} className="space-y-4 rounded-2xl border-2 border-teal-500 bg-white p-5" aria-label="Friendly scorecard"><h2 className="text-xl font-semibold">Scorecard: {name(editor.host_team_id)} v {name(editor.guest_team_id)}</h2><p>Choose the registered players for each frame. Enter final scoreboard totals including the displayed start — the app does not add it twice. These are friendly records only. Save once all listed frames are finished.</p>{error&&<p role="alert" className="text-red-800">{error}</p>}<form className="space-y-4" onSubmit={e=>{e.preventDefault();void act({action:'score',id:editor.id,version:editor.version,frames:frames.map(f=>({...f,homeScore:Number(f.homeScore),awayScore:Number(f.awayScore)}))},'Friendly scorecard saved. No ratings or league records changed.');}}>
      {frames.map((f,i)=>{
        const homePlayers=f.homeIds.map(id=>board?.players.find(p=>p.id===id&&p.team_id===editor.host_team_id)).filter((p):p is FriendlyPlayer=>Boolean(p));
        const awayPlayers=f.awayIds.map(id=>board?.players.find(p=>p.id===id&&p.team_id===editor.guest_team_id)).filter((p):p is FriendlyPlayer=>Boolean(p));
        const leagueFor=(id:string|null)=>board?.seasons.find(s=>s.id===board.teams.find(t=>t.id===id)?.season_id);
        const hLeague=leagueFor(editor.host_team_id),aLeague=leagueFor(editor.guest_team_id);
        const old=editor.frames[i];
        const same=old&&JSON.stringify(old.homeIds)===JSON.stringify(f.homeIds)&&JSON.stringify(old.awayIds)===JSON.stringify(f.awayIds);
        const starts=same?old:homePlayers.length===f.homeIds.length&&awayPlayers.length===f.awayIds.length&&hLeague&&aLeague?frameHandicaps(homePlayers,awayPlayers,hLeague,aLeague,editor.use_handicaps):null;
        return <fieldset key={i} className="space-y-3 rounded-xl border p-3"><legend>Frame {i+1} — {f.homeIds.length===2?'Doubles':'Singles'}</legend><div className="grid gap-4 sm:grid-cols-2">{(['home','away'] as const).map(side=><div key={side} className="space-y-2"><h3 className="font-semibold">{name(side==='home'?editor.host_team_id:editor.guest_team_id)}</h3>{f[`${side}Ids`].map((id,n)=><label key={n} className="block">Player {n+1}<select required className={field} value={id} onChange={e=>setFrames(old=>old.map((row,k)=>k===i?{...row,[`${side}Ids`]:row[`${side}Ids`].map((v,j)=>j===n?e.target.value:v)}:row))}><option value="">Choose player</option>{board?.players.filter(p=>p.team_id===(side==='home'?editor.host_team_id:editor.guest_team_id)).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>)}<label className="block">Final points (including start)<input required type="number" min={0} max={999} step={1} className={field} value={f[`${side}Score`]} onChange={e=>setFrames(old=>old.map((row,k)=>k===i?{...row,[`${side}Score`]:e.target.value}:row))}/></label></div>)}</div><p className="rounded-lg bg-teal-50 p-3">{starts?(starts.homeStart?`${name(editor.host_team_id)} receives ${starts.homeStart} points from ${name(editor.guest_team_id)}.`:starts.awayStart?`${name(editor.guest_team_id)} receives ${starts.awayStart} points from ${name(editor.host_team_id)}.`:'No start — play off scratch.'):'Choose all players to see who gives and receives the start.'}</p></fieldset>;
      })}
      <div className="flex flex-wrap gap-3"><button disabled={busy} className={button}>Save finished scorecard</button><button disabled={busy} type="button" className={secondary} onClick={()=>setEditor(null)}>Close without saving</button></div></form></section>}
  </main>;
}
export default function FriendliesPage(){return <RequireAuth><FriendlyBoard /></RequireAuth>;}
