import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const meetingSlug = "premier-handicap-2026-27-egm";

export default async function CurrentEgmVotePage() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return <BallotUnavailable message="The EGM ballot is not configured." />;
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const meeting = await admin
    .from("handicap_egm_meetings")
    .select("public_token,status")
    .eq("slug", meetingSlug)
    .maybeSingle();

  if (meeting.error || !meeting.data?.public_token) {
    return <BallotUnavailable message="Tonight’s EGM ballot could not be found." />;
  }

  redirect(`/egm-vote/${meeting.data.public_token}`);
}

function BallotUnavailable({ message }: { message: string }) {
  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-8">
      <section className="mx-auto max-w-2xl rounded-2xl border border-amber-300 bg-white p-6 shadow-sm">
        <p className="text-sm font-bold uppercase tracking-wider text-teal-700">Rack &amp; Frame · EGM ballot</p>
        <h1 className="mt-2 text-2xl font-black">Ballot unavailable</h1>
        <p className="mt-3 leading-7 text-slate-700">{message} Please ask the League Secretary or Chairman to confirm that voting has been enabled.</p>
      </section>
    </main>
  );
}
