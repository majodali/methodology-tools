// Vocabulary lookup shared by the prose lints (P-008: terms are
// defined once and cited everywhere) and the IR checks (CK-04). Two
// register shapes are read: the communication pipeline's table rows
// `| <a id="def-x"></a>Term | meaning | status | site |` and the
// methodology's list entries `- <a id="def-x"></a>**Term** — meaning`
// (nested entries included). The anchor is the term's definition site;
// a document links the term's first use to it.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export type TermStatus = 'decided' | 'proposed' | 'unknown';

export interface VocabularyEntry {
  term: string;
  anchor: string | null;
  status: TermStatus;
}

/** Lower-cased term (and abbreviation) → entry. */
export type Vocabulary = Map<string, VocabularyEntry>;

const TABLE_ROW_RE = /^\|\s*(?:<a id="([^"]+)"><\/a>)?\s*([^|]+?)\s*\|([^|]*)\|([^|]*)\|/;
const LIST_ENTRY_RE = /^\s*[-*]\s+(?:<a id="([^"]+)"><\/a>)?\s*\*\*([^*]+)\*\*/;

function statusOf(cell: string): TermStatus {
  if (/^\s*decided/.test(cell)) return 'decided';
  if (/^\s*proposed/.test(cell)) return 'proposed';
  return 'unknown';
}

function addEntry(into: Vocabulary, rawTerm: string, anchor: string | null, status: TermStatus): void {
  const term = rawTerm.replace(/\s*\(.*\)$/, '').replace(/\s+/g, ' ').trim();
  if (!term) return;
  into.set(term.toLowerCase(), { term, anchor, status });
  const abbr = /\(([A-Z]{2,})\)/.exec(rawTerm);
  if (abbr) into.set(abbr[1]!.toLowerCase(), { term: abbr[1]!, anchor, status });
}

/** Read one vocabulary file into `into` (a missing file adds nothing). */
export function vocabularyEntries(file: string, into: Vocabulary = new Map()): Vocabulary {
  if (!existsSync(file)) return into;
  const lines = readFileSync(file, 'utf8').split('\n');
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]!;
    if (line.trimStart().startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const row = TABLE_ROW_RE.exec(line);
    if (row && !/^(Term|---)\s*$/.test(row[2]!)) {
      // A table row: term · meaning · status · site. A list entry whose
      // status cell is absent is the corpus's own register: decided.
      addEntry(into, row[2]!, row[1] ?? null, statusOf(row[4]!));
      continue;
    }

    // A bold term may wrap onto the next line(s) in the list form
    // (`**Proportional\nverification** — …`): join until the bold closes.
    if (/^\s*[-*]\s+(?:<a id="[^"]+"><\/a>)?\s*\*\*/.test(line) && !/\*\*.*\*\*/.test(line)) {
      let j = i + 1;
      while (j < lines.length && (line.match(/\*\*/g) ?? []).length % 2 === 1 && lines[j]!.trim() !== '') {
        line += ' ' + lines[j]!.trim();
        j++;
      }
    }
    const entry = LIST_ENTRY_RE.exec(line);
    if (entry) addEntry(into, entry[2]!, entry[1] ?? null, 'decided');
  }
  return into;
}

/** Merge several vocabulary files; later files win on a duplicate term. */
export function loadVocabulary(files: string[]): Vocabulary {
  const out: Vocabulary = new Map();
  for (const f of files) vocabularyEntries(f, out);
  return out;
}

/** Whether `path#anchor` (relative to `fromFile`) resolves: the file
 *  exists and the anchor is an explicit `id="…"` or a heading slug. */
export function anchorExists(target: string, fromFile: string): boolean {
  const [path, anchor] = target.split('#');
  const file = path ? resolve(dirname(fromFile), path) : fromFile;
  if (!existsSync(file)) return false;
  if (!anchor) return true;
  const text = readFileSync(file, 'utf8');
  if (text.includes(`id="${anchor}"`)) return true;
  const slug = (s: string) => s.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
  return text.split('\n').some((l) => /^#{1,6}\s/.test(l) && slug(l.replace(/^#+\s*/, '')) === anchor);
}
