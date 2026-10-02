import { describe, expect, it } from "vitest";
import { APP } from "../src/config.ts";
import { deckFileName } from "../src/deck/format.ts";
import { resourcePath } from "../src/deck/store.ts";
import { shippedDeckFiles } from "./helpers.ts";

describe("resourcePath", () => {
  it("accepts every shipped deck", () => {
    for (const { file } of shippedDeckFiles()) expect(() => resourcePath(file), file).not.toThrow();
  });

  it("lives under the app's own folder", () => {
    expect(resourcePath(deckFileName("x"))).toBe(`/ext/user_assets/${APP}/resources/deck-x.txt`);
  });

  it("refuses a name the storage API would answer with 400", () => {
    expect(() => resourcePath(deckFileName("x".repeat(40)))).toThrow(/name too long/);
  });
});
