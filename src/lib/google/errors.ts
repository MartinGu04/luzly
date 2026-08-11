/** Thrown when the Google service-account environment configuration is missing or invalid. */
export class GoogleConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleConfigError";
  }
}
