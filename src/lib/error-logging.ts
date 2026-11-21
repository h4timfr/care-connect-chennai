type ErrorEvent = "Request failed" | "SSR request failed" | "Route rendering failed";

export function logAppError(event: ErrorEvent, error?: unknown, development = false): void {
  if (development && error !== undefined) {
    console.error(`[CareConnect] ${event}`, error);
    return;
  }
  console.error(`[CareConnect] ${event}`);
}
