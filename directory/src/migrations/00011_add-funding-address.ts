import { DataTypes, type Sequelize } from "sequelize";

export async function up({ context: sequelize }: { context: Sequelize }) {
  const qi = sequelize.getQueryInterface();

  await qi.addColumn("agents", "funding_address", {
    type: DataTypes.STRING(42),
    allowNull: true,
    defaultValue: null,
  });
}

export async function down({ context: sequelize }: { context: Sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.removeColumn("agents", "funding_address");
}
