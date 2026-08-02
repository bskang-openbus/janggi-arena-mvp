import { describe, expect, it } from "vitest";
import { ENGINE_NAME, ENGINE_SCAFFOLD_VERSION } from "./index";

describe("engine scaffold (P0)", () => {
  it("exposes package identity constants (placeholder until P1 rule engine lands)", () => {
    expect(ENGINE_NAME).toBe("janggi-engine");
    expect(ENGINE_SCAFFOLD_VERSION).toBe("0.0.1");
  });
});
