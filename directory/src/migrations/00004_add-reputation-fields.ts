import { DataTypes, type Sequelize } from "sequelize";

export async function up({ context: sequelize }: { context: Sequelize }) {
  const qi = sequelize.getQueryInterface();

  await qi.addColumn("agents", "reputation_score", {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0.5,
  });

  await qi.addColumn("agents", "tasks_completed", {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  });

  await qi.addColumn("agents", "tasks_failed", {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  });

  await qi.addColumn("agents", "total_interactions", {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  });

  await qi.addColumn("agents", "reputation_updated_at", {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: null,
  });
}

export async function down({ context: sequelize }: { context: Sequelize }) {
  const qi = sequelize.getQueryInterface();

  await qi.removeColumn("agents", "reputation_updated_at");
  await qi.removeColumn("agents", "total_interactions");
  await qi.removeColumn("agents", "tasks_failed");
  await qi.removeColumn("agents", "tasks_completed");
  await qi.removeColumn("agents", "reputation_score");
}
