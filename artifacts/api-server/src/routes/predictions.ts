import { Router, type IRouter } from "express";
import {
  FootballDataApiError,
  MissingFootballDataApiKeyError,
} from "../services/football-data/client";
import { footballDataService } from "../services/football-data/service";
import { calculateMatchPrediction } from "../services/football-prediction";
import {
  findLeaguePosition,
  calculateTeamStatistics,
} from "../services/team-statistics";
import { predictionRequestSchema } from "../services/prediction-validation";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const matchIdPattern = /^[1-9]\d*$/;

function errorDetails(error: unknown): {
  status: number;
  message: string;
} {
  if (error instanceof MissingFootballDataApiKeyError) {
    return {
      status: 503,
      message:
        "Football-Data.org is not configured. Set FOOTBALL_DATA_API_KEY on the server.",
    };
  }

  if (error instanceof FootballDataApiError) {
    if (
      error.status === 401 ||
      (error.status === 400 && /token is invalid/i.test(error.message))
    ) {
      return {
        status: 503,
        message:
          "Football-Data.org rejected the configured API token. Update FOOTBALL_DATA_API_KEY in Replit Secrets.",
      };
    }

    if (error.status === 404) {
      return { status: 404, message: "The requested football match was not found." };
    }

    return {
      status: error.status === 429 ? 503 : 502,
      message: "Football-Data.org could not provide the requested data.",
    };
  }

  return {
    status: 500,
    message: "Prediction calculation failed.",
  };
}

router.post("/", (req, res) => {
  const parsed = predictionRequestSchema.safeParse(req.body);

  if (!parsed.success) {
    logger.warn(
      { issues: parsed.error.issues },
      "Invalid prediction request",
    );
    res.status(400).json({
      error: "Invalid prediction request.",
      details: parsed.error.issues.map((issue) => ({
        path: issue.path,
        message: issue.message,
      })),
    });
    return;
  }

  try {
    const prediction = calculateMatchPrediction(
      parsed.data.homeTeam,
      parsed.data.awayTeam,
    );
    res.status(200).json(prediction);
  } catch (error) {
    logger.error({ error }, "Prediction calculation failed");
    res.status(500).json({ error: "Prediction calculation failed." });
  }
});

router.get("/match/:matchId", async (req, res) => {
  const rawMatchId = req.params.matchId;
  if (
    !matchIdPattern.test(rawMatchId) ||
    !Number.isSafeInteger(Number(rawMatchId))
  ) {
    logger.warn({ matchId: rawMatchId }, "Invalid football match ID");
    res.status(400).json({
      error: "Invalid match ID. Match IDs must be positive integers.",
    });
    return;
  }

  const matchId = Number(rawMatchId);

  try {
    const match = await footballDataService.getMatch(matchId);
    const competitionCode =
      match.competition?.code ?? match.competition?.id;

    const standingsPromise = competitionCode
      ? footballDataService
          .getCompetitionStandings(competitionCode)
          .catch((error: unknown) => {
            logger.warn(
              { competitionCode, error },
              "Could not retrieve competition standings; continuing without league position",
            );
            return undefined;
          })
      : Promise.resolve(undefined);

    const [homeMatches, awayMatches, standings] = await Promise.all([
      footballDataService.getHistoricalMatches(match.homeTeam.id, {
        status: "FINISHED",
        limit: 10,
      }),
      footballDataService.getHistoricalMatches(match.awayTeam.id, {
        status: "FINISHED",
        limit: 10,
      }),
      standingsPromise,
    ]);

    const homePosition = standings
      ? findLeaguePosition(standings.standings, match.homeTeam.id)
      : undefined;
    const awayPosition = standings
      ? findLeaguePosition(standings.standings, match.awayTeam.id)
      : undefined;

    const homeStats = calculateTeamStatistics(
      match.homeTeam,
      homeMatches,
      homePosition,
    );
    const awayStats = calculateTeamStatistics(
      match.awayTeam,
      awayMatches,
      awayPosition,
    );
    const prediction = calculateMatchPrediction(homeStats, awayStats);

    res.status(200).json({
      match: {
        id: match.id,
        utcDate: match.utcDate,
        status: match.status,
        competition: match.competition,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
      },
      homeTeamStats: homeStats,
      awayTeamStats: awayStats,
      prediction,
    });
  } catch (error) {
    const details = errorDetails(error);
    logger.error(
      { matchId, status: details.status, error },
      "Fixture prediction request failed",
    );
    res.status(details.status).json({ error: details.message });
  }
});

export default router;