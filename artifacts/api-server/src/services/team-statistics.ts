import type { FootballDataMatch, FootballDataTeam } from "./football-data/types";
import type {
  MatchResult,
  MatchVenue,
  TeamFormResult,
  TeamStats,
} from "./prediction-types";
import type { FootballDataProvider } from "./football-data/service";

function isFinishedMatch(match: FootballDataMatch): boolean {
  return (
    match.status === "FINISHED" &&
    Number.isFinite(match.score.fullTime.home) &&
    Number.isFinite(match.score.fullTime.away)
  );
}

function resultForTeam(
  match: FootballDataMatch,
  teamId: number,
  goalsFor: number,
  goalsAgainst: number,
): MatchResult {
  if (goalsFor > goalsAgainst) {
    return "W";
  }

  if (goalsFor < goalsAgainst) {
    return "L";
  }

  return "D";
}

function formScore(results: TeamFormResult[]): number {
  if (results.length === 0) {
    return 50;
  }

  const points = results.reduce((total, result) => {
    if (result.result === "W") {
      return total + 3;
    }

    return total + (result.result === "D" ? 1 : 0);
  }, 0);

  return Number(((points / (results.length * 3)) * 100).toFixed(2));
}

export function calculateTeamStatistics(
  team: FootballDataTeam,
  matches: FootballDataMatch[],
  leaguePosition?: number,
): TeamStats {
  const results = matches
    .filter((match) => isFinishedMatch(match))
    .map((match): TeamFormResult => {
      const isHome = match.homeTeam.id === team.id;
      const homeGoals = match.score.fullTime.home as number;
      const awayGoals = match.score.fullTime.away as number;
      const goalsFor = isHome ? homeGoals : awayGoals;
      const goalsAgainst = isHome ? awayGoals : homeGoals;

      return {
        matchId: match.id,
        date: match.utcDate,
        opponentId: isHome ? match.awayTeam.id : match.homeTeam.id,
        opponentName: isHome ? match.awayTeam.name : match.homeTeam.name,
        venue: isHome ? "home" : "away",
        goalsFor,
        goalsAgainst,
        result: resultForTeam(match, team.id, goalsFor, goalsAgainst),
      };
    })
    .sort((left, right) => right.date.localeCompare(left.date));

  const last10 = results.slice(0, 10);
  const last5 = last10.slice(0, 5);
  const homeResults = results.filter((result) => result.venue === "home");
  const awayResults = results.filter((result) => result.venue === "away");

  const totals = results.reduce(
    (summary, result) => {
      summary.goalsScored += result.goalsFor;
      summary.goalsConceded += result.goalsAgainst;

      if (result.result === "W") {
        summary.wins += 1;
      } else if (result.result === "D") {
        summary.draws += 1;
      } else {
        summary.losses += 1;
      }

      return summary;
    },
    {
      wins: 0,
      draws: 0,
      losses: 0,
      goalsScored: 0,
      goalsConceded: 0,
    },
  );

  const venueTotals = (venueResults: TeamFormResult[]) =>
    venueResults.reduce(
      (summary, result) => {
        summary.goalsScored += result.goalsFor;
        summary.goalsConceded += result.goalsAgainst;

        if (result.result === "W") {
          summary.wins += 1;
        } else if (result.result === "D") {
          summary.draws += 1;
        } else {
          summary.losses += 1;
        }

        return summary;
      },
      {
        wins: 0,
        draws: 0,
        losses: 0,
        goalsScored: 0,
        goalsConceded: 0,
      },
    );

  const home = venueTotals(homeResults);
  const away = venueTotals(awayResults);
  const matchesAnalyzed = results.length;

  return {
    teamId: team.id,
    teamName: team.name,
    ...(leaguePosition !== undefined ? { leaguePosition } : {}),
    form: {
      last5,
      last10,
      currentFormScore: formScore(last5),
    },
    wins: totals.wins,
    draws: totals.draws,
    losses: totals.losses,
    goalsScored: totals.goalsScored,
    goalsConceded: totals.goalsConceded,
    goalsPerMatch:
      matchesAnalyzed === 0
        ? 0
        : Number((totals.goalsScored / matchesAnalyzed).toFixed(3)),
    goalsConcededPerMatch:
      matchesAnalyzed === 0
        ? 0
        : Number((totals.goalsConceded / matchesAnalyzed).toFixed(3)),
    homeWins: home.wins,
    homeDraws: home.draws,
    homeLosses: home.losses,
    homeGoalsScored: home.goalsScored,
    homeGoalsConceded: home.goalsConceded,
    awayWins: away.wins,
    awayDraws: away.draws,
    awayLosses: away.losses,
    awayGoalsScored: away.goalsScored,
    awayGoalsConceded: away.goalsConceded,
    currentFormScore: formScore(last5),
    matchesAnalyzed,
  };
}

export async function getTeamStatistics(
  provider: FootballDataProvider,
  team: FootballDataTeam,
  leaguePosition?: number,
): Promise<TeamStats> {
  const matches = await provider.getHistoricalMatches(team.id, {
    status: "FINISHED",
    limit: 10,
  });

  return calculateTeamStatistics(team, matches, leaguePosition);
}

export function findLeaguePosition(
  standings: Array<{
    table: Array<{ position: number; team: FootballDataTeam }>;
  }>,
  teamId: number,
): number | undefined {
  for (const standing of standings) {
    const row = standing.table.find((entry) => entry.team.id === teamId);
    if (row) {
      return row.position;
    }
  }

  return undefined;
}