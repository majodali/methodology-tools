// `mtool audit deliver`: the audit process's compare-and-deliver step
// (spec: methodology docs/audit-process.md — the tooling transitional
// Risk R5 awaits). Computes the current finding fingerprint, reads the
// baseline from the project's own Audit log, and decides whether a new
// entry is due. Raising the delivery PR stays with the operator; with
// --write the entry is appended (register created on first delivery).

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AuditReport, FingerprintItem, buildAudit, fingerprint } from './audit.js';
import { git, latestSemverTag } from './git.js';

export interface BaselineEntry {
  date: string;
  kind: string;
  raw: string;
  /** Parsed (rule, file[, severity]) pairs; severity present only for
   *  machine-formatted digests. */
  pairs: { rule: string; file: string; severity?: string }[];
  /** True when the entry's outcome reads as pass / zero findings. */
  pass: boolean;
  parseNote: string | null;
}

export type DeliveryVerdict = 'deliver-first' | 'deliver-transition' | 'no-change';

export interface DeliveryReport {
  repo: string;
  audit: AuditReport;
  current: FingerprintItem[];
  baseline: BaselineEntry | null;
  verdict: DeliveryVerdict;
  comparedOn: 'no-baseline' | 'rule-severity-file' | 'rule-file' | 'outcome-counts';
  entry: string;
  written: string | null;
}

const ENTRY_START_RE = /^-\s+(\d{4}(?:-\d{2}){1,2})\s+—\s+(form|semantic)\b/u;
const PAIR_RE = /([A-Z]-\d{3}|Article \d+(?: \(declaration accuracy\); K-\d{3})?)(?: \((violation|warning)\))?:\s*`([^`]+)`/gu;

/** Newest same-kind entry in the project's Audit log (last in file
 *  order — entries are append-oriented). */
export function parseBaseline(repo: string, kind: 'form' | 'semantic'): BaselineEntry | null {
  const path = join(repo, 'docs', 'audits.md');
  if (!existsSync(path)) return null;
  const lines = readFileSync(path, 'utf8').split('\n');
  const entries: { date: string; kind: string; text: string }[] = [];
  for (const raw of lines) {
    const m = raw.match(ENTRY_START_RE);
    if (m) entries.push({ date: m[1]!, kind: m[2]!, text: raw });
    else if (entries.length > 0 && /^\s+\S/.test(raw)) entries[entries.length - 1]!.text += ' ' + raw.trim();
  }
  const same = entries.filter((e) => e.kind === kind);
  if (same.length === 0) return null;
  const e = same[same.length - 1]!;

  const pairs: BaselineEntry['pairs'] = [];
  for (const m of e.text.matchAll(PAIR_RE)) {
    pairs.push({ rule: m[1]!, file: m[3]!, ...(m[2] ? { severity: m[2] } : {}) });
  }
  const pass =
    /—\s*pass\b/iu.test(e.text) ||
    /\b0 violations \/ 0 warnings\b/u.test(e.text) ||
    /\bno findings\b/iu.test(e.text);
  let parseNote: string | null = null;
  if (!pass && pairs.length === 0) {
    parseNote =
      'baseline entry has findings but no machine-parseable digest — compared coarsely on outcome counts (parse ambiguity is a finding, not a guess)';
  } else if (pairs.length > 0 && pairs.some((p) => !p.severity)) {
    parseNote = 'baseline digest lacks severities — compared on (rule, file)';
  }
  return { date: e.date, kind: e.kind, raw: e.text, pairs, pass, parseNote };
}

function renderEntry(
  r: AuditReport,
  current: FingerprintItem[],
  date: string,
  corpusVersion: string,
): string {
  const sha = git(['rev-parse', '--short', 'HEAD'], r.repo) ?? 'unknown';
  const counts = { violation: 0, warning: 0, info: 0 };
  for (const f of r.findings) counts[f.severity]++;
  const outcome =
    counts.violation + counts.warning === 0
      ? `pass (${counts.info} info)`
      : `${counts.violation} violations / ${counts.warning} warnings / ${counts.info} info`;
  const digest =
    current.length === 0
      ? '—'
      : current.map((i) => `${i.rule} (${i.severity}): \`${i.file}\``).join('; ');
  return `- ${date} — form — full tree — audited ${sha} against methodology ${corpusVersion} — ${outcome} — ${digest}`;
}

const REGISTER_HEADER = `# Audit log

The register of audit executions (methodology Article 9); entry format
and delivery per the methodology's audit process — entries arrive by
Audit delivery on state transitions. This file was created by the
first delivery.
`;

export function buildDelivery(
  repo: string,
  corpus: string,
  opts: { write?: boolean; date: string },
): DeliveryReport {
  const audit = buildAudit(repo, corpus, { mode: 'full' });
  const current = fingerprint(audit.findings);
  const baseline = parseBaseline(repo, 'form');

  let verdict: DeliveryVerdict;
  let comparedOn: DeliveryReport['comparedOn'];
  if (baseline === null) {
    verdict = 'deliver-first';
    comparedOn = 'no-baseline';
  } else if (baseline.pass && baseline.pairs.length === 0) {
    comparedOn = 'rule-severity-file';
    verdict = current.length === 0 ? 'no-change' : 'deliver-transition';
  } else if (baseline.pairs.length > 0) {
    const withSeverity = baseline.pairs.every((p) => p.severity);
    comparedOn = withSeverity ? 'rule-severity-file' : 'rule-file';
    const key = (rule: string, file: string, severity?: string) =>
      withSeverity ? `${rule}|${severity}|${file}` : `${rule}|${file}`;
    const b = new Set(baseline.pairs.map((p) => key(p.rule, p.file, p.severity)));
    const c = new Set(current.map((i) => key(i.rule, i.file, i.severity)));
    const equal = b.size === c.size && [...b].every((k) => c.has(k));
    verdict = equal ? 'no-change' : 'deliver-transition';
  } else {
    // Findings claimed but digest unparseable: the comparison cannot be
    // made, so deliver conservatively — the parse note travels with the
    // report (parse ambiguity is a finding, not a guess).
    comparedOn = 'outcome-counts';
    verdict = 'deliver-transition';
  }

  const entry = renderEntry(audit, current, opts.date, latestSemverTag(corpus) ?? 'untagged');
  let written: string | null = null;
  if (opts.write && verdict !== 'no-change') {
    const path = join(repo, 'docs', 'audits.md');
    const existing = existsSync(path) ? readFileSync(path, 'utf8') : REGISTER_HEADER + '\n';
    writeFileSync(path, existing.replace(/\n*$/, '\n') + entry + '\n');
    written = path;
  }

  return { repo, audit, current, baseline, verdict, comparedOn, entry, written };
}

export function renderDelivery(r: DeliveryReport): string {
  const lines = [
    `audit deliver — ${r.audit.declared}`,
    `current fingerprint: ${r.current.length === 0 ? '(clean)' : r.current.map((i) => `${i.rule}(${i.severity[0]}):${i.file}`).join('; ')}`,
    r.baseline
      ? `baseline: ${r.baseline.date} — ${r.baseline.pass ? 'pass' : `${r.baseline.pairs.length} parsed pair(s)`}${r.baseline.parseNote ? ` — ${r.baseline.parseNote}` : ''}`
      : 'baseline: none (no same-kind Audit-log entry)',
    `verdict: ${r.verdict} (compared on ${r.comparedOn})`,
  ];
  if (r.verdict !== 'no-change') {
    lines.push('entry:', r.entry);
    lines.push(
      r.written
        ? `written to ${r.written} — raise the delivery PR (register maintenance)`
        : 'not written (pass --write to append; then raise the delivery PR)',
    );
  }
  return lines.join('\n');
}
