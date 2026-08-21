// `mtool audit form`: the daily deterministic duty (Article 9). Runs
// the mechanically checkable subset of the project's in-play rules;
// every finding cites its rule or article. Scoping per the delta-scope
// calibration (proposed amendment): per-file content checks are scoped
// to the change deltas in --staged / --changed-since modes, while
// repo-wide invariants — existence rules, link integrity,
// declaration-consistency — run over the full tree on every audit
// (closing the delta blind spot of deletions breaking inbound links in
// unchanged files). Semantic judgment stays out (tools plan non-goal).

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { inPlay } from './applicability.js';
import { loadClassification } from './classification.js';
import { git, latestSemverTag } from './git.js';
import { checkLinks } from './links.js';
import { parseDoc } from './markdown.js';
import { loadRules } from './rules.js';
import { scanSandbox } from './status.js';
import { Classification, deriveState } from './types.js';

export type Severity = 'violation' | 'warning' | 'info';

export interface AuditFinding {
  rule: string;
  severity: Severity;
  message: string;
  file?: string;
  line?: number;
}

export type AuditMode = 'full' | 'staged' | 'changed-since';

export interface AuditReport {
  repo: string;
  corpus: string;
  mode: AuditMode;
  declared: string;
  inPlay: string[];
  /** Article 8: every audit calls out version lag and all deviations. */
  versionLag: string;
  deviations: string[];
  /** Files in delta scope (null in full mode). */
  scopedFiles: string[] | null;
  findings: AuditFinding[];
}

const SECRET_FILE_RE = /(^|\/)(\.env(\.(?!example|template|sample)[^/]+)?|id_rsa[^/]*|[^/]+\.pem)$/;
const SECRET_CONTENT_RES: [RegExp, string][] = [
  [/AKIA[0-9A-Z]{16}/, 'AWS access key id'],
  [/-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY( BLOCK)?-----/, 'private key material'],
];
const PLAN_STATUS_RE = /^(draft|active|superseded|closed)\b/i;
const DECISION_STATUS_RE = /\b(accepted|superseded|deprecated)\b/i;

function slugish(v: string): string {
  return v.toLowerCase().replace(/[ /]+/g, '-');
}

export function buildAudit(
  repo: string,
  corpus: string,
  opts: { mode: AuditMode; sinceRef?: string },
): AuditReport {
  const findings: AuditFinding[] = [];
  const classification = loadClassification(repo);

  // Classification parse findings: the Workflow-format gap is the
  // methodology's open item (informational here); everything else is a
  // defect of the declaration itself.
  for (const f of classification.findings) {
    findings.push({
      rule: 'Article 4 (declaration)',
      severity: f.includes('Workflow declared') ? 'info' : 'violation',
      message: f,
      file: 'docs/classification.md',
    });
  }

  const state = deriveState(classification);
  const rules = loadRules(corpus).rules;
  const playing = new Set(rules.filter((r) => inPlay(r, state)).map((r) => r.id));

  // ---- delta scope ----
  let scopedFiles: string[] | null = null;
  if (opts.mode === 'staged') {
    const out = git(['diff', '--cached', '--name-only'], repo);
    scopedFiles = out === null ? [] : out.split('\n').filter(Boolean);
    if (out === null)
      findings.push({ rule: 'Article 9', severity: 'warning', message: 'staged mode: git index unavailable' });
  } else if (opts.mode === 'changed-since') {
    const out = git(['diff', '--name-only', `${opts.sinceRef}..HEAD`], repo);
    if (out === null) {
      findings.push({
        rule: 'Article 9',
        severity: 'warning',
        message: `changed-since mode: cannot resolve ${opts.sinceRef} — falling back to empty delta`,
      });
      scopedFiles = [];
    } else scopedFiles = out.split('\n').filter(Boolean);
  }
  const inScope = (file: string) => scopedFiles === null || scopedFiles.includes(file);

  // ---- repo-wide invariants: existence rules (always) ----
  const requireFile = (rule: string, rel: string, what: string): boolean => {
    if (!playing.has(rule)) return true;
    if (existsSync(join(repo, rel))) return true;
    findings.push({ rule, severity: 'violation', message: `${what} missing (${rel})`, file: rel });
    return false;
  };

  const haveBootstrap = requireFile('K-002', 'CLAUDE.md', 'Agent bootstrap with Binding block');
  if (playing.has('K-003')) {
    if (!existsSync(join(repo, 'docs', 'backlog.md'))) {
      const rootBacklog = existsSync(join(repo, 'BACKLOG.md'));
      findings.push({
        rule: 'K-003',
        severity: 'violation',
        message: rootBacklog
          ? 'Backlog exists at repo root (BACKLOG.md) but the canonical Register home is docs/ (vocabulary: Document) — relocate to docs/backlog.md'
          : 'Backlog missing (docs/backlog.md)',
        file: rootBacklog ? 'BACKLOG.md' : 'docs/backlog.md',
      });
    }
  }
  const haveDecisions = requireFile('K-004', 'docs/decisions.md', 'Decision register');
  if (playing.has('W-007')) {
    const readme = join(repo, 'README.md');
    if (!existsSync(readme) || readFileSync(readme, 'utf8').trim().length === 0) {
      findings.push({
        rule: 'W-007',
        severity: 'violation',
        message: 'README missing or empty — every project has a README that says what it is',
        file: 'README.md',
      });
    }
  }
  requireFile('M-001', 'docs/registers/portfolio.md', 'Portfolio register');

  // ---- repo-wide invariant: Binding-block declaration consistency ----
  if (haveBootstrap && playing.has('K-002') && existsSync(join(repo, 'CLAUDE.md'))) {
    checkBindingConsistency(repo, classification, findings);
  }

  // ---- repo-wide invariant: link integrity (always full-tree) ----
  for (const lf of checkLinks(repo).findings) {
    findings.push({
      rule: 'Article 10',
      severity: 'violation',
      message: `${lf.problem}: ${lf.target}`,
      file: lf.file,
      line: lf.line,
    });
  }

  // ---- per-file content checks (delta-scoped) ----
  if (haveBootstrap && playing.has('K-002') && inScope('CLAUDE.md') && existsSync(join(repo, 'CLAUDE.md'))) {
    const lineCount = readFileSync(join(repo, 'CLAUDE.md'), 'utf8').split('\n').length;
    if (lineCount > 200)
      findings.push({
        rule: 'K-002',
        severity: 'warning',
        message: `Agent bootstrap is ${lineCount} lines — SHOULD stay under ~200 (pointer, not record)`,
        file: 'CLAUDE.md',
      });
  }

  if (haveDecisions && playing.has('K-004') && inScope('docs/decisions.md') && existsSync(join(repo, 'docs', 'decisions.md'))) {
    const doc = parseDoc(join(repo, 'docs', 'decisions.md'));
    doc.lines.forEach((raw, i) => {
      const m = raw.match(/^-\s+\**D\d+/);
      if (m && !DECISION_STATUS_RE.test(raw)) {
        findings.push({
          rule: 'K-004',
          severity: 'warning',
          message: 'decision entry carries no status (accepted · superseded by D<n> · deprecated)',
          file: 'docs/decisions.md',
          line: i + 1,
        });
      }
    });
  }

  if (playing.has('K-007')) {
    const plansDir = join(repo, 'docs', 'plans');
    if (existsSync(plansDir)) {
      for (const name of readdirSync(plansDir)) {
        const rel = `docs/plans/${name}`;
        // TEMPLATE is a skeleton and README an index — neither is a Plan.
        if (
          !name.endsWith('.md') ||
          ['TEMPLATE.MD', 'README.MD'].includes(name.toUpperCase()) ||
          !inScope(rel)
        )
          continue;
        const doc = parseDoc(join(plansDir, name));
        const status = doc.statusLines[0];
        if (!status) {
          findings.push({ rule: 'K-007', severity: 'violation', message: 'plan has no Status line', file: rel });
        } else if (!PLAN_STATUS_RE.test(status.value)) {
          findings.push({
            rule: 'K-007',
            severity: 'violation',
            message: `plan Status "${status.value}" is outside draft → active → (superseded | closed)`,
            file: rel,
            line: status.line,
          });
        }
      }
    }
  }

  // ---- S-001 secret hygiene ----
  if (playing.has('S-001')) {
    const tracked = git(['ls-files'], repo)?.split('\n').filter(Boolean) ?? [];
    for (const file of tracked) {
      if (SECRET_FILE_RE.test(file)) {
        findings.push({
          rule: 'S-001',
          severity: 'violation',
          message: 'credential-shaped file is tracked — secrets never live in repositories',
          file,
        });
      }
    }
    const contentScan = scopedFiles === null ? tracked : scopedFiles.filter((f) => tracked.includes(f));
    for (const file of contentScan) {
      const full = join(repo, file);
      if (!existsSync(full) || statSync(full).size > 512 * 1024) continue;
      const content = readFileSync(full, 'utf8');
      if (content.includes('\0')) continue; // binary
      for (const [re, what] of SECRET_CONTENT_RES) {
        const m = content.match(re);
        if (m) {
          findings.push({
            rule: 'S-001',
            severity: 'violation',
            message: `${what} pattern in tracked content`,
            file,
          });
        }
      }
    }
  }

  // ---- W-003 same-commit guard (delta modes only) ----
  if (playing.has('W-003') && scopedFiles !== null && scopedFiles.length > 0) {
    const touchesNonDocs = scopedFiles.some((f) => !f.endsWith('.md') && !f.startsWith('docs/'));
    const touchesDocs = scopedFiles.some((f) => f.startsWith('docs/'));
    if (touchesNonDocs && !touchesDocs) {
      findings.push({
        rule: 'W-003',
        severity: 'violation',
        message:
          'changes touch source but nothing under docs/ — documentation (Backlog, registers, plans) moves in the same commit as the work',
      });
    }
  }

  // ---- Article 7 sandbox ages (info) ----
  for (const s of scanSandbox(repo)) {
    findings.push({
      rule: 'Article 7',
      severity: 'info',
      message: `sandbox designation "${s.designation}"${s.ageDays !== null ? `, age ${s.ageDays}d` : ''} — age is an audit finding`,
      file: s.file,
      line: s.line,
    });
  }

  // ---- Article 8 call-outs ----
  const latest = latestSemverTag(corpus);
  let versionLag: string;
  if (classification.pinned === null) versionLag = 'none (unpinned C0 tracks latest)';
  else if (latest === null) versionLag = 'undecidable (corpus checkout has no version tags)';
  else if (classification.pinned !== latest) {
    versionLag = `LAGGING: pinned ${classification.pinned}, latest ${latest}`;
    findings.push({
      rule: 'Article 8',
      severity: 'warning',
      message: `version lag: pinned ${classification.pinned} while latest is ${latest} — migration pending; lag is temporary, never a home`,
      file: 'docs/classification.md',
    });
  } else versionLag = `none (pinned ${classification.pinned} is latest)`;

  return {
    repo,
    corpus,
    mode: opts.mode,
    declared: `${classification.implicit ? 'implicit ' : ''}C${classification.ctier} / S${classification.slevel} / ${classification.type} / ${classification.target}`,
    inPlay: [...playing],
    versionLag,
    deviations: classification.deviations.map((d) => d.text),
    scopedFiles,
    findings,
  };
}

function checkBindingConsistency(
  repo: string,
  c: Classification,
  findings: AuditFinding[],
): void {
  const text = readFileSync(join(repo, 'CLAUDE.md'), 'utf8');
  if (!/methodology — binding/i.test(text) || !text.includes('docs/classification.md')) {
    findings.push({
      rule: 'K-002',
      severity: 'violation',
      message: 'Agent bootstrap lacks the Binding block referencing docs/classification.md',
      file: 'CLAUDE.md',
    });
    return;
  }
  const v = text.match(/methodology v(\d+\.\d+\.\d+)/);
  if (c.pinned !== null && v && v[1] !== c.pinned) {
    findings.push({
      rule: 'Article 4 (declaration accuracy); K-002',
      severity: 'violation',
      message: `Binding block says v${v[1]} but the Classification pins ${c.pinned}`,
      file: 'CLAUDE.md',
    });
  }
  const line = text.match(/^Classification:\s*(.+)$/m);
  if (line) {
    const parts = line[1]!.split('/').map((p) => p.trim());
    const expected = [`c${c.ctier}`, `s${c.slevel}`, slugish(c.type), slugish(c.target)];
    const actual = parts.map(slugish);
    if (
      parts.length !== 4 ||
      actual[0] !== expected[0] ||
      actual[1] !== expected[1] ||
      actual[2] !== expected[2] ||
      actual[3] !== expected[3]
    ) {
      findings.push({
        rule: 'Article 4 (declaration accuracy); K-002',
        severity: 'violation',
        message: `Binding block Classification line "${line[1]}" does not match the declared ${'C' + c.ctier} / S${c.slevel} / ${c.type} / ${c.target}`,
        file: 'CLAUDE.md',
      });
    }
  }
}

export function renderAudit(r: AuditReport): string {
  const counts = { violation: 0, warning: 0, info: 0 };
  for (const f of r.findings) counts[f.severity]++;
  const lines = [
    `form audit (${r.mode}${r.scopedFiles ? `, ${r.scopedFiles.length} files in delta` : ''}) — ${r.declared}`,
    `in play: ${r.inPlay.length} rules; version lag: ${r.versionLag}; deviations: ${r.deviations.length === 0 ? 'none' : ''}`,
  ];
  for (const d of r.deviations) lines.push(`  deviation: ${d}`);
  if (r.findings.length === 0) {
    lines.push('no findings');
  } else {
    lines.push(`findings: ${counts.violation} violations, ${counts.warning} warnings, ${counts.info} info`);
    for (const f of r.findings) {
      const where = f.file ? ` [${f.file}${f.line ? `:${f.line}` : ''}]` : '';
      lines.push(`  ${f.severity.toUpperCase().padEnd(9)} ${f.rule} — ${f.message}${where}`);
    }
  }
  return lines.join('\n');
}
