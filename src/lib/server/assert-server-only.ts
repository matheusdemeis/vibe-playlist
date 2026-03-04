export function assertServerOnly(context: string): void {
  if (typeof window !== "undefined") {
    throw new Error(`${context} must run on the server.`);
  }
}
