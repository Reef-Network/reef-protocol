import { Sequelize } from "sequelize";
import { config } from "./config.js";
import { createMigrator } from "./migrate.js";

export let sequelize: Sequelize;

/**
 * Initialize database — create Sequelize instance, run migrations, init models.
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
      pool: {
        max: 20,
        min: 2,
        acquire: 30000,
        idle: 10000,
      },
    });
    await sequelize.authenticate();
  }

  // Run pending migrations (creates/alters tables as needed)
  const migrator = createMigrator(sequelize);
  await migrator.up();

  // Import and init models after migrations have run
  const { initAgentModel } = await import("./models/Agent.js");
  const { initSnapshotModel } = await import("./models/Snapshot.js");
  const { initAppModel } = await import("./models/App.js");
  initAgentModel(sequelize);
  initSnapshotModel(sequelize);
  initAppModel(sequelize);

  console.log("[db] Connected and migrated");
}
