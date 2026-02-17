import { DataTypes, type Sequelize } from "sequelize";

export async function up({ context: sequelize }: { context: Sequelize }) {
  const qi = sequelize.getQueryInterface();

  await qi.createTable("agents", {
    address: {
      type: DataTypes.STRING(42),
      primaryKey: true,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(128),
      allowNull: false,
    },
    bio: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    skills: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    availability: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: "online",
    },
    version: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    reef_version: {
      type: DataTypes.STRING(16),
      allowNull: true,
    },
    last_heartbeat: {
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

  await qi.createTable("snapshots", {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    total_agents: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    online_agents: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    messages_reported: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    top_skills: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    captured_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  });
}

export async function down({ context: sequelize }: { context: Sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.dropTable("snapshots");
  await qi.dropTable("agents");
}
