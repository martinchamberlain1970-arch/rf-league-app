import type { SupabaseClient } from '@supabase/supabase-js';
import { notificationEmailIsConfigured, sendNotificationEmail } from '@/lib/email';
import { buildCaptainHandicapEmail, buildPlayerHandicapEmail, type HandicapEmailBatch, type HandicapEmail } from '@/lib/handicap-review-email-template';

type Outbox = {id:string; kind:'player'|'captain';player_id:string;team_id:string|null;batch_id:string;payload:HandicapEmail;expected_handicaps:Record<string,number>;recipient:string|null;recipient_user_id:string|null};
function checked<T>(r:{data:T;error:{message:string}|null}):T { if(r.error) throw new Error(r.error.message);return r.data; }
export function emailDeliveryEnabled() {
  const from=process.env.HANDICAP_REVIEW_EMAILS_FROM;
  return process.env.HANDICAP_REVIEW_EMAILS_ENABLED === 'true' && !!from && Number.isFinite(Date.parse(from));
}
export function handicapEmailSite() {
  const site=process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/,'');
  if (!site || new URL(site).protocol!=='https:') throw new Error('A public HTTPS NEXT_PUBLIC_SITE_URL is required');
  return site;
}
export async function previousEmailBatch(db:SupabaseClient,b:HandicapEmailBatch) {
  const rows=checked(await db.from('handicap_email_batches').select('payload').eq('season_id',b.seasonId)
    .lt('completed_at',b.completedAt).order('completed_at',{ascending:false}).limit(1));
  return rows?.[0]?.payload as HandicapEmailBatch|undefined;
}
async function prepare(db:SupabaseClient,site:string) {
  const batches=checked(await db.from('handicap_email_batches').select('id,payload').is('prepared_at',null)
    .gte('completed_at',new Date(process.env.HANDICAP_REVIEW_EMAILS_FROM!).toISOString()).order('completed_at').limit(5));
  for(const row of batches??[]) {
    const b=row.payload as HandicapEmailBatch;
    const previous=await previousEmailBatch(db,b);
    const messages=[];
    for(const c of b.changes.filter(c=>c.before!==c.after)) messages.push({batch_id:b.id,kind:'player',subject_id:c.playerId,player_id:c.playerId,expected_handicaps:{[c.playerId]:c.after},payload:buildPlayerHandicapEmail(b,c.playerId,site,previous)});
    const changedIds=new Set(b.changes.map(c=>c.playerId));
    for(const captain of b.members.filter(m=>m.captain && b.members.some(p=>p.teamId===m.teamId && changedIds.has(p.playerId)))) {
      const roster=new Set(b.members.filter(m=>m.teamId===captain.teamId).map(m=>m.playerId));
      messages.push({batch_id:b.id,kind:'captain',subject_id:captain.teamId,player_id:captain.playerId,team_id:captain.teamId,expected_handicaps:Object.fromEntries(b.changes.filter(c=>roster.has(c.playerId)).map(c=>[c.playerId,c.after])),payload:buildCaptainHandicapEmail(b,captain.teamId,site)});
    }
    if(messages.length) checked(await db.from('handicap_email_outbox').upsert(messages,{onConflict:'batch_id,kind,subject_id,player_id',ignoreDuplicates:true}));
    checked(await db.from('handicap_email_batches').update({prepared_at:new Date().toISOString()}).eq('id',row.id));
  }
}
async function recipient(db:SupabaseClient,row:Outbox) {
  const expected=Object.keys(row.expected_handicaps);
  if(!expected.length) return null;
  const handicaps=checked(await db.from('players').select('id,snooker_handicap,is_archived').in('id',expected));
  if(handicaps?.length!==expected.length || handicaps.some(p=>p.is_archived || p.snooker_handicap!==row.expected_handicaps[p.id])) return null;
  const p=checked(await db.from('players').select('claimed_by,is_archived').eq('id',row.player_id).maybeSingle());
  if(!p?.claimed_by || p.is_archived) return null;
  if(row.kind==='captain') {
    const roster=checked(await db.from('league_team_members').select('player_id').eq('team_id',row.team_id).in('player_id',expected));
    if(new Set(roster?.map(m=>m.player_id)).size!==expected.length) return null;
    const m=checked(await db.from('league_team_members').select('player_id').eq('team_id',row.team_id).eq('player_id',row.player_id).eq('is_captain',true).limit(1));
    if(!m?.length) return null;
  }
  const auth=await db.auth.admin.getUserById(p.claimed_by);
  if(auth.error) {
    if(auth.error.status===404) return null;
    throw new Error('Unable to verify recipient account');
  }
  const user=auth.data.user;
  if(!user?.email_confirmed_at || !user.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email) || (user.banned_until && Date.parse(user.banned_until)>Date.now())) return null;
  return {email:user.email,userId:user.id};
}
export async function deliverHandicapReviewEmails(db:SupabaseClient) {
  // Both gates are required: the enable switch alone cannot release old reviews.
  if(!emailDeliveryEnabled()) return {enabled:false,sent:0};
  if(!notificationEmailIsConfigured()) throw new Error('Verified email sender is not configured');
  await prepare(db,handicapEmailSite());
  let sent=0,skipped=0;
  for(let i=0;i<15;i++) {
    const claimed=checked(await db.rpc('claim_handicap_email')) as Outbox[];
    const row=claimed?.[0]; if(!row) break;
    try {
      const current=await recipient(db,row);
      if(!current || (row.recipient && (current.email!==row.recipient || current.userId!==row.recipient_user_id))) {
        checked(await db.from('handicap_email_outbox').update({status:'skipped',error:'No eligible current recipient, or account/email changed during delivery.'}).eq('id',row.id));skipped++;continue;
      }
      // Freeze the recipient before contacting the provider; retries use identical content/key.
      checked(await db.from('handicap_email_outbox').update({recipient:current.email,recipient_user_id:current.userId}).eq('id',row.id));
      const result=await sendNotificationEmail({to:current.email,...row.payload,idempotencyKey:`handicap-review-${row.id}`});
      if(!result.sent) throw new Error('Email provider did not confirm delivery');
      checked(await db.from('handicap_email_outbox').update({status:'sent',sent_at:new Date().toISOString(),error:null}).eq('id',row.id));sent++;
    } catch {
      // Leave the lease in place. The next worker retries within the provider's key lifetime.
      checked(await db.from('handicap_email_outbox').update({error:'Delivery not confirmed; retry with the same provider idempotency key.'}).eq('id',row.id));
    }
  }
  return {enabled:true,sent,skipped};
}
