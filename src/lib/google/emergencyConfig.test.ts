import { afterEach, describe, expect, it } from "vitest";
import { GoogleConfigError } from "./errors";
import { readGoogleEmergencyServiceAccountConfig } from "./emergencyConfig";

const ENV_KEYS = [
  "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  "GOOGLE_PRIVATE_KEY",
  "GOOGLE_SPREADSHEET_ID",
  "GOOGLE_EMERGENCY_SPREADSHEET_ID",
] as const;

const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

describe("readGoogleEmergencyServiceAccountConfig", () => {
  it("throws a typed GoogleConfigError when GOOGLE_EMERGENCY_SPREADSHEET_ID is missing", () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "svc@example-project.iam.gserviceaccount.com";
    process.env.GOOGLE_PRIVATE_KEY = "-----BEGIN KEY-----\\nabc\\n-----END KEY-----";
    delete process.env.GOOGLE_EMERGENCY_SPREADSHEET_ID;

    expect(() => readGoogleEmergencyServiceAccountConfig()).toThrow(GoogleConfigError);
    expect(() => readGoogleEmergencyServiceAccountConfig()).toThrow(/GOOGLE_EMERGENCY_SPREADSHEET_ID/);
  });

  it("never requires the REGULAR GOOGLE_SPREADSHEET_ID -- regular and emergency config stay independent", () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "svc@example-project.iam.gserviceaccount.com";
    process.env.GOOGLE_PRIVATE_KEY = "-----BEGIN KEY-----\\nabc\\n-----END KEY-----";
    process.env.GOOGLE_EMERGENCY_SPREADSHEET_ID = "synthetic-emergency-spreadsheet-id";
    delete process.env.GOOGLE_SPREADSHEET_ID;

    const config = readGoogleEmergencyServiceAccountConfig();

    expect(config.spreadsheetId).toBe("synthetic-emergency-spreadsheet-id");
  });

  it("returns a normalized config when all variables are present", () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "svc@example-project.iam.gserviceaccount.com";
    process.env.GOOGLE_PRIVATE_KEY = "-----BEGIN KEY-----\\nabc\\n-----END KEY-----";
    process.env.GOOGLE_EMERGENCY_SPREADSHEET_ID = "synthetic-emergency-spreadsheet-id";

    const config = readGoogleEmergencyServiceAccountConfig();

    expect(config).toEqual({
      clientEmail: "svc@example-project.iam.gserviceaccount.com",
      privateKey: "-----BEGIN KEY-----\nabc\n-----END KEY-----",
      spreadsheetId: "synthetic-emergency-spreadsheet-id",
    });
  });

  it("throws when the shared service-account credentials are missing, even if the emergency spreadsheet id is set", () => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    delete process.env.GOOGLE_PRIVATE_KEY;
    process.env.GOOGLE_EMERGENCY_SPREADSHEET_ID = "synthetic-emergency-spreadsheet-id";

    expect(() => readGoogleEmergencyServiceAccountConfig()).toThrow(
      /GOOGLE_SERVICE_ACCOUNT_EMAIL.*GOOGLE_PRIVATE_KEY/,
    );
  });
});
