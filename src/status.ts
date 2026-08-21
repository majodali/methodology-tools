// `mtool status`: the everyday command. Reports in-play rules,
// deviations, version lag, sandbox ages, and delta-ratio since the last
// semantic audit (Article 9), from the Classification and the pinned
// corpus alone.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { inPlay } from './applicability.js';
import { loadClassification } from './classification.js';
import { parseDoc } from './markdown.js';
import { loadRules } from './rules.js';
import { Classification, ProjectState, Rule, deriveState } from './types.js';

const SANDBOX_DESIGNATIONS = ['in-progress', 'not-compliant'];
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

export interface SandboxItem {
  file: string;
  line: number;
  designation: string;
  ageDays: number | null; // null when git history is unavailable
}

export interface StatusReport {
  repo: string;
  corpus: string;
  classification: Classification;
  state: ProjectState;
  inPlay: { id: string; title: string; applies: string }[];
  deviations: { text: string; ruleRef: string | null }[];
  version: {
    pinned: string | null;
    corpusLatest: string | null;
    lag: boolean | null; // null = undecidable (no corpus tags found)
    note: string;
  };
  sandbox: SandboxItem[];
  deltaRatio: {
    value: number | null;
    sinceSemanticAudit: string | null;
    note: string;
  };
  findings: string[];
}

function git(args: string[], cwd: string): string | null {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function latestSemverTag(corpus: string): string | null {
  const out = git(['tag', '-l', 'v*'], corpus);
  if (!out) return null;
  const versions = out
    .split('\n')
    .map((t) => t.match(/^v(\d+)\.(\d+)\.(\d+)$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => [Number(m[1]), Number(m[2]), Number(m[3])] as const);
  if (versions.length === 0) return null;
  versions.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  const [x, y, z] = versions[versions.length - 1]!;
  return `${x}.${y}.${z}`;
}

function* markdownFiles(root: string, sub = ''): Generator<string> {
  const dir = join(root, sub);
  for (const name of readdirSync(dir)) {
    // `fixtures` holds test data, not the project's own material — a
    // deliberately sandbox-designated fixture is not the repo's sandbox.
    if (name === '.git' || name === 'node_modules' || name === 'fixtures') continue;
    const rel = sub ? `${sub}/${name}` : name;
    const full = join(root, rel);
    if (statSync(full).isDirectory()) yield* markdownFiles(root, rel);
    else if (name.endsWith('.md')) yield rel;
  }
}

/** Date of the newest `semantic` entry in the project's Audit log
 *  (`docs/audits.md`, methodology ≥ 1.1.0), or why there is none. */
export function lastSemanticAudit(repo: string): { kind: 'no-log' } | { kind: 'none' } | { kind: 'date'; date: string } {
  const path = join(repo, 'docs', 'audits.md');
  if (!existsSync(path)) return { kind: 'no-log' };
  let last: string | null = null;
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const m = raw.match(/^-\s+(\d{4}-\d{2}-\d{2})\s+—\s+semantic\b/u);
    if (m && (!last || m[1]! > last)) last = m[1]!;
  }
  return last ? { kind: 'date', date: last } : { kind: 'none' };
}

/** Lines changed since `sinceDate` over current tracked lines, scoped to
 *  the repo directory. Null when git history is unavailable. */
export function changeRatioSince(repo: string, sinceDate: string): number | null {
  const num = git(['log', `--since=${sinceDate}`, '--numstat', '--format=', '--', '.'], repo);
  if (num === null) return null;
  let changed = 0;
  for (const line of num.split('\n')) {
    const m = line.match(/^(\d+)\t(\d+)\t/);
    if (m) changed += Number(m[1]) + Number(m[2]);
  }
  const total = git(['diff', '--shortstat', EMPTY_TREE, 'HEAD', '--', '.'], repo);
  const tm = total?.match(/(\d+) insertion/);
  if (!tm) return null;
  const size = Number(tm[1]);
  return size > 0 ? changed / size : null;
}

function buildDeltaRatio(repo: string): StatusReport['deltaRatio'] {
  const last = lastSemanticAudit(repo);
  if (last.kind === 'no-log') {
    return {
      value: null,
      sinceSemanticAudit: null,
      note: 'no Audit log (docs/audits.md) in this project — the register is available since methodology 1.1.0',
    };
  }
  if (last.kind === 'none') {
    return {
      value: null,
      sinceSemanticAudit: null,
      note: 'no semantic audit recorded yet in docs/audits.md',
    };
  }
  const value = changeRatioSince(repo, last.date);
  if (value === null) {
    return {
      value: null,
      sinceSemanticAudit: last.date,
      note: `last semantic audit ${last.date}; ratio undecidable — git history unavailable`,
    };
  }
  return {
    value,
    sinceSemanticAudit: last.date,
    note: `${Math.round(value * 100)}% of current tracked lines changed since the semantic audit of ${last.date} (Article 9 auto-trigger calibration: 50% at C2, 25% at C3)`,
  };
}

function scanSandbox(repo: string): SandboxItem[] {
  const items: SandboxItem[] = [];
  for (const rel of markdownFiles(repo)) {
    const doc = parseDoc(join(repo, rel));
    for (const s of doc.statusLines) {
      const value = s.value.toLowerCase();
      const hit = SANDBOX_DESIGNATIONS.find((d) => value.startsWith(d));
      if (!hit) continue;
      const ts = git(['log', '-1', '--format=%ct', '--', rel], repo);
      const ageDays = ts ? Math.floor((Date.now() / 1000 - Number(ts)) / 86400) : null;
      items.push({ file: rel, line: s.line, designation: hit, ageDays });
    }
  }
  return items;
}

export function buildStatus(repo: string, corpus: string): StatusReport {
  const classification = loadClassification(repo);
  const state = deriveState(classification);
  const corpusRules = loadRules(corpus);
  const findings = [...classification.findings, ...corpusRules.findings];

  const playing = corpusRules.rules.filter((r: Rule) => inPlay(r, state));

  const corpusLatest = latestSemverTag(corpus);
  let lag: boolean | null = null;
  let note: string;
  if (classification.pinned === null) {
    lag = false;
    note = 'unpinned: compliance target is the latest version and moves with it (Article 8; legal at C0 only)';
  } else if (corpusLatest === null) {
    note = 'corpus checkout has no version tags — lag undecidable from here';
  } else {
    lag = classification.pinned !== corpusLatest;
    note = lag
      ? `pinned ${classification.pinned} lags latest ${corpusLatest} — migration pending (Article 8)`
      : `pinned ${classification.pinned} is the latest version`;
    // The in-play computation reads the corpus checkout as-is; if it is
    // not at the pinned version, say so rather than guess.
    const head = git(['describe', '--tags', '--exact-match'], corpus);
    if (head && head !== `v${classification.pinned}`) {
      findings.push(
        `corpus checkout is at ${head}, not the pinned v${classification.pinned} — ` +
          'in-play rules computed from the checkout, not the compliance target',
      );
    }
  }

  return {
    repo,
    corpus,
    classification,
    state,
    inPlay: playing.map((r) => ({ id: r.id, title: r.title, applies: r.appliesRaw })),
    deviations: classification.deviations,
    version: { pinned: classification.pinned, corpusLatest, lag, note },
    sandbox: scanSandbox(repo),
    deltaRatio: buildDeltaRatio(repo),
    findings,
  };
}

export function renderHuman(r: StatusReport, brief: boolean): string {
  const c = r.classification;
  const head =
    `${relative(process.cwd(), r.repo) || '.'}: ` +
    `${c.implicit ? 'implicit ' : ''}C${c.ctier} / S${c.slevel} / ${c.type} / ${c.target}` +
    ` — compliance target ${c.pinned ?? 'latest'}`;
  const lines: string[] = [head];
  lines.push(
    `in play: ${r.inPlay.length} rules (${r.inPlay.map((x) => x.id).join(', ') || 'none'})`,
  );
  lines.push(`deviations: ${r.deviations.length}; version lag: ${r.version.lag === null ? 'undecidable' : r.version.lag ? 'YES' : 'no'} (${r.version.note})`);
  if (r.sandbox.length > 0)
    lines.push(
      `sandbox: ${r.sandbox
        .map((s) => `${s.file}:${s.line} ${s.designation}${s.ageDays !== null ? ` (${s.ageDays}d)` : ''}`)
        .join('; ')} — age is an audit finding (Article 7)`,
    );
  else lines.push('sandbox: none');
  lines.push(`delta-ratio: ${r.deltaRatio.note}`);
  if (r.findings.length > 0) {
    lines.push(`findings (${r.findings.length}):`);
    for (const f of r.findings) lines.push(`  - ${f}`);
  } else lines.push('findings: none');

  if (brief) {
    // SessionStart injection: the binding facts in a few lines.
    return [
      head,
      lines[1]!,
      lines[2]!,
      r.findings.length > 0 ? `findings: ${r.findings.length} (run mtool status)` : 'findings: none',
    ].join('\n');
  }
  return lines.join('\n');
}
