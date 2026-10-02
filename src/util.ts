// Small helpers with no knowledge of the app.

import { APP } from "./config.ts";

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** a→b by t (0..1), rounded to whole pixels. */
export function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

/** 1..size in random order. */
export function shuffled(size: number): number[] {
  const values = Array.from({ length: size }, (_, i) => i + 1);
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}

/** Greedy word wrap into lines of at most `max` characters. */
export function wrapWords(text: string, max: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line !== "" && line.length + 1 + word.length > max) {
      lines.push(line);
      line = word;
    } else {
      line = line === "" ? word : `${line} ${word}`;
    }
  }
  if (line !== "") lines.push(line);
  return lines;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Logs a problem without interrupting anything. */
export function report(err: unknown): void {
  console.error(`${APP}: ${errorMessage(err)}`);
}
