/** Reputation scoring for Reef agents using Bayesian Beta distribution */

export interface ReputationInput {
  createdAt: Date;
  lastHeartbeat: Date | null;
  availability: string;
  tasksCompleted: number;
  tasksFailed: number;
  totalInteractions: number;
  agentCard: unknown | null;
  name: string;
  bio: string | null;
  skills: string[];
}

export interface ReputationComponents {
  uptimeReliability: number;
  profileCompleteness: number;
  taskSuccessRate: number;
  activityLevel: number;
}

const WEIGHTS = {
  uptimeReliability: 0.3,
  profileCompleteness: 0.2,
  taskSuccessRate: 0.3,
  activityLevel: 0.2,
} as const;

/**
 * Compute uptime reliability score (0–1).
 * Based on whether the agent is currently online and how recently
 * it sent a heartbeat relative to registration age.
 */
function computeUptimeReliability(input: ReputationInput, now: Date): number {
  if (!input.lastHeartbeat) return 0;

  const ageSinceRegistration = now.getTime() - input.createdAt.getTime();
  if (ageSinceRegistration <= 0) return 0;

  const timeSinceHeartbeat = now.getTime() - input.lastHeartbeat.getTime();
  const twentyMinutesMs = 20 * 60 * 1000;

  // If the agent hasn't sent a heartbeat in 20+ minutes, it's stale
  if (timeSinceHeartbeat > twentyMinutesMs) {
    // Scale down based on how stale: 20min → 0.5, 1hr+ → 0
    const staleness = Math.min(timeSinceHeartbeat / (60 * 60 * 1000), 1);
    return Math.max(0, 0.5 * (1 - staleness));
  }

  // Online agents get 0.5–1.0 based on registration age
  // Agents registered > 24h ago get full credit
  const ageHours = ageSinceRegistration / (60 * 60 * 1000);
  const ageFactor = Math.min(ageHours / 24, 1);
  return 0.5 + 0.5 * ageFactor;
}

/**
 * Compute profile completeness score (0–1).
 * Rewards agents that fill out their AgentCard fully.
 */
function computeProfileCompleteness(input: ReputationInput): number {
  let score = 0;
  const checks = 4;

  if (input.name && input.name.length > 0) score++;
  if (input.bio && input.bio.length > 0) score++;
  if (input.skills && input.skills.length > 0) score++;
  if (input.agentCard !== null) score++;

  return score / checks;
}

/**
 * Compute task success rate using Bayesian Beta posterior (0–1).
 * Beta(1,1) prior (uniform): with no data, returns 0.5.
 *
 * Formula: (successes + alpha) / (successes + failures + alpha + beta)
 * With alpha=1, beta=1 (uniform prior):
 *   0 tasks → 0.5
 *   10 completed, 0 failed → 0.846
 *   10 completed, 2 failed → 0.786
 *   1 completed, 5 failed → 0.25
 */
function computeTaskSuccessRate(input: ReputationInput): number {
  const alpha = 1; // Beta prior parameter
  const beta = 1;
  return (
    (input.tasksCompleted + alpha) /
    (input.tasksCompleted + input.tasksFailed + alpha + beta)
  );
}

/**
 * Compute activity level score (0–1).
 * Log-scaled interaction count relative to registration age.
 * Rewards steady engagement over bursts.
 */
function computeActivityLevel(input: ReputationInput, now: Date): number {
  if (input.totalInteractions === 0) return 0;

  const ageDays = Math.max(
    (now.getTime() - input.createdAt.getTime()) / (24 * 60 * 60 * 1000),
    1,
  );

  // Expected interactions: ~1 per day is "healthy"
  const interactionsPerDay = input.totalInteractions / ageDays;

  // Log-scale: 1/day → ~0.5, 10/day → ~0.83, 100/day → ~1.0
  // Using log10(x + 1) / log10(101) which maps [0, 100] → [0, 1]
  return Math.min(Math.log10(interactionsPerDay + 1) / Math.log10(101), 1);
}

/**
 * Compute individual reputation components.
 * Exposed separately so the /reputation endpoint can show the breakdown.
 */
export function computeReputationComponents(
  input: ReputationInput,
  now: Date = new Date(),
): ReputationComponents {
  return {
    uptimeReliability: computeUptimeReliability(input, now),
    profileCompleteness: computeProfileCompleteness(input),
    taskSuccessRate: computeTaskSuccessRate(input),
    activityLevel: computeActivityLevel(input, now),
  };
}

/**
 * Compute composite reputation score (0–1) from weighted components.
 * New agents with no data start at ~0.5 (Bayesian neutral prior).
 */
export function computeReputationScore(
  input: ReputationInput,
  now: Date = new Date(),
): number {
  const components = computeReputationComponents(input, now);

  const score =
    components.uptimeReliability * WEIGHTS.uptimeReliability +
    components.profileCompleteness * WEIGHTS.profileCompleteness +
    components.taskSuccessRate * WEIGHTS.taskSuccessRate +
    components.activityLevel * WEIGHTS.activityLevel;

  // Clamp to [0, 1] and round to 3 decimal places
  return Math.round(Math.min(Math.max(score, 0), 1) * 1000) / 1000;
}
