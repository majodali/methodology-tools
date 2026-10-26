// mtool CLI. Output is JSON findings + human summary; nonzero exit on
// MUST violations. Surfaces decide severity handling, not the checks
// (tools plan, design decisions).

import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { AuditFinding, buildAudit, renderAudit } from './audit.js';
import { buildCensus, renderCensus } from './census.js';
import { classify, renderClassifyResult } from './classify.js';
import { buildDelivery, renderDelivery } from './deliver.js';
import { installHooks } from './hooks.js';
import { lintIR } from './ir.js';
import { checkLinks, renderLinkReport } from './links.js';
import { markdownFiles } from './markdown.js';
import { moveDoc, renderMove } from './move.js';
import { assembleSemanticPacket } from './semantic.js';
import { buildStatus, renderHuman } from './status.js';
import { lintProse, loadVocabulary } from './style.js';
import { TARGETS, TYPES, ProjectType, Target } from './types.js';

function usage(): never {
  console.error(
    [
      'usage: mtool <command> [options]',
      '',
      'commands:',
      '  status            report the project against its compliance target',
      '  classify          adopt the methodology: write Classification, Binding',
      '                    block, and required governance docs from the corpus',
      '                    skeletons (interactive where flags are omitted)',
      '  links check       deterministic link integrity across the repo',
      '  links move <from> <to>',
      '                    move a document: inbound links rewritten, own links',
      '                    re-based, heavy-linkage warning, --tombstone stub',
      '                    (Article 10; external-reference knowledge is',
      '                    operator-supplied until the census index exists)',
      '  audit form        the daily deterministic audit (Article 9): the',
      '                    mechanically checkable subset of in-play rules',
      '  hooks install     write a git pre-commit hook running the staged',
      '                    form audit (same-commit guard, W-003)',
      '  audit deliver     compare-and-deliver per the audit process: compute',
      '                    the finding fingerprint, compare with the project',
      "                    Audit log's baseline, emit the due entry (--write",
      '                    appends it; raising the PR stays with the operator)',
      '  audit semantic    assemble the semantic-audit packet (context only —',
      '                    adjudication is human)',
      '  census            reconcile the Portfolio register against observed',
      '                    repos and local checkouts (M-001/M-002)',
      '  style [files...]  the mechanically checkable prose rules (P- rules,',
      '                    W-008 report shape) over the given markdown files',
      '                    or every one under the repo; an .ir.md file takes',
      '                    the IR checks instead',
      '  ir check <file.ir.md>...',
      '                    the IR schema checks CK-01..CK-11 (communication',
      '                    pipeline docs/ir-schema.md) plus the unratified-',
      '                    term count',
      '',
      'common options:',
      '  --repo <path>     project to operate on (default: cwd)',
      '  --corpus <path>   checkout of majodali/methodology (default: $MTOOL_CORPUS,',
      '                    else a sibling directory named "methodology")',
      '  --json            machine-readable output',
      '',
      'status options:   --brief',
      'classify options: --tier C0..C3  --slevel S0..S2  --type <type>',
      '                  --target <target>  --pin <X.Y.Z>  --description <text>',
      'audit options:    --staged | --changed-since <ref>  (form)',
      '                  --write  (deliver)',
      'census options:   --observed <file: JSON array or owner/name lines>',
      '                  --checkouts <dir of checkouts> (repeatable)',
      'style/ir options: --vocab <path> (repeatable; default: docs/vocabulary.md',
      '                  of the repo and of the corpus)',
    ].join('\n'),
  );
  process.exit(2);
}

function locateCorpus(explicit: string | undefined, repo: string): string | null {
  const candidates = [
    explicit,
    process.env['MTOOL_CORPUS'],
    resolve(repo, '..', 'methodology'),
  ].filter((c): c is string => Boolean(c));
  for (const c of candidates) {
    if (existsSync(resolve(c, 'docs', 'rules'))) return resolve(c);
  }
  return null;
}

function findCorpus(explicit: string | undefined, repo: string): string {
  const found = locateCorpus(explicit, repo);
  if (found) return found;
  console.error(
    'mtool: cannot find a methodology corpus checkout (need <corpus>/docs/rules). ' +
      'Pass --corpus or set MTOOL_CORPUS.',
  );
  process.exit(2);
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    repo: { type: 'string' },
    corpus: { type: 'string' },
    json: { type: 'boolean', default: false },
    brief: { type: 'boolean', default: false },
    tier: { type: 'string' },
    slevel: { type: 'string' },
    type: { type: 'string' },
    target: { type: 'string' },
    pin: { type: 'string' },
    description: { type: 'string' },
    staged: { type: 'boolean', default: false },
    'changed-since': { type: 'string' },
    write: { type: 'boolean', default: false },
    observed: { type: 'string' },
    checkouts: { type: 'string', multiple: true },
    tombstone: { type: 'boolean', default: false },
    vocab: { type: 'string', multiple: true },
  },
});

const repo = resolve(values.repo ?? process.cwd());
const command = positionals[0];

/** Vocabulary files for `style` and `ir check`: --vocab, else the
 *  repo's and the corpus's docs/vocabulary.md (whichever exist). */
function vocabularyFiles(): string[] {
  if (values.vocab && values.vocab.length > 0) return values.vocab.map((v) => resolve(v));
  const corpus = locateCorpus(values.corpus, repo);
  return [join(repo, 'docs', 'vocabulary.md'), ...(corpus ? [join(corpus, 'docs', 'vocabulary.md')] : [])];
}

/** `file:line: SEVERITY rule message` lines plus the one-line summary;
 *  paths print repo-relative when the file is under the repo. */
function renderFindingLines(findings: AuditFinding[], fileCount: number): { text: string; violations: number } {
  const lines: string[] = [];
  let violations = 0;
  let warnings = 0;
  for (const f of findings) {
    if (f.severity === 'violation') violations++;
    else if (f.severity === 'warning') warnings++;
    const abs = f.file ?? '';
    const shown = abs.startsWith(repo + '/') ? relative(repo, abs) : abs;
    lines.push(`${shown}:${f.line ?? 0}: ${f.severity.toUpperCase().padEnd(9)} ${f.rule} ${f.message}`);
  }
  lines.push(`${fileCount} file(s); ${violations} violation(s), ${warnings} warning(s)`);
  return { text: lines.join('\n'), violations };
}

async function ask(question: string, allowed?: readonly string[]): Promise<string> {
  if (!process.stdin.isTTY) {
    console.error(`mtool classify: missing required option and no TTY to prompt — ${question}`);
    process.exit(2);
  }
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    for (;;) {
      const answer = (await rl.question(`${question} `)).trim();
      if (!allowed || allowed.some((a) => a.toLowerCase() === answer.toLowerCase())) return answer;
      console.error(`  one of: ${allowed.join(' · ')}`);
    }
  } finally {
    rl.close();
  }
}

if (command === 'status') {
  const corpus = findCorpus(values.corpus, repo);
  const report = buildStatus(repo, corpus);
  if (values.json) console.log(JSON.stringify(report, null, 2));
  else console.log(renderHuman(report, values.brief));
} else if (command === 'links' && positionals[1] === 'check') {
  const report = checkLinks(repo);
  if (values.json) console.log(JSON.stringify(report, null, 2));
  else console.log(renderLinkReport(report));
  // Dangling links are audit findings (Article 10) — nonzero exit.
  process.exit(report.findings.length === 0 ? 0 : 1);
} else if (command === 'audit' && positionals[1] === 'form') {
  const corpus = findCorpus(values.corpus, repo);
  const sinceRef = values['changed-since'];
  const mode = values.staged ? 'staged' : sinceRef ? 'changed-since' : 'full';
  const report = buildAudit(repo, corpus, { mode, sinceRef });
  if (values.json) console.log(JSON.stringify(report, null, 2));
  else console.log(renderAudit(report));
  // Nonzero exit on MUST violations; warnings/info never block.
  process.exit(report.findings.some((f) => f.severity === 'violation') ? 1 : 0);
} else if (command === 'links' && positionals[1] === 'move') {
  const from = positionals[2];
  const to = positionals[3];
  if (!from || !to) usage();
  const report = moveDoc(repo, from, to, { tombstone: values.tombstone });
  if (values.json) console.log(JSON.stringify(report, null, 2));
  else console.log(renderMove(report));
  process.exit(report.residualFindings === 0 ? 0 : 1);
} else if (command === 'audit' && positionals[1] === 'deliver') {
  const corpus = findCorpus(values.corpus, repo);
  const date = new Date().toISOString().slice(0, 10);
  const report = buildDelivery(repo, corpus, { write: values.write, date });
  if (values.json) console.log(JSON.stringify(report, null, 2));
  else console.log(renderDelivery(report));
} else if (command === 'audit' && positionals[1] === 'semantic') {
  const corpus = findCorpus(values.corpus, repo);
  console.log(assembleSemanticPacket(repo, corpus));
} else if (command === 'census') {
  const corpus = findCorpus(values.corpus, repo);
  const report = buildCensus(corpus, {
    ...(values.observed ? { observedFile: values.observed } : {}),
    checkoutDirs: values.checkouts ?? [],
  });
  if (values.json) console.log(JSON.stringify(report, null, 2));
  else console.log(renderCensus(report));
  process.exit(report.findings.some((f) => f.severity === 'violation') ? 1 : 0);
} else if (command === 'style') {
  // The P- rules' mechanical part and W-008's report shape (style.ts).
  const vocab = loadVocabulary(vocabularyFiles());
  const files =
    positionals.length > 1
      ? positionals.slice(1).map((p) => resolve(p))
      : [...markdownFiles(repo, ['.git', 'node_modules'])].map((rel) => join(repo, rel));
  const findings: AuditFinding[] = [];
  for (const file of files) {
    if (file.endsWith('.ir.md')) findings.push(...lintIR(readFileSync(file, 'utf8'), { vocab, file }).findings);
    else findings.push(...lintProse(file, { vocab }));
  }
  if (values.json) console.log(JSON.stringify(findings, null, 2));
  else console.log(renderFindingLines(findings, files.length).text);
  // Prose findings are SHOULD-level warnings; only a W-008 MUST (or an
  // IR schema violation) is a violation and blocks.
  process.exit(findings.some((f) => f.severity === 'violation') ? 1 : 0);
} else if (command === 'ir' && positionals[1] === 'check') {
  // The IR schema's mechanical checks CK-01..CK-11 (ir.ts).
  const files = positionals.slice(2).map((p) => resolve(p));
  if (files.length === 0) usage();
  const vocab = loadVocabulary(vocabularyFiles());
  const findings: AuditFinding[] = [];
  let unratified = 0;
  for (const file of files) {
    const r = lintIR(readFileSync(file, 'utf8'), { vocab, file });
    findings.push(...r.findings);
    unratified += r.unratifiedTerms;
  }
  if (values.json) console.log(JSON.stringify({ findings, unratifiedTerms: unratified }, null, 2));
  else {
    console.log(renderFindingLines(findings, files.length).text);
    console.log(`unratified terms: ${unratified}`);
  }
  process.exit(findings.some((f) => f.severity === 'violation') ? 1 : 0);
} else if (command === 'hooks' && positionals[1] === 'install') {
  const corpus = findCorpus(values.corpus, repo);
  const { hookPath } = installHooks(repo, corpus);
  console.log(
    `installed ${hookPath} — runs \`mtool audit form --staged\` before each commit ` +
      '(bypass an intentional exception with --no-verify and record why in the Backlog)',
  );
} else if (command === 'classify') {
  const corpus = findCorpus(values.corpus, repo);
  const tier = values.tier ?? (await ask('C-tier (C0..C3)?', ['C0', 'C1', 'C2', 'C3']));
  const slevel = values.slevel ?? (await ask('S-level (S0..S2)?', ['S0', 'S1', 'S2']));
  const type = (values.type ??
    (await ask(`type (${TYPES.join(' · ')})?`, TYPES))) as ProjectType;
  const target = (values.target ??
    (await ask(`target (${TARGETS.join(' · ')})?`, TARGETS))) as Target;
  const tm = tier.match(/^C([0-3])$/i);
  const sm = slevel.match(/^S([0-2])$/i);
  if (!tm || !sm || !TYPES.includes(type) || !TARGETS.includes(target)) usage();
  const result = classify(repo, corpus, {
    ctier: Number(tm[1]),
    slevel: Number(sm[1]),
    type,
    target,
    pin: values.pin,
    description: values.description,
  });
  if (values.json) console.log(JSON.stringify(result, null, 2));
  else console.log(renderClassifyResult(result));
} else {
  usage();
}
