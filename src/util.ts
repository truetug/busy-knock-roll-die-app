// Small helpers with no knowledge of the app.

import { APP } from "./config.ts";

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** a→b by t (0..1), rounded to whole pixels. */
export function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

/** A colour between two "#RRGGBBAA" colours: `a` at t = 0, `b` at t = 1. */
export function mixColor(a: string, b: string, t: number): string {
  const channel = (color: string, i: number): number => Number.parseInt(color.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2, 3]
    .map((i) =>
      Math.round(channel(a, i) + (channel(b, i) - channel(a, i)) * t)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")
    .toUpperCase()}`;
}

/** How far apart two "#RRGGBBAA" colours are: the sum of the differences of their red, green and blue, 0 to 765. */
export function colorDistance(a: string, b: string): number {
  const channel = (color: string, i: number): number => Number.parseInt(color.slice(1 + i * 2, 3 + i * 2), 16);
  return [0, 1, 2].reduce((sum, i) => sum + Math.abs(channel(a, i) - channel(b, i)), 0);
}

/** Size of `text` in bytes once encoded as UTF-8 (what a file's byte ranges count). */
export function utf8Length(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code < 0xdc00) {
      bytes += 4; // a surrogate pair is one 4-byte character
      i++;
    } else bytes += 3;
  }
  return bytes;
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
