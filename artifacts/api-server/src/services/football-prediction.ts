import type {
  MatchPrediction,
  PredictionFactor,
  PredictionMarket,
  TeamStats,
} from "./prediction-types";

export const PREDICTION_FACTOR_WEIGHTS = {
  recentForm: 25,
  attackingStrength: 20,
  defensiveStrength: 20,
  homeAdvantage: 15,
  venuePerformance: 10,
  leaguePosition: 10,
} as const;

const MAX_GOALS = 12;
const HOME_GOAL_BASELINE = 1.15;
const AWAY_GOAL_BASELINE = 0.95;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function percentage(value: number): number {
  return round(clamp(value, 0, 100));
}

function probability(value: number): number {
  return Math.round(clamp(value, 0, 100));
}

function ratioScore(
  homeValue: number,
  awayValue: number,
  lowerIsBetter = false,
): number {
  const safeHome = Math.max(0, homeValue);
  const safeAway = Math.max(0, awayValue);
  const total = safeHome + safeAway;

  if (total === 0) {
    return 50;
  }

  return percentage(
    lowerIsBetter
      ? (safeAway / total) * 100
      : (safeHome / total) * 100,
  );
}

function venueMatches(stats: TeamStats, venue: "home" | "away"): number {
  return venue === "home"
    ? stats.homeWins + stats.homeDraws + stats.homeLosses
    : stats.awayWins + stats.awayDraws + stats.awayLosses;
}

function winRate(stats: TeamStats, venue: "home" | "away"): number {
  const matches = venueMatches(stats, venue);
  if (matches === 0) {
    return 50;
  }

  const wins = venue === "home" ? stats.homeWins : stats.awayWins;
  return (wins / matches) * 100;
}

function rate(
  value: number,
  matches: number,
  fallback: number,
): number {
  return matches > 0 ? value / matches : fallback;
}

function factor(
  key: PredictionFactor["key"],
  label: string,
  weight: number,
  value: number,
  description: string,
): PredictionFactor {
  return {
    key,
    label,
    weight,
    value: percentage(value),
    contribution: round((weight * percentage(value)) / 100),
    description,
  };
}

function buildFactors(home: TeamStats, away: TeamStats): PredictionFactor[] {
  const homePosition = home.leaguePosition;
  const awayPosition = away.leaguePosition;
  const leaguePositionValue =
    homePosition !== undefined &&
    awayPosition !== undefined &&
    homePosition > 0 &&
    awayPosition > 0
      ? ratioScore(awayPosition, homePosition)
      : 50;

  const homeWinRate = winRate(home, "home");
  const awayLossRate =
    venueMatches(away, "away") === 0
      ? 50
      : (away.awayLosses / venueMatches(away, "away")) * 100;

  const homeAdvantageValue = percentage(
    50 + (homeWinRate - awayLossRate) * 0.25,
  );

  const homeVenueValue = winRate(home, "home");
  const awayVenueValue = winRate(away, "away");
  const venuePerformanceValue =
    venueMatches(home, "home") === 0 &&
    venueMatches(away, "away") === 0
      ? 50
      : percentage((homeVenueValue + (100 - awayVenueValue)) / 2);

  return [
    factor(
      "recentForm",
      "Recent form",
      PREDICTION_FACTOR_WEIGHTS.recentForm,
      ratioScore(home.currentFormScore, away.currentFormScore),
      "Compares each team's current-form score from its most recent results.",
    ),
    factor(
      "attackingStrength",
      "Attacking strength",
      PREDICTION_FACTOR_WEIGHTS.attackingStrength,
      ratioScore(home.goalsPerMatch, away.goalsPerMatch),
      "Compares goals scored per match across the available sample.",
    ),
    factor(
      "defensiveStrength",
      "Defensive strength",
      PREDICTION_FACTOR_WEIGHTS.defensiveStrength,
      ratioScore(
        home.goalsConcededPerMatch,
        away.goalsConcededPerMatch,
        true,
      ),
      "Rewards the home team when its concession rate is lower than the away team's.",
    ),
    factor(
      "homeAdvantage",
      "Home advantage",
      PREDICTION_FACTOR_WEIGHTS.homeAdvantage,
      homeAdvantageValue,
      "Uses home win rate versus the away team's away loss rate.",
    ),
    factor(
      "venuePerformance",
      "Home/away performance",
      PREDICTION_FACTOR_WEIGHTS.venuePerformance,
      venuePerformanceValue,
      "Combines the home team's home win rate with the away team's away win rate.",
    ),
    factor(
      "leaguePosition",
      "League position",
      PREDICTION_FACTOR_WEIGHTS.leaguePosition,
      leaguePositionValue,
      "Favors the team with the better (lower) league-table position when supplied.",
    ),
  ];
}

function weightedHomeEdge(factors: PredictionFactor[]): number {
  const totalWeight = factors.reduce((total, item) => total + item.weight, 0);
  if (totalWeight !== 100) {
    throw new Error("Prediction factor weights must total exactly 100%.");
  }

  return factors.reduce(
    (edge, item) => edge + ((item.value - 50) * item.weight) / 100,
    0,
  );
}

function expectedGoals(
  home: TeamStats,
  away: TeamStats,
  homeEdge: number,
): { home: number; away: number } {
  const homeMatches = venueMatches(home, "home");
  const awayMatches = venueMatches(away, "away");

  const homeAttack = rate(
    home.homeGoalsScored,
    homeMatches,
    home.matchesAnalyzed > 0 ? home.goalsPerMatch : HOME_GOAL_BASELINE,
  );
  const awayDefense = rate(
    away.awayGoalsConceded,
    awayMatches,
    away.matchesAnalyzed > 0
      ? away.goalsConcededPerMatch
      : AWAY_GOAL_BASELINE,
  );
  const awayAttack = rate(
    away.awayGoalsScored,
    awayMatches,
    away.matchesAnalyzed > 0 ? away.goalsPerMatch : AWAY_GOAL_BASELINE,
  );
  const homeDefense = rate(
    home.homeGoalsConceded,
    homeMatches,
    home.matchesAnalyzed > 0
      ? home.goalsConcededPerMatch
      : HOME_GOAL_BASELINE,
  );

  return {
    home: round(
      clamp(
        (homeAttack * 0.6 + awayDefense * 0.4) *
          (1 + clamp(homeEdge, -45, 45) / 250),
        0.05,
        8,
      ),
      3,
    ),
    away: round(
      clamp(
        (awayAttack * 0.6 + homeDefense * 0.4) *
          (1 - clamp(homeEdge, -45, 45) / 300),
        0.05,
        8,
      ),
      3,
    ),
  };
}

function poissonDistribution(lambda: number): number[] {
  const probabilities = [Math.exp(-lambda)];
  for (let goals = 1; goals <= MAX_GOALS; goals += 1) {
    probabilities.push(
      (probabilities[goals - 1] * lambda) / goals,
    );
  }

  const total = probabilities.reduce((sum, value) => sum + value, 0);
  return probabilities.map((value) => value / total);
}

function roundPairTo100(first: number, second: number): [number, number] {
  const roundedFirst = probability(first);
  return [roundedFirst, 100 - roundedFirst];
}

function roundTripleTo100(
  values: [number, number, number],
): [number, number, number] {
  const rounded = values.map(probability) as [number, number, number];
  const difference = 100 - rounded.reduce((sum, value) => sum + value, 0);
  const largestIndex = rounded.reduce(
    (index, value, currentIndex, source) =>
      value > source[index] ? currentIndex : index,
    0,
  );
  rounded[largestIndex] = Math.max(0, rounded[largestIndex] + difference);
  return rounded;
}

function markets(prediction: Omit<MatchPrediction, "markets">): PredictionMarket[] {
  return [
    { market: "match_result", selection: "home_win", probability: prediction.homeWin },
    { market: "match_result", selection: "draw", probability: prediction.draw },
    { market: "match_result", selection: "away_win", probability: prediction.awayWin },
    { market: "total_goals", selection: "over_1_5", probability: prediction.over1_5 },
    { market: "total_goals", selection: "over_2_5", probability: prediction.over2_5 },
    { market: "total_goals", selection: "under_2_5", probability: prediction.under2_5 },
    { market: "both_teams_to_score", selection: "yes", probability: prediction.bttsYes },
    { market: "both_teams_to_score", selection: "no", probability: prediction.bttsNo },
    { market: "clean_sheet", selection: "home", probability: prediction.homeCleanSheet },
    { market: "clean_sheet", selection: "away", probability: prediction.awayCleanSheet },
  ];
}

export function calculateMatchPrediction(
  home: TeamStats,
  away: TeamStats,
): MatchPrediction {
  const factors = buildFactors(home, away);
  const homeEdge = weightedHomeEdge(factors);
  const goals = expectedGoals(home, away, homeEdge);
  const homePoisson = poissonDistribution(goals.home);
  const awayPoisson = poissonDistribution(goals.away);

  let homeWinRaw = 0;
  let drawRaw = 0;
  let awayWinRaw = 0;
  let over1_5Raw = 0;
  let over2_5Raw = 0;
  let bttsYesRaw = 0;

  for (let homeGoals = 0; homeGoals <= MAX_GOALS; homeGoals += 1) {
    for (let awayGoals = 0; awayGoals <= MAX_GOALS; awayGoals += 1) {
      const probability = homePoisson[homeGoals] * awayPoisson[awayGoals];
      if (homeGoals > awayGoals) {
        homeWinRaw += probability;
      } else if (homeGoals === awayGoals) {
        drawRaw += probability;
      } else {
        awayWinRaw += probability;
      }

      if (homeGoals + awayGoals > 1) {
        over1_5Raw += probability;
      }
      if (homeGoals + awayGoals > 2) {
        over2_5Raw += probability;
      }
      if (homeGoals > 0 && awayGoals > 0) {
        bttsYesRaw += probability;
      }
    }
  }

  const [homeWin, draw, awayWin] = roundTripleTo100([
    homeWinRaw * 100,
    drawRaw * 100,
    awayWinRaw * 100,
  ]);
  const [over1_5] = roundPairTo100(over1_5Raw * 100, 0);
  const [over2_5, under2_5] = roundPairTo100(
    over2_5Raw * 100,
    (1 - over2_5Raw) * 100,
  );
  const [bttsYes, bttsNo] = roundPairTo100(
    bttsYesRaw * 100,
    (1 - bttsYesRaw) * 100,
  );

  // A home clean sheet means the away team scores zero; an away clean sheet
  // means the home team scores zero.
  const homeCleanSheet = probability(awayPoisson[0] * 100);
  const awayCleanSheet = probability(homePoisson[0] * 100);
  const dataCoverage = Math.min(
    100,
    ((Math.min(home.matchesAnalyzed, 10) +
      Math.min(away.matchesAnalyzed, 10)) /
      20) *
      100,
  );
  const confidence = probability(
    40 + dataCoverage * 0.4 + Math.min(Math.abs(homeEdge), 25) * 0.8,
  );

  const predictionWithoutMarkets: Omit<MatchPrediction, "markets"> = {
    homeWin,
    draw,
    awayWin,
    over1_5,
    over2_5,
    under2_5,
    bttsYes,
    bttsNo,
    homeCleanSheet,
    awayCleanSheet,
    homeExpectedGoals: Math.max(0, goals.home),
    awayExpectedGoals: Math.max(0, goals.away),
    confidence,
    methodology:
      "Transparent weighted model using recent form, attack, defense, home advantage, venue performance, and league position. Expected goals are then converted into score probabilities with independent Poisson distributions.",
    factors,
    limitations: [
      "Predictions are statistical estimates, not guarantees.",
      "The model does not account for injuries, suspensions, line-ups, weather, tactical changes, or late team news.",
      "Small or missing historical samples reduce confidence and are treated conservatively.",
    ],
  };

  return {
    ...predictionWithoutMarkets,
    markets: markets(predictionWithoutMarkets),
  };
}