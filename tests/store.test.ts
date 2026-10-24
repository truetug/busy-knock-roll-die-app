import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { APP, DEFAULT_COLOR, REPO } from "../src/config.ts";
import { DECK_FILES, DECKS_REF } from "../src/deck/files.ts";
import { deckFileName } from "../src/deck/format.ts";
import { resourcePath } from "../src/deck/store.ts";
import { parseShipped, shippedDeckFiles } from "./helpers.ts";

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

describe("the app id", () => {
  it("is the one in the manifest", async () => {
    const { default: manifest } = await import("../src/appmeta/manifest.json");
    const { APP } = await import("../src/config.ts");
    expect(APP).toBe(manifest.id);
  });
});

describe("a bar that keeps storage from the app (HTTP API 27.14)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("knows every shipped deck file and its size", () => {
    expect(DECK_FILES).toEqual(
      shippedDeckFiles()
        .map(({ file }) => ({ name: file, size: statSync(join("src", file)).size }))
        .sort((a, b) => (a.name < b.name ? -1 : 1)),
    );
  });

  it("reads the decks from the repository at this version's tag", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: { headers?: Record<string, string> }) => {
      urls.push(url);
      if (url.startsWith("http://127.0.0.1/")) return new Response("Forbidden", { status: 403 });
      const [, from, to] = /bytes=(\d+)-(\d+)/.exec(init?.headers?.Range ?? "") ?? [];
      const file = readFileSync(join("src", url.slice(url.lastIndexOf("/") + 1)));
      return new Response(file.subarray(Number(from), Number(to) + 1), { status: 206 });
    });
    const { listResources, loadDeck, loadItem } = await import("../src/deck/store.ts");

    expect(await listResources()).toEqual(DECK_FILES);
    const deck = await loadDeck("classic", DEFAULT_COLOR);
    expect(deck).toEqual(parseShipped("classic"));
    expect((await loadItem(deck, 1)).length).toBe(deck.steps.length);
    expect(urls.filter((u) => u.startsWith("http://127.0.0.1/"))).toHaveLength(1);
    expect(urls.at(-1)).toBe(`https://raw.githubusercontent.com/${REPO}/${DECKS_REF}/src/deck-classic.txt`);
  });
});
