// `mtool census`: the methodology-repo duty (M-001/M-002) — reconcile
// the Portfolio register against observable repositories, refresh stale
// summaries, emit spot-check candidates. The tooling transitional Risk
// R3 awaits. Enumeration sources, in order of preference: the GitHub
// API (GITHUB_TOKEN honored; may be unreachable behind egress policy),
// or an --observed file; without either, enumeration-unavailable is
// itself a finding, and checkout-based reconciliation still runs.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { loadClassification } from './classification.js';

export interface RegisterRow {
  project: string;
  location: string;
  summary: string;
  notes: string;
}

export interface ObservedRepo {
  name: string;
}

export interface CheckoutSummary {
  name: string;
  /** Rendered classification summary, e.g. "C2 / S0 / web-app / serverless-aws — pinned 1.1.0" or "implicit C0". */
  summary: string;
}

export interface CensusFinding {
  kind:
    | 'unregistered-repo'
    | 'unobservable-row'
    | 'summary-drift'
    | 'spot-check-candidate'
    | 'enumeration-unavailable';
  severity: 'violation' | 'warning' | 'info';
  cites: string;
  message: string;
  proposedSummary?: string;
}

export interface CensusReport {
  rows: RegisterRow[];
  observedCount: number | null;
  checkoutCount: number;
  findings: CensusFinding[];
}

/** Parse the Portfolio register's table rows. */
export function parseRegister(corpus: string): RegisterRow[] {
  const path = join(corpus, 'docs', 'registers', 'portfolio.md');
  const rows: RegisterRow[] = [];
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const m = raw.match(/^\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]*)\|$/);
    if (!m) continue;
    const project = m[1]!.trim();
    if (project === 'Project' || /^-+$/.test(project.replace(/\s/g, '-'))) continue;
    rows.push({
      project,
      location: m[2]!.trim(),
      summary: m[3]!.trim(),
      notes: m[4]!.trim(),
    });
  }
  return rows;
}

export function summarizeCheckout(dir: string): CheckoutSummary {
  const c = loadClassification(dir);
  const summary = c.implicit
    ? 'implicit C0'
    : `C${c.ctier} / S${c.slevel} / ${c.type} / ${c.target} — pinned ${c.pinned ?? 'latest'}`;
  return { name: basename(dir), summary };
}

const norm = (s: string) => s.toLowerCase().replace(/[`*]/g, '').replace(/[ /]+/g, '-');

/** The pure reconciliation: register rows vs observed repos vs checkout summaries. */
export function reconcile(
  rows: RegisterRow[],
  observed: ObservedRepo[] | null,
  checkouts: CheckoutSummary[],
): CensusFinding[] {
  const findings: CensusFinding[] = [];
  const rowByName = new Map(rows.map((r) => [r.project, r]));

  if (observed === null) {
    findings.push({
      kind: 'enumeration-unavailable',
      severity: 'warning',
      cites: 'M-001 (completeness unverifiable this run)',
      message:
        'account enumeration unavailable (no API access, no --observed file) — completeness not verified',
    });
  } else {
    for (const o of observed) {
      if (!rowByName.has(o.name)) {
        findings.push({
          kind: 'unregistered-repo',
          severity: 'violation',
          cites: 'M-001 (the Portfolio register MUST contain every project)',
          message: `observed repository "${o.name}" has no Portfolio row`,
        });
      }
    }
    const observedNames = new Set(observed.map((o) => o.name));
    for (const r of rows) {
      if (!observedNames.has(r.project)) {
        findings.push({
          kind: 'unobservable-row',
          severity: 'warning',
          cites: 'M-002 (census reconciles the register against observable repositories)',
          message: `register row "${r.project}" matches no observed repository (renamed, deleted, or beyond enumeration reach)`,
        });
      }
    }
  }

  const checkoutByName = new Map(checkouts.map((c) => [c.name, c]));
  for (const r of rows) {
    const c = checkoutByName.get(r.project);
    if (!c) {
      if (norm(r.summary).startsWith('implicit-c0')) {
        findings.push({
          kind: 'spot-check-candidate',
          severity: 'info',
          cites: 'M-002 / Article 4 (declaration accuracy; spot-check implicit-C0 defaults)',
          message: `"${r.project}" is registered implicit C0 with no checkout to verify against — spot-check candidate`,
        });
      }
      continue;
    }
    // Compare the row's summary head (before any parenthetical) with
    // the observed declaration, slug-normalized.
    const rowHead = norm(r.summary);
    const actual = norm(c.summary);
    if (rowHead !== actual) {
      findings.push({
        kind: 'summary-drift',
        severity: 'warning',
        cites: 'M-002 (the census refreshes stale summaries; the summary is an informative cache)',
        message: `"${r.project}": register says "${r.summary}" but the observed declaration is "${c.summary}"`,
        proposedSummary: c.summary,
      });
    }
  }

  return findings;
}

export function loadObserved(path: string): ObservedRepo[] {
  const text = readFileSync(path, 'utf8').trim();
  if (text.startsWith('[')) {
    const arr = JSON.parse(text) as { name?: string; full_name?: string }[];
    return arr.map((r) => ({ name: (r.name ?? r.full_name ?? '').split('/').pop()! })).filter((r) => r.name);
  }
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => ({ name: l.split('/').pop()! }));
}

export function buildCensus(
  corpus: string,
  opts: { observedFile?: string; checkoutDirs: string[] },
): CensusReport {
  const rows = parseRegister(corpus);
  const observed = opts.observedFile ? loadObserved(opts.observedFile) : null;
  const checkouts: CheckoutSummary[] = [];
  for (const dir of opts.checkoutDirs) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory() && existsSync(join(full, '.git'))) {
        checkouts.push(summarizeCheckout(full));
      }
    }
  }
  return {
    rows,
    observedCount: observed?.length ?? null,
    checkoutCount: checkouts.length,
    findings: reconcile(rows, observed, checkouts),
  };
}

export function renderCensus(r: CensusReport): string {
  const lines = [
    `census: ${r.rows.length} register rows; ${r.observedCount ?? 'no'} observed repos; ${r.checkoutCount} checkouts inspected`,
  ];
  if (r.findings.length === 0) {
    lines.push('register reconciles cleanly');
  } else {
    for (const f of r.findings) {
      lines.push(`  ${f.severity.toUpperCase().padEnd(9)} ${f.kind} — ${f.message} [${f.cites}]`);
      if (f.proposedSummary) lines.push(`            proposed summary: ${f.proposedSummary}`);
    }
  }
  return lines.join('\n');
}
