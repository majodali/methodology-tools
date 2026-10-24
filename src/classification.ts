// Classification parsing (spec: vocabulary "Classification" definition;
// Article 4 stage 1). The Classification is the config: mtool has no
// configuration file of its own (tools plan, design decisions).

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  Classification,
  DeviationEntry,
  ProjectType,
  TARGETS,
  TYPES,
  Target,
} from './types.js';

// Omission defaults — sole authoritative location is the vocabulary's
// Classification definition; these constants mirror it (Article 3).
const DEFAULTS = {
  slevel: 0, // S0
  type: 'exploration' as ProjectType,
  target: 'none/local' as Target,
};

const RULE_ID_RE = /\b([A-Z]-\d{3})\b/;

function fieldValue(lines: string[], name: string): string | null {
  // Accepts `- **C-tier**: C1` and `- C-tier: C1` (and non-list forms).
  const re = new RegExp(`^[-*]?\\s*\\**${name}\\**\\s*:\\s*(.+)$`, 'i');
  for (const raw of lines) {
    const m = raw.match(re);
    if (m) return m[1]!.trim();
  }
  return null;
}

function sectionLines(lines: string[], heading: string): string[] {
  const start = lines.findIndex((l) =>
    l.match(new RegExp(`^#{2,6}\\s+${heading}\\s*$`, 'i')),
  );
  if (start < 0) return [];
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{2,6}\s+/.test(lines[i]!)) break;
    out.push(lines[i]!);
  }
  return out;
}

function normalizeEnum<T extends string>(
  value: string,
  allowed: readonly T[],
): T | null {
  const v = value.toLowerCase().replace(/[`]/g, '').trim();
  for (const a of allowed) {
    const canon = a.toLowerCase();
    if (v === canon || v.startsWith(canon)) return a;
    // tolerate slug spellings from Binding blocks: none-local, package-registry
    if (v.replace(/-/g, ' ') === canon.replace(/\//g, ' ')) return a;
    if (v.replace(/-/g, '/') === canon) return a;
  }
  return null;
}

/** Parse `<repoRoot>/docs/classification.md`; absent file = implicit C0
 *  with every omission default (Article 4). */
export function loadClassification(repoRoot: string): Classification {
  const path = join(repoRoot, 'docs', 'classification.md');
  const findings: string[] = [];

  if (!existsSync(path)) {
    return {
      implicit: true,
      ctier: 0,
      slevel: DEFAULTS.slevel,
      type: DEFAULTS.type,
      target: DEFAULTS.target,
      pinned: null,
      workflow: 'none',
      deviations: [],
      customDefinitions: [],
      findings,
    };
  }

  const lines = readFileSync(path, 'utf8').split('\n');

  // Mandatory: C-tier.
  const cRaw = fieldValue(lines, 'C-tier');
  let ctier = 0;
  if (cRaw === null) {
    findings.push('classification: mandatory field C-tier missing (vocabulary: Classification)');
  } else {
    const m = cRaw.match(/^C([0-3])\b/i);
    if (m) ctier = Number(m[1]);
    else findings.push(`classification: unparseable C-tier value "${cRaw}"`);
  }

  // Mandatory at C1+: pinned version.
  const pinRaw = fieldValue(lines, 'Pinned methodology version');
  let pinned: string | null = null;
  if (pinRaw !== null) {
    const m = pinRaw.match(/(\d+\.\d+\.\d+)/);
    if (m) pinned = m[1]!;
    else findings.push(`classification: unparseable pinned version "${pinRaw}"`);
  } else if (ctier >= 1) {
    findings.push('classification: pinned methodology version is mandatory at C1+ (vocabulary: Classification)');
  }

  // Optional fields with omission defaults.
  const sRaw = fieldValue(lines, 'S-level');
  let slevel = DEFAULTS.slevel;
  if (sRaw !== null) {
    const m = sRaw.match(/^S([0-2])\b/i);
    if (m) slevel = Number(m[1]);
    else findings.push(`classification: unparseable S-level value "${sRaw}"`);
  }

  const tRaw = fieldValue(lines, 'Type');
  let type = DEFAULTS.type;
  if (tRaw !== null) {
    const t = normalizeEnum(tRaw, TYPES);
    if (t) type = t;
    else findings.push(`classification: type "${tRaw}" is not an amendment-controlled field value`);
  }

  const gRaw = fieldValue(lines, 'Target');
  let target = DEFAULTS.target;
  if (gRaw !== null) {
    const g = normalizeEnum(gRaw, TARGETS);
    if (g) target = g;
    else findings.push(`classification: target "${gRaw}" is not an amendment-controlled field value`);
  }

  const wRaw = fieldValue(lines, 'Workflow');
  let workflow: Classification['workflow'] = 'none';
  if (wRaw !== null && !/^none\b/i.test(wRaw)) {
    workflow = 'declared';
    findings.push(
      'classification: Workflow declared, but this tool cannot yet parse the ' +
        'declaration (methodology v1.4.0 defines the canonical format; the ' +
        'parser is queued in this repo\'s backlog) — `deployed` cannot be ' +
        'derived and is treated as false',
    );
  }

  // Embedded registers.
  const deviations: DeviationEntry[] = [];
  for (const raw of sectionLines(lines, 'Deviation register')) {
    const m = raw.match(/^\s*[-*]\s+(.*)$/);
    if (!m) continue;
    const text = m[1]!.trim();
    if (/^no deviations/i.test(text)) continue;
    const ref = text.match(RULE_ID_RE);
    if (!ref) {
      findings.push(
        `classification: deviation entry lacks the rule it overrides ("${text.slice(0, 60)}") — ` +
          'overrides are always explicit (Article 4)',
      );
    }
    deviations.push({ text, ruleRef: ref ? ref[1]! : null });
  }

  const customDefinitions: string[] = [];
  for (const raw of sectionLines(lines, 'Custom definitions')) {
    const m = raw.match(/^\s*[-*]\s+(.*)$/);
    if (!m) continue;
    const text = m[1]!.trim();
    if (/^no custom definitions/i.test(text)) continue;
    customDefinitions.push(text);
  }

  return {
    implicit: false,
    ctier,
    slevel,
    type,
    target,
    pinned,
    workflow,
    deviations,
    customDefinitions,
    findings,
  };
}
