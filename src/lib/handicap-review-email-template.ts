export type RatingEvidence = {
  key: string; playerId: string; before: number; after: number; delta: number;
  result: string; recordedAt: string; source: string; type: string; opponent: string; date: string | null;
};
export type HandicapEmailBatch = {
  id: string; seasonId: string; season: string; week: number; completedAt: string;
  previousAt: string | null; nextWeek: number; nextDate: string | null;
  players: { id: string; name: string; rating: number; handicap: number }[];
  members: { playerId: string; teamId: string; captain: boolean; team: string }[];
  changes: { playerId: string; before: number; after: number; reason: string }[];
  events: RatingEvidence[];
};
export type HandicapEmail = { subject: string; text: string; html: string };
export const signed = (n: number) => n > 0 ? `+${n}` : `${n}`;
const escape = (s: string) => s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function ukDate(value: string) {
  return new Date(value.length === 10 ? `${value}T12:00:00Z` : value).toLocaleDateString('en-GB', {timeZone:'Europe/London',day:'numeric',month:'long',year:'numeric'});
}
export function startExplanation(before: number, after: number) {
  const movement = after-before;
  if (!movement) return 'Your playing handicap is unchanged.';
  return movement > 0
    ? `Your start improves by ${movement} points against the same opponent: you receive more start or give less.`
    : `Your start reduces by ${-movement} points against the same opponent: you receive less start or give more.`;
}
function nextReview(b: HandicapEmailBatch) {
  return `Next review: after fixture Week ${b.nextWeek}${b.nextDate ? ` (currently expected after ${ukDate(b.nextDate)})` : ' (fixture date not yet available)'}. The review runs once all fixtures in that week are approved and complete; postponements can delay it.`;
}
function wrap(subject: string, heading: string, paragraphs: string[], body: string): HandicapEmail {
  return {subject, text: [heading,...paragraphs].join('\n\n'),html:`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body style="margin:0;background:#eef3f5;font-family:Arial,sans-serif;color:#172738"><main style="max-width:680px;margin:24px auto;background:white;padding:32px;border-radius:16px"><p style="color:#007e80;font-weight:bold;letter-spacing:2px">RACK &amp; FRAME</p><h1 style="font-size:27px">${escape(heading)}</h1>${body}<p style="font-size:13px;color:#526272">Questions about your record? Contact your captain or the League Secretary.</p></main></body></html>`};
}
export function buildPlayerHandicapEmail(b: HandicapEmailBatch, playerId: string, site: string, previous?: HandicapEmailBatch): HandicapEmail {
  const p=b.players.find(p=>p.id===playerId); const c=b.changes.find(c=>c.playerId===playerId);
  if (!p || !c) throw new Error('Changed player missing from review snapshot');
  const oldEvents=new Map((previous?.events ?? []).map(e=>[e.key,e]));
  const events=b.events.filter(e=>e.playerId===playerId && (previous
    ? !oldEvents.has(e.key) || oldEvents.get(e.key)?.before!==e.before || oldEvents.get(e.key)?.after!==e.after
    : (!b.previousAt || e.recordedAt>b.previousAt)));
  const previousRating=previous?.players.find(x=>x.id===playerId)?.rating;
  const reason=previousRating === undefined
    ? `Your reviewed Elo is ${p.rating}. The published handicap for this Elo band is ${signed(c.after)}. The previous review's exact Elo snapshot is unavailable.`
    : `Your Elo was ${previousRating} at the previous review and is now ${p.rating} (${signed(p.rating-previousRating)}). This places you in the ${signed(c.after)} handicap band.`;
  const explanation=startExplanation(c.before,c.after);
  const effect=`Effective from the completed Week ${b.week} review on ${ukDate(b.completedAt)}. Use your published handicap for subsequent matches; existing recorded results are unchanged. Match caps and doubles rules still apply.`;
  const evidenceNote=previous
    ? 'New or revised rated results since the previous review are listed below. Revised records are labelled; their full Elo movement is not an additional gain or loss.'
    : 'Recorded rating activity since the previous review is shown below. This first email has no earlier saved snapshot, so rebuilt historical results may also appear. Recording dates are not necessarily match dates.';
  const lines=events.map(e=>`${e.date ? ukDate(e.date) : `Recorded ${ukDate(e.recordedAt)}`} · ${e.type} · ${e.result.replace('result_','')} vs ${e.opponent} · Elo ${e.before} → ${e.after} (${signed(e.delta)})${oldEvents.has(e.key)?' · Revised record':''}`);
  const link=`${site}/players/${encodeURIComponent(p.id)}`;
  const paragraphs=[`Hello ${p.name},`,`Your playing handicap: ${signed(c.before)} → ${signed(c.after)}`,explanation,reason,effect,evidenceNote,...(lines.length?lines:['No new rated result records are available for this change.']),`Review reason: ${c.reason}`,'Administrative adjustments, removed results or rebuilt ratings may also affect Elo; the listed movements should not be assumed to explain the entire difference.',nextReview(b),`Full player record: ${link}`,'Questions? Contact your captain or the League Secretary.'];
  const body=paragraphs.map((x,i)=>`<p${i===1?' style="font-size:30px;font-weight:bold;color:#007e80;background:#e9f7f5;padding:20px;border-radius:10px"':''}>${x===`Full player record: ${link}` ? `<a href="${escape(link)}" style="color:#007e80">View your full player record</a>` : escape(x)}</p>`).join('');
  return wrap(`Your handicap: ${signed(c.before)} → ${signed(c.after)} | Week ${b.week}`,`Your handicap review`,paragraphs,body);
}
export function buildCaptainHandicapEmail(b: HandicapEmailBatch, teamId: string, site: string): HandicapEmail {
  const members=b.members.filter(m=>m.teamId===teamId); const ids=new Set(members.map(m=>m.playerId));
  const changes=b.changes.filter(c=>ids.has(c.playerId));
  const team=members[0]?.team ?? 'Your team';
  const lines=changes.map(c=>`${b.players.find(p=>p.id===c.playerId)?.name ?? 'Player'}: ${signed(c.before)} → ${signed(c.after)}. ${startExplanation(c.before,c.after).replaceAll('Your','Their').replaceAll('you ','they ')}`);
  const paragraphs=[`${team} — Week ${b.week} review`,`${changes.length} player handicap${changes.length===1?' has':'s have'} changed.`,...lines,`Effective from the review completed on ${ukDate(b.completedAt)}. Please use the published handicaps for subsequent matches, subject to the usual match caps and doubles rules.`, 'Players with a registered account and a confirmed current email are eligible for an individual explanation. Please pass the changes to players who do not receive an email.',nextReview(b),`Published handicaps: ${site}/display/handicaps?seasonId=${encodeURIComponent(b.seasonId)}`];
  return wrap(`${team}: handicap changes | Week ${b.week}`,'Your team’s handicap review',paragraphs,paragraphs.map(x=>`<p>${x.startsWith('Published handicaps: ') ? `<a href="${escape(x.slice('Published handicaps: '.length))}" style="color:#007e80">View published handicaps</a>` : escape(x)}</p>`).join(''));
}
export function exampleHandicapBatch(): HandicapEmailBatch {
  return {id:'example',seasonId:'example',season:'Premier League 2026/2027',week:8,completedAt:'2026-11-01T12:00:00Z',previousAt:'2026-10-01T12:00:00Z',nextWeek:12,nextDate:null,
    players:[{id:'example-player',name:'Alex Example',rating:960,handicap:8},{id:'example-captain',name:'Sam Example',rating:1000,handicap:0}],
    members:[{playerId:'example-player',teamId:'example-team',captain:false,team:'Example Snooker Club'},{playerId:'example-captain',teamId:'example-team',captain:true,team:'Example Snooker Club'}],
    changes:[{playerId:'example-player',before:12,after:8,reason:'Scheduled review after fixture Week 8.'}],
    events:[{key:'demo',playerId:'example-player',before:940,after:960,delta:20,result:'result_win',recordedAt:'2026-10-20T22:00:00Z',source:'league',type:'singles',opponent:'Jamie Example',date:'2026-10-20'}]};
}
