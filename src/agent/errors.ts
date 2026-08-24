export class AgentUnavailableError extends Error {
  constructor(message = "Agent is temporarily unavailable") {
    super(message);
    this.name = "AgentUnavailableError";
  }
}
export class AgentToolError extends Error {
  constructor(
    public readonly code: "UNKNOWN_TOOL" | "INVALID_INPUT" | "FORBIDDEN" | "TIMEOUT" | "EXECUTION_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "AgentToolError";
  }
}
