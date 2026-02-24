import { DataTypes, type Sequelize } from "sequelize";

export async function up({ context: sequelize }: { context: Sequelize }) {
  const qi = sequelize.getQueryInterface();

  await qi.addColumn("agents", "icon_url", {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: null,
  });

  await qi.addColumn("apps", "icon_url", {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: null,
  });
}

export async function down({ context: sequelize }: { context: Sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.removeColumn("apps", "icon_url");
  await qi.removeColumn("agents", "icon_url");
}
