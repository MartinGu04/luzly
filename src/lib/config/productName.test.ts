import { describe, expect, it } from "vitest";
import { APP_NAME, APP_NAME_ASCII } from "./productName";

describe("productName -- final brand identity (PR #23)", () => {
  it("the Hebrew display name is exactly מי-מה-מו", () => {
    expect(APP_NAME).toBe("מי-מה-מו");
  });

  it("the ASCII/technical brand spelling is exactly mi-ma-mo", () => {
    expect(APP_NAME_ASCII).toBe("mi-ma-mo");
  });

  it("neither form is the retired 'Luzly' name", () => {
    expect(APP_NAME.toLowerCase()).not.toContain("luzly");
    expect(APP_NAME_ASCII.toLowerCase()).not.toContain("luzly");
  });
});
