// `mtool style`: the mechanically checkable part of the methodology's
// prose rules (the P- rules, W-008's report shape, K-010's supersession
// markers), as the communication pipeline's style specification
// (docs/style-spec.md, the `lint` column) restates them. Ported from
// the pipeline's scripts/lint.mjs (lintProse). Each finding cites the
// methodology rule the check serves; the SP identifier of the
// specification row travels in `check` and at the end of the message.
// The P- rules are SHOULD-level in their mechanical part, so prose
// findings are warnings; a report missing or misordering W-008's
// headings is a violation of that rule's MUST.

import { readFileSync } from 'node:fs';
import type { AuditFinding, Severity } from './audit.js';
import { DEICTIC, PRONOUN_THEN_VERB, isList, wordCount } from './ir.js';
import { Vocabulary, anchorExists } from './vocabulary.js';

export { anchorExists, loadVocabulary, vocabularyEntries } from './vocabulary.js';
export type { Vocabulary, VocabularyEntry } from './vocabulary.js';

export interface StyleFinding extends AuditFinding {
  /** The style-specification row (`SP-nn`) the finding instantiates. */
  check: string;
}

/** Style-specification row → the methodology rule it serves. */
export const RULE_OF: Record<string, string> = {
  'SP-01': 'P-002',
  'SP-02': 'P-002',
  'SP-03': 'P-002',
  'SP-04': 'P-008',
  'SP-05': 'P-004',
  'SP-06': 'P-004',
  'SP-07': 'P-003',
  'SP-08': 'P-002',
  'SP-09': 'P-002',
  'SP-10': 'P-005',
  'SP-12': 'P-006',
  'SP-13': 'W-008',
  'SP-14': 'W-008',
  'SP-16': 'P-007',
  'SP-20': 'P-001',
  'SP-22': 'K-010',
  'SP-23': 'P-008',
  'SP-24': 'P-008',
};

const BARE_ID = /(?<![\w\[\(`/#.-])((?:[A-Z]{1,3}-\d{1,4})|§\d+)(?![\w\]\)`/-])/g;

type BlockKind = 'para' | 'row' | 'table' | 'heading';

interface Block {
  line: number;
  text: string;
  kind: BlockKind;
}

/** Prose paragraphs, list items, table rows and headings, skipping code
 *  fences, HTML comments and IR-element lines. A paragraph or list item
 *  that opens with a bold label, or a short `head — description`
 *  pointer item, is a fielded row: SP-09 permits one em-dash there and
 *  SP-07 permits the label. */
export function proseBlocks(text: string): Block[] {
  const out: Block[] = [];
  const lines = text.split(/\r?\n/);
  let fence = false;
  let comment = false;
  let buf: string[] = [];
  let start = 0;
  let rowStart = false;
  const flush = () => {
    if (buf.length) out.push({ line: start, text: buf.join(' '), kind: rowStart ? 'row' : 'para' });
    buf = [];
    rowStart = false;
  };
  lines.forEach((raw, i) => {
    const l = raw.trimEnd();
    if (/^\s*```/.test(l)) {
      flush();
      fence = !fence;
      return;
    }
    if (fence) return;
    if (/<!--/.test(l)) comment = true;
    if (comment) {
      if (/-->/.test(l)) comment = false;
      return;
    }
    if (/^\s*$/.test(l)) {
      flush();
      return;
    }
    if (/^\s*\|/.test(l)) {
      flush();
      out.push({ line: i + 1, text: l, kind: 'table' });
      return;
    }
    if (/^#{1,6}\s/.test(l)) {
      flush();
      out.push({ line: i + 1, text: l.replace(/^#+\s*/, ''), kind: 'heading' });
      return;
    }
    if (/^[TCGREA]\d+\.\s/.test(l)) {
      flush();
      return;
    }
    const isItem = /^\s*(?:[-*]|\d+\.)\s+/.test(l);
    if (isItem) flush();
    const item = l.replace(/^\s*(?:[-*]|\d+\.)\s+(?:\[[ x]\]\s+)?/, '').replace(/^>\s?/, '');
    if (!buf.length) {
      start = i + 1;
      const head = item.split(/\s—\s/)[0]!;
      if (/^\*\*[^*]+\*\*/.test(item) || (isItem && /\s—\s/.test(item) && head.split(/\s+/).length <= 6)) rowStart = true;
    }
    buf.push(item);
  });
  flush();
  return out;
}

/** Sentences of a block: code spans count as one word, links as their text. */
export function sentences(p: string): string[] {
  return p
    .replace(/`[^`]*`/g, 'code')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .split(/(?<=[.!?])\s+(?=[A-Z"(\[])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface ProseLintOptions {
  vocab?: Vocabulary;
  /** Also report sentences over 25 words as info (SP-02's warn band). */
  verbose?: boolean;
  /** The document's path on disk; enables SP-24 and the vocabulary-file exemption. */
  file?: string;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Lint one document's text. */
export function lintProseText(text: string, opts: ProseLintOptions = {}): StyleFinding[] {
  const vocab = opts.vocab ?? new Map();
  const verbose = opts.verbose ?? false;
  const file = opts.file;
  const f: StyleFinding[] = [];
  const add = (check: string, severity: Severity, line: number, msg: string) => {
    f.push({
      rule: RULE_OF[check] ?? check,
      severity,
      message: `${msg} (${check})`,
      ...(file ? { file } : {}),
      line,
      check,
    });
  };
  const blocks = proseBlocks(text);
  const seenIds = new Set<string>();
  const unfenced = text.replace(/```[\s\S]*?```/g, '');

  // SP-13 (W-008): a report carries Asks, What is already covered, What
  // changed, in that order. A document with an Asks heading and at
  // least one more of the three is a report; a plan with an Asks
  // section alone is not.
  const hasAsks = /^##\s+Asks\b/m.test(unfenced);
  if (hasAsks) {
    const want = ['Asks', 'What is already covered', 'What changed'];
    const pos = want.map((h) => unfenced.search(new RegExp(`^##\\s+${h}`, 'm')));
    const present = pos.filter((p) => p >= 0).length;
    if (present >= 2 && (pos.some((p) => p < 0) || !(pos[0]! < pos[1]! && pos[1]! < pos[2]!)))
      add('SP-13', 'violation', 1, `a report carries Asks, What is already covered, What changed, in that order; found positions ${pos.join(',')}`);
  }

  // The first-use unit for SP-23 is the document for a report and the
  // section for a reference document (Reader: RD-4 or RD-5).
  const perSection = /^Reader:.*\bRD-[45]\b/m.test(text.split('\n').slice(0, 20).join('\n'));
  const isVocabulary = file ? /(^|\/)vocabulary\.md$/.test(file) : false;
  let seenTerms = new Set<string>();
  const termList = [...vocab.values()].filter((v) => v.term.length > 3).sort((a, b) => b.term.length - a.term.length);

  // SP-24: a link to a #def- anchor resolves.
  if (file)
    for (const m of text.matchAll(/\]\(([^)\s]*#def-[\w-]+)\)/g)) {
      if (!anchorExists(m[1]!, file)) add('SP-24', 'warning', text.slice(0, m.index).split('\n').length, `link to ${m[1]} does not resolve`);
    }

  for (const b of blocks) {
    if (b.kind === 'heading') {
      if (perSection && /^##\s/.test(text.split('\n')[b.line - 1] ?? '')) seenTerms = new Set();
      // SP-10 (P-005): a header predicts its section's content.
      if (/^[A-Z]{1,3}-\d+\s*$/.test(b.text)) add('SP-10', 'warning', b.line, `identifier-only header "${b.text}"`);
      if (/\?\s*$/.test(b.text)) add('SP-10', 'warning', b.line, `header ends in a question mark: "${b.text}"`);
      if (/—/.test(b.text) && !/^Chunk \d/.test(b.text)) add('SP-10', 'warning', b.line, `header contains an em-dash: "${b.text}"`);
      continue;
    }
    // SP-05 (P-004): bare identifiers — first occurrence in the
    // document, prose and tables alike. The first cell of a table row
    // is a definition site (the row defines the identifier), so it
    // satisfies the first use.
    const scan =
      b.kind === 'table'
        ? b.text.replace(/^\|\s*([^|]*)\|/, (_m0, cell: string) => {
            for (const x of cell.matchAll(BARE_ID)) seenIds.add(x[1]!);
            return '|' + ' '.repeat(cell.length) + '|';
          })
        : b.text;
    for (const m of scan.matchAll(BARE_ID)) {
      const id = m[1]!;
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      const after = scan.slice(m.index + id.length, m.index + id.length + 4);
      const inLink = /\[[^\]]*$/.test(scan.slice(0, m.index)) && /^[^\[]*\]\(/.test(scan.slice(m.index));
      if (!inLink && !/^\s*\(/.test(after)) add('SP-05', 'warning', b.line, `${id} appears bare on first use; add its name in parentheses or a link`);
    }
    if (b.kind === 'para' || b.kind === 'row' || b.kind === 'table') {
      // SP-23 (P-008): a vocabulary term is linked to its definition
      // site at first use. Code spans are not prose: blank them so a
      // term inside backticks is not a first use.
      const scanText = b.text.replace(/`[^`]*`/g, (c) => ' '.repeat(c.length));
      const lower = scanText.toLowerCase();
      for (const v of termList) {
        const key = v.term.toLowerCase();
        if (seenTerms.has(key)) continue;
        const idx = lower.search(new RegExp(`\\b${escapeRe(key)}\\b`));
        if (idx === -1) continue;
        seenTerms.add(key);
        const before = scanText.slice(0, idx);
        const after = scanText.slice(idx + key.length);
        const linked = /\[[^\]]*$/.test(before) && /^[^\[\]]*\]\(/.test(after);
        const defining = /<a id="def-/.test(before.slice(-60)) || /\*\*$/.test(before) || (b.kind === 'row' && /^\*\*/.test(b.text));
        if (!linked && !defining && v.anchor && !isVocabulary)
          add('SP-23', 'warning', b.line, `"${v.term}" first used here without a link to its definition (#${v.anchor})`);
      }
    }
    if (b.kind !== 'para' && b.kind !== 'row') continue;
    const row = b.kind === 'row';
    for (const s of sentences(b.text)) {
      const w = wordCount(s);
      // SP-02 (P-002): a sentence is at most about 25 words.
      if (w > 35) add('SP-02', 'warning', b.line, `${w}-word sentence: "${s.slice(0, 60)}…"`);
      else if (w > 25 && verbose) add('SP-02', 'info', b.line, `${w}-word sentence`);
      // SP-03 (P-002, the referent rule): every referent is named.
      if (PRONOUN_THEN_VERB.test(s)) add('SP-03', 'warning', b.line, `sentence opens with a pronoun; name the referent: "${s.slice(0, 50)}…"`);
      const d = DEICTIC.exec(s);
      if (d) add('SP-03', 'warning', b.line, `"${d[1]}" without a named referent`);
      // SP-08 (P-002): no rhetorical devices.
      if (/^That is [^.]{1,60}\.$/.test(s)) add('SP-08', 'warning', b.line, `aphoristic fragment: "${s}"`);
      // SP-09 (P-002): no chained em-dashes or clause-joining semicolons.
      const body = row ? s.replace(/^\*\*[^*]+\*\*/, '') : s;
      const dashes = (body.match(/\s—\s/g) ?? []).length;
      if ((row ? dashes > 1 : dashes > 0) || (/;\s+[a-z]/.test(s) && !isList(s)))
        add('SP-09', 'warning', b.line, `clauses joined by em-dash or semicolon: "${s.slice(0, 60)}…"`);
      // SP-20 (P-001): numbers go in a table or on their own line.
      // Identifiers (CK-01, RD-4), versions (v1.5.0, 1.4.0) and dates
      // are not the numbers the rule means.
      const nums =
        s
          .replace(/\b[A-Z]{1,3}-\d+\b/g, '')
          .replace(/\bv?\d+\.\d+(\.\d+)?\b/g, '')
          .replace(/\b\d{4}-\d{2}-\d{2}\b/g, '')
          .match(/\b\d[\d,.]*\b/g) ?? [];
      if (nums.length >= 3) add('SP-20', 'warning', b.line, `${nums.length} numerals in one sentence; prefer a table or its own line`);
    }
    // SP-07 (P-003): bold is a field label or a definition site.
    let first = true;
    for (const m of b.text.matchAll(/\*\*([^*]+)\*\*/g)) {
      const w = wordCount(m[1]!);
      const label = row && first;
      first = false;
      if (w > 4 && !/:$/.test(m[1]!) && !(label && w <= 8))
        add('SP-07', 'warning', b.line, `bold span of ${w} words: "${m[1]!.slice(0, 40)}…" (bold is a label or a definition site)`);
    }
    // SP-08 (P-002): the suspense construction "X is not Y. It is Z."
    const ss = sentences(b.text);
    for (let i = 0; i + 1 < ss.length; i++)
      if (/\bis not\b/.test(ss[i]!) && /^It is\b/.test(ss[i + 1]!))
        add('SP-08', 'warning', b.line, `suspense construction: "${ss[i]!.slice(0, 40)}… ${ss[i + 1]!.slice(0, 20)}…"`);
  }
  return f;
}

/** Lint the document at `path`. */
export function lintProse(path: string, opts: Omit<ProseLintOptions, 'file'> = {}): StyleFinding[] {
  return lintProseText(readFileSync(path, 'utf8'), { ...opts, file: path });
}
