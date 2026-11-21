export type MatchResult = "W" | "D" | "L";

export type MatchVenue = "home" | "away";

export interface TeamFormResult {
  matchId: number;
  date: string;
  opponentId: number;
  opponentName: string;
  venue: MatchVenue;
  goalsFor: number;
  goalsAgainst: number;
  result: MatchResult;
}

export interface TeamForm {
  last5: TeamFormResult[];
  last10: TeamFormResult[];
  currentFormScore: number;
}

export interface TeamStats {
  teamId?: number;
  teamName: string;
  leaguePosition?: number;
  form: TeamForm;
  wins: number;
  draws: number;
  losses: number;
  goalsScored: number;
  goalsConceded: number;
  goalsPerMatch: number;
  goalsConcededPerMatch: number;
  homeWins: number;
  homeDraws: number;
  homeLosses: number;
  homeGoalsScored: number;
  homeGoalsConceded: number;
  awayWins: number;
  awayDraws: number;
  awayLosses: number;
  awayGoalsScored: number;
  awayGoalsConceded: number;
  currentFormScore: number;
  matchesAnalyzed: number;
}

export interface PredictionFactor {
  key:
    | "recentForm"
    | "attackingStrength"
    | "defensiveStrength"
    | "homeAdvantage"
    | "venuePerformance"
    | "leaguePosition";
  label: string;
  weight: number;
  value: number;
  contribution: number;
  description: string;
}

export interface PredictionMarket {
  market: string;
  selection: string;
  probability: number;
}

export interface MatchPrediction {
  homeWin: number;
  draw: number;
  awayWin: number;
  over1_5: number;
  over2_5: number;
  under2_5: number;
  bttsYes: number;
  bttsNo: number;
  homeCleanSheet: number;
  awayCleanSheet: number;
  homeExpectedGoals: number;
  awayExpectedGoals: number;
  confidence: number;
  methodology: string;
  factors: PredictionFactor[];
  markets: PredictionMarket[];
  limitations: string[];
}