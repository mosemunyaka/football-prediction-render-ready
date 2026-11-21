import assert from "node:assert/strict";
import { createServer, request as httpRequest, type Server } from "node:http";
import { after, before, describe, it } from "node:test";
import app from "./app";
import { FootballDataClient } from "./services/football-data/client";
import { calculateMatchPrediction } from "./services/football-prediction";
import type {
  FootballDataMatch,
  FootballDataTeam,
} from "./services/football-data/types";
import {
  calculateTeamStatistics,
} from "./services/team-statistics";
import type { TeamStats } from "./services/prediction-types";

function useFootballDataCredentials(token?: string, legacyKey?: string) {
  const originalToken = process.env.FOOTBALL_DATA_API_TOKEN;
  const originalKey = process.env.FOOTBALL_DATA_API_KEY;

  if (token === undefined) {
    delete process.env.FOOTBALL_DATA_API_TOKEN;
  } else {
    process.env.FOOTBALL_DATA_API_TOKEN = token;
  }

  if (legacyKey === undefined) {
    delete process.env.FOOTBALL_DATA_API_KEY;
  } else {
    process.env.FOOTBALL_DATA_API_KEY = legacyKey;
  }

  return () => {
    if (originalToken === undefined) {
      delete process.env.FOOTBALL_DATA_API_TOKEN;
    } else {
      process.env.FOOTBALL_DATA_API_TOKEN = originalToken;
    }
    if (originalKey === undefined) {
      delete process.env.FOOTBALL_DATA_API_KEY;
    } else {
      process.env.FOOTBALL_DATA_API_KEY = originalKey;
    }
  };
}

function requestJson(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {},
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      url,
      {
        method: options.method ?? "GET",
        headers: options.headers,
      },
      (response) => {
        let rawBody = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          rawBody += chunk;
        });
        response.on("end", () => {
          try {
            resolve({
              status: response.statusCode ?? 0,
              body: JSON.parse(rawBody),
            });
          } catch {
            resolve({
              status: response.statusCode ?? 0,
              body: rawBody,
            });
          }
        });
      },
    );

    request.on("error", reject);
    if (options.body !== undefined) {
      request.write(options.body);
    }
    request.end();
  });
}

function makeTeamStats(
  name: string,
  overrides: Partial<TeamStats> = {},
): TeamStats {
  return {
    teamId: name === "Home" ? 1 : 2,
    teamName: name,
    leaguePosition: name === "Home" ? 5 : 8,
    form: {
      last5: [],
      last10: [],
      currentFormScore: 50,
    },
    wins: 4,
    draws: 2,
    losses: 4,
    goalsScored: 14,
    goalsConceded: 12,
    goalsPerMatch: 1.4,
    goalsConcededPerMatch: 1.2,
    homeWins: 3,
    homeDraws: 1,
    homeLosses: 1,
    homeGoalsScored: 8,
    homeGoalsConceded: 4,
    awayWins: 1,
    awayDraws: 1,
    awayLosses: 3,
    awayGoalsScored: 6,
    awayGoalsConceded: 8,
    currentFormScore: 50,
    matchesAnalyzed: 10,
    ...overrides,
  };
}

function assertPredictionInvariants(prediction: ReturnType<typeof calculateMatchPrediction>): void {
  const probabilityKeys = [
    "homeWin",
    "draw",
    "awayWin",
    "over1_5",
    "over2_5",
    "under2_5",
    "bttsYes",
    "bttsNo",
    "homeCleanSheet",
    "awayCleanSheet",
    "confidence",
  ] as const;

  for (const key of probabilityKeys) {
    assert.ok(
      prediction[key] >= 0 && prediction[key] <= 100,
      `${key} must be between 0 and 100`,
    );
  }

  assert.equal(
    prediction.homeWin + prediction.draw + prediction.awayWin,
    100,
  );
  assert.equal(prediction.over2_5 + prediction.under2_5, 100);
  assert.equal(prediction.bttsYes + prediction.bttsNo, 100);
  assert.ok(prediction.homeExpectedGoals >= 0);
  assert.ok(prediction.awayExpectedGoals >= 0);
  assert.equal(
    prediction.factors.reduce((total, factor) => total + factor.weight, 0),
    100,
  );
}

describe("football prediction engine", () => {
  it("handles normal balanced teams", () => {
    const prediction = calculateMatchPrediction(
      makeTeamStats("Home"),
      makeTeamStats("Away"),
    );

    assertPredictionInvariants(prediction);
    assert.ok(prediction.homeWin > prediction.awayWin);
  });

  it("favors a strong home team over a weak away team", () => {
    const prediction = calculateMatchPrediction(
      makeTeamStats("Home", {
        leaguePosition: 1,
        currentFormScore: 90,
        goalsPerMatch: 2.6,
        goalsConcededPerMatch: 0.5,
        homeWins: 5,
        homeDraws: 0,
        homeLosses: 0,
        homeGoalsScored: 13,
        homeGoalsConceded: 2,
      }),
      makeTeamStats("Away", {
        leaguePosition: 18,
        currentFormScore: 20,
        goalsPerMatch: 0.5,
        goalsConcededPerMatch: 2.4,
        awayWins: 0,
        awayDraws: 1,
        awayLosses: 4,
        awayGoalsScored: 2,
        awayGoalsConceded: 11,
      }),
    );

    assertPredictionInvariants(prediction);
    assert.ok(prediction.homeWin > prediction.awayWin);
    assert.ok(prediction.homeExpectedGoals > prediction.awayExpectedGoals);
  });

  it("handles a strong away team against a weak home team", () => {
    const prediction = calculateMatchPrediction(
      makeTeamStats("Home", {
        leaguePosition: 18,
        currentFormScore: 20,
        goalsPerMatch: 0.5,
        goalsConcededPerMatch: 2.4,
        homeWins: 0,
        homeDraws: 1,
        homeLosses: 4,
        homeGoalsScored: 2,
        homeGoalsConceded: 11,
      }),
      makeTeamStats("Away", {
        leaguePosition: 1,
        currentFormScore: 90,
        goalsPerMatch: 2.6,
        goalsConcededPerMatch: 0.5,
        awayWins: 5,
        awayDraws: 0,
        awayLosses: 0,
        awayGoalsScored: 13,
        awayGoalsConceded: 2,
      }),
    );

    assertPredictionInvariants(prediction);
    assert.ok(prediction.awayWin > prediction.homeWin);
    assert.ok(prediction.awayExpectedGoals > prediction.homeExpectedGoals);
  });

  it("keeps two evenly matched teams close and valid", () => {
    const team = makeTeamStats("Home", {
      leaguePosition: 7,
      currentFormScore: 50,
    });
    const prediction = calculateMatchPrediction(
      team,
      makeTeamStats("Away", { leaguePosition: 7 }),
    );

    assertPredictionInvariants(prediction);
    assert.ok(prediction.homeWin > prediction.awayWin);
  });

  it("handles low-data inputs without negative or invalid outputs", () => {
    const emptyStats = makeTeamStats("Home", {
      leaguePosition: undefined,
      form: { last5: [], last10: [], currentFormScore: 50 },
      currentFormScore: 50,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsScored: 0,
      goalsConceded: 0,
      goalsPerMatch: 0,
      goalsConcededPerMatch: 0,
      homeWins: 0,
      homeDraws: 0,
      homeLosses: 0,
      homeGoalsScored: 0,
      homeGoalsConceded: 0,
      awayWins: 0,
      awayDraws: 0,
      awayLosses: 0,
      awayGoalsScored: 0,
      awayGoalsConceded: 0,
      matchesAnalyzed: 0,
    });

    assertPredictionInvariants(
      calculateMatchPrediction(emptyStats, makeTeamStats("Away", emptyStats)),
    );
  });

  it("handles zero-goal teams with a non-negative Poisson floor", () => {
    const zeroGoals = makeTeamStats("Home", {
      goalsScored: 0,
      goalsConceded: 0,
      goalsPerMatch: 0,
      goalsConcededPerMatch: 0,
      homeGoalsScored: 0,
      homeGoalsConceded: 0,
      awayGoalsScored: 0,
      awayGoalsConceded: 0,
      matchesAnalyzed: 5,
    });

    const prediction = calculateMatchPrediction(
      zeroGoals,
      makeTeamStats("Away", zeroGoals),
    );

    assertPredictionInvariants(prediction);
    assert.ok(prediction.homeExpectedGoals > 0);
    assert.ok(prediction.awayExpectedGoals > 0);
  });

  it("handles very high-scoring teams without unbounded expected goals", () => {
    const highScoring = makeTeamStats("Home", {
      goalsPerMatch: 30,
      goalsConcededPerMatch: 20,
      homeGoalsScored: 150,
      homeGoalsConceded: 20,
    });

    const prediction = calculateMatchPrediction(
      highScoring,
      makeTeamStats("Away", {
        goalsPerMatch: 25,
        goalsConcededPerMatch: 30,
        awayGoalsScored: 125,
        awayGoalsConceded: 30,
      }),
    );

    assertPredictionInvariants(prediction);
    assert.ok(prediction.homeExpectedGoals <= 8);
    assert.ok(prediction.awayExpectedGoals <= 8);
  });

  it("handles extreme differences in team strength", () => {
    const prediction = calculateMatchPrediction(
      makeTeamStats("Home", {
        leaguePosition: 1,
        currentFormScore: 100,
        goalsPerMatch: 8,
        goalsConcededPerMatch: 0.1,
        homeWins: 10,
        homeDraws: 0,
        homeLosses: 0,
        homeGoalsScored: 80,
        homeGoalsConceded: 1,
      }),
      makeTeamStats("Away", {
        leaguePosition: 20,
        currentFormScore: 0,
        goalsPerMatch: 0.1,
        goalsConcededPerMatch: 8,
        awayWins: 0,
        awayDraws: 0,
        awayLosses: 10,
        awayGoalsScored: 1,
        awayGoalsConceded: 80,
      }),
    );

    assertPredictionInvariants(prediction);
    assert.ok(prediction.homeWin > 80);
  });

  it("supports missing optional head-to-head-style form data", () => {
    const prediction = calculateMatchPrediction(
      makeTeamStats("Home", {
        form: { last5: [], last10: [], currentFormScore: 50 },
      }),
      makeTeamStats("Away", {
        form: { last5: [], last10: [], currentFormScore: 50 },
      }),
    );

    assertPredictionInvariants(prediction);
  });

  it("handles fewer than five available recent matches", () => {
    const shortForm = Array.from({ length: 3 }, (_, index) => ({
      matchId: index + 1,
      date: `2026-01-0${index + 1}T12:00:00.000Z`,
      opponentId: index + 10,
      opponentName: `Opponent ${index + 1}`,
      venue: "home" as const,
      goalsFor: 1,
      goalsAgainst: index === 0 ? 0 : 1,
      result: index === 0 ? ("W" as const) : ("D" as const),
    }));

    const prediction = calculateMatchPrediction(
      makeTeamStats("Home", {
        form: { last5: shortForm, last10: shortForm, currentFormScore: 66.67 },
      }),
      makeTeamStats("Away"),
    );

    assertPredictionInvariants(prediction);
  });

  it("handles exactly five available recent matches", () => {
    const fiveForm = Array.from({ length: 5 }, (_, index) => ({
      matchId: index + 1,
      date: `2026-01-0${index + 1}T12:00:00.000Z`,
      opponentId: index + 10,
      opponentName: `Opponent ${index + 1}`,
      venue: "away" as const,
      goalsFor: 2,
      goalsAgainst: 1,
      result: "W" as const,
    }));

    const prediction = calculateMatchPrediction(
      makeTeamStats("Home", {
        form: { last5: fiveForm, last10: fiveForm, currentFormScore: 100 },
        currentFormScore: 100,
      }),
      makeTeamStats("Away"),
    );

    assertPredictionInvariants(prediction);
  });
});

describe("team statistics service", () => {
  it("calculates recent results, venue splits, goals, and form", () => {
    const team: FootballDataTeam = { id: 1, name: "Sample FC" };
    const opponent: FootballDataTeam = { id: 2, name: "Opponent FC" };
    const matches = Array.from({ length: 6 }, (_, index): FootballDataMatch => ({
      id: index + 1,
      utcDate: `2026-02-0${index + 1}T12:00:00.000Z`,
      status: "FINISHED",
      homeTeam: index % 2 === 0 ? team : opponent,
      awayTeam: index % 2 === 0 ? opponent : team,
      score: {
        fullTime:
          index === 0
            ? { home: 2, away: 0 }
            : index === 1
              ? { home: 1, away: 1 }
              : { home: 0, away: 1 },
      },
    }));

    const stats = calculateTeamStatistics(team, matches, 4);

    assert.equal(stats.matchesAnalyzed, 6);
    assert.equal(stats.form.last5.length, 5);
    assert.equal(stats.form.last10.length, 6);
    assert.equal(stats.wins, 3);
    assert.equal(stats.draws, 1);
    assert.equal(stats.losses, 2);
    assert.equal(stats.homeWins, 1);
    assert.equal(stats.awayWins, 2);
    assert.equal(stats.leaguePosition, 4);
    assert.equal(stats.goalsScored, 5);
    assert.equal(stats.goalsConceded, 3);
  });
});

describe("Football-Data.org client cache", () => {
  it("prefers FOOTBALL_DATA_API_TOKEN and sends X-Auth-Token server-side", async () => {
    const originalFetch = globalThis.fetch;
    const restoreCredentials = useFootballDataCredentials(
      "preferred-test-token",
      "legacy-test-token",
    );
    let calls = 0;
    let receivedToken: string | null = null;
    globalThis.fetch = async (_input, init) => {
      calls += 1;
      receivedToken = new Headers(init?.headers).get("X-Auth-Token");
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    try {
      const client = new FootballDataClient({
        baseUrl: "https://football-data.test",
        cacheTtlMs: 30_000,
      });
      await client.get<{ ok: boolean }>("/matches/1");
      await client.get<{ ok: boolean }>("/matches/1");

      assert.equal(calls, 1);
      assert.equal(receivedToken, "preferred-test-token");
    } finally {
      globalThis.fetch = originalFetch;
      restoreCredentials();
    }
  });
});

describe("prediction API", () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    server = createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it("returns a complete prediction for valid statistics", async () => {
    const response = await fetch(`${baseUrl}/api/predictions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        homeTeam: makeTeamStats("Home"),
        awayTeam: makeTeamStats("Away"),
      }),
    });

    assert.equal(response.status, 200);
    const prediction = (await response.json()) as ReturnType<
      typeof calculateMatchPrediction
    >;
    assertPredictionInvariants(prediction);
    assert.equal(prediction.methodology.length > 0, true);
    assert.equal(prediction.limitations.length > 0, true);
  });

  it("rejects negative statistics, invalid probabilities, and missing fields", async () => {
    const negative = await fetch(`${baseUrl}/api/predictions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        homeTeam: { ...makeTeamStats("Home"), goalsScored: -1 },
        awayTeam: makeTeamStats("Away"),
      }),
    });
    assert.equal(negative.status, 400);

    const invalidProbability = await fetch(`${baseUrl}/api/predictions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        homeWin: 101,
        homeTeam: makeTeamStats("Home"),
        awayTeam: makeTeamStats("Away"),
      }),
    });
    assert.equal(invalidProbability.status, 400);

    const missing = await fetch(`${baseUrl}/api/predictions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(missing.status, 400);
  });

  it("rejects malformed match IDs and reports a missing API key clearly", async () => {
    const malformed = await fetch(
      `${baseUrl}/api/predictions/match/not-a-match`,
    );
    assert.equal(malformed.status, 400);

    const restoreCredentials = useFootballDataCredentials();
    try {
      const missingKey = await fetch(`${baseUrl}/api/predictions/match/123`);
      assert.equal(missingKey.status, 503);
      const body = (await missingKey.json()) as { error: string };
      assert.match(body.error, /FOOTBALL_DATA_API_KEY/);
    } finally {
      restoreCredentials();
    }
  });

  it("reports an invalid provider token as a configuration error", async () => {
    const originalFetch = globalThis.fetch;
    const restoreCredentials = useFootballDataCredentials(
      undefined,
      "test-only-token",
    );
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ message: "Your API token is invalid." }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });

    try {
      const response = await requestJson(
        `${baseUrl}/api/predictions/match/123`,
      );

      assert.equal(response.status, 503);
      assert.deepEqual(response.body, {
        error:
          "Football-Data.org rejected the configured API token. Update FOOTBALL_DATA_API_KEY in Replit Secrets.",
      });
    } finally {
      globalThis.fetch = originalFetch;
      restoreCredentials();
    }
  });
});

describe("match finder API", () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    server = createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it("returns safe fixture summaries and forwards supported filters", async () => {
    const originalFetch = globalThis.fetch;
    const restoreCredentials = useFootballDataCredentials(
      undefined,
      "test-only-token",
    );
    let receivedUrl = "";
    let receivedToken: string | null = null;
    globalThis.fetch = async (input, init) => {
      receivedUrl = String(input);
      receivedToken = new Headers(init?.headers).get("X-Auth-Token");
      return new Response(
        JSON.stringify({
          matches: [
            {
              id: 456,
              utcDate: "2026-09-24T18:00:00Z",
              status: "SCHEDULED",
              competition: { id: 2021, name: "Premier League", code: "PL" },
              homeTeam: { id: 1, name: "Home FC" },
              awayTeam: { id: 2, name: "Away FC" },
              score: {
                winner: null,
                fullTime: { home: null, away: null },
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    try {
      const response = await requestJson(
        `${baseUrl}/api/matches?competition=PL&dateFrom=2026-09-24&dateTo=2026-09-30&status=SCHEDULED&limit=5`,
      );

      assert.equal(response.status, 200);
      assert.deepEqual(response.body, {
        matches: [
          {
            id: 456,
            utcDate: "2026-09-24T18:00:00Z",
            status: "SCHEDULED",
            competition: { id: 2021, name: "Premier League", code: "PL" },
            homeTeam: { id: 1, name: "Home FC" },
            awayTeam: { id: 2, name: "Away FC" },
            score: {
              winner: null,
              fullTime: { home: null, away: null },
            },
          },
        ],
        count: 1,
      });

      const parsedUrl = new URL(receivedUrl);
      assert.equal(parsedUrl.pathname, "/v4/competitions/PL/matches");
      assert.equal(parsedUrl.searchParams.get("dateFrom"), "2026-09-24");
      assert.equal(parsedUrl.searchParams.get("dateTo"), "2026-09-30");
      assert.equal(parsedUrl.searchParams.get("status"), "SCHEDULED");
      assert.equal(parsedUrl.searchParams.has("limit"), false);
      assert.equal(receivedToken, "test-only-token");
    } finally {
      globalThis.fetch = originalFetch;
      restoreCredentials();
    }
  });

  it("rejects invalid date ranges, statuses, and limits", async () => {
    const response = await requestJson(
      `${baseUrl}/api/matches?dateFrom=2026-10-10&dateTo=2026-09-01&status=UNKNOWN&limit=0`,
    );

    assert.equal(response.status, 400);
    assert.deepEqual(response.body, {
      error: "Invalid match search request.",
      details: [
        "dateFrom must be on or before dateTo.",
        "status must be one of: SCHEDULED, TIMED, LIVE, IN_PLAY, PAUSED, FINISHED, POSTPONED, SUSPENDED, CANCELLED, AWARDED.",
        "limit must be a whole number between 1 and 50.",
      ],
    });
  });

  it("requires dateFrom and dateTo to be supplied together", async () => {
    const response = await requestJson(
      `${baseUrl}/api/matches?dateFrom=2026-09-24`,
    );

    assert.equal(response.status, 400);
    assert.deepEqual(response.body, {
      error: "Invalid match search request.",
      details: ["dateFrom and dateTo must be supplied together."],
    });
  });

  it("identifies an invalid provider token clearly", async () => {
    const originalFetch = globalThis.fetch;
    const restoreCredentials = useFootballDataCredentials(
      undefined,
      "test-only-token",
    );
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ message: "Your API token is invalid." }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });

    try {
      const response = await requestJson(`${baseUrl}/api/matches`);

      assert.equal(response.status, 503);
      assert.deepEqual(response.body, {
        error:
          "Football-Data.org rejected the configured API token. Update FOOTBALL_DATA_API_KEY in Replit Secrets.",
      });
    } finally {
      globalThis.fetch = originalFetch;
      restoreCredentials();
    }
  });
});