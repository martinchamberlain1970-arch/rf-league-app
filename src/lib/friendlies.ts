export type FriendlyFrame = { home: string; away: string; homeScore: number; awayScore: number };
export type Friendly = {
  id: string; host_team_id: string; guest_team_id: string | null; match_date: string;
  start_time: string; venue: string; notes: string; status: "open" | "booked" | "played" | "cancelled";
  frames: FriendlyFrame[]; version: number;
};
export function ukToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function validateOffer(body: Record<string, unknown>, today = ukToday()) {
  const date = String(body.match_date ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date || date < today) throw new Error("Choose a valid date today or later.");
  const time = String(body.start_time ?? "");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Choose a start time.");
  const venue = String(body.venue ?? "").trim();
  const notes = String(body.notes ?? "").trim();
  if (!venue || venue.length > 200) throw new Error("Enter a venue (up to 200 characters).");
  if (notes.length > 1000) throw new Error("Keep notes within 1,000 characters.");
  return { match_date: date, start_time: time, venue, notes };
}
export function validateFrames(value: unknown): FriendlyFrame[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 30) throw new Error("Record between 1 and 30 frames.");
  return value.map(frame => {
    if (!frame || typeof frame !== "object") throw new Error("Invalid frame.");
    const home = String(frame.home ?? "").trim(), away = String(frame.away ?? "").trim();
    if (!home || !away || home.length > 120 || away.length > 120) throw new Error("Enter both player names for every frame (up to 120 characters).");
    if (![frame.homeScore, frame.awayScore].every(n => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 999)) throw new Error("Frame scores must be whole numbers from 0 to 999.");
    if (frame.homeScore === frame.awayScore) throw new Error("Finish tied frames before saving the scorecard.");
    return {home, away, homeScore: frame.homeScore, awayScore: frame.awayScore};
  });
}
export function canManageFriendly(row: Friendly, teamIds: string[]) {
  return teamIds.includes(row.host_team_id) || Boolean(row.guest_team_id && teamIds.includes(row.guest_team_id));
}
