export interface FootballDataTeam {
  id: number;
  name: string;
  shortName?: string;
  tla?: string;
  crest?: string;
}

export interface FootballDataScore {
  winner?: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;
  duration?: string;
  fullTime: {
    home: number | null;
    away: number | null;
  };
  halfTime?: {
    home: number | null;
    away: number | null;
  };
}

export interface FootballDataCompetition {
  id: number;
  name: string;
  code?: string;
  type?: string;
}

export interface FootballDataMatch {
  id: number;
  utcDate: string;
  status: string;
  homeTeam: FootballDataTeam;
  awayTeam: FootballDataTeam;
  score: FootballDataScore;
  competition?: FootballDataCompetition;
}

export interface CompetitionListResponse {
  competitions: FootballDataCompetition[];
}

export interface CompetitionMatchesResponse {
  matches: FootballDataMatch[];
}

export interface TeamMatchesResponse {
  matches: FootballDataMatch[];
}

export interface CompetitionStanding {
  position: number;
  team: FootballDataTeam;
  playedGames: number;
  won: number;
  draw: number;
  lost: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
}

export interface CompetitionStandingsResponse {
  standings: Array<{
    stage?: string;
    type?: string;
    group?: string | null;
    table: CompetitionStanding[];
  }>;
}