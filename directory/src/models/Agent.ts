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
    },
    {
      sequelize,
      tableName: "agents",
      underscored: true,
    },
  );
}
