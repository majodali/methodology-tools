// IR documents (communication-pipeline docs/ir-schema.md): the parser
// for `*.ir.md` files and the mechanical checks CK-01..CK-11 of the
// schema's "Mechanical checks" table. Ported from the pipeline's
// scripts/ir.mjs and scripts/lint.mjs. The schema document is the spec;
// this module is a built artifact of it (Constitution Article 3).

import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import type { AuditFinding } from './audit.js';
import { Vocabulary, anchorExists } from './vocabulary.js';

export type IRKind = 'T' | 'C' | 'G' | 'R' | 'E' | 'A';
export const KINDS: Record<IRKind, string> = {
  T: 'term',
  C: 'claim',
  G: 'cluster',
  R: 'relation',
  E: 'evidence',
  A: 'ask',
};
/** Kinds that carry a provenance status (schema v1.1: terms, claims, clusters). */
export const PROVENANCE_KINDS: ReadonlySet<IRKind> = new Set<IRKind>(['T', 'C', 'G']);

export type ProvenanceStatus = 'decided' | 'proposed' | 'inferred';

export interface IRSection {
  title: string;
  line: number;
}

export interface IRElement {
  kind: IRKind;
  n: number;
  id: string;
  /** The element's full text, continuation lines joined. */
  body: string;
  /** `body` without the trailing provenance tag. */
  text: string;
  line: number;
  section: string;
  provenance: { status: ProvenanceStatus; detail: string } | null;
}

export interface IRDoc {
  /** Header lines before the first H2: reader, purpose, status, source, normative. */
  header: Record<string, string>;
  sections: IRSection[];
  elements: IRElement[];
  /** CK-16: lines inside a section that are neither element, heading, continuation, comment, empty-parts nor resolution line. */
  stray: { line: number; text: string }[];
}

const ELEMENT_RE = /^([TCGREA])(\d+)\.\s+(.*)$/;
const H2_RE = /^##\s+(.+?)\s*$/;
const PROV_RE = /\[(decided|proposed|inferred)(?::\s*([^\]]*))?\]\s*$/;
const HEADER_RE = /^(Reader|Purpose|Status|Source|Normative|Footprint):\s*(.*)$/;

export function parseIR(text: string): IRDoc {
  const lines = text.split(/\r?\n/);
  const ir: IRDoc = { header: {}, sections: [], elements: [], stray: [] };
  const firstH2 = lines.findIndex((l) => H2_RE.test(l));
  const headLines = firstH2 === -1 ? lines : lines.slice(0, firstH2);
  for (const l of headLines) {
    const m = HEADER_RE.exec(l.trim());
    if (m) ir.header[m[1]!.toLowerCase()] = m[2]!.trim();
  }
  let section: IRSection | null = null;
  let current: IRElement | null = null;
  const flush = () => {
    if (current) ir.elements.push(current);
    current = null;
  };
  lines.forEach((raw, i) => {
    const h = H2_RE.exec(raw);
    if (h) {
      flush();
      section = { title: h[1]!, line: i + 1 };
      ir.sections.push(section);
      return;
    }
    const m = ELEMENT_RE.exec(raw);
    if (m) {
      flush();
      current = {
        kind: m[1] as IRKind,
        n: Number(m[2]),
        id: `${m[1]}${m[2]}`,
        body: m[3]!,
        text: '',
        line: i + 1,
        section: section?.title ?? '(none)',
        provenance: null,
      };
      return;
    }
    if (current) {
      if (raw.trim() === '' || /^#/.test(raw)) flush();
      else current.body += ' ' + raw.trim();
      return;
    }
    const t = raw.trim();
    if (section && t !== '' && !/^#/.test(t) && !/^<!--/.test(t) && !/^Empty parts:/.test(t) && !/^A\d+ resolved:/.test(t)) {
      ir.stray.push({ line: i + 1, text: t.slice(0, 80) });
    }
  });
  flush();
  for (const e of ir.elements) {
    const p = PROV_RE.exec(e.body);
    e.provenance = p ? { status: p[1] as ProvenanceStatus, detail: (p[2] ?? '').trim() } : null;
    e.text = p ? e.body.slice(0, p.index).trim() : e.body.trim();
  }
  return ir;
}

export type SectionKind = 'terms' | 'claims' | 'relations' | 'evidence' | 'asks' | 'resolution';

export function sectionKind(title: string): SectionKind {
  const t = title.toLowerCase();
  if (/^terms?\b/.test(t)) return 'terms';
  if (/^relations?\b/.test(t)) return 'relations';
  if (/^evidence\b/.test(t)) return 'evidence';
  if (/^asks?\b/.test(t)) return 'asks';
  if (/^resolution\b/.test(t)) return 'resolution';
  return 'claims';
}

export function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

/** Element identifiers (`C3`, `E1`, …) of the given kinds found in `s`. */
export function idsIn(s: string, letters = 'TCGREA'): string[] {
  const re = new RegExp(`\\b([${letters}])(\\d+)\\b`, 'g');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out.push(`${m[1]}${m[2]}`);
  return out;
}

const READER_RE = /^RD-[1-5]\b/;
/** The referent rule's deictic phrases (CK-01; SP-03). */
export const DEICTIC = /\b(the other|the above|the former|the latter|the same)\b/i;
/** Sentence-initial "This specification restates" names its referent;
 *  "This is fine" does not. Flag the pronoun form only (CK-01; SP-03). */
export const PRONOUN_THEN_VERB =
  /^(It|This|That|These|Those)\s+(is|are|was|were|means|makes|made|has|have|had|does|did|will|would|can|could|should|may|might|seems|says|gives|keeps|lets|took|takes)\b/;

/** A semicolon that follows a colon in the same sentence separates list
 *  items, not clauses: "three parts: asks; what is covered; what changed". */
export function isList(s: string): boolean {
  const colon = s.indexOf(':');
  const semi = s.indexOf(';');
  return colon !== -1 && semi !== -1 && colon < semi;
}

/** A ", and" that follows a colon closes a list, not a second clause. */
function colonBeforeConjunction(s: string): boolean {
  const colon = s.indexOf(':');
  const conj = s.search(/,\s(and|but|so)\s/);
  return colon !== -1 && conj !== -1 && colon < conj;
}

export interface IRLintOptions {
  /** Project (and corpus) vocabulary for CK-04 and the unratified-term count. */
  vocab?: Vocabulary;
  /** The IR's path on disk; enables CK-11 (defined-at targets resolve). */
  file?: string;
}

export interface IRLintResult {
  findings: AuditFinding[];
  ir: IRDoc;
  /** Terms proposed in this IR with no decided vocabulary row. */
  unratifiedTerms: number;
}

const termKey = (e: IRElement) => e.text.split(/[:(]/)[0]!.trim().toLowerCase();

/** The schema's mechanical checks. Every CK finding is a violation of
 *  the IR schema; the schema table names the condition each one reports. */
export function lintIR(text: string, opts: IRLintOptions = {}): IRLintResult {
  const vocab = opts.vocab ?? new Map();
  const file = opts.file;
  const ir = parseIR(text);
  const findings: AuditFinding[] = [];
  // CK-03 and CK-04 are heuristics (a coordinating clause, a bolded
  // phrase), so they report as warnings; the other checks are exact.
  const HEURISTIC = new Set(['CK-03', 'CK-04']);
  const add = (rule: string, line: number, message: string) => {
    findings.push({ rule, severity: HEURISTIC.has(rule) ? 'warning' : 'violation', message, ...(file ? { file } : {}), line });
  };

  // CK-07: the Reader header is a catalog identifier; Purpose starts with report or document.
  const reader = ir.header['reader'] ?? '';
  const purpose = ir.header['purpose'] ?? '';
  if (!READER_RE.test(reader)) add('CK-07', 1, `Reader header is not a catalog identifier: "${reader}"`);
  if (!/^(report|document)\b/.test(purpose))
    add('CK-07', 1, `Purpose header must start with "report" or "document": "${purpose}"`);

  // CK-13: a term is defined once per IR (specification, Element kinds).

  {

    const seenTerms = new Map<string, string>();

    for (const e of ir.elements.filter((x) => x.kind === 'T')) {

      const name = e.text.split(/[:(]/)[0]!.trim().toLowerCase();

      const prev = seenTerms.get(name);

      if (prev !== undefined) add('CK-13', e.line, `${e.id} names the term "${name}" already defined by ${prev}`);

      else seenTerms.set(name, e.id);

    }

  }

  // CK-14: a reviewed IR has its review record with a verdict beside it.

  const selectedForRounds = /^yes/i.test(ir.header['normative'] ?? '') || /^document/.test(ir.header['purpose'] ?? '') || /\bRD-[45]\b/.test(ir.header['reader'] ?? '') || /\breview/i.test(ir.header['status'] ?? '');
  if (file && selectedForRounds && /^(reviewed|rendered|delivered)/.test(ir.header['status'] ?? '')) {

    const record = file.replace(/\.ir\.md$/, '.review.md');

    if (!existsSync(record)) add('CK-14', 1, `Status records a review but ${basename(record)} is absent`);

    else if (!/verdict/i.test(readFileSync(record, 'utf8'))) add('CK-14', 1, `${basename(record)} holds no verdict`);

  }


  // CK-16: element form (specification, Mechanical checks).


  for (const st of ir.stray) add('CK-16', st.line, `line is not an element, heading or continuation: "${st.text}"`);



  // CK-12: identifiers are unique within the document (specification,

  // Element kinds).

  {

    const seen = new Map<string, number>();

    for (const e of ir.elements) {

      const prev = seen.get(e.id);

      if (prev !== undefined) add('CK-12', e.line, `${e.id} is already used at line ${prev}`);

      else seen.set(e.id, e.line);

    }

  }


  // CK-10: the sections run Terms, Claims, Relations, Evidence, Asks.
  const kinds = ir.sections.map((s) => sectionKind(s.title));
  const order: SectionKind[] = ['terms', 'claims', 'relations', 'evidence', 'asks', 'resolution'];
  let last = -1;
  let ok = kinds.length > 0 && kinds[0] === 'terms';
  for (const k of kinds) {
    const i = order.indexOf(k);
    if (i < last && !(k === 'claims' && last === 1)) ok = false;
    if (i > last) last = i;
  }
  for (const req of ['terms', 'relations', 'evidence'] as SectionKind[]) if (!kinds.includes(req)) ok = false;
  if (!ok)
    add(
      'CK-10',
      ir.sections[0]?.line ?? 1,
      `sections must run Terms, Claims, Relations, Evidence, Asks; found: ${ir.sections.map((s) => s.title).join(' | ')}`,
    );

  // CK-08: an IR for either human-owner reader has an Asks section.
  if (/^RD-[12]/.test(reader) && !kinds.includes('asks')) add('CK-08', 1, 'an IR for RD-1 or RD-2 needs an Asks section');

  const ids = new Set(ir.elements.map((e) => e.id));
  const terms = new Set(ir.elements.filter((e) => e.kind === 'T').map(termKey));
  const clusterOf = new Map<string, string>();
  for (const e of ir.elements) {
    // CK-05: provenance status with its required fields.
    if (PROVENANCE_KINDS.has(e.kind)) {
      if (!e.provenance) add('CK-05', e.line, `${e.id} has no provenance status`);
      else {
        const { status, detail } = e.provenance;
        if (status === 'decided' && !detail) add('CK-05', e.line, `${e.id}: [decided] needs who and when, or a source`);
        if (status === 'proposed' && !detail) add('CK-05', e.line, `${e.id}: [proposed] needs the IR identifier or "this IR"`);
        if (status === 'inferred' && !/^R\d+/.test(detail)) add('CK-05', e.line, `${e.id}: [inferred] must cite a relation R<n>`);
      }
    }
    // CK-11: a term's defined-at target resolves.
    if (e.kind === 'T' && file) {
      const d = /defined-at:\s*(\S+)/.exec(e.body);
      if (d && !/^https?:/.test(d[1]!) && !anchorExists(d[1]!.replace(/[),.]+$/, ''), file))
        add('CK-11', e.line, `${e.id} defined-at target does not resolve: ${d[1]}`);
    }
    if (e.kind === 'C') {
      const w = wordCount(e.text);
      // CK-02: a claim is at most 40 words.
      if (w > 40) add('CK-02', e.line, `${e.id} is ${w} words (limit 40)`);
      // CK-01: the referent rule.
      if (PRONOUN_THEN_VERB.test(e.text)) add('CK-01', e.line, `${e.id} opens with a pronoun; name the referent`);
      const d = DEICTIC.exec(e.text);
      if (d) add('CK-01', e.line, `${e.id} uses "${d[1]}" without a named referent`);
      // CK-03: one claim per element; a list after a colon is not a join.
      if (/\s—\s|\s--\s/.test(e.text) || (/;\s/.test(e.text) && !isList(e.text)))
        add('CK-03', e.line, `${e.id} joins clauses with a semicolon or em-dash; split into claims`);
      else if (w > 25 && /,\s(and|but|so)\s/.test(e.text) && !colonBeforeConjunction(e.text))
        add('CK-03', e.line, `${e.id} may hold two claims (${w} words with a coordinating clause)`);
      // CK-04: a bolded term is a T element or a vocabulary term.
      for (const b of e.text.matchAll(/\*\*([^*]+)\*\*/g)) {
        const t = b[1]!.toLowerCase();
        if (!terms.has(t) && !vocab.has(t))
          add('CK-04', e.line, `${e.id} bolds "${b[1]}", which is neither a T element nor in the vocabulary`);
      }
      // CK-06: evidence pointers resolve.
      const ev = /evidence:\s*([^.;\]]+)/.exec(e.body);
      if (ev) for (const id of idsIn(ev[1]!, 'E')) if (!ids.has(id)) add('CK-06', e.line, `${e.id} cites ${id}, which does not exist`);
    }
    if (e.kind === 'R') {
      const refs = idsIn(e.text, 'CTGA');
      if (refs.length < 2) add('CK-06', e.line, `${e.id} must relate two identifiers`);
      for (const id of refs) if (!ids.has(id)) add('CK-06', e.line, `${e.id} names ${id}, which does not exist`);
      if (!/\b(supports|depends-on|contradicts|refines)\b/.test(e.text))
        add('CK-06', e.line, `${e.id} needs a verb: supports, depends-on, contradicts or refines`);
    }
    if (e.kind === 'G') {
      const m = /cluster:\s*([^\]]+)/.exec(e.text);
      const members = m ? idsIn(m[1]!, 'C') : [];
      if (!members.length) add('CK-06', e.line, `${e.id} lists no claims`);
      for (const id of members) {
        if (!ids.has(id)) add('CK-06', e.line, `${e.id} lists ${id}, which does not exist`);
        // CK-09: a claim is in one cluster.
        if (clusterOf.has(id)) add('CK-09', e.line, `${id} is in both ${clusterOf.get(id)} and ${e.id}`);
        clusterOf.set(id, e.id);
      }
    }
    if (e.kind === 'A') {
      const dep = /Depends:\s*([^.\]]+)/.exec(e.body);
      if (dep) for (const id of idsIn(dep[1]!, 'CA')) if (!ids.has(id)) add('CK-06', e.line, `${e.id} depends on ${id}, which does not exist`);
    }
  }

  // An unratified term: proposed in this IR and not yet a decided
  // vocabulary row (W-008's terms-introduced part; the divergence indicator).
  const unratifiedTerms = ir.elements.filter(
    (e) => e.kind === 'T' && e.provenance?.status === 'proposed' && vocab.get(termKey(e))?.status !== 'decided',
  ).length;
  return { findings, ir, unratifiedTerms };
}
