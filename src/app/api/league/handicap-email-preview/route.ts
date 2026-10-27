import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireLeagueManager } from '@/lib/server-role';
import { buildCaptainHandicapEmail, buildPlayerHandicapEmail, exampleHandicapBatch, type HandicapEmailBatch } from '@/lib/handicap-review-email-template';
import { handicapEmailSite, previousEmailBatch } from '@/lib/handicap-review-emails';
// Read-only: this endpoint never queues, sends, or enables email.
export async function GET(request:NextRequest) {
  const headers={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex'};
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url || !key) return NextResponse.json({error:'Server configuration missing'},{status:500,headers});
  const db=createClient(url,key,{auth:{persistSession:false}});
  const token=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
  if(!token) return NextResponse.json({error:'Unauthorized'},{status:401,headers});
  const {data,error}=await db.auth.getUser(token);
  if(error || !data.user) return NextResponse.json({error:'Unauthorized'},{status:401,headers});
  try {await requireLeagueManager(db,data.user);} catch {return NextResponse.json({error:'Forbidden'},{status:403,headers});}
  try {
    const id=request.nextUrl.searchParams.get('reviewId');
    let b=exampleHandicapBatch(); let previous:HandicapEmailBatch|undefined;
    if(id) {
      const row=await db.from('handicap_email_batches').select('payload').eq('id',id).maybeSingle();
      if(row.error) throw new Error(row.error.message);
      if(!row.data) return NextResponse.json({error:'Review snapshot not found'},{status:404,headers});
      b=row.data.payload;previous=await previousEmailBatch(db,b);
    }
    const site=id?handicapEmailSite():'https://example.invalid';
    const players=b.changes.map(c=>({playerId:c.playerId,...buildPlayerHandicapEmail(b,c.playerId,site,previous)}));
    const changed=new Set(b.changes.map(c=>c.playerId));
    const teamIds=[...new Set(b.members.filter(m=>changed.has(m.playerId)).map(m=>m.teamId))];
    return NextResponse.json({example:!id,sending:false,players,captains:teamIds.map(teamId=>({teamId,...buildCaptainHandicapEmail(b,teamId,site)}))},{headers});
  } catch {return NextResponse.json({error:'Unable to build email preview'},{status:500,headers});}
}
