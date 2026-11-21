import { Router, type IRouter } from "express";
import {
  FootballDataApiError,
  MissingFootballDataApiKeyError,
} from "../services/football-data/client";
import { footballDataService } from "../services/football-data/service";
import type { FootballDataMatch } from "../services/football-data/types";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const competitionPattern = /^[A-Za-z0-9_-]{2,20}$/;
const validStatuses = new Set([
  "SCHEDULED",
  "TIMED",
  "LIVE",
  "IN_PLAY",
  "PAUSED",
  "FINISHED",
  "POSTPONED",
  "SUSPENDED",
  "CANCELLED",
  "AWARDED",
]);

function queryString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isValidDate(value: string): boolean {
  if (!datePattern.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

function errorDetails(error: unknown): { status: number; message: string } {
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

    return {
      status: error.status === 429 ? 503 : 502,
      message: "Football-Data.org could not provide the requested matches.",
    };
  }

  return {
    status: 500,
    message: "Match search failed.",
  };
}

function summarizeMatch(match: FootballDataMatch) {
  return {
    id: match.id,
    utcDate: match.utcDate,
    status: match.status,
    competition: match.competition,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    score: {
      winner: match.score.winner,
      fullTime: match.score.fullTime,
    },
  };
}

router.get("/", async (req, res) => {
  const competition = queryString(req.query.competition);
  const requestedDateFrom = queryString(req.query.dateFrom);
  const requestedDateTo = queryString(req.query.dateTo);
  const status = queryString(req.query.status)?.toUpperCase();
  const rawLimit = queryString(req.query.limit);
  const limit = rawLimit === undefined ? 20 : Number(rawLimit);

  const today = new Date().toISOString().slice(0, 10);
  const twoWeeksFromToday = new Date(Date.now() + 14 * 24 * 60 * 60 * 1_000)
    .toISOString()
    .slice(0, 10);
  const dateFrom =
    requestedDateFrom === undefined && requestedDateTo === undefined
      ? today
      : requestedDateFrom;
  const dateTo =
    requestedDateFrom === undefined && requestedDateTo === undefined
      ? twoWeeksFromToday
      : requestedDateTo;

  const errors: string[] = [];
  if (competition !== undefined && !competitionPattern.test(competition)) {
    errors.push(
      "competition must be 2-20 letters, numbers, underscores, or hyphens.",
    );
  }
  if ((dateFrom === undefined) !== (dateTo === undefined)) {
    errors.push("dateFrom and dateTo must be supplied together.");
  }
  if (dateFrom !== undefined && !isValidDate(dateFrom)) {
    errors.push("dateFrom must use the YYYY-MM-DD format.");
  }
  if (dateTo !== undefined && !isValidDate(dateTo)) {
    errors.push("dateTo must use the YYYY-MM-DD format.");
  }
  if (
    dateFrom !== undefined &&
    dateTo !== undefined &&
    isValidDate(dateFrom) &&
    isValidDate(dateTo) &&
    dateFrom > dateTo
  ) {
    errors.push("dateFrom must be on or before dateTo.");
  }
  if (status !== undefined && !validStatuses.has(status)) {
    errors.push(
      `status must be one of: ${Array.from(validStatuses).join(", ")}.`,
    );
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
    errors.push("limit must be a whole number between 1 and 50.");
  }

  if (errors.length > 0) {
    res.status(400).json({
      error: "Invalid match search request.",
      details: errors,
    });
    return;
  }

  try {
    const query = {
      dateFrom,
      dateTo,
      status,
    };
    const matches = competition
      ? await footballDataService.getCompetitionMatches(competition, query)
      : await footballDataService.getMatches(query);
    const limitedMatches = matches.slice(0, limit);

    res.status(200).json({
      matches: limitedMatches.map(summarizeMatch),
      count: limitedMatches.length,
    });
  } catch (error) {
    const details = errorDetails(error);
    logger.error(
      { status: details.status, error },
      "Match finder request failed",
    );
    res.status(details.status).json({ error: details.message });
  }
});

export default router;