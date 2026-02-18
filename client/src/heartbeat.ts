import type { AgentIdentity } from "@reef-protocol/protocol";

const DEFAULT_DIRECTORY_URL = "http://localhost:3000";
const HEARTBEAT_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

export interface TelemetryData {
  messagesHandled?: number;
  uptime?: number;
  tasksCompleted?: number;
  tasksFailed?: number;
  country?: string;
}

export interface HeartbeatOptions {
  intervalMs?: number;
  /** Static telemetry (sent every 4th beat). Ignored if getTelemetry is provided. */
  telemetry?: TelemetryData;
  /** Dynamic telemetry callback — called every 4th beat to get current counters. */
  getTelemetry?: () => TelemetryData;
}

/**
 * Start a periodic heartbeat to the directory server.
 * Returns a cleanup function to stop the heartbeat.
 */
export function startHeartbeat(
  directoryUrl: string | undefined,
  identity: AgentIdentity,
  options?: HeartbeatOptions,
): () => void {
  const url = directoryUrl || DEFAULT_DIRECTORY_URL;
  const intervalMs = options?.intervalMs || HEARTBEAT_INTERVAL_MS;
  let beatCount = 0;

  async function beat() {
    beatCount++;
    try {
      const body: Record<string, unknown> = {
        address: identity.address,
      };

      // Include telemetry every 4th beat
      if (beatCount % 4 === 0) {
        const telemetry = options?.getTelemetry
          ? options.getTelemetry()
          : options?.telemetry;
        if (telemetry) {
          body.telemetry = telemetry;
        }
      }

      const res = await fetch(`${url}/agents/heartbeat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        console.error(`[heartbeat] Failed: ${res.status} ${res.statusText}`);
        return;
      }

      const data = (await res.json()) as {
        stats?: { totalAgents: number; onlineAgents: number };
      };
      if (data.stats) {
        console.log(
          `[heartbeat] OK — ${data.stats.onlineAgents}/${data.stats.totalAgents} agents online`,
        );
      }
    } catch (err) {
      console.error("[heartbeat] Error:", (err as Error).message);
    }
  }

  // Send first heartbeat immediately
  beat();

  const interval = setInterval(beat, intervalMs);

  return () => {
    clearInterval(interval);
  };
}
