import { calculateSnookerHandicapStarts } from "./snooker-handicap";
export const FRIENDLY_FORMATS = { six_singles: "6 singles", four_singles_one_doubles: "4 singles and 1 doubles" } as const;
export type FriendlyFormat = keyof typeof FRIENDLY_FORMATS;
export type FriendlyPlayer = { id: string; name: string; team_id: string; current: number; suggested: number };
export type FriendlySeason = { id: string; name: string; handicap_max_start?: number | null };
export type FriendlyTeam = { id: string; name: string; season_id: string; venue?: string | null; location_id?: string | null; table_count?: number | null };
export type FriendlyFrame = { home: string; away: string; homeScore: number; awayScore: number; homeIds: string[]; awayIds: string[]; homeStart: number; awayStart: number; homeHandicap: number; awayHandicap: number };
export function frameTypes(format: FriendlyFormat) { return format === "six_singles" ? [1,1,1,1,1,1] : [1,1,1,1,2]; }
export function friendlyHandicap(player: FriendlyPlayer, ownLeague: string, opponentLeague: string, enabled: boolean) {
  if (!enabled) return 0;
  return /division\s*(1|one)\b/i.test(ownLeague) && /premier/i.test(opponentLeague) ? player.suggested + 20 : player.current;
}
export function frameHandicaps(home: FriendlyPlayer[], away: FriendlyPlayer[], homeLeague: FriendlySeason, awayLeague: FriendlySeason, enabled: boolean) {
  const average = (players: FriendlyPlayer[], own: string, opponent: string) => players.reduce((sum,p)=>sum+friendlyHandicap(p,own,opponent,enabled),0)/players.length;
  const h=average(home,homeLeague.name,awayLeague.name), a=average(away,awayLeague.name,homeLeague.name);
  const governingLeague = /premier/i.test(awayLeague.name) ? awayLeague : homeLeague;
  const starts=calculateSnookerHandicapStarts(h,a,governingLeague.handicap_max_start);
  return {homeHandicap:h,awayHandicap:a,homeStart:starts.team1,awayStart:starts.team2};
}
export type Friendly = {
  id: string; host_team_id: string; guest_team_id: string | null; match_date: string;
  start_time: string; venue: string; notes: string; status: "open" | "booked" | "played" | "cancelled";
  can_host: boolean; hosting_team_id: string | null; format: FriendlyFormat; use_handicaps: boolean; frames: FriendlyFrame[]; version: number;
};
export function ukToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function validateOffer(body: Record<string, unknown>, today = ukToday()) {
  const date = String(body.match_date ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date || date < today) throw new Error("Choose a valid date today or later.");
  const time = String(body.start_time ?? "");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Choose a start time.");
  if (typeof body.can_host !== "boolean") throw new Error("Choose whether your team can host.");
  const venue = body.can_host ? String(body.venue ?? "").trim() : "Awaiting a host club";
  const notes = String(body.notes ?? "").trim();
  if (!venue || venue.length > 200) throw new Error("Enter a venue (up to 200 characters).");
  if (notes.length > 1000) throw new Error("Keep notes within 1,000 characters.");
  if (body.format !== "six_singles" && body.format !== "four_singles_one_doubles") throw new Error("Choose one of the two supported formats.");
  if (typeof body.use_handicaps !== "boolean") throw new Error("Choose whether to use current handicaps.");
  return { can_host: body.can_host, match_date: date, start_time: time, venue, notes, format: body.format, use_handicaps: body.use_handicaps };
}
export function validateFrames(value: unknown, row: Friendly, players: FriendlyPlayer[], homeLeague: FriendlySeason, awayLeague: FriendlySeason): FriendlyFrame[] {
  const slots=frameTypes(row.format);
  if (!Array.isArray(value) || value.length !== slots.length) throw new Error(`This format requires exactly ${slots.length} frames.`);
  return value.map((frame,index) => {
    if (!frame || typeof frame !== "object") throw new Error("Invalid frame.");
    const choose=(ids:unknown,team:string|null) => {
      if (!Array.isArray(ids) || ids.length !== slots[index] || new Set(ids).size !== ids.length) throw new Error(`Frame ${index+1} requires ${slots[index]} different player(s) per side.`);
      return ids.map(id=>{const p=players.find(p=>p.id===id && p.team_id===team);if(!p) throw new Error("Choose registered players from the correct team.");return p;});
    };
    const home=choose(frame.homeIds,row.host_team_id),away=choose(frame.awayIds,row.guest_team_id);
    if (home.some(p=>away.some(q=>q.id===p.id))) throw new Error("A player cannot play both sides of a frame.");
    if (![frame.homeScore,frame.awayScore].every(n=>typeof n === "number" && Number.isInteger(n) && n>=0 && n<=999)) throw new Error("Frame scores must be whole numbers from 0 to 999.");
    if (frame.homeScore===frame.awayScore) throw new Error("Finish tied frames before saving the scorecard.");
    const old=row.frames[index];
    // Retain the recorded starts when correcting scores for the same line-up.
    const same=old && JSON.stringify(old.homeIds)===JSON.stringify(frame.homeIds) && JSON.stringify(old.awayIds)===JSON.stringify(frame.awayIds);
    const starts=same ? {homeHandicap:old.homeHandicap,awayHandicap:old.awayHandicap,homeStart:old.homeStart,awayStart:old.awayStart} : frameHandicaps(home,away,homeLeague,awayLeague,row.use_handicaps);
    return {home:home.map(p=>p.name).join(" / "),away:away.map(p=>p.name).join(" / "),homeIds:home.map(p=>p.id),awayIds:away.map(p=>p.id),homeScore:frame.homeScore,awayScore:frame.awayScore,...starts};
  });
}
export function canManageFriendly(row: Friendly, teamIds: string[]) {
  return teamIds.includes(row.host_team_id) || Boolean(row.guest_team_id && teamIds.includes(row.guest_team_id));
}

export function availableFriendlyTables(team: FriendlyTeam | undefined, date: string, teams: FriendlyTeam[], friendlies: Friendly[], leagueReservations: {date:string;location_id?:string|null}[]) {
  if (!team?.location_id || !team.table_count || team.table_count<1) return 0;
  const friendlyCount=friendlies.filter(f=>f.match_date===date&&f.status!=='cancelled'&&f.hosting_team_id&&teams.find(t=>t.id===f.hosting_team_id)?.location_id===team.location_id).length;
  return Math.max(0,team.table_count-friendlyCount-leagueReservations.filter(f=>f.date===date&&f.location_id===team.location_id).length);
}
