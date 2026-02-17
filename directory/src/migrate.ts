import { Umzug, SequelizeStorage } from "umzug";
import { Sequelize } from "sequelize";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Create an Umzug migrator bound to the given Sequelize instance.
 * Migrations are discovered from the `migrations/` directory.
 */
export function createMigrator(sequelize: Sequelize): Umzug<Sequelize> {
  return new Umzug({
    migrations: {
      glob: [
        "migrations/*.{ts,js}",
        { cwd: __dirname, ignore: ["**/*.d.ts", "**/*.d.ts.map"] },
      ],
      resolve: ({ name, path: migrationPath, context }) => {
        const loadModule = async () => import(migrationPath!);
        return {
          name,
          up: async () => (await loadModule()).up({ context }),
          down: async () => (await loadModule()).down({ context }),
        };
      },
    },
    context: sequelize,
    storage: new SequelizeStorage({ sequelize }),
    logger: console,
  });
}

// CLI entry point: `tsx src/migrate.ts up|down|pending|create`
const isDirectRun =
  process.argv[1] &&
  fileURLToPath(import.meta.url).endsWith(
    process.argv[1].replace(/\.js$/, ".ts"),
  );

if (isDirectRun) {
  const { config } = await import("./config.js");
  const sequelize = new Sequelize(config.databaseUrl, {
    dialect: "postgres",
    logging: false,
    define: { underscored: true },
  });

  const migrator = createMigrator(sequelize);
  const command = process.argv[2];

  switch (command) {
    case "up":
      await migrator.up();
      console.log("All migrations applied.");
      break;

    case "down":
      await migrator.down();
      console.log("Last migration reverted.");
      break;

    case "pending": {
      const pending = await migrator.pending();
      if (pending.length === 0) {
        console.log("No pending migrations.");
      } else {
        console.log("Pending migrations:");
        pending.forEach((m) => console.log(`  - ${m.name}`));
      }
      break;
    }

    case "create": {
      const desc = process.argv[3] || "unnamed";
      const migrationsDir = path.join(__dirname, "migrations");
      const existing = fs
        .readdirSync(migrationsDir)
        .filter((f) => /^\d{5}_/.test(f));
      const nextNum = String(existing.length + 1).padStart(5, "0");
      const filename = `${nextNum}_${desc}.ts`;
      const template = `import { DataTypes, type Sequelize } from "sequelize";

export async function up({ context: sequelize }: { context: Sequelize }) {
  const qi = sequelize.getQueryInterface();
  // TODO: implement migration
}

export async function down({ context: sequelize }: { context: Sequelize }) {
  const qi = sequelize.getQueryInterface();
  // TODO: implement rollback
}
`;
      fs.writeFileSync(path.join(migrationsDir, filename), template);
      console.log(`Created: src/migrations/${filename}`);
      break;
    }

    default:
      console.log("Usage: tsx src/migrate.ts [up|down|pending|create <name>]");
  }

  await sequelize.close();
}
