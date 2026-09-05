"use client";

export type LeagueStandingRow = {
  team_id: string;
  team_name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  frames_for: number;
  frames_against: number;
  frame_diff: number;
  points: number;
  streak: string;
  last_five: string;
};

export type PlayerPerformance = {
  appearances: number;
  played: number;
  won: number;
  lost: number;
  points_for: number;
  points_against: number;
  win_pct: number;
};

export type PlayerSummaryRow = {
  player_id: string;
  player_name: string;
  team_name: string;
  singles?: PlayerPerformance;
  doubles?: PlayerPerformance;
  total?: PlayerPerformance;
  rank: number | null;
};

export type PlayerTableMode = "all" | "singles" | "doubles" | "total";

export function LeagueStandings({ rows, onSelectTeam }: { rows: LeagueStandingRow[]; onSelectTeam: (teamId: string) => void }) {
  return (
    <section className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-white to-emerald-50 p-4 shadow-sm">
      <h2 className="text-lg font-semibold text-emerald-900">League Table</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-slate-600">
            {['#', 'Team', 'P', 'W', 'D', 'L', 'FF', 'FA', 'FD', 'Points', 'Streak', 'Last 5'].map((heading) => <th key={heading} className="px-2 py-2">{heading}</th>)}
          </tr></thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.team_id} className="border-b border-slate-100 text-slate-800">
                <td className="px-2 py-2">{index + 1}</td>
                <td className="px-2 py-2"><button type="button" className="text-left underline decoration-slate-300 underline-offset-2 hover:text-slate-900" onClick={() => onSelectTeam(row.team_id)}>{row.team_name}</button></td>
                <td className="px-2 py-2">{row.played}</td><td className="px-2 py-2">{row.won}</td><td className="px-2 py-2">{row.drawn}</td><td className="px-2 py-2">{row.lost}</td>
                <td className="px-2 py-2">{row.frames_for}</td><td className="px-2 py-2">{row.frames_against}</td><td className="px-2 py-2">{row.frame_diff}</td>
                <td className="px-2 py-2 font-semibold">{row.points}</td><td className="px-2 py-2">{row.streak}</td><td className="px-2 py-2">{row.last_five}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? <p className="mt-2 text-sm text-slate-600">No table rows yet for this league.</p> : null}
      </div>
    </section>
  );
}

type PlayerTableProps = {
  hasSeason: boolean;
  seasonName: string;
  singlesCount: number;
  doublesCount: number;
  mode: PlayerTableMode;
  rows: PlayerSummaryRow[];
  onModeChange: (mode: PlayerTableMode) => void;
  onSelectPlayer: (playerId: string) => void;
};

const metricHeadings = ['App', 'Played', 'Won', 'Lost', 'PF', 'PA', 'Win %'];

function MetricCells({ performance, compact = false }: { performance?: PlayerPerformance; compact?: boolean }) {
  const cellClass = compact ? "px-2 py-2 text-center" : "px-3 py-2 text-center";
  return <><td className={cellClass}>{performance?.appearances ?? 0}</td><td className={cellClass}>{performance?.played ?? 0}</td><td className={cellClass}>{performance?.won ?? 0}</td><td className={cellClass}>{performance?.lost ?? 0}</td><td className={cellClass}>{performance?.points_for ?? 0}</td><td className={cellClass}>{performance?.points_against ?? 0}</td><td className={cellClass}>{(performance?.win_pct ?? 0).toFixed(1)}%</td></>;
}

export function LeaguePlayerTable({ hasSeason, seasonName, singlesCount, doublesCount, mode, rows, onModeChange, onSelectPlayer }: PlayerTableProps) {
  return (
    <section className="rounded-2xl border border-violet-200 bg-gradient-to-br from-white to-violet-50 p-4 shadow-sm">
      <h2 className="text-lg font-semibold text-violet-900">Player Table</h2>
      {hasSeason ? <>
        <p className="mt-1 text-[11px] text-slate-600">Ranking is based on Singles results.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-medium text-violet-900">{seasonName}</span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700">{doublesCount > 0 ? `${singlesCount} singles + ${doublesCount} doubles` : `${singlesCount} singles only`}</span>
          <div className="ml-auto flex flex-wrap gap-2">
            {([{ key: "all", label: "Full table", hidden: doublesCount === 0 }, { key: "singles", label: "Singles" }, { key: "doubles", label: "Doubles", hidden: doublesCount === 0 }, { key: "total", label: "Overall", hidden: doublesCount === 0 }] as Array<{ key: PlayerTableMode; label: string; hidden?: boolean }>).map((option) => option.hidden ? null : (
              <button key={option.key} type="button" onClick={() => onModeChange(option.key)} className={`rounded-full border px-3 py-1 text-xs font-medium transition ${mode === option.key ? "border-violet-700 bg-violet-700 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>{option.label}</button>
            ))}
          </div>
        </div>
        <div className="mt-3 overflow-auto rounded-xl border border-slate-200 bg-white">
          <table className={`${mode === "all" ? "min-w-[1380px]" : "w-full table-fixed"} border-collapse text-xs`}>
            <thead>{mode === "all" ? <>
              <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500"><th className="w-14 px-3 py-2 text-center" rowSpan={2}>Rank</th><th className="w-[180px] px-2 py-2" rowSpan={2}>Player</th><th className="w-[140px] whitespace-nowrap px-2 py-2" rowSpan={2}>Team</th><th className="px-3 py-2 text-center text-violet-800" colSpan={7}>Singles</th><th className="px-3 py-2 text-center text-indigo-800" colSpan={7}>Doubles</th><th className="px-3 py-2 text-center text-emerald-800" colSpan={7}>Total</th></tr>
              <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-600">{[...metricHeadings, ...metricHeadings, ...metricHeadings].map((heading, index) => <th key={`${heading}-${index}`} className="w-16 px-3 py-1.5 text-center">{heading}</th>)}</tr>
            </> : <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-600"><th className="w-12 px-2 py-2 text-center">Rank</th><th className="w-[170px] px-2 py-2">Player</th><th className="w-[240px] px-2 py-2">Team</th>{metricHeadings.map((heading) => <th key={heading} className="w-14 px-2 py-2 text-center">{heading}</th>)}</tr>}</thead>
            <tbody>
              {rows.map((row) => {
                const selected = mode === "singles" ? row.singles : mode === "doubles" ? row.doubles : row.total;
                return <tr key={row.player_id} className="border-b border-slate-100 text-slate-800"><td className="px-3 py-2 text-center font-semibold">{row.rank ?? "-"}</td><td className="px-2 py-2"><button type="button" onClick={() => onSelectPlayer(row.player_id)} className="block truncate text-left underline decoration-violet-200 underline-offset-2 hover:text-violet-800" title={row.player_name}>{row.player_name}</button></td><td className="truncate whitespace-nowrap px-2 py-2" title={row.team_name}>{row.team_name}</td>{mode === "all" ? <><MetricCells performance={row.singles} /><MetricCells performance={row.doubles} /><MetricCells performance={row.total} /></> : <MetricCells performance={selected} compact />}</tr>;
              })}
              {!rows.length ? <tr><td className="px-2 py-2 text-slate-500" colSpan={mode === "all" ? 24 : 10}>No player data yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </> : <p className="mt-2 text-sm text-slate-600">Select a published league to view player statistics.</p>}
    </section>
  );
}
