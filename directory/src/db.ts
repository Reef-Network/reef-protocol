import { Sequelize } from "sequelize";
import { config } from "./config.js";

export let sequelize: Sequelize;

/**
 * Initialize database — create Sequelize instance, init models, sync.
 * Accepts an optional pre-configured instance (for testing with pg-mem).
 */
export async function initDb(instance?: Sequelize): Promise<void> {
  if (instance) {
    sequelize = instance;
  } else {
    sequelize = new Sequelize(config.databaseUrl, {
      dialect: "postgres",
      logging: config.nodeEnv === "development" ? console.log : false,
      define: {
        underscored: true,
      },
    });
    await sequelize.authenticate();
  }

  // Import and init models after sequelize is set
  const { initAgentModel } = await import("./models/Agent.js");
  const { initSnapshotModel } = await import("./models/Snapshot.js");
  initAgentModel(sequelize);
  initSnapshotModel(sequelize);

  await sequelize.sync({
    force: !!instance,
    alter: !instance && config.nodeEnv === "development",
  });
  console.log("[db] Connected and synced");
}
