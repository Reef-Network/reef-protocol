import { DataTypes, type Sequelize } from "sequelize";

export async function up({ context: sequelize }: { context: Sequelize }) {
  const qi = sequelize.getQueryInterface();

  await qi.changeColumn("agents", "skills", {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: [],
  });
}

export async function down({ context: sequelize }: { context: Sequelize }) {
  const qi = sequelize.getQueryInterface();

  await qi.changeColumn("agents", "skills", {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: [],
  });
}
