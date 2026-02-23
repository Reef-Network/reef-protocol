import { DataTypes, Model, type Sequelize } from "sequelize";
import type { AppManifest } from "@reef-protocol/protocol";

export interface AppAttributes {
  app_id: string;
  name: string;
  description: string | null;
  version: string;
  category: string | null;
  coordinator_address: string | null;
  registered_by: string | null;
  availability: "available" | "offline";
  manifest: AppManifest;
  reputation_score: number;
  tasks_completed: number;
  tasks_failed: number;
  total_interactions: number;
  reputation_updated_at: Date | null;
  last_refreshed: Date | null;
  icon_url: string | null;
}

export class App extends Model<AppAttributes> {
  declare app_id: string;
  declare name: string;
  declare description: string | null;
  declare version: string;
  declare category: string | null;
  declare coordinator_address: string | null;
  declare registered_by: string | null;
  declare availability: "available" | "offline";
  declare manifest: AppManifest;
  declare reputation_score: number;
  declare tasks_completed: number;
  declare tasks_failed: number;
  declare total_interactions: number;
  declare reputation_updated_at: Date | null;
  declare last_refreshed: Date | null;
  declare icon_url: string | null;
  declare readonly created_at: Date;
  declare readonly updated_at: Date;
}

export function initAppModel(sequelize: Sequelize): void {
  App.init(
    {
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
      registered_by: {
        type: DataTypes.STRING(42),
        allowNull: true,
        defaultValue: null,
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
      icon_url: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: null,
      },
    },
    {
      sequelize,
      tableName: "apps",
      underscored: true,
    },
  );
}
