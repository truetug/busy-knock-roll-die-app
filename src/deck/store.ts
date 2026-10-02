// Reads decks from the device's storage over its own loopback HTTP API.

import { APP, STORAGE_PATH_MAX } from "../config.ts";
import { type Deck, deckFileName, decodeRecord, type Part, parseDeck, splitHeader } from "./format.ts";

const API = "http://127.0.0.1/api";
const RESOURCES_DIR = `/ext/user_assets/${APP}/resources`;
const HEADER_CHUNK = 1024;
const HEADER_CHUNKS_MAX = 4;

export type ResourceFile = { name: string; size: number };

/** The files in the resources folder, with sizes. */
export async function listResources(): Promise<ResourceFile[]> {
  const res = await fetch(`${API}/storage/list?path=${encodeURIComponent(RESOURCES_DIR)}`);
  const body = (await res.json()) as { list?: { type?: string; name: string; size?: number }[] };
  return (body.list ?? []).filter((e) => e.type !== "dir" && e.size !== undefined).map((e) => ({ name: e.name, size: e.size ?? 0 }));
}

/** Full storage path of a resource file; throws if the storage API would refuse it. */
export function resourcePath(file: string): string {
  const full = `${RESOURCES_DIR}/${file}`;
  if (full.length > STORAGE_PATH_MAX) throw new Error(`${file}: name too long (path ${full.length} > ${STORAGE_PATH_MAX})`);
  return full;
}

/** Bytes [start, end] of a resource file, by HTTP Range. */
async function readRange(file: string, start: number, end: number): Promise<string> {
  const res = await fetch(`${API}/storage/read?path=${encodeURIComponent(resourcePath(file))}`, {
    headers: { Range: `bytes=${start}-${end}` },
  });
  if (!res.ok) throw new Error(`${file}: read failed (HTTP ${res.status})`);
  return res.text();
}

/** Reads a header of any length, chunk by chunk, until its delimiter shows up. The storage API answers 416 to a range past the end of the file, hence `size`. */
export async function readHeader(file: string, size: number): Promise<{ head: string; dataStart: number }> {
  let text = "";
  for (let i = 0; i < HEADER_CHUNKS_MAX && i * HEADER_CHUNK < size; i++) {
    text += await readRange(file, i * HEADER_CHUNK, Math.min(size, (i + 1) * HEADER_CHUNK) - 1);
    const split = splitHeader(text);
    if (split) return split;
  }
  throw new Error(`${file}: no "---" line ending the header`);
}

/** Loads a deck by id, or throws an error saying what is wrong with its file. */
export async function loadDeck(id: string, settingsColor: string): Promise<Deck> {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error(`bad deck id "${id}"`);

  const file = deckFileName(id);
  const entry = (await listResources()).find((e) => e.name === file);
  if (entry === undefined) throw new Error(`${file}: file not found`);

  const { head, dataStart } = await readHeader(file, entry.size);
  return parseDeck(head, dataStart, file, entry.size, settingsColor);
}

/** Item `value` (1-based): all its steps, read with one request. */
export async function loadItem(deck: Deck, value: number): Promise<Part[]> {
  if (deck.file === null || deck.recordSize <= 0) return [];

  const start = deck.dataStart + (value - 1) * deck.recordSize;
  const record = await readRange(deck.file, start, start + deck.recordSize - 1);
  if (record.length !== deck.recordSize) throw new Error(`${deck.file}: item ${value}: got ${record.length} bytes`);
  return decodeRecord(deck, record);
}
