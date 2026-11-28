import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { connection } from "next/server";
import { competitionDeadlineLabel, competitionEntriesOpen } from "@/lib/fixed-competition-handicaps";
import { isLeagueCup, knockoutBestOf, knockoutRoundLabel, knockoutSize } from "@/lib/knockout-draw";
import { competitionEntryFormat, entrantsRequired, isHamiltonCompetitionName, isMickWhiteCompetitionName, specialCompetitionScoring } from "@/lib/public-competition-entry";
import { fetchAllSupabasePages } from "@/lib/supabase-pagination";

export const metadata = { title: "Cup entry totals | Rack & Frame" };

type EntryCountRow = { competition_id: string; status: "approved" | "pending" };

async function loadCompetitionCounts() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Competition updates are unavailable.");

  const client = createClient(url, key, {
    global: { fetch: (input, init) => fetch(input, { ...init, next: { revalidate: 60 } }) },
  });
  const [seasons, competitions] = await Promise.all([
    client.from("league_seasons").select("name").eq("is_active", true).eq("is_published", true),
    client.from("competitions")
      .select("id,name,sport_type,match_mode,best_of,knockout_round_best_of,signup_open,signup_deadline")
      .eq("competition_format", "knockout").eq("is_archived", false).eq("is_completed", false)
      .or("signup_open.eq.true,signup_deadline.not.is.null").order("name"),
  ]);
  if (seasons.error || competitions.error) throw new Error("Competition updates are unavailable.");

  const labels = new Set(seasons.data.flatMap(({ name }) => name.match(/\b\d{4}\/\d{4}$/)?.[0] ?? []));
  const current = competitions.data.filter(({ name }) => labels.has(name.match(/\s-\s(\d{4}\/\d{4})$/)?.[1] ?? ""));
  if (!current.length) return [];

  const entries = await fetchAllSupabasePages<EntryCountRow>((from, to) =>
    client.from("competition_entries").select("competition_id,status")
      .in("competition_id", current.map(({ id }) => id))
      .in("status", ["approved", "pending"]).order("id").range(from, to)
  );
  if (entries.error) throw new Error("Competition updates are unavailable.");

  const counts = new Map<string, { approved: number; pending: number }>();
  for (const entry of entries.data ?? []) {
    const total = counts.get(entry.competition_id) ?? { approved: 0, pending: 0 };
    total[entry.status] += 1;
    counts.set(entry.competition_id, total);
  }

  return current.map((competition) => {
    const { id, name, signup_open, signup_deadline, knockout_round_best_of, best_of } = competition;
    const { approved, pending } = counts.get(id) ?? { approved: 0, pending: 0 };
    const forecast = knockoutSize(approved + pending);
    const size = isMickWhiteCompetitionName(name) ? 3 : entrantsRequired(competition);
    const format = competitionEntryFormat(competition);
    const final = knockoutBestOf(knockout_round_best_of, best_of, 1, 1);
    const semi = knockoutBestOf(knockout_round_best_of, best_of, 1, 2);
    const scoring = isHamiltonCompetitionName(name)
      ? "Handicapped billiards. Points targets will be confirmed before the draw."
      : specialCompetitionScoring(name) ?? (best_of === semi && semi === final
        ? `Best of ${best_of} frames`
        : `Best of ${best_of} early · Best of ${semi} in the semi-finals · Best of ${final} in the final`);
    return {
      id, name, approved, pending, forecast, scoring, size, format,
      open: signup_open && competitionEntriesOpen(signup_deadline),
      deadline: signup_deadline ? competitionDeadlineLabel(signup_deadline) : null,
      extraNeeded: isLeagueCup(name) ? Math.max(0, 4 - approved - pending) : 0,
    };
  });
}

function entryUnit(size: number, count: number) {
  return size === 3 ? (count === 1 ? "team" : "teams") : size === 2 ? (count === 1 ? "pair" : "pairs") : (count === 1 ? "player" : "players");
}

export default async function CompetitionEntriesOverview() {
  await connection();
  const competitions = await loadCompetitionCounts().catch(() => null);
  const total = competitions?.reduce((sum, row) => sum + row.approved + row.pending, 0);
  const anyOpen = competitions?.some((row) => row.open);

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <header className="rounded-3xl bg-slate-950 p-6 text-white">
          <p className="text-xs font-semibold uppercase tracking-widest text-teal-300">Rack &amp; Frame</p>
          <h1 className="mt-2 text-3xl font-bold">Competition entries</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            The projected rounds and byes use entries received so far. Pairings will be announced after the league runs the official draw.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            {total !== undefined && competitions?.length ? <strong>{total} {total === 1 ? "entry" : "entries"} received</strong> : null}
            {anyOpen ? <Link href="/competition-entry" className="font-semibold text-teal-200 underline underline-offset-4">Captains’ entry form</Link> : null}
          </div>
        </header>

        {!competitions ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm">Entry totals are temporarily unavailable. Please try again later.</p>
        ) : !competitions.length ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm">There are no current competitions to show.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {competitions.map(({ id, name, approved, pending, forecast, scoring, size, format, open, deadline, extraNeeded }) => {
              const count = approved + pending;
              return (
                <article key={id} className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="font-semibold">{name.replace(/\s-\s\d{4}\/\d{4}$/, "")}</h2>
                      <p className="mt-1 text-sm text-slate-600">{format.sport} · {format.mode} · Knockout</p>
                    </div>
                    <p className="font-bold text-teal-900">{count} {entryUnit(size, count)}</p>
                  </div>
                  {pending ? <p className="mt-1 text-xs text-slate-600">{pending} awaiting approval</p> : null}
                  <p className="mt-3 text-sm text-slate-700">
                    {forecast.rounds
                      ? `${forecast.rounds} ${forecast.rounds === 1 ? "round" : "rounds"} including the final · ${knockoutRoundLabel(1, forecast.rounds)} opening · ${forecast.byes} ${forecast.byes === 1 ? "bye" : "byes"}`
                      : "A knockout draw needs at least two entries."}
                  </p>
                  <p className="mt-1 text-sm text-slate-700">{scoring}</p>
                  {extraNeeded ? <p className="mt-2 text-sm text-amber-900">
                    {open
                      ? `${extraNeeded} more for a standard knockout that meets Rule 30.`
                      : "The league will confirm the format under Rule 30."}
                  </p> : null}
                  <p className="mt-3 text-xs text-slate-600">{open ? deadline ? `Entries close ${deadline} (UK time)` : "Entries open" : "Entries closed"}</p>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
