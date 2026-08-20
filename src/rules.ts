// Rule-corpus parsing (spec: methodology docs/rules/README.md — rule ID
// and header format; Article 5 rule form and defaults).

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  Conditions,
  DERIVED,
  Derived,
  ProjectType,
  Rule,
  TARGETS,
  TYPES,
  Target,
} from './types.js';

const RULE_HEADING_RE = /^###\s+([A-Z]-\d{3})\s+—\s+(.+)$/;

export interface ParsedCorpusRules {
  rules: Rule[];
  findings: string[];
}

/** Article 5 defaults when unstated: [C1+], all S-levels, all types, all targets. */
export function defaultConditions(): Conditions {
  return { c: { min: 1, max: 3 }, s: { min: 0, max: 2 }, types: null, targets: null, derived: [] };
}

/** Parse an `Applies:` tag line, e.g. `[C2+] [type: web-app, backend-service] [deployed]`. */
export function parseApplies(raw: string, findings: string[], where: string): Conditions {
  const cond = defaultConditions();
  const tags = raw.match(/\[[^\]]+\]/g) ?? [];
  if (tags.length === 0 && raw.trim() !== '' && raw.trim() !== '—') {
    findings.push(`${where}: unparseable Applies line "${raw}"`);
  }
  for (const tag of tags) {
    const body = tag.slice(1, -1).trim();
    let m: RegExpMatchArray | null;
    if ((m = body.match(/^C([0-3])(\+)?$/i))) {
      const n = Number(m[1]);
      cond.c = m[2] ? { min: n, max: 3 } : { min: n, max: n };
    } else if ((m = body.match(/^S([0-2])(\+)?$/i))) {
      const n = Number(m[1]);
      cond.s = m[2] ? { min: n, max: 2 } : { min: n, max: n };
    } else if ((m = body.match(/^type:\s*(.+)$/i))) {
      const names = m[1]!.split(',').map((s) => s.trim());
      const resolved: ProjectType[] = [];
      for (const n of names) {
        const hit = TYPES.find((t) => t.toLowerCase() === n.toLowerCase());
        if (hit) resolved.push(hit);
        else findings.push(`${where}: unknown type "${n}" in tag ${tag}`);
      }
      cond.types = resolved;
    } else if ((m = body.match(/^target:\s*(.+)$/i))) {
      const names = m[1]!.split(',').map((s) => s.trim());
      const resolved: Target[] = [];
      for (const n of names) {
        const hit = TARGETS.find((t) => t.toLowerCase() === n.toLowerCase());
        if (hit) resolved.push(hit);
        else findings.push(`${where}: unknown target "${n}" in tag ${tag}`);
      }
      cond.targets = resolved;
    } else if (DERIVED.includes(body.toLowerCase() as Derived)) {
      cond.derived.push(body.toLowerCase() as Derived);
    } else {
      findings.push(`${where}: unrecognized applicability tag ${tag}`);
    }
  }
  return cond;
}

/** Load every rule from `<corpusRoot>/docs/rules/*.md` (README excluded). */
export function loadRules(corpusRoot: string): ParsedCorpusRules {
  const dir = join(corpusRoot, 'docs', 'rules');
  const findings: string[] = [];
  const rules: Rule[] = [];

  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md')
    .sort();

  for (const file of files) {
    const path = join(dir, file);
    const lines = readFileSync(path, 'utf8').split('\n');
    lines.forEach((raw, i) => {
      const h = raw.match(RULE_HEADING_RE);
      if (!h) return;
      const id = h[1]!;
      const title = h[2]!.trim();
      const where = `${file}:${i + 1} (${id})`;
      let appliesRaw = '';
      let keywords: string[] = [];
      for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
        const a = lines[j]!.match(/^Applies:\s*(.*)$/);
        if (a) appliesRaw = a[1]!.trim();
        const k = lines[j]!.match(/^Keywords:\s*(.*)$/);
        if (k) keywords = k[1]!.split(',').map((s) => s.trim()).filter(Boolean);
      }
      if (!appliesRaw) findings.push(`${where}: missing Applies line (Article 5)`);
      rules.push({
        id,
        title,
        file,
        line: i + 1,
        appliesRaw,
        applies: parseApplies(appliesRaw, findings, where),
        keywords,
      });
    });
  }

  const seen = new Set<string>();
  for (const r of rules) {
    if (seen.has(r.id)) findings.push(`duplicate rule ID ${r.id} — IDs are unique across the corpus`);
    seen.add(r.id);
  }

  return { rules, findings };
}
