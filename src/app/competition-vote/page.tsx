"use client";
import {useCallback,useEffect,useState} from 'react';
import RequireAuth from '@/components/RequireAuth';
import {supabase} from '@/lib/supabase';
import {VOTE_LABELS,stageTitle,type VotingBoard} from '@/lib/competition-voting';
async function request(body?:unknown){
 const session=await supabase?.auth.getSession(); const token=session?.data.session?.access_token;
 if(!token) throw new Error('Please sign in again.');
 const r=await fetch('/api/league/competition-vote',{method:body?'POST':'GET',cache:'no-store',headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const data=await r.json(); if(!r.ok) throw new Error(data.error||'Unable to load the ballot.'); return data;
}
const button='rounded-xl bg-teal-700 px-5 py-3 font-bold text-white disabled:opacity-50';
function Ballot(){
 const [board,setBoard]=useState<VotingBoard|null>(null),[team,setTeam]=useState(''),[choice,setChoice]=useState(''),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[closeConfirm,setCloseConfirm]=useState(false);
 const reload=useCallback(async()=>{const d:VotingBoard=await request();setBoard(d);setTeam(t=>d.managedIds.includes(t)?t:d.managedIds[0]??'');setChoice('');setConfirmed(false);setCloseConfirm(false);},[]);
 useEffect(()=>{void reload().catch(e=>setError(e.message));},[reload]);
 async function act(body:unknown,message:string){setBusy(true);setError('');setNotice('');try{await request(body);setNotice(message);await reload();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const current=board?.rounds.find(r=>!r.closed_at),submitted=board?.ownVotes.find(v=>v.team_id===team);
 return <main className="mx-auto max-w-4xl space-y-5 p-4 sm:p-8">
  <header className="rounded-3xl bg-slate-950 p-6 text-white"><p className="text-sm font-bold uppercase tracking-widest text-teal-300">Rack &amp; Frame · 2026/2027</p><h1 className="mt-2 text-3xl font-bold">Competition handicap vote</h1><p className="mt-3">One vote per team in each round. Captains and vice-captains vote on behalf of their team.</p></header>
  <section className="rounded-2xl border bg-white p-5"><h2 className="text-xl font-bold">What we are deciding</h2><p className="mt-2">Temporary arrangements for Lee Ford Singles Handicap and Handicap Doubles this season only. Scratch and billiards competitions keep their existing rules. This vote records the decision; it does not change playing handicaps automatically.</p><ol className="mt-3 list-decimal space-y-2 pl-5"><li>Choose Proposal 1 or Proposal 2.</li><li>If Proposal 2 wins, every team can vote on +8, +12 or +16. A runoff follows if needed.</li><li>Once that decision is settled, a separate vote on Proposals 3 and 4 can be opened.</li></ol></section>
  <section className="rounded-2xl border border-teal-200 bg-teal-50 p-5"><p><strong>Proposal 1:</strong> use each player’s Elo-suggested handicap without adjustment.</p><p className="mt-2"><strong>Proposal 2:</strong> use each player’s Elo-suggested handicap and add the agreed adjustment for Division 1 players. Premier players receive no adjustment.</p><p className="mt-2 text-sm">The adjustment changes the individual handicap, not a guaranteed start. For example, an Elo suggestion of −12 with +8 becomes −4. The start is calculated against the opponent under the competition rules.</p></section>
  {error&&<p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}{notice&&<p role="status" className="rounded-xl bg-green-50 p-4 text-green-900">{notice}</p>}
  {!board&&!error&&<p>Loading ballot…</p>}
  {board&&<>
   <div className="flex flex-wrap items-center justify-between gap-3"><p>{current?`${board.submittedTeamIds.length} of ${board.teams.length} teams have responded in this round.`:'No ballot is currently open.'}</p><button className="rounded-xl border bg-white px-4 py-2" disabled={busy} onClick={()=>{setError('');void reload().catch(e=>setError(e.message));}}>Refresh ballot</button></div>
   {board.manager && current && (
    <section className="rounded-2xl border bg-white p-5" aria-labelledby="team-voting-progress">
     <h2 id="team-voting-progress" className="text-xl font-bold">Team voting progress</h2>
     <p className="mt-2 text-sm text-slate-600">Round {current.round_no} · {stageTitle(current.stage)}. Use Refresh ballot to check for new responses.</p>
     <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
       <h3 className="font-bold text-emerald-900">Responded ({board.submittedTeamIds.length})</h3>
       <ul className="mt-3 space-y-2">
        {board.teams.filter(team => board.submittedTeamIds.includes(team.team_id)).map(team => (
         <li key={team.team_id}>{team.team_name}</li>
        ))}
       </ul>
       {board.submittedTeamIds.length === 0 && <p className="mt-3">No team responses yet.</p>}
      </div>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
       <h3 className="font-bold text-amber-900">Awaiting response ({board.teams.length - board.submittedTeamIds.length})</h3>
       <ul className="mt-3 space-y-2">
        {board.teams.filter(team => !board.submittedTeamIds.includes(team.team_id)).map(team => (
         <li key={team.team_id}>{team.team_name}</li>
        ))}
       </ul>
       {board.submittedTeamIds.length === board.teams.length && <p className="mt-3">Every team has responded.</p>}
      </div>
     </div>
    </section>
   )}
   {current?<section className="space-y-4 rounded-2xl border bg-white p-5"><h2 className="text-xl font-bold">Round {current.round_no} · {stageTitle(current.stage)}</h2>
    {board.rounds.some(r=>r.closed_at&&r.stage===current.stage)&&<p className="rounded-lg bg-amber-50 p-3">This is a follow-up ballot. Every team may vote again, regardless of its earlier choice.</p>}
    {current.stage==='timing'&&<div className="space-y-2 text-sm"><p><strong>Proposal 3:</strong> fix each player’s competition handicap at the entry closing date, including the approved Division 1 adjustment.</p><p><strong>Proposal 4:</strong> use the latest Elo suggestion when each match starts, including the approved adjustment. All rated league and cup frames count. Handicaps stay fixed during that match.</p></div>}
    {board.managedIds.length? <><label className="block font-semibold">Your team<select className="mt-2 w-full rounded-xl border p-3" disabled={busy} value={team} onChange={e=>{setTeam(e.target.value);setChoice('');setConfirmed(false);setNotice('');}}>{board.teams.filter(t=>board.managedIds.includes(t.team_id)).map(t=><option key={t.team_id} value={t.team_id}>{t.team_name}</option>)}</select></label>
     {submitted?<p className="rounded-xl bg-green-50 p-4 text-green-900">Your team’s vote is recorded: <strong>{VOTE_LABELS[submitted.choice]}</strong>. There is one shared vote for the captain and vice-captain; a second vote cannot be submitted.</p>:<form className="space-y-4" onSubmit={e=>{e.preventDefault();void act({action:'vote',round_id:current.id,team_id:team,choice,confirmed},'Your team’s vote has been recorded.');}}><fieldset disabled={busy} className="space-y-2"><legend className="mb-2 font-semibold">Choose one</legend>{[...current.options,'abstain'].map(o=><label key={o} className="flex cursor-pointer gap-3 rounded-xl border p-4"><input required type="radio" name="choice" value={o} checked={choice===o} onChange={()=>{setChoice(o);setConfirmed(false);}}/><span>{VOTE_LABELS[o]}</span></label>)}</fieldset><label className="flex gap-3 text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} required disabled={busy}/><span>I confirm this is the agreed vote for <strong>{board.teams.find(t=>t.team_id===team)?.team_name}</strong>. It cannot be changed after submission.</span></label><button className={button} disabled={busy||!choice||!confirmed}>Submit team vote</button></form>}</>:<p>Your account is not linked as a captain or vice-captain of an eligible team. Please contact the League Secretary if your team link needs updating.</p>}
    {board.manager&&<div className="space-y-3 border-t pt-4"><h3 className="font-bold">League officer controls</h3><p className="text-sm">Voting stays open until an officer closes it. Closing counts the votes cast; teams that have not voted are not counted as abstentions. The next adjustment or runoff ballot opens automatically where required.</p><label className="flex gap-3 text-sm"><input type="checkbox" checked={closeConfirm} onChange={e=>setCloseConfirm(e.target.checked)}/><span>Close this round now, with {board.submittedTeamIds.length} of {board.teams.length} teams having responded.</span></label><button className={button} disabled={busy||!closeConfirm||!board.submittedTeamIds.length} onClick={()=>void act({action:'close',round_id:current.id,confirmed:true},'Round closed. The decision and next step are shown below.')}>Close round and count votes</button></div>}
   </section>:null}
   {board.ballot.method&&<section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><h2 className="text-xl font-bold">Calculation decision</h2><p className="mt-2">{VOTE_LABELS[board.ballot.method]}</p><p>{board.ballot.adjustment===null?'Division 1 adjustment vote in progress.':`Division 1 adjustment: ${board.ballot.adjustment===0?'none':`+${board.ballot.adjustment} points`}.`}</p>{board.ballot.timing&&<p className="mt-2">{VOTE_LABELS[board.ballot.timing]}</p>}</section>}
   {board.ballot.phase==='timing_ready'&&<section className="space-y-3 rounded-2xl border bg-white p-5"><h2 className="text-xl font-bold">Next: Proposals 3 and 4</h2><p>The calculation decision is complete. The separate vote on fixed or updated handicaps is ready for a league officer to open.</p>{board.manager&&<button className={button} disabled={busy} onClick={()=>void act({action:'timing'},'The vote on Proposals 3 and 4 is now open.')}>Open Proposals 3 and 4 vote</button>}</section>}
   {board.ballot.phase==='complete'&&<p className="rounded-xl bg-green-50 p-5 font-semibold">Voting is complete. The agreed policy will be communicated before it is brought into use.</p>}
   {board.rounds.filter(r=>r.closed_at).map(r=><section key={r.id} className="rounded-2xl border bg-white p-5"><h2 className="font-bold">Round {r.round_no} results · {stageTitle(r.stage)}</h2><ul className="mt-3 space-y-2">{[...r.options,'abstain'].map(o=><li key={o} className="flex justify-between gap-4"><span>{VOTE_LABELS[o]}</span><strong>{r.totals?.[o]??0}</strong></li>)}</ul><p className="mt-3 font-semibold">{r.winner?`Selected: ${VOTE_LABELS[r.winner]}`:'No majority — a further ballot is required.'}</p></section>)}
  </>}
  <footer className="rounded-2xl bg-slate-100 p-5 text-sm leading-6"><h2 className="font-bold">Voting rules</h2><p>A choice must receive more than half of the votes cast, excluding abstentions. If none does, the top two choices go to a runoff. Any tie at the qualifying position is retained, so a three-way tie or tie for second can require another three-choice ballot. A tied two-choice ballot is repeated. A round with no substantive votes cannot be concluded.</p><p className="mt-2">Choice totals appear after each round closes. Each team may vote in every round, including teams that preferred Proposal 1. Team, voter account, choice and submission time are retained as the decision record. There is no automatic closing deadline or email notification; the League Secretary will announce each round.</p></footer>
 </main>;
}
export default function CompetitionVotePage(){return <RequireAuth><Ballot/></RequireAuth>;}
