import { AgentUnavailableError } from "../agent/errors.js";
import { runAgent } from "../agent/orchestrator.js";

export class CoachUnavailableError extends Error {
  constructor() {
    super("Coach AI is temporarily unavailable");
    this.name = "CoachUnavailableError";
  }
}

export async function askCoach(userId: string, message: string): Promise<string> {
  try {
    return (await runAgent({ userId, message })).answer;
  } catch (error) {
    if (!(error instanceof AgentUnavailableError)) throw error;
    throw new CoachUnavailableError();
  }
}
