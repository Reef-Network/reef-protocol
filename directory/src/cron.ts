import { initDb } from "./db.js";
import { captureSnapshot } from "./snapshot.js";
import { sweepStaleAgents, sweepStaleApps } from "./sweep.js";

async function main() {
  await initDb();

  console.log("[reef-cron] Running sweep...");
  await sweepStaleAgents();
  await sweepStaleApps();

  console.log("[reef-cron] Capturing snapshot...");
  await captureSnapshot();

  console.log("[reef-cron] Done");
  process.exit(0);
}

main().catch((err) => {
  console.error("[reef-cron] Fatal:", err);
  process.exit(1);
});
