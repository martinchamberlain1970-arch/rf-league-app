import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { deliverHandicapReviewEmails, emailDeliveryEnabled } from '@/lib/handicap-review-emails';
export const maxDuration=60;
export async function GET(request:NextRequest) {
  if(!process.env.CRON_SECRET || request.headers.get('authorization')!==`Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({error:'Unauthorized'},{status:401});
  const headers={'Cache-Control':'no-store'};
  if(!emailDeliveryEnabled()) return NextResponse.json({enabled:false,sent:0},{headers});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url || !key) return NextResponse.json({error:'Server configuration missing'},{status:500,headers});
  try {return NextResponse.json(await deliverHandicapReviewEmails(createClient(url,key,{auth:{persistSession:false}})),{headers});}
  catch {return NextResponse.json({error:'Handicap email processing failed; inspect the outbox before retrying.'},{status:500,headers});}
}
