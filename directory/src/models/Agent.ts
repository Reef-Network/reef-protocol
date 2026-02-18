import { DataTypes, Model, type Sequelize } from "sequelize";
import type { AgentCard } from "@a2a-js/sdk";

export interface AgentAttributes {
  address: string;
  name: string;
  bio: string | null;
  skills: string[];
  availability: "online" | "offline";
  version: string | null;
  reef_version: string | null;
  last_heartbeat: Date | null;
  agent_card: AgentCard | null;
  reputation_score: number;
  tasks_completed: number;
  tasks_failed: number;
  total_interactions: number;
  reputation_updated_at: Date | null;
  country: string | null;
}

export class Agent extends Model<AgentAttributes> {
  declare address: string;
  declare name: string;
  declare bio: string | null;
  declare skills: string[];
  declare availability: "online" | "offline";
  declare version: string | null;
  declare reef_version: string | null;
  declare last_heartbeat: Date | null;
  declare agent_card: AgentCard | null;
  declare reputation_score: number;
  declare tasks_completed: number;
  declare tasks_failed: number;
  declare total_interactions: number;
  declare reputation_updated_at: Date | null;
  declare country: string | null;
  declare readonly created_at: Date;
  declare readonly updated_at: Date;
}

export function initAgentModel(sequelize: Sequelize): void {
  Agent.init(
    {
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
        type: DataTypes.JSONB,
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
      agent_card: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: null,
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
      country: {
        type: DataTypes.STRING(2),
        allowNull: true,
        defaultValue: null,
      },
    },
    {
      sequelize,
      tableName: "agents",
      underscored: true,
    },
  );
}
