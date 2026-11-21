import { z } from "zod";

const nonNegativeNumber = z.number().finite().nonnegative();
const percentageNumber = z.number().finite().min(0).max(100);

const teamFormResultSchema = z
  .object({
    matchId: z.number().int().positive(),
    date: z.string().datetime(),
    opponentId: z.number().int().positive(),
    opponentName: z.string().trim().min(1),
    venue: z.enum(["home", "away"]),
    goalsFor: nonNegativeNumber,
    goalsAgainst: nonNegativeNumber,
    result: z.enum(["W", "D", "L"]),
  })
  .strict();

const teamFormSchema = z
  .object({
    last5: z.array(teamFormResultSchema).max(5),
    last10: z.array(teamFormResultSchema).max(10),
    currentFormScore: percentageNumber,
  })
  .strict();

export const teamStatsSchema = z
  .object({
    teamId: z.number().int().positive().optional(),
    teamName: z.string().trim().min(1),
    leaguePosition: z.number().int().positive().optional(),
    form: teamFormSchema,
    wins: nonNegativeNumber,
    draws: nonNegativeNumber,
    losses: nonNegativeNumber,
    goalsScored: nonNegativeNumber,
    goalsConceded: nonNegativeNumber,
    goalsPerMatch: nonNegativeNumber,
    goalsConcededPerMatch: nonNegativeNumber,
    homeWins: nonNegativeNumber,
    homeDraws: nonNegativeNumber,
    homeLosses: nonNegativeNumber,
    homeGoalsScored: nonNegativeNumber,
    homeGoalsConceded: nonNegativeNumber,
    awayWins: nonNegativeNumber,
    awayDraws: nonNegativeNumber,
    awayLosses: nonNegativeNumber,
    awayGoalsScored: nonNegativeNumber,
    awayGoalsConceded: nonNegativeNumber,
    currentFormScore: percentageNumber,
    matchesAnalyzed: z.number().int().nonnegative(),
  })
  .strict();

export const predictionRequestSchema = z
  .object({
    homeTeam: teamStatsSchema,
    awayTeam: teamStatsSchema,
  })
  .strict();