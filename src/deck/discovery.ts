// Deck discovery: keeps the settings screen's deck list in step with the files.
//
// The firmware draws the settings screen from appmeta/settings.json, so a deck
// file dropped into resources/ appears there only once that file's "deck"
// options list it. This lists the deck files, reads each header's NAME and
// ORDER, and — when the options differ — rewrites the app's own settings.json
// through the assets upload API. The new list shows the next time Setup opens.

import { APP } from "../config.ts";
import { report } from "../util.ts";
import { deckIdFromFile, parseFields } from "./format.ts";
import { listResources, type ResourceFile, readHeader } from "./store.ts";

type Listing = { id: string; name: string; order: number };
type DeckOption = { value: string; label: string };
type SettingsDoc = { fields: { deck: { options: DeckOption[]; default: string } } };

const SCHEMA_FILE = "appmeta/settings.json";
const API = "http://127.0.0.1/api";

/** Every deck file, in display order. A deck whose header cannot be read is still listed, marked "!", so choosing it shows its error. */
async function discoverDecks(files: ResourceFile[]): Promise<DeckOption[]> {
  const found: Listing[] = [];
  for (const file of files) {
    const id = deckIdFromFile(file.name);
    if (id === null) continue;
    try {
      const { fields } = parseFields((await readHeader(file.name, file.size)).head);
      found.push({ id, name: fields.NAME || id, order: Number(fields.ORDER) || 1000 });
    } catch (err) {
      report(err);
      found.push({ id, name: `${id} !`, order: 2000 });
    }
  }
  found.sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1));
  return found.map((d) => ({ value: d.id, label: d.name }));
}

export async function syncDeckOptions(): Promise<void> {
  const current = await fetch(`${API}/storage/read?path=${encodeURIComponent(`/ext/user_assets/${APP}/${SCHEMA_FILE}`)}`);
  const doc = (await current.json()) as SettingsDoc;
  const deck = doc.fields.deck;

  // The usual case, and the cheap one: the files are the decks the list already names (the build writes that list), so none of
  // their headers needs reading. Only a deck that was added or removed makes it worth reading them all.
  const files = await listResources();
  const ids = files.flatMap((file) => deckIdFromFile(file.name) ?? []);
  if (ids.length === deck.options.length && ids.every((id) => deck.options.some((o) => o.value === id))) return;

  const options = await discoverDecks(files);
  if (options.length === 0 || JSON.stringify(deck.options) === JSON.stringify(options)) return;

  deck.options = options;
  if (!options.some((o) => o.value === deck.default)) deck.default = options[0].value;

  const res = await fetch(`${API}/assets/upload?application_name=${APP}&file=${encodeURIComponent(SCHEMA_FILE)}`, {
    method: "POST",
    body: JSON.stringify(doc, null, 2),
  });
  if (!res.ok) throw new Error(`deck list: settings.json upload failed (HTTP ${res.status})`);
  console.log(`${APP}: deck list updated (${options.length} decks)`);
}
