import { FootballDataClient } from "./client";
import type {
  CompetitionListResponse,
  CompetitionMatchesResponse,
  CompetitionStandingsResponse,
  FootballDataCompetition,
  FootballDataMatch,
  FootballDataTeam,
  TeamMatchesResponse,
} from "./types";

export interface MatchQuery {
  [key: string]: string | number | undefined;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  limit?: number;
}

export interface FootballDataProvider {
  getCompetitions(): Promise<FootballDataCompetition[]>;
  getCompetitionStandings(
    competitionCode: string | number,
  ): Promise<CompetitionStandingsResponse>;
  getCompetitionMatches(
    competitionCode: string | number,
    query?: MatchQuery,
  ): Promise<FootballDataMatch[]>;
  getMatches(query?: MatchQuery): Promise<FootballDataMatch[]>;
  getTeam(teamId: number): Promise<FootballDataTeam>;
  getTeamMatches(teamId: number, query?: MatchQuery): Promise<FootballDataMatch[]>;
  getHistoricalMatches(
    teamId: number,
    query?: MatchQuery,
  ): Promise<FootballDataMatch[]>;
  getMatch(matchId: number): Promise<FootballDataMatch>;
}

export class FootballDataService implements FootballDataProvider {
  constructor(private readonly client: FootballDataClient) {}

  async getCompetitions(): Promise<FootballDataCompetition[]> {
    const response = await this.client.get<CompetitionListResponse>(
      "/competitions",
    );
    return response.competitions;
  }

  getCompetitionStandings(
    competitionCode: string | number,
  ): Promise<CompetitionStandingsResponse> {
    return this.client.get<CompetitionStandingsResponse>(
      `/competitions/${encodeURIComponent(String(competitionCode))}/standings`,
    );
  }

  async getCompetitionMatches(
    competitionCode: string | number,
    query: MatchQuery = {},
  ): Promise<FootballDataMatch[]> {
    const response = await this.client.get<CompetitionMatchesResponse>(
      `/competitions/${encodeURIComponent(String(competitionCode))}/matches`,
      query,
    );
    return response.matches;
  }

  async getMatches(query: MatchQuery = {}): Promise<FootballDataMatch[]> {
    const response = await this.client.get<CompetitionMatchesResponse>(
      "/matches",
      query,
    );
    return response.matches;
  }

  getTeam(teamId: number): Promise<FootballDataTeam> {
    return this.client.get<FootballDataTeam>(`/teams/${teamId}`);
  }

  async getTeamMatches(
    teamId: number,
    query: MatchQuery = {},
  ): Promise<FootballDataMatch[]> {
    const response = await this.client.get<TeamMatchesResponse>(
      `/teams/${teamId}/matches`,
      query,
    );
    return response.matches;
  }

  getHistoricalMatches(
    teamId: number,
    query: MatchQuery = {},
  ): Promise<FootballDataMatch[]> {
    return this.getTeamMatches(teamId, {
      status: "FINISHED",
      limit: 10,
      ...query,
    });
  }

  getMatch(matchId: number): Promise<FootballDataMatch> {
    return this.client.get<FootballDataMatch>(`/matches/${matchId}`);
  }
}

export const footballDataService = new FootballDataService(
  new FootballDataClient(),
);