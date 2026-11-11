export const VOTE_LABELS: Record<string,string> = {
 p1:'Proposal 1 — Elo suggestion, no adjustment',
 p2:'Proposal 2 — Elo suggestion plus a Division 1 adjustment',
 '8':'+8 points', '12':'+12 points', '16':'+16 points',
 p3:'Proposal 3 — Fixed at the entry closing date',
 p4:'Proposal 4 — Updated when each match is played', abstain:'Abstain',
};
export const stageTitle = (stage:string) => stage==='calculation'?'Choose the handicap calculation':stage==='adjustment'?'Choose the Division 1 adjustment':'Choose when handicaps change';
export type BallotRound = {id:string;round_no:number;stage:string;options:string[];closed_at:string|null;winner:string|null;totals:Record<string,number>|null};
export type VotingBoard = {
 ballot:{id:string;phase:string;method:string|null;adjustment:number|null;timing:string|null};
 rounds:BallotRound[]; teams:{team_id:string;team_name:string}[]; managedIds:string[];
 currentTotals?:Record<string,number>;
 manager:boolean; submittedTeamIds:string[]; ownVotes:{team_id:string;choice:string}[];
};
