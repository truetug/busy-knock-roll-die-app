// Checks deck files the way the app reads them, and says which item is wrong: `pnpm check-deck src/deck-*.txt`.
//
// It uses the app's own parser (src/deck/format.ts), so it can not disagree with the app about what a deck is. On top of that it
// checks what the app does not need to: that the header ends on a 1 KiB boundary, that every item ends with its dashes line, and
// that every text fits the screen - for every variant of a line that offers some.
//
// Items are RECORD bytes each (UTF-8: a Cyrillic letter is two), ended by a comment of dashes. Editing text changes an item's
// length: keep it by adding a dash for every character removed (and removing one for every character added). A wrong item shifts
// every item after it, so the first complaint is the one to fix.

import { readFileSync } from "node:fs";
import { argv } from "node:process";
import { decodeRecord, parseDeck, splitHeader } from "../src/deck/format.ts";
import { wrapWords } from "../src/util.ts";

const SETTINGS_COLOR = "#7C3AEDFF";
const BLOCK = 1024;
const utf8 = (bytes: string): string => Buffer.from(bytes, "latin1").toString("utf8");
const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** Whether a text screen fits: at most two lines of 13 characters, a longer word not at all. */
function fits(text: string): boolean {
  const rows = text.split("\n").flatMap((line) => wrapWords(line, 13));
  return rows.length <= 2 && rows.every((row) => row.length <= 13);
}

function check(path: string): string[] {
  const file = readFileSync(path);
  const text = file.toString("latin1"); // one character per byte, so that offsets are byte offsets
  const split = splitHeader(text);
  if (!split) return ['no "---" line ending the header'];

  let deck: ReturnType<typeof parseDeck>;
  try {
    deck = parseDeck(utf8(split.head), split.dataStart, path, file.length, SETTINGS_COLOR);
  } catch (err) {
    return [message(err)];
  }

  const problems: string[] = [];
  if (split.dataStart % BLOCK !== 0) {
    problems.push(
      `the header ends at byte ${split.dataStart}: it must end on a multiple of ${BLOCK} (pad it with a comment line of dashes, as tools/make-decks.ts does)`,
    );
  }

  for (let item = 1; deck.recordSize > 0 && item <= deck.count; item++) {
    const start = deck.dataStart + (item - 1) * deck.recordSize;
    const record = text.slice(start, start + deck.recordSize);
    const last = record.endsWith("\n") ? record.slice(0, -1).split("\n").pop() : undefined;
    if (last === undefined || !/^# -+$/.test(last)) {
      problems.push(`item ${item} does not end with its dashes line - it, or the item before it, has the wrong length`);
      break;
    }
    // The first variant of every line, then the last: between them every variant is shown.
    for (const random of [() => 0, () => 0.999]) {
      try {
        const parts = decodeRecord(deck, utf8(record), item, random);
        deck.steps.forEach((step, i) => {
          const part = parts[i];
          if (step.kind === "text" && part != null && !fits(part)) {
            problems.push(`item ${item}: does not fit, at most 2 lines of 13 characters: ${JSON.stringify(part)}`);
          }
        });
      } catch (err) {
        problems.push(message(err));
        break;
      }
    }
  }
  return [...new Set(problems)];
}

const paths = argv.slice(2);
if (paths.length === 0) {
  console.error("usage: pnpm check-deck src/deck-*.txt");
  process.exit(2);
}
let bad = false;
for (const path of paths) {
  const problems = check(path);
  console.log(`${path}: ${problems.length === 0 ? "ok" : `${problems.length} problem(s)`}`);
  for (const problem of problems) console.log(`  ${problem}`);
  bad ||= problems.length > 0;
}
process.exit(bad ? 1 : 0);
