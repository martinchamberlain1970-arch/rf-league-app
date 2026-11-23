import { NextRequest, NextResponse } from 'next/server';
import { fixedHandicapCompetitionNames } from '@/lib/fixed-competition-handicaps';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: 'Missing configuration' }, { status: 500 });
  const client = createClient(url, key);
  const { error } = await client.rpc('process_competition_vote_deadlines');
  if (error) {
    console.error('Competition vote deadline processing failed', error);
    return NextResponse.json({ error: 'Could not process deadlines' }, { status: 500 });
  }
  const competitions = await client.from('competitions').select('id')
    .in('name', [...fixedHandicapCompetitionNames]).eq('is_archived', false).eq('is_completed', false)
    .lte('signup_deadline', new Date().toISOString());
  if (competitions.error) return NextResponse.json({ error: 'Could not check competition closing dates' }, { status: 500 });
  const locks = await Promise.all(competitions.data.map(({ id }) => client.rpc('lock_2026_competition_handicaps', { p_competition_id: id })));
  if (locks.some((lock) => lock.error)) return NextResponse.json({ error: 'Could not fix competition handicaps' }, { status: 500 });
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
