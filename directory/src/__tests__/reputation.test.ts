import { describe, it, expect } from "vitest";
import {
  computeReputationScore,
  computeReputationComponents,
} from "../reputation.js";
import type { ReputationInput } from "../reputation.js";

function makeInput(overrides: Partial<ReputationInput> = {}): ReputationInput {
  return {
    createdAt: new Date("2026-01-01T00:00:00Z"),
    lastHeartbeat: new Date("2026-02-17T23:50:00Z"), // 10 min before NOW
    availability: "online",
    tasksCompleted: 0,
    tasksFailed: 0,
    totalInteractions: 0,
    agentCard: { name: "Test" },
    name: "Test Agent",
    bio: "A test agent",
    skills: ["test"],
    ...overrides,
  };
}

// Fixed reference time for deterministic tests
const NOW = new Date("2026-02-18T00:00:00Z");

describe("computeReputationScore", () => {
  it("returns moderate score for agent with no task activity but good uptime", () => {
    const input = makeInput({
      tasksCompleted: 0,
      tasksFailed: 0,
      totalInteractions: 0,
    });
    const score = computeReputationScore(input, NOW);
    // uptime=1.0*0.3 + profile=1.0*0.2 + tasks=0.5*0.3 + activity=0*0.2 = 0.65
    expect(score).toBeGreaterThanOrEqual(0.6);
    expect(score).toBeLessThanOrEqual(0.7);
  });

  it("returns higher score for agent with many completed tasks", () => {
    const activeInput = makeInput({
      tasksCompleted: 50,
      tasksFailed: 0,
      totalInteractions: 50,
    });
    const freshInput = makeInput({
      tasksCompleted: 0,
      tasksFailed: 0,
      totalInteractions: 0,
    });
    const activeScore = computeReputationScore(activeInput, NOW);
    const freshScore = computeReputationScore(freshInput, NOW);
    expect(activeScore).toBeGreaterThan(freshScore);
  });

  it("returns lower score for agent with many failed tasks", () => {
    const failedInput = makeInput({
      tasksCompleted: 1,
      tasksFailed: 10,
      totalInteractions: 11,
    });
    const goodInput = makeInput({
      tasksCompleted: 10,
      tasksFailed: 1,
      totalInteractions: 11,
    });
    const failedScore = computeReputationScore(failedInput, NOW);
    const goodScore = computeReputationScore(goodInput, NOW);
    expect(failedScore).toBeLessThan(goodScore);
  });

  it("returns score between 0 and 1", () => {
    const input = makeInput({
      tasksCompleted: 100,
      tasksFailed: 100,
      totalInteractions: 200,
    });
    const score = computeReputationScore(input, NOW);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("penalizes agents with no heartbeat", () => {
    const noHeartbeat = makeInput({ lastHeartbeat: null });
    const withHeartbeat = makeInput();
    const noScore = computeReputationScore(noHeartbeat, NOW);
    const withScore = computeReputationScore(withHeartbeat, NOW);
    expect(noScore).toBeLessThan(withScore);
  });

  it("penalizes agents with stale heartbeat", () => {
    const stale = makeInput({
      lastHeartbeat: new Date("2026-02-17T22:00:00Z"), // 2 hours before NOW
    });
    const fresh = makeInput({
      lastHeartbeat: new Date("2026-02-17T23:55:00Z"), // 5 min before NOW
    });
    const staleScore = computeReputationScore(stale, NOW);
    const freshScore = computeReputationScore(fresh, NOW);
    expect(staleScore).toBeLessThan(freshScore);
  });
});

describe("computeReputationComponents", () => {
  it("returns all four component scores", () => {
    const input = makeInput();
    const components = computeReputationComponents(input, NOW);

    expect(components).toHaveProperty("uptimeReliability");
    expect(components).toHaveProperty("profileCompleteness");
    expect(components).toHaveProperty("taskSuccessRate");
    expect(components).toHaveProperty("activityLevel");
  });

  it("profile completeness is 1.0 for fully filled profile", () => {
    const input = makeInput({
      name: "Full Agent",
      bio: "Has a bio",
      skills: ["skill1"],
      agentCard: { name: "Full Agent" },
    });
    const components = computeReputationComponents(input, NOW);
    expect(components.profileCompleteness).toBe(1.0);
  });

  it("profile completeness is 0.0 for empty profile", () => {
    const input = makeInput({
      name: "",
      bio: null,
      skills: [],
      agentCard: null,
    });
    const components = computeReputationComponents(input, NOW);
    expect(components.profileCompleteness).toBe(0.0);
  });

  it("task success rate follows Bayesian Beta formula", () => {
    // Beta(1,1) prior: (completed + 1) / (completed + failed + 2)
    const input10_0 = makeInput({ tasksCompleted: 10, tasksFailed: 0 });
    const input10_2 = makeInput({ tasksCompleted: 10, tasksFailed: 2 });
    const input0_0 = makeInput({ tasksCompleted: 0, tasksFailed: 0 });

    const c10_0 = computeReputationComponents(input10_0, NOW);
    const c10_2 = computeReputationComponents(input10_2, NOW);
    const c0_0 = computeReputationComponents(input0_0, NOW);

    expect(c0_0.taskSuccessRate).toBeCloseTo(0.5, 2); // (0+1)/(0+0+2) = 0.5
    expect(c10_0.taskSuccessRate).toBeCloseTo(11 / 12, 2); // ~0.917
    expect(c10_2.taskSuccessRate).toBeCloseTo(11 / 14, 2); // ~0.786
  });

  it("activity level is 0 with no interactions", () => {
    const input = makeInput({ totalInteractions: 0 });
    const components = computeReputationComponents(input, NOW);
    expect(components.activityLevel).toBe(0);
  });

  it("activity level increases with interactions", () => {
    const low = makeInput({ totalInteractions: 1 });
    const high = makeInput({ totalInteractions: 100 });
    const lowComponents = computeReputationComponents(low, NOW);
    const highComponents = computeReputationComponents(high, NOW);
    expect(highComponents.activityLevel).toBeGreaterThan(
      lowComponents.activityLevel,
    );
  });
});
