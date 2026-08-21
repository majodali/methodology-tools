// `mtool classify`: adoption in one run. Writes the Classification, the
// CLAUDE.md Binding block, and the governance documents the declared
// classification's in-play rules require — from the methodology's own
// skeletons/ (the corpus checkout), never from templates baked into the
// tool (Article 3: documents are the spec). Existing files are never
// overwritten.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { inPlay } from './applicability.js';
import { latestSemverTag } from './git.js';
import { loadRules } from './rules.js';
import { ProjectType, Target, deriveState } from './types.js';
import { loadClassification } from './classification.js';

export interface ClassifyOptions {
  ctier: number;
  slevel: number;
  type: ProjectType;
  target: Target;
  /** Pinned version; when absent, the corpus's latest release tag. */
  pin?: string;
  /** One-line project description for the README stub (W-007). */
  description?: string;
}

export interface ClassifyResult {
  written: { path: string; because: string }[];
  skipped: { path: string; reason: string }[];
  pin: string | null;
}

function skeleton(corpus: string, rel: string): string {
  return readFileSync(join(corpus, 'skeletons', rel), 'utf8');
}

function writeNew(
  repo: string,
  rel: string,
  content: string,
  because: string,
  result: ClassifyResult,
): void {
  const path = join(repo, rel);
  if (existsSync(path)) {
    result.skipped.push({ path: rel, reason: 'exists — classify never overwrites' });
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  result.written.push({ path: rel, because });
}

/** Replace a skeleton's `- **Field**: value` line with the chosen value. */
function setField(text: string, field: string, value: string): string {
  const re = new RegExp(`^(- \\*\\*${field}\\*\\*: ).*$`, 'm');
  return text.replace(re, `$1${value}`);
}

export function classify(repo: string, corpus: string, opts: ClassifyOptions): ClassifyResult {
  const result: ClassifyResult = { written: [], skipped: [], pin: null };
  const pin = opts.pin ?? latestSemverTag(corpus);
  if (pin === null && opts.ctier >= 1) {
    throw new Error(
      'a pinned version is mandatory at C1+ (vocabulary: Classification) — pass --pin or use a tagged corpus checkout',
    );
  }
  result.pin = pin;

  // The Classification itself, from the corpus skeleton.
  let cls = skeleton(corpus, 'docs/classification.md');
  cls = setField(cls, 'C-tier', `C${opts.ctier}`);
  if (pin === null) {
    // C0 with no pin: omit the line — omission declares the default
    // (latest) per the vocabulary's Classification definition.
    cls = cls.replace(/^- \*\*Pinned methodology version\*\*: .*\n/m, '');
  } else {
    cls = setField(cls, 'Pinned methodology version', `${pin} (compliance target)`);
  }
  cls = setField(cls, 'S-level', `S${opts.slevel}`);
  cls = setField(cls, 'Type', opts.type);
  cls = setField(cls, 'Target', opts.target);
  cls = setField(cls, 'Workflow', 'none declared (⇒ `deployed` is false)');
  writeNew(repo, 'docs/classification.md', cls, 'the binding declaration (Article 4; vocabulary: Classification)', result);

  // The in-play rule set for this declaration drives the rest.
  const state = deriveState(loadClassification(repo));
  const rules = loadRules(corpus).rules.filter((r) => inPlay(r, state));
  const inPlayIds = new Set(rules.map((r) => r.id));

  if (inPlayIds.has('K-002')) {
    let bootstrap = skeleton(corpus, 'CLAUDE.md');
    bootstrap = bootstrap.replace('v<VERSION>', `v${pin ?? 'latest'}`);
    bootstrap = bootstrap.replace(
      /^Classification: .*$/m,
      `Classification: C${opts.ctier} / S${opts.slevel} / ${opts.type.replace(/[ /]/g, '-')} / ${opts.target.replace(/[ /]/g, '-')}`,
    );
    bootstrap = bootstrap.replace(/^Deviations: .*$/m, 'Deviations: none');
    writeNew(repo, 'CLAUDE.md', bootstrap, 'the Agent bootstrap Binding block (K-002)', result);
  }

  if (inPlayIds.has('W-007')) {
    const name = basename(repo);
    const readme =
      `# ${name}\n\n` +
      (opts.description ??
        (opts.ctier === 0
          ? '<W-007: state the question being explored.>'
          : '<W-007: what the project is, for whom, and where the documentation lives.>')) +
      '\n\nGoverned by [majodali/methodology](https://github.com/majodali/methodology)' +
      ` as declared in [docs/classification.md](docs/classification.md).\n`;
    writeNew(repo, 'README.md', readme, 'every project has a README (W-007)', result);
  }

  if (inPlayIds.has('K-003')) {
    writeNew(repo, 'docs/backlog.md', skeleton(corpus, 'docs/backlog.md'), 'the Backlog is the single source of progress truth (K-003)', result);
  }

  if (inPlayIds.has('K-004')) {
    writeNew(repo, 'docs/decisions.md', skeleton(corpus, 'docs/decisions.md'), 'C2+ keeps a Decision register (K-004)', result);
  }
  // Risk/Radar/Hypothesis registers are deliberately NOT scaffolded:
  // K-005 forbids empty ceremony ahead of need.

  return result;
}

export function renderClassifyResult(r: ClassifyResult): string {
  const lines: string[] = [];
  for (const w of r.written) lines.push(`wrote   ${w.path} — ${w.because}`);
  for (const s of r.skipped) lines.push(`skipped ${s.path} — ${s.reason}`);
  lines.push(
    `pinned ${r.pin ?? 'nothing (C0 tracks latest)'} — fill the placeholders, then run \`mtool status\` and \`mtool links check\``,
  );
  return lines.join('\n');
}
