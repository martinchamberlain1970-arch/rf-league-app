import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow'};
class RequestError extends Error {constructor(message:string,public status=400){super(message);}}
async function context(req:NextRequest){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!anon||!key) throw new Error('Missing configuration');
 const token=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
 if(!token) throw new RequestError('Please sign in to vote.',401);
 const auth=await createClient(url,anon).auth.getUser(token);
 if(auth.error||!auth.data.user) throw new RequestError('Please sign in again.',401);
 const admin=createClient(url,key),user=auth.data.user;
 const account=await admin.from('app_users').select('role,linked_player_id').eq('id',user.id).maybeSingle();
 if(account.error) throw account.error;
 if(!account.data) throw new RequestError('An app account is required.',403);
 const membership=account.data.linked_player_id?await admin.from('league_team_members').select('team_id,is_captain,is_vice_captain').eq('player_id',account.data.linked_player_id):{data:[],error:null};
 if(membership.error) throw membership.error;
 const ballot=await admin.from('competition_handicap_ballots').select('id,phase,method,adjustment,timing').eq('slug','competition-handicaps-2026-27').single();
 if(ballot.error) throw ballot.error;
 const teams=await admin.from('competition_handicap_voters').select('team_id,team_name').eq('ballot_id',ballot.data.id).order('team_name');
 if(teams.error) throw teams.error;
 const managed=new Set((membership.data??[]).filter(m=>m.is_captain||m.is_vice_captain).map(m=>m.team_id));
 return {admin,user,ballot:ballot.data,teams:teams.data??[],managedIds:(teams.data??[]).filter(t=>managed.has(t.team_id)).map(t=>t.team_id),manager:['owner','super','league_secretary','league_chairman'].includes(account.data.role)};
}
function failure(e:unknown){
 if(e instanceof RequestError) return NextResponse.json({error:e.message},{status:e.status,headers});
 if(e&&typeof e==='object'&&'code' in e){
  if(e.code==='23505') return NextResponse.json({error:'A vote has already been recorded for this team in this round. Refresh to see its confirmation.'},{status:409,headers});
  if(e.code==='P0001'&&'message' in e) return NextResponse.json({error:String(e.message)},{status:409,headers});
 }
 console.error('Competition ballot request failed',e);
 return NextResponse.json({error:'The ballot could not be loaded or saved. Please try again.'},{status:500,headers});
}
export async function GET(req:NextRequest){try{
 const c=await context(req);
 const rounds=await c.admin.from('competition_handicap_rounds').select('id,round_no,stage,options,closed_at,winner,totals').eq('ballot_id',c.ballot.id).order('round_no');
 if(rounds.error) throw rounds.error;
 const current=rounds.data?.find(r=>!r.closed_at);
 const votes=current?await c.admin.from('competition_handicap_votes').select('team_id,choice').eq('round_id',current.id):{data:[],error:null};
 if(votes.error) throw votes.error;
 return NextResponse.json({ballot:c.ballot,rounds:rounds.data,teams:c.teams,managedIds:c.managedIds,manager:c.manager,
 submittedTeamIds:(votes.data??[]).map(v=>v.team_id),ownVotes:(votes.data??[]).filter(v=>c.managedIds.includes(v.team_id))},{headers});
}catch(e){return failure(e);}}
export async function POST(req:NextRequest){try{
 const c=await context(req); const raw=await req.text();
 if(raw.length>2000) throw new RequestError('Request is too large.');
 let b;try{b=JSON.parse(raw);}catch{throw new RequestError('Invalid request.');}
 if(!b||typeof b!=='object'||Array.isArray(b)) throw new RequestError('Invalid request.');
 let result;
 if(b.action==='timing'){
  if(!c.manager) throw new RequestError('Only a league officer can open the timing vote.',403);
  result=await c.admin.rpc('open_competition_timing_vote',{p_ballot:c.ballot.id,p_actor:c.user.id});
 }else{
  if(typeof b.round_id!=='string'||!/^[0-9a-f-]{36}$/i.test(b.round_id)) throw new RequestError('Invalid round.');
  const round=await c.admin.from('competition_handicap_rounds').select('id,options,closed_at').eq('id',b.round_id).eq('ballot_id',c.ballot.id).maybeSingle();
  if(round.error) throw round.error;
  if(!round.data||round.data.closed_at) throw new RequestError('This round is no longer open. Refresh the page.',409);
  if(b.action==='vote'){
   if(!c.managedIds.includes(b.team_id)) throw new RequestError('Only the captain or vice-captain of this team can vote.',403);
   if(typeof b.choice!=='string'||!['abstain',...round.data.options].includes(b.choice)) throw new RequestError('Choose an available option.');
   if(b.confirmed!==true) throw new RequestError('Confirm that this is your team’s agreed vote.');
   result=await c.admin.rpc('cast_competition_handicap_vote',{p_round:b.round_id,p_team:b.team_id,p_choice:b.choice,p_actor:c.user.id});
  }else if(b.action==='close'){
   if(!c.manager) throw new RequestError('Only a league officer can close a round.',403);
   if(b.confirmed!==true) throw new RequestError('Confirm that voting should close now.');
   result=await c.admin.rpc('close_competition_handicap_round',{p_round:b.round_id,p_actor:c.user.id});
  }else throw new RequestError('Unknown action.');
 }
 if(result.error) throw result.error;
 return NextResponse.json({ok:true},{headers});
}catch(e){return failure(e);}}
