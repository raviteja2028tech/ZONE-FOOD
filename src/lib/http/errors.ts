/** Application errors that map directly onto an HTTP response. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, "BAD_REQUEST", message, details);
export const validationFailed = (details: unknown) =>
  new AppError(422, "VALIDATION_FAILED", "Input validation failed.", details);
export const notFound = (what = "Resource") => new AppError(404, "NOT_FOUND", `${what} not found.`);
