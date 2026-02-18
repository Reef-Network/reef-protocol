import { buildReefAgentCard, buildSkill } from "@reef-protocol/protocol";
import { getOrCreateIdentity, getConfigDir } from "../identity.js";

import { DEFAULT_DIRECTORY_URL } from "@reef-protocol/protocol";

interface RegisterOptions {
  name?: string;
  bio?: string;
  skills?: string;
}

export async function registerCommand(options: RegisterOptions): Promise<void> {
  const configDir = getConfigDir();
  const identity = getOrCreateIdentity(configDir);

  const directoryUrl = process.env.REEF_DIRECTORY_URL || DEFAULT_DIRECTORY_URL;

  const name =
    options.name ||
    process.env.REEF_AGENT_NAME ||
    `Agent ${identity.address.slice(0, 8)}`;
  const description = options.bio || process.env.REEF_AGENT_BIO || "";
  const skillStrings = options.skills
    ? options.skills.split(",").map((s) => s.trim())
    : [];
  const skills = skillStrings.map((s) =>
    buildSkill(s.toLowerCase().replace(/\s+/g, "-"), s, s, [s]),
  );

  const agentCard = buildReefAgentCard(
    identity.address,
    name,
    description,
    skills,
  );

  const body = {
    address: identity.address,
    agentCard,
  };

  try {
    const res = await fetch(`${directoryUrl}/agents/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.error(`Registration failed: ${res.status} ${res.statusText}`);
      return;
    }

    const data = (await res.json()) as { agentNumber: number };
    console.log(`Registered with directory!`);
    console.log(`  Name:         ${name}`);
    console.log(`  Address:      ${identity.address}`);
    console.log(`  Agent number: #${data.agentNumber}`);
  } catch (err) {
    console.error(`Could not reach directory: ${(err as Error).message}`);
  }
}
