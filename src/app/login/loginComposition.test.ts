import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Regression guard for the "immersive composition" pass (Design Pass
 * PR #22): mobile must read as ONE continuous dark canvas -- no seam
 * between the hero and the auth surface -- while desktop keeps the
 * approved theme-responsive split. These are the two easiest-to-regress,
 * hardest-to-catch-by-render-test invariants (Tailwind's `lg:` responsive
 * classes don't actually take effect in jsdom, so a render test can't see
 * whether the auth panel is opaque below `lg`), so this checks the source
 * directly instead.
 */
const authPanelSource = fs.readFileSync(
  path.resolve(__dirname, "..", "..", "components", "login", "LoginAuthPanel.tsx"),
  "utf8",
);
const googleButtonSource = fs.readFileSync(
  path.resolve(__dirname, "..", "..", "components", "auth", "GoogleSignInButton.tsx"),
  "utf8",
);
const globalsCss = fs.readFileSync(path.resolve(__dirname, "..", "globals.css"), "utf8");

describe("login mobile canvas unification", () => {
  it("LoginAuthPanel never applies bg-surface-3 unconditionally -- only behind the lg: breakpoint, so mobile has no opaque background of its own", () => {
    expect(authPanelSource).not.toMatch(/(?<!lg:)bg-surface-3\b/);
    expect(authPanelSource).toContain("lg:bg-surface-3");
  });

  it("LoginAuthPanel's glass card and its text use the fixed (theme-independent) mobile tokens, reverting to theme-responsive tokens only at lg:", () => {
    for (const fixedToken of ["--login-glass-bg-fixed", "--login-glass-border-fixed", "--login-fg-fixed", "--login-muted-fixed"]) {
      expect(authPanelSource).toContain(fixedToken);
    }
    expect(authPanelSource).toContain("lg:bg-[var(--login-glass-bg)]");
    expect(authPanelSource).toContain("lg:text-foreground");
  });

  it("the fixed mobile tokens referenced by components are actually defined in globals.css", () => {
    for (const token of [
      "--login-glass-bg-fixed",
      "--login-glass-border-fixed",
      "--shadow-login-glass-fixed",
      "--login-fg-fixed",
      "--login-muted-fixed",
      "--login-muted-2-fixed",
      "--login-cta-fixed-bg",
      "--login-cta-fixed-text",
    ]) {
      expect(globalsCss).toContain(`${token}:`);
    }
  });
});

describe("Google CTA contrast treatment", () => {
  it("uses the light/milky fixed treatment by default (mobile's always-dark canvas) and the violet product accent only at lg: (desktop split)", () => {
    expect(googleButtonSource).toContain("bg-[var(--login-cta-fixed-bg)]");
    expect(googleButtonSource).toContain("text-[var(--login-cta-fixed-text)]");
    expect(googleButtonSource).toContain("lg:bg-primary");
    expect(googleButtonSource).toContain("lg:text-primary-foreground");
  });

  it('keeps the exact wording "המשך עם Google" and the Google glyph regardless of which treatment is active', () => {
    expect(googleButtonSource).toContain("המשך עם Google");
    expect(googleButtonSource).toContain("GoogleGlyph");
  });
});
