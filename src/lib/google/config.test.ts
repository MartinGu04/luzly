import { afterEach, describe, expect, it } from "vitest";
import { GoogleConfigError } from "./errors";
import { normalizePrivateKey, readGoogleServiceAccountConfig } from "./config";

const ENV_KEYS = [
  "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  "GOOGLE_PRIVATE_KEY",
  "GOOGLE_SPREADSHEET_ID",
] as const;

const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

describe("normalizePrivateKey", () => {
  it("converts escaped \\n sequences into real newlines", () => {
    expect(normalizePrivateKey("-----BEGIN KEY-----\\nabc\\n-----END KEY-----")).toBe(
      "-----BEGIN KEY-----\nabc\n-----END KEY-----",
    );
  });

  it("leaves keys that already contain real newlines untouched", () => {
    const key = "-----BEGIN KEY-----\nabc\n-----END KEY-----";
    expect(normalizePrivateKey(key)).toBe(key);
  });
});

describe("readGoogleServiceAccountConfig", () => {
  it("throws a typed GoogleConfigError when configuration is missing", () => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    delete process.env.GOOGLE_PRIVATE_KEY;
    delete process.env.GOOGLE_SPREADSHEET_ID;

    expect(() => readGoogleServiceAccountConfig()).toThrow(GoogleConfigError);
  });

  it("reports every missing variable by name", () => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    process.env.GOOGLE_PRIVATE_KEY = "key";
    delete process.env.GOOGLE_SPREADSHEET_ID;

    expect(() => readGoogleServiceAccountConfig()).toThrow(
      /GOOGLE_SERVICE_ACCOUNT_EMAIL.*GOOGLE_SPREADSHEET_ID/,
    );
  });

  it("returns a normalized config when all variables are present", () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "svc@example-project.iam.gserviceaccount.com";
    process.env.GOOGLE_PRIVATE_KEY = "-----BEGIN KEY-----\\nabc\\n-----END KEY-----";
    process.env.GOOGLE_SPREADSHEET_ID = "synthetic-spreadsheet-id";

    const config = readGoogleServiceAccountConfig();

    expect(config).toEqual({
      clientEmail: "svc@example-project.iam.gserviceaccount.com",
      privateKey: "-----BEGIN KEY-----\nabc\n-----END KEY-----",
      spreadsheetId: "synthetic-spreadsheet-id",
    });
  });
});
