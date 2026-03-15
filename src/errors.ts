// Thrown when the agent loop was intentionally aborted via agent.abort(). The
// queue catches this and resolves cleanly instead of retrying.
export class AbortError extends Error {
  constructor() {
    super("Agent aborted.");
    this.name = "AbortError";
  }
}
