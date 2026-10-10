import type { ApiError } from "@pdm/contracts";

/** Thrown by handlers; the backend turns it into an ApiError response. */
export class ApiFailure extends Error {
  constructor(
    readonly code: ApiError["code"],
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiFailure";
  }

  toApiError(): ApiError {
    return { code: this.code, message: this.message, ...(this.details === undefined ? {} : { details: this.details }) };
  }
}
