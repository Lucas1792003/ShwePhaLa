import { describe, expect, it } from "vitest";
import { newId } from "./id";

describe("newId", () => {
  it("prefixes with the given label", () => {
    expect(newId("shop")).toMatch(/^shop-[0-9a-f]{32}$/);
  });

  it("never collides across a large sample (real entropy, not Date.now())", () => {
    const ids = new Set(Array.from({ length: 10_000 }, () => newId("x")));
    expect(ids.size).toBe(10_000);
  });
});
