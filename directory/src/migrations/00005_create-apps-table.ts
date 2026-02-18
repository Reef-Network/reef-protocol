import { DataTypes, type Sequelize } from "sequelize";

export async function up({ context: sequelize }: { context: Sequelize }) {
  const qi = sequelize.getQueryInterface();

  await qi.createTable("apps", {
    app_id: {
      type: DataTypes.STRING(64),
      primaryKey: true,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(128),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    version: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    category: {
      type: DataTypes.STRING(32),
      allowNull: true,
    },
    coordinator_address: {
      type: DataTypes.STRING(42),
      allowNull: true,
    },
    availability: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: "available",
    },
    manifest: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    reputation_score: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0.5,
    },
    tasks_completed: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    tasks_failed: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    total_interactions: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    reputation_updated_at: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    last_refreshed: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  });
}

export async function down({ context: sequelize }: { context: Sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.dropTable("apps");
}
