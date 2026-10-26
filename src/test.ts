// Chunk-1 gate tests: `status` against fixtures for implicit-C0,
// minimal-C0, and full C2 Classifications, including the precedence
// tie-breaks from the constitution's own examples (Article 4 stage 2.3).
// Runner-native, no framework (methodology practice C2).

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { constraints, inPlay, moreSpecific } from './applicability.js';
import { buildAudit, corpusW008Block, fingerprint, w008Block } from './audit.js';
import { lintIR, parseIR } from './ir.js';
import { lintProseText, vocabularyEntries } from './style.js';
import { reconcile } from './census.js';
import { classify } from './classify.js';
import { buildDelivery, parseBaseline } from './deliver.js';
import { installHooks } from './hooks.js';
import { moveDoc } from './move.js';
import { assembleSemanticPacket } from './semantic.js';
import { loadClassification } from './classification.js';
import { checkLinks } from './links.js';
import { slugify } from './markdown.js';
import { defaultConditions, loadRules, parseApplies } from './rules.js';
import { buildStatus, lastSemanticAudit, renderHuman } from './status.js';
import { Rule, deriveState } from './types.js';

let passed = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}`);
    throw err;
  }
}

const FIXTURES = resolve(import.meta.dirname, '..', 'fixtures');
const CORPUS = resolve(FIXTURES, 'corpus');

function rule(id: string, applies: string): Rule {
  const findings: string[] = [];
  const r: Rule = {
    id,
    title: id,
    file: 'synthetic',
    line: 0,
    appliesRaw: applies,
    applies: parseApplies(applies, findings, id),
    keywords: [],
  };
  assert.deepEqual(findings, [], `synthetic rule ${id} must parse cleanly`);
  return r;
}

// ---------- markdown model ----------

test('slugify matches GitHub anchors for corpus headings', () => {
  assert.equal(
    slugify('K-001 — Project documentation is the sole authority'),
    'k-001--project-documentation-is-the-sole-authority',
  );
  assert.equal(slugify('Article 9 — Audits'), 'article-9--audits');
  assert.equal(
    slugify('Article 4 — Applicability, then precedence'),
    'article-4--applicability-then-precedence',
  );
});

// ---------- applies parsing ----------

test('Article 5 defaults when unstated: [C1+], all S, all types, all targets', () => {
  const c = defaultConditions();
  assert.deepEqual(c.c, { min: 1, max: 3 });
  assert.deepEqual(c.s, { min: 0, max: 2 });
  assert.equal(c.types, null);
  assert.equal(c.targets, null);
});

test('tag grammar: ranges, exact tiers, type lists, derived conditions', () => {
  const f: string[] = [];
  const c = parseApplies('[C2+] [S2] [type: web-app, backend-service] [deployed]', f, 't');
  assert.deepEqual(f, []);
  assert.deepEqual(c.c, { min: 2, max: 3 });
  assert.deepEqual(c.s, { min: 2, max: 2 });
  assert.deepEqual(c.types, ['web-app', 'backend-service']);
  assert.deepEqual(c.derived, ['deployed']);
});

test('unknown tags are findings, never guesses', () => {
  const f: string[] = [];
  parseApplies('[C1+] [phase: moon]', f, 't');
  assert.equal(f.length, 1);
});

// ---------- stage 1: applicability over the three fixture Classifications ----------

const SYNTH = [
  rule('R-C0', '[C0+]'),
  rule('R-C1', '[C1+]'),
  rule('R-C2', '[C2+]'),
  rule('R-C3', '[C3]'),
  rule('R-METH', '[type: methodology-corpus]'),
  rule('R-DEPLOYABLE', '[C1+] [deployable]'),
  rule('R-DEPLOYED', '[C1+] [deployed]'),
  rule('R-S2', '[S2]'),
];
const playing = (root: string) => {
  const state = deriveState(loadClassification(root));
  return SYNTH.filter((r) => inPlay(r, state)).map((r) => r.id);
};

test('implicit C0: only [C0+] rules are in play (no carve-outs, Article 4/7)', () => {
  assert.deepEqual(playing(resolve(FIXTURES, 'implicit-c0')), ['R-C0']);
});

test('minimal C0 (tier-line-only Classification is legal at C0)', () => {
  const c = loadClassification(resolve(FIXTURES, 'minimal-c0'));
  assert.equal(c.implicit, false);
  assert.equal(c.ctier, 0);
  assert.equal(c.pinned, null); // pin optional at C0 ⇒ latest
  assert.deepEqual(c.findings, []);
  assert.deepEqual(playing(resolve(FIXTURES, 'minimal-c0')), ['R-C0']);
});

test('full C2 web-app on serverless-aws: tiered + deployable rules in play', () => {
  const root = resolve(FIXTURES, 'full-c2');
  const c = loadClassification(root);
  assert.equal(c.ctier, 2);
  assert.equal(c.slevel, 1);
  assert.equal(c.type, 'web-app');
  assert.equal(c.target, 'serverless-aws');
  assert.equal(c.pinned, '1.0.0');
  assert.equal(c.workflow, 'none');
  assert.equal(c.deviations.length, 1);
  assert.equal(c.deviations[0]!.ruleRef, 'W-006');
  assert.deepEqual(c.findings, []);
  assert.deepEqual(playing(root), ['R-C0', 'R-C1', 'R-C2', 'R-DEPLOYABLE']);
  // no Workflow ⇒ deployed is false ⇒ R-DEPLOYED out; S1 ⇒ R-S2 out.
});

// ---------- stage 2.3: the constitution's own tie-break examples ----------

test('(b) narrower range wins: [C3] beats [C2+]', () => {
  const r = moreSpecific(rule('A', '[C3]'), rule('B', '[C2+]'));
  assert.equal(r.outcome, 'first');
});

test('normalization: vacuous [C0+] is dropped; default [C1+] still constrains', () => {
  // [C0+] admits every tier ⇒ zero constraining conditions; the
  // unstated default [C1+] excludes C0 ⇒ one. Stage (a) decides.
  assert.equal(constraints(rule('A', '[C0+]').applies).length, 0);
  const r = moreSpecific(rule('A', '[C0+]'), rule('B', ''));
  assert.equal(r.outcome, 'second');
});

test('restating a default is never a specificity advantage (corpus defect)', () => {
  const r = moreSpecific(rule('A', '[C1+]'), rule('B', ''));
  assert.equal(r.outcome, 'corpus-defect');
});

test('(a) more constrained fields wins: [C2+][type: web-app] beats [C2+]', () => {
  const r = moreSpecific(rule('A', '[C2+] [type: web-app]'), rule('B', '[C2+]'));
  assert.equal(r.outcome, 'first');
});

test('(b) mixed narrowness: narrower on the higher-weighted field (S) wins', () => {
  // A narrower on S, B narrower on C ⇒ A wins (weight order S > C).
  const r = moreSpecific(rule('A', '[C1+] [S2]'), rule('B', '[C2+] [S1+]'));
  assert.equal(r.outcome, 'first');
});

test('(c) distinguishing conditions rank by weight order: type beats target', () => {
  const r = moreSpecific(
    rule('A', '[C2+] [type: web-app]'),
    rule('B', '[C2+] [target: serverless-aws]'),
  );
  assert.equal(r.outcome, 'first');
});

test('derived ranking: deployed is more specific than deployable', () => {
  const r = moreSpecific(rule('A', '[C1+] [deployed]'), rule('B', '[C1+] [deployable]'));
  assert.equal(r.outcome, 'first');
});

test('a conflict surviving 2.3 is a corpus defect, owner-ruled (2.4)', () => {
  const r = moreSpecific(
    rule('A', '[C2+] [type: web-app]'),
    rule('B', '[C2+] [type: backend-service]'),
  );
  assert.equal(r.outcome, 'corpus-defect');
});

test('links: inline code spans are not scanned for links', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'mtool-links-code-'));
  try {
    // Allegro's syntax in prose: a code span that reads as a markdown
    // link if spans are scanned. The real link after it must still be
    // checked (and here, still be broken).
    writeFileSync(join(tmp, 'doc.md'), 'Call `apply[e: Effect](x)` then see [gone](missing.md).\n');
    const report = checkLinks(tmp);
    assert.equal(report.findings.length, 1);
    assert.equal(report.findings[0]!.target, 'missing.md');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------- status end-to-end over the fixture corpus ----------

test('status: full C2 fixture against the fixture corpus', () => {
  const report = buildStatus(resolve(FIXTURES, 'full-c2'), CORPUS);
  assert.deepEqual(
    report.inPlay.map((r) => r.id),
    // governance.md stubs + T-rules; T-301 needs deployed
    ['K-002', 'K-003', 'K-004', 'W-003', 'W-007', 'S-001', 'T-001', 'T-101', 'T-201'],
  );
  assert.equal(report.deviations.length, 1);
  assert.equal(report.version.lag, null); // fixture corpus has no version tags
  assert.equal(report.sandbox.length, 1);
  assert.equal(report.sandbox[0]!.designation, 'in-progress');
  assert.equal(report.deltaRatio.value, null); // fixture has no Audit log
  assert.ok(report.deltaRatio.note.includes('no Audit log'));
  const brief = renderHuman(report, true);
  assert.ok(brief.includes('C2 / S1 / web-app / serverless-aws'));
  assert.ok(brief.split('\n').length <= 4);
});

test('status: implicit C0 fixture reports the implicit default honestly', () => {
  const report = buildStatus(resolve(FIXTURES, 'implicit-c0'), CORPUS);
  assert.equal(report.classification.implicit, true);
  assert.deepEqual(report.inPlay.map((r) => r.id), ['W-007', 'S-001', 'T-001']);
  assert.equal(report.version.lag, false); // unpinned ⇒ latest, moves with it
});

// ---------- delta-ratio against the Audit log (methodology ≥ 1.1.0) ----------

test('audit-log parsing: no log, no semantic entry, newest semantic date', () => {
  assert.deepEqual(lastSemanticAudit(resolve(FIXTURES, 'full-c2')), { kind: 'no-log' });
  assert.deepEqual(lastSemanticAudit(resolve(FIXTURES, 'audited-c1')), {
    kind: 'date',
    date: '2020-01-01',
  });
});

test('delta-ratio computed for a fixture with a recorded semantic audit', () => {
  // The fixture lives inside this git repo; the ratio is scoped to the
  // fixture directory, whose files were all committed after 2020-01-01.
  const report = buildStatus(resolve(FIXTURES, 'audited-c1'), CORPUS);
  assert.equal(report.deltaRatio.sinceSemanticAudit, '2020-01-01');
  assert.ok(report.deltaRatio.value !== null && report.deltaRatio.value > 0);
});

// ---------- links check (chunk-2 gate: findings cite rule/article sources) ----------

test('links check: dangling file and dangling anchor are findings citing Article 10', () => {
  const report = checkLinks(resolve(FIXTURES, 'broken-links'));
  assert.equal(report.linksChecked, 3);
  assert.equal(report.findings.length, 2);
  const problems = report.findings.map((f) => f.problem).sort();
  assert.deepEqual(problems, ['missing-anchor', 'missing-file']);
  for (const f of report.findings) assert.ok(f.cites.includes('Article 10'));
});

test('links check: this repo is clean (fixtures excluded as test data)', () => {
  const report = checkLinks(resolve(import.meta.dirname, '..'));
  assert.deepEqual(report.findings, []);
  assert.ok(report.filesScanned >= 5);
});

// ---------- classify (chunk-2 gate: empty repo to form-clean in one run) ----------

test('classify: a fresh C2 web-app repo is form-clean in one run', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'mtool-classify-'));
  try {
    const result = classify(tmp, CORPUS, {
      ctier: 2,
      slevel: 0,
      type: 'web-app',
      target: 'serverless-aws',
      pin: '1.1.0',
      description: 'A test project.',
    });
    assert.deepEqual(
      result.written.map((w) => w.path).sort(),
      ['CLAUDE.md', 'README.md', 'docs/backlog.md', 'docs/classification.md', 'docs/decisions.md'],
    );
    // Every scaffolded file cites the rule that required it.
    for (const w of result.written.filter((x) => x.path !== 'docs/classification.md'))
      assert.ok(/[KW]-\d{3}/.test(w.because), `${w.path} lacks a rule citation`);

    const c = loadClassification(tmp);
    assert.deepEqual(c.findings, []);
    assert.equal(c.ctier, 2);
    assert.equal(c.pinned, '1.1.0');
    assert.equal(c.type, 'web-app');

    const status = buildStatus(tmp, CORPUS);
    assert.deepEqual(status.findings, []);
    assert.deepEqual(
      status.inPlay.map((r) => r.id),
      ['K-002', 'K-003', 'K-004', 'W-003', 'W-007', 'S-001', 'T-001', 'T-101', 'T-201'],
    );

    assert.deepEqual(checkLinks(tmp).findings, []);

    // Second run changes nothing: classify never overwrites.
    const again = classify(tmp, CORPUS, {
      ctier: 2,
      slevel: 0,
      type: 'web-app',
      target: 'serverless-aws',
      pin: '1.1.0',
    });
    assert.deepEqual(again.written, []);
    assert.equal(again.skipped.length, 5);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('classify: C0 scaffolds only the C0 baseline (README; no ceremony)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'mtool-classify-c0-'));
  try {
    const result = classify(tmp, CORPUS, {
      ctier: 0,
      slevel: 0,
      type: 'exploration',
      target: 'none/local',
    });
    const paths = result.written.map((w) => w.path).sort();
    assert.deepEqual(paths, ['README.md', 'docs/classification.md']);
    // No K-002 bootstrap, no K-003 backlog, no K-004 register at C0.
    const c = loadClassification(tmp);
    assert.equal(c.ctier, 0);
    assert.deepEqual(c.findings, []);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------- audit form (chunk-3 gate) ----------

function sh(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

test('audit form: full-C2 fixture surfaces the missing governance files', () => {
  const report = buildAudit(resolve(FIXTURES, 'full-c2'), CORPUS, { mode: 'full' });
  const violations = new Set(
    report.findings.filter((f) => f.severity === 'violation').map((f) => f.rule),
  );
  assert.deepEqual([...violations].sort(), ['K-002', 'K-003', 'K-004', 'W-007']);
  const info = report.findings.filter((f) => f.severity === 'info');
  assert.ok(info.some((f) => f.rule === 'Article 7')); // sandbox age
});

test('audit form: a classify-scaffolded repo audits clean (the adoption loop)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'mtool-audit-clean-'));
  try {
    classify(tmp, CORPUS, {
      ctier: 2,
      slevel: 0,
      type: 'web-app',
      target: 'serverless-aws',
      pin: '1.1.0',
      description: 'Audit-clean loop.',
    });
    const report = buildAudit(tmp, CORPUS, { mode: 'full' });
    const blocking = report.findings.filter((f) => f.severity !== 'info');
    assert.deepEqual(blocking, []);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('audit form --staged: the W-003 same-commit guard', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'mtool-audit-staged-'));
  try {
    classify(tmp, CORPUS, { ctier: 1, slevel: 0, type: 'web-app', target: 'none/local', pin: '1.1.0', description: 'Guard test.' });
    sh(tmp, 'init', '-q');
    sh(tmp, 'add', '-A');
    sh(tmp, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'scaffold');
    // Source staged, nothing under docs/ staged → violation.
    execFileSync('bash', ['-c', 'mkdir -p src && echo "export {}" > src/app.ts'], { cwd: tmp });
    sh(tmp, 'add', 'src/app.ts');
    const bad = buildAudit(tmp, CORPUS, { mode: 'staged' });
    assert.ok(bad.findings.some((f) => f.rule === 'W-003' && f.severity === 'violation'));
    // Backlog staged alongside → guard satisfied.
    execFileSync('bash', ['-c', 'echo "- [ ] app" >> docs/backlog.md'], { cwd: tmp });
    sh(tmp, 'add', 'docs/backlog.md');
    const good = buildAudit(tmp, CORPUS, { mode: 'staged' });
    assert.ok(!good.findings.some((f) => f.rule === 'W-003'));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('audit form: S-001 catches tracked credential files and key patterns', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'mtool-audit-secrets-'));
  try {
    classify(tmp, CORPUS, { ctier: 1, slevel: 0, type: 'web-app', target: 'none/local', pin: '1.1.0', description: 'Secrets test.' });
    sh(tmp, 'init', '-q');
    execFileSync('bash', ['-c', 'echo "TOKEN=x" > .env'], { cwd: tmp });
    // Assemble the key pattern at runtime so this source file never
    // contains it contiguously (the scanner audits this repo too).
    const fakeKey = ['AK', 'IA', 'ABCDEFGH', 'IJKLMNOP'].join('');
    writeFileSync(join(tmp, 'config.ts'), `const k = '${fakeKey}'\n`);
    sh(tmp, 'add', '-A');
    const report = buildAudit(tmp, CORPUS, { mode: 'full' });
    const s = report.findings.filter((f) => f.rule === 'S-001' && f.severity === 'violation');
    assert.equal(s.length, 2);
    assert.ok(s.some((f) => f.file === '.env') && s.some((f) => f.file === 'config.ts'));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('audit form: S-001 ignores bare key headers with no base64 body', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'mtool-audit-keyhdr-'));
  try {
    classify(tmp, CORPUS, { ctier: 1, slevel: 1, type: 'backend-service', target: 'serverless-aws', pin: '1.1.0', description: 'Key-header test.' });
    sh(tmp, 'init', '-q');
    // The review-round service-repo false positives: a runbook that
    // documents what a verify command prints, and a test literal with
    // a placeholder body. Header assembled at runtime (scanner audits
    // this repo too); neither carries a base64 body, so neither flags.
    const hdr = ['-----BEGIN', 'PRIVATE', 'KEY-----'].join(' ');
    writeFileSync(join(tmp, 'docs', 'runbook.md'), `# Runbook\n\nVerify: the command prints \`${hdr}\`.\n`);
    writeFileSync(join(tmp, 'sample.test.ts'), `const k = "${hdr}\\nfake\\n-----END PRIVATE KEY-----";\n`);
    // A key with a real-shaped base64 body still flags.
    const body = 'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqa2xtbm9w';
    writeFileSync(join(tmp, 'leak.txt'), `${hdr}\n${body}\n`);
    sh(tmp, 'add', '-A');
    const report = buildAudit(tmp, CORPUS, { mode: 'full' });
    const s = report.findings.filter((f) => f.rule === 'S-001' && f.severity === 'violation');
    assert.deepEqual(s.map((f) => f.file), ['leak.txt']);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('hooks install writes an executable pre-commit running the staged audit', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'mtool-hooks-'));
  try {
    sh(tmp, 'init', '-q');
    const { hookPath } = installHooks(tmp, CORPUS);
    assert.ok(existsSync(hookPath));
    const content = execFileSync('cat', [hookPath], { encoding: 'utf8' });
    assert.ok(content.includes('audit form --staged'));
    assert.ok(content.startsWith('#!/bin/sh'));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------- chunk 4: fingerprint, deliver, census, semantic assembly ----------

test('fingerprint: dedupes, sorts, and excludes info findings', () => {
  const fp = fingerprint([
    { rule: 'K-003', severity: 'violation', message: 'x', file: 'BACKLOG.md' },
    { rule: 'K-003', severity: 'violation', message: 'y', file: 'BACKLOG.md' },
    { rule: 'Article 8', severity: 'warning', message: 'lag', file: 'docs/classification.md' },
    { rule: 'Article 7', severity: 'info', message: 'sandbox', file: 'docs/notes.md' },
  ]);
  assert.deepEqual(fp, [
    { rule: 'Article 8', severity: 'warning', file: 'docs/classification.md' },
    { rule: 'K-003', severity: 'violation', file: 'BACKLOG.md' },
  ]);
});

test('deliver: first delivery creates the register; second run is no-change', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'mtool-deliver-'));
  try {
    classify(tmp, CORPUS, { ctier: 1, slevel: 0, type: 'web-app', target: 'none/local', pin: '1.1.0', description: 'Deliver test.' });
    sh(tmp, 'init', '-q');
    sh(tmp, 'add', '-A');
    sh(tmp, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'scaffold');
    const first = buildDelivery(tmp, CORPUS, { write: true, date: '2026-08-21' });
    assert.equal(first.verdict, 'deliver-first');
    assert.ok(first.written && existsSync(first.written));
    const second = buildDelivery(tmp, CORPUS, { date: '2026-08-21' });
    assert.equal(second.verdict, 'no-change');
    assert.equal(second.comparedOn, 'rule-severity-file');
    // Introduce a finding (tracked .env) → transition.
    writeFileSync(join(tmp, '.env'), 'TOKEN=x\n');
    sh(tmp, 'add', '.env');
    sh(tmp, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'oops');
    const third = buildDelivery(tmp, CORPUS, { date: '2026-08-21' });
    assert.equal(third.verdict, 'deliver-transition');
    assert.ok(third.entry.includes('S-001'));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('deliver: prose baselines compare on (rule, file); pass baselines parse', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'mtool-baseline-'));
  try {
    execFileSync('bash', ['-c', 'mkdir -p docs'], { cwd: tmp });
    writeFileSync(
      join(tmp, 'docs', 'audits.md'),
      '# Audit log\n\n- 2026-08-20 — form — full tree — 1 violation — K-003: `BACKLOG.md` (root Backlog)\n',
    );
    const b = parseBaseline(tmp, 'form');
    assert.ok(b);
    assert.equal(b!.pass, false);
    assert.deepEqual(b!.pairs, [{ rule: 'K-003', file: 'BACKLOG.md' }]);
    assert.ok(b!.parseNote?.includes('(rule, file)'));
    writeFileSync(
      join(tmp, 'docs', 'audits.md'),
      '# Audit log\n\n- 2026-08-20 — form — full tree — pass (no findings) — —\n',
    );
    const p = parseBaseline(tmp, 'form');
    assert.ok(p!.pass);
    assert.equal(p!.pairs.length, 0);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('census reconcile: unregistered, unobservable, drift, spot-check', () => {
  const rows = [
    { project: 'alpha', location: 'x', summary: 'C2 / S0 / web-app / serverless-aws — pinned 1.1.0', notes: '' },
    { project: 'beta', location: 'x', summary: 'implicit C0', notes: '' },
    { project: 'ghost', location: 'x', summary: 'implicit C0', notes: '' },
  ];
  const observed = [{ name: 'alpha' }, { name: 'beta' }, { name: 'newcomer' }];
  const checkouts = [{ name: 'alpha', summary: 'C2 / S1 / web-app / serverless-aws — pinned 1.2.0' }];
  const findings = reconcile(rows, observed, checkouts);
  const kinds = findings.map((f) => f.kind).sort();
  assert.deepEqual(kinds, [
    'spot-check-candidate', // beta: implicit C0, no checkout (ghost has no observed repo → unobservable, and also spot-check? ghost has no checkout too)
    'spot-check-candidate',
    'summary-drift', // alpha: S0→S1, pin moved
    'unobservable-row', // ghost
    'unregistered-repo', // newcomer
  ]);
  const drift = findings.find((f) => f.kind === 'summary-drift')!;
  assert.equal(drift.proposedSummary, 'C2 / S1 / web-app / serverless-aws — pinned 1.2.0');
  assert.equal(findings.find((f) => f.kind === 'unregistered-repo')!.severity, 'violation');
});

test('census reconcile: no enumeration source is itself a finding', () => {
  const findings = reconcile([], null, []);
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.kind, 'enumeration-unavailable');
});

test('semantic packet assembles the adjudication context, judgment-free', () => {
  const packet = assembleSemanticPacket(resolve(FIXTURES, 'audited-c1'), CORPUS);
  assert.ok(packet.includes('# Semantic-audit packet'));
  assert.ok(packet.includes('## In-play rule checklist'));
  assert.ok(packet.includes('Last semantic audit: 2020-01-01'));
  assert.ok(packet.includes('adjudication is human'));
});

// ---------- chunk 5: links move + plugin wiring ----------

const readFileSync2 = (p: string) => readFileSync(p, 'utf8');

test('links move: inbound rewrite, anchor kept, own links re-based, git mv', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'mtool-move-'));
  try {
    execFileSync('bash', ['-c', 'mkdir -p docs/notes'], { cwd: tmp });
    writeFileSync(join(tmp, 'README.md'), '# R\n\nSee [b](docs/b.md#real-heading).\n');
    writeFileSync(join(tmp, 'docs', 'b.md'), '# B\n\n## Real heading\n\nBack to [readme](../README.md).\n');
    sh(tmp, 'init', '-q');
    sh(tmp, 'add', '-A');
    sh(tmp, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'seed');
    const r = moveDoc(tmp, 'docs/b.md', 'docs/notes/b2.md');
    assert.equal(r.inboundTotal, 1);
    assert.ok(readFileSync2(join(tmp, 'README.md')).includes('(docs/notes/b2.md#real-heading)'));
    assert.equal(r.selfRewritten, 1);
    assert.ok(readFileSync2(join(tmp, 'docs', 'notes', 'b2.md')).includes('(../../README.md)'));
    assert.equal(r.residualFindings, 0);
    assert.equal(r.heavyLinkWarning, false);
    assert.ok(!existsSync(join(tmp, 'docs', 'b.md'))); // git followed the move
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('links move: heavy-linkage warning and tombstone stub', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'mtool-move-heavy-'));
  try {
    execFileSync('bash', ['-c', 'mkdir -p docs'], { cwd: tmp });
    writeFileSync(join(tmp, 'docs', 'hub.md'), '# Hub\n');
    for (let i = 0; i < 5; i++)
      writeFileSync(join(tmp, `caller${i}.md`), `# C${i}\n\n[hub](docs/hub.md)\n`);
    const r = moveDoc(tmp, 'docs/hub.md', 'docs/hub-renamed.md', { tombstone: true });
    assert.equal(r.inboundTotal, 5);
    assert.equal(r.heavyLinkWarning, true); // Article 10: MUST warn
    assert.equal(r.tombstone, 'docs/hub.md');
    assert.ok(readFileSync2(join(tmp, 'docs', 'hub.md')).includes('moved to [docs/hub-renamed.md](hub-renamed.md)'));
    assert.equal(r.residualFindings, 0); // the stub's own link resolves too
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('plugin gate: the git-commit guard drives the staged form audit', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'mtool-plugin-'));
  const plugin = resolve(import.meta.dirname, '..', 'plugin');
  const env = { ...process.env, MTOOL_CORPUS: CORPUS, CLAUDE_PROJECT_DIR: tmp, CLAUDE_PLUGIN_ROOT: plugin };
  const guard = (payload: object): number => {
    try {
      execFileSync(join(plugin, 'hooks', 'git-commit-guard.sh'), [], {
        env,
        input: JSON.stringify(payload),
        stdio: ['pipe', 'ignore', 'ignore'],
      });
      return 0;
    } catch (err) {
      return (err as { status?: number }).status ?? -1;
    }
  };
  try {
    classify(tmp, CORPUS, { ctier: 1, slevel: 0, type: 'web-app', target: 'none/local', pin: '1.2.0', description: 'Plugin gate.' });
    sh(tmp, 'init', '-q');
    sh(tmp, 'add', '-A');
    sh(tmp, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'scaffold');
    // Non-commit commands pass straight through.
    assert.equal(guard({ tool_input: { command: 'ls -la' } }), 0);
    // Clean staged docs change: the audit runs through the hook path and passes.
    execFileSync('bash', ['-c', 'echo "- [ ] item" >> docs/backlog.md'], { cwd: tmp });
    sh(tmp, 'add', 'docs/backlog.md');
    assert.equal(guard({ tool_input: { command: 'git commit -m "docs"' } }), 0);
    // Source staged with nothing under docs/: W-003 violation blocks (exit 2).
    sh(tmp, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'docs');
    execFileSync('bash', ['-c', 'mkdir -p src && echo "export {}" > src/x.ts'], { cwd: tmp });
    sh(tmp, 'add', 'src/x.ts');
    assert.equal(guard({ tool_input: { command: 'git commit -m "code"' } }), 2);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('plugin: SessionStart command injects the brief status', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'mtool-plugin-status-'));
  const plugin = resolve(import.meta.dirname, '..', 'plugin');
  try {
    classify(tmp, CORPUS, { ctier: 1, slevel: 0, type: 'web-app', target: 'none/local', pin: '1.2.0', description: 'Status hook.' });
    const out = execFileSync(join(plugin, 'bin', 'mtool.sh'), ['status', '--brief', '--repo', tmp], {
      env: { ...process.env, MTOOL_CORPUS: CORPUS },
      encoding: 'utf8',
    });
    assert.ok(out.includes('compliance target 1.2.0'));
    assert.ok(out.trim().split('\n').length <= 4);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------- IR parser and checks (communication-pipeline docs/ir-schema.md) ----------
// Ported from the pipeline's scripts/test.mjs; the regression cases are
// its recorded false positives.

const GOOD_IR = `# IR: x

Reader: RD-1 (human owner, in conversation).
Purpose: report. A test.
Status: draft
Source: test

## Terms

T1. Widget: a thing. [proposed: this IR]

## Claims

C1. The widget exists. evidence: E1. [decided: owner, 2026-10-25]
C2. The widget is blue. [inferred: R1]

## Relations

R1. C2 depends-on C1 because a thing must exist to have a colour.

## Evidence

E1. tests/fixture.md, line 1.

## Asks

A1. Approve the widget. Depends: C1.
`;
const irRules = (text: string) => lintIR(text).findings.map((f) => f.rule);

test('ir: a conforming IR parses and has no findings', () => {
  const ir = parseIR(GOOD_IR);
  assert.equal(ir.header['reader'], 'RD-1 (human owner, in conversation).');
  assert.deepEqual(ir.sections.map((s) => s.title), ['Terms', 'Claims', 'Relations', 'Evidence', 'Asks']);
  assert.deepEqual(ir.elements.map((e) => e.id), ['T1', 'C1', 'C2', 'R1', 'E1', 'A1']);
  const c1 = ir.elements[1]!;
  assert.deepEqual(c1.provenance, { status: 'decided', detail: 'owner, 2026-10-25' });
  assert.equal(c1.text, 'The widget exists. evidence: E1.');
  assert.equal(c1.line, 14);
  assert.equal(c1.section, 'Claims');
  const r = lintIR(GOOD_IR);
  assert.deepEqual(r.findings, []);
  assert.equal(r.unratifiedTerms, 1, 'T1 is proposed and no vocabulary row is decided');
});

test('ir: continuation lines join the element; CK findings are violations with a line and file', () => {
  const t = GOOD_IR.replace('C2. The widget is blue.', 'C2. It is blue,\n   like the other one.');
  const r = lintIR(t, { file: '/x/a.ir.md' });
  assert.equal(r.ir.elements[2]!.text, 'It is blue, like the other one.');
  const ck01 = r.findings.filter((f) => f.rule === 'CK-01');
  assert.equal(ck01.length, 2);
  for (const f of ck01) {
    assert.equal(f.severity, 'violation');
    assert.equal(f.line, 15);
    assert.equal(f.file, '/x/a.ir.md');
  }
});

test('ir: CK-01 passes a sentence-initial determiner that names its noun', () => {
  const t = GOOD_IR.replace('C2. The widget is blue.', 'C2. This widget is blue.');
  assert.deepEqual(irRules(t).filter((r) => r === 'CK-01'), []);
});

test('ir: CK-02 flags a claim over 40 words', () => {
  const long = 'C2. ' + Array(42).fill('word').join(' ') + '. [inferred: R1]';
  const t = GOOD_IR.replace(/C2\. .*$/m, long);
  assert.ok(irRules(t).includes('CK-02'));
});

test('ir: CK-03 — a semicolon list after a colon, or a closing ", and", is not a clause join', () => {
  const list = GOOD_IR.replace('C2. The widget is blue.', 'C2. The widget has three parts: a base; a stem; a cap.');
  assert.deepEqual(irRules(list).filter((r) => r === 'CK-03'), []);
  const and = GOOD_IR.replace(
    'C2. The widget is blue.',
    'C2. The widget has three parts that matter to every reader who ever meets it in practice: a base, a stem, and a cap that fits.',
  );
  assert.deepEqual(irRules(and).filter((r) => r === 'CK-03'), []);
  const join = GOOD_IR.replace('C2. The widget is blue.', 'C2. The widget is blue; the base is red.');
  assert.ok(irRules(join).includes('CK-03'));
});

test('ir: CK-04 — a bolded term is a T element or a vocabulary term', () => {
  const t = GOOD_IR.replace('C2. The widget is blue.', 'C2. The **widget** has a **gadget**.');
  const vocab = new Map([['gadget', { term: 'Gadget', anchor: 'def-gadget', status: 'decided' as const }]]);
  assert.equal(lintIR(t).findings.filter((f) => f.rule === 'CK-04').length, 1);
  assert.deepEqual(lintIR(t, { vocab }).findings.filter((f) => f.rule === 'CK-04'), []);
});

test('ir: CK-05 requires provenance on T, C, G and the right fields', () => {
  const t = GOOD_IR.replace(' [inferred: R1]', ' [inferred]').replace(' [decided: owner, 2026-10-25]', '');
  assert.equal(irRules(t).filter((r) => r === 'CK-05').length, 2);
});

test('ir: CK-06 flags unresolved identifiers in relations, evidence and asks', () => {
  const t = GOOD_IR.replace('evidence: E1', 'evidence: E9').replace('Depends: C1', 'Depends: C7').replace('C2 depends-on C1', 'C2 depends-on C5');
  assert.equal(irRules(t).filter((r) => r === 'CK-06').length, 3);
});

test('ir: CK-07 and CK-08 check the header and the asks section', () => {
  const t = GOOD_IR.replace('Reader: RD-1 (human owner, in conversation).', 'Reader: the owner')
    .replace('Purpose: report. A test.', 'Purpose: a test.')
    .replace(/## Asks[\s\S]*$/, '');
  const rules = irRules(t);
  assert.equal(rules.filter((r) => r === 'CK-07').length, 2);
  assert.ok(!rules.includes('CK-08'), 'an unparseable Reader is not an RD-1/RD-2 IR');
  const noAsks = GOOD_IR.replace(/## Asks[\s\S]*$/, '');
  assert.ok(irRules(noAsks).includes('CK-08'));
});

test('ir: CK-09 flags a claim in two clusters; CK-10 flags section order', () => {
  const t = GOOD_IR.replace('## Relations', 'G1. cluster: C1, C2 [proposed: this IR]\nG2. cluster: C2 [proposed: this IR]\n\n## Relations');
  assert.ok(irRules(t).includes('CK-09'));
  const u = GOOD_IR.replace('## Terms', '## Zebra').replace('## Claims', '## Terms');
  assert.ok(irRules(u).includes('CK-10'));
});

test('ir: CK-11 — a defined-at target resolves', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'mtool-ir-defined-at-'));
  try {
    writeFileSync(join(tmp, 'vocabulary.md'), '| Term | Meaning |\n|---|---|\n| <a id="def-widget"></a>Widget | a thing |\n');
    const path = join(tmp, 'a.ir.md');
    const ok = GOOD_IR.replace('T1. Widget: a thing.', 'T1. Widget: a thing. defined-at: vocabulary.md#def-widget');
    assert.deepEqual(lintIR(ok, { file: path }).findings, []);
    const bad = GOOD_IR.replace('T1. Widget: a thing.', 'T1. Widget: a thing. defined-at: vocabulary.md#def-gadget');
    assert.equal(lintIR(bad, { file: path }).findings.filter((f) => f.rule === 'CK-11').length, 1);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------- prose lints (the P- rules' mechanical part; style-spec rows) ----------

const checks = (text: string, opts = {}) => lintProseText(text, opts).map((f) => f.check);
const only = (text: string, check: string, opts = {}) => lintProseText(text, opts).filter((f) => f.check === check);

test('style: the case 001 patterns, each cited to its methodology rule', () => {
  const prose = `# Review

## Asks

Do the thing.

## What changed

That is the monolith. P-004 and P-006 exist and hold in 10 of 50 documents across 3 projects. **The three documents are one argument at three levels, and your framework should adjudicate the other two.** This is fine. The mapping says where the corpus is weakest — provenance of concepts; most of the package lands there.

## What is already covered

Nothing.
`;
  const findings = lintProseText(prose);
  const seen = findings.map((f) => f.check);
  for (const c of ['SP-08', 'SP-05', 'SP-20', 'SP-07', 'SP-03', 'SP-09', 'SP-13']) assert.ok(seen.includes(c), `expected ${c} in ${seen}`);
  const ruleOf = (c: string) => findings.find((f) => f.check === c)!;
  assert.equal(ruleOf('SP-13').rule, 'W-008');
  assert.equal(ruleOf('SP-13').severity, 'violation');
  assert.equal(ruleOf('SP-05').rule, 'P-004');
  assert.equal(ruleOf('SP-07').rule, 'P-003');
  assert.equal(ruleOf('SP-20').rule, 'P-001');
  assert.equal(ruleOf('SP-03').rule, 'P-002');
  assert.match(ruleOf('SP-03').message, /referent/);
  for (const f of findings) if (f.check !== 'SP-13') assert.equal(f.severity, 'warning', `${f.check} is a warning`);
});

test('style: named identifiers and links satisfy P-004 (SP-05)', () => {
  assert.deepEqual(only('W-006 (branches are single-use) binds. See [P-004](x.md). W-006 again is fine.\n', 'SP-05'), []);
});

test('style: a semicolon list after a colon is not a clause join (SP-09)', () => {
  assert.deepEqual(only('Three parts: asks; what is covered; what changed.\n', 'SP-09'), []);
  assert.equal(only('The lint runs; the reviewer reads.\n', 'SP-09').length, 1);
});

test('style: a sentence-initial determiner with its noun is not a bare pronoun (SP-03)', () => {
  assert.deepEqual(only('This specification restates the rules.\n', 'SP-03'), []);
  assert.equal(only('This is fine.\n', 'SP-03').length, 1);
});

test('style: a table row defines the identifier in its first cell (SP-05)', () => {
  const prose = '| Id | Rule |\n|---|---|\n| SP-01 | one claim per sentence |\n\nSP-01 binds everyone.\n';
  assert.deepEqual(only(prose, 'SP-05'), []);
  const bare = '| Id | Rule |\n|---|---|\n| SP-01 | see SP-02 |\n';
  assert.equal(only(bare, 'SP-05').length, 1);
});

test('style: SP-13 ignores headings inside fenced code', () => {
  assert.deepEqual(only('Intro.\n\n```markdown\n## Asks\n\n## What changed\n```\n', 'SP-13'), []);
});

test('style: SP-13 applies to reports, not to a plan with an Asks section', () => {
  assert.deepEqual(only('# Plan\n\n## Chunks\n\nx.\n\n## Asks\n\nNone.\n', 'SP-13'), []);
});

test('style: SP-20 does not count identifiers, versions or dates as numerals', () => {
  assert.deepEqual(only('Checks CK-01 to CK-10 shipped in v1.5.0 on 2026-10-25 under RD-4.\n', 'SP-20'), []);
  assert.equal(only('There were 43 violations, 130 warnings and 15 files.\n', 'SP-20').length, 1);
});

test('style: a fielded row may open with a bold label and carry one em-dash (SP-07, SP-09)', () => {
  const row = checks('- [x] **Chunk 2 — roles in Claude Code** — 2026-10-25. Three skills landed.\n');
  assert.ok(!row.includes('SP-07') && !row.includes('SP-09'), row.join());
  assert.equal(only('The lint runs — the reviewer reads — the owner decides.\n', 'SP-09').length, 1);
});

test('style: a pointer list item is a row: path — description', () => {
  assert.deepEqual(only('- docs/classification.md — the binding declaration\n', 'SP-09'), []);
});

test('style: list items are separate blocks, not one long sentence (SP-02)', () => {
  const list =
    '1. **Asks** — the decisions requested of the reader.\n2. **What changed** — the parts that are new, each with a pointer into the deliverable and what to review there.\n3. **What is covered** — the parts that encode decisions the conversation already settled before this report.\n';
  assert.deepEqual(only(list, 'SP-02'), []);
});

test('style: SP-23 wants a vocabulary term linked at first use; code spans are not uses', () => {
  const vocab = new Map([['paraphraser', { term: 'Paraphraser', anchor: 'def-paraphraser', status: 'decided' as const }]]);
  const bare = only('The paraphraser renders prose. The paraphraser is fast.\n', 'SP-23', { vocab });
  assert.equal(bare.length, 1);
  assert.equal(bare[0]!.rule, 'P-008');
  assert.deepEqual(only('The [paraphraser](docs/vocabulary.md#def-paraphraser) renders prose. The paraphraser is fast.\n', 'SP-23', { vocab }), []);
  assert.deepEqual(only('Run `paraphraser` now.\n', 'SP-23', { vocab }), []);
});

test('style: vocabulary entries read the table rows and the methodology list form; SP-24 checks #def- links', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'mtool-vocab-'));
  try {
    const table = join(tmp, 'table.md');
    writeFileSync(
      table,
      '| Term | Meaning | Status | Definition site |\n|---|---|---|---|\n' +
        '| <a id="def-intermediate-representation"></a>Intermediate representation (IR) | the structured form | decided, owner 2026-10-24 | [ir-schema.md](ir-schema.md) |\n' +
        '| <a id="def-render-map"></a>Render map | a comment line | proposed, chunk 2 IR | |\n',
    );
    const t = vocabularyEntries(table);
    assert.deepEqual(t.get('ir'), { term: 'IR', anchor: 'def-intermediate-representation', status: 'decided' });
    assert.equal(t.get('intermediate representation')?.status, 'decided');
    assert.equal(t.get('render map')?.status, 'proposed');

    const list = join(tmp, 'list.md');
    writeFileSync(
      list,
      '# Vocabulary\n\n- <a id="def-c-tier"></a>**C-tier** — criticality.\n' +
        '- <a id="def-derived-conditions"></a>**Derived conditions** (functions of declared fields) — see below.\n' +
        '  - <a id="def-proportional-verification"></a>**Proportional\n    verification** — review cost follows the change.\n' +
        '- **Unanchored** — a term with no definition site.\n',
    );
    const l = vocabularyEntries(list);
    assert.deepEqual(l.get('c-tier'), { term: 'C-tier', anchor: 'def-c-tier', status: 'decided' });
    assert.equal(l.get('derived conditions')?.anchor, 'def-derived-conditions');
    assert.equal(l.get('proportional verification')?.anchor, 'def-proportional-verification');
    assert.deepEqual(l.get('unanchored'), { term: 'Unanchored', anchor: null, status: 'decided' });
    // Later files add to earlier ones.
    assert.equal(vocabularyEntries(list, t).size, t.size);

    const doc = join(tmp, 'doc.md');
    const f = lintProseText('A [render map](table.md#def-render-map) and a [gadget](table.md#def-gadget).\n', { file: doc });
    const sp24 = f.filter((x) => x.check === 'SP-24');
    assert.equal(sp24.length, 1);
    assert.match(sp24[0]!.message, /def-gadget/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------- W-008 bootstrap cache drift ----------

test('audit form: W-008 bootstrap cache — identical passes, one changed character is drift, absence warns at C1+', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'mtool-w008-'));
  const corpus = join(tmp, 'corpus');
  const repo = join(tmp, 'repo');
  try {
    const block =
      '## Reporting and writing — cached from W-008; do not edit here\n\nReports carry four parts.\n\nAuthority: W-008. This block is a\ncache — amend it upstream, never here.';
    mkdirSync(join(corpus, 'docs', 'rules'), { recursive: true });
    writeFileSync(
      join(corpus, 'docs', 'rules', 'working-agreement.md'),
      `# W — Working agreement\n\n### W-008 — Reports map their deliverables\nApplies: [C0+]\nKeywords: MUST\n\n**Required bootstrap text**: the block below, verbatim.\n\n\`\`\`markdown\n${block}\n\`\`\`\n\n**Rationale**: conformance decays with distance.\n\n### W-009 — Another rule\nApplies: [C1+]\nKeywords: MUST\n`,
    );
    assert.equal(corpusW008Block(corpus), block);
    assert.equal(corpusW008Block(CORPUS), null, 'the fixture corpus prescribes no block');

    classify(repo, CORPUS, { ctier: 1, slevel: 0, type: 'web-app', target: 'none/local', pin: '1.1.0', description: 'W-008 test.' });
    const w008 = () => buildAudit(repo, corpus, { mode: 'full' }).findings.filter((f) => f.rule === 'W-008');
    const bootstrap = join(repo, 'CLAUDE.md');
    assert.equal(w008Block(readFileSync(bootstrap, 'utf8')), null);
    assert.deepEqual(w008().map((f) => [f.severity, f.message]), [['warning', 'Agent bootstrap lacks the W-008 block']]);

    const original = readFileSync(bootstrap, 'utf8');
    writeFileSync(bootstrap, `${original}\n${block}\n`);
    assert.deepEqual(w008(), []);

    writeFileSync(bootstrap, `${original}\n${block.replace('four parts', 'four part')}\n`);
    assert.deepEqual(w008().map((f) => [f.severity, f.message]), [['warning', "Agent bootstrap's W-008 block differs from the rule's block (drift)"]]);

    // A fixture corpus with no prescribed block compares nothing.
    assert.deepEqual(buildAudit(repo, CORPUS, { mode: 'full' }).findings.filter((f) => f.rule === 'W-008'), []);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------- the real corpus, when a checkout is available ----------

const realCorpus = process.env['MTOOL_CORPUS'];
if (realCorpus && existsSync(resolve(realCorpus, 'docs', 'rules'))) {
  // Owner-approved change (W-002, 2026-08-20): the exact rule count
  // (21) broke when v1.1.0 added M-004 — a correct signal, resolved by
  // asserting a clean parse and the expected IDs instead of a count
  // that re-breaks on every accepted amendment.
  test('real corpus parses cleanly with all expected rule IDs', () => {
    const { rules, findings } = loadRules(realCorpus);
    assert.deepEqual(findings, []);
    assert.ok(rules.length >= 22, `expected ≥22 rules, got ${rules.length}`);
    const ids = rules.map((r) => r.id);
    for (const id of ['K-001', 'K-009', 'W-001', 'W-007', 'M-001', 'M-003', 'M-004', 'Q-001', 'S-001', 'S-002'])
      assert.ok(ids.includes(id), `missing ${id}`);
  });

  test('real corpus: methodology repo has exactly the K/W/M rules in play', () => {
    const state = deriveState(loadClassification(realCorpus));
    const { rules } = loadRules(realCorpus);
    const ids = rules.filter((r) => inPlay(r, state)).map((r) => r.id);
    // C1/S0/methodology-corpus/none-local: all K- and W- C1+ rules, the
    // C0+ baseline, and the M- mirrors; K-004..K-009 and W-004 are C2+,
    // so out of play.
    assert.ok(ids.includes('M-001') && ids.includes('M-002') && ids.includes('M-003'));
    assert.ok(ids.includes('M-004')); // in play since the repo migrated to 1.1.0
    assert.ok(ids.includes('K-001') && ids.includes('W-003') && ids.includes('S-001'));
    assert.ok(!ids.includes('K-004') && !ids.includes('K-007') && !ids.includes('W-004'));
  });

  test('real corpus: delta-ratio reads the recorded semantic-audit baseline', () => {
    const report = buildStatus(realCorpus, realCorpus);
    // Review round 1 (2026-08-30) recorded the corpus's first semantic
    // audit, so delta-ratio must now be a real ratio, not the honest
    // "none yet" null the pre-round corpus produced.
    assert.ok(report.deltaRatio.value !== null, 'expected a computed delta-ratio');
    assert.ok(report.deltaRatio.value >= 0 && report.deltaRatio.value <= 1);
    assert.ok(report.deltaRatio.note.includes('since the semantic audit'));
  });

  test('real corpus: links check passes across the whole methodology tree', () => {
    const report = checkLinks(realCorpus);
    assert.deepEqual(report.findings, []);
    assert.ok(report.linksChecked >= 140, `checked only ${report.linksChecked}`);
  });

  test('real corpus: the methodology repo passes its own form audit', () => {
    const report = buildAudit(realCorpus, realCorpus, { mode: 'full' });
    assert.deepEqual(report.findings.filter((f) => f.severity === 'violation'), []);
    assert.ok(report.versionLag.startsWith('none'));
  });
} else {
  console.log('skip real-corpus tests (set MTOOL_CORPUS to a methodology checkout)');
}

test('ir check: CK-12 flags a duplicated identifier; a Footprint header parses', () => {
  const ir = 'Reader: RD-1\nPurpose: report. x\nStatus: draft\nSource: s\nFootprint: docs/a.md; docs/records/\n\n## Terms\n\n## Claims\n\nC1. One. [proposed: this IR]\n\nC1. Two. [proposed: this IR]\n\n## Relations\n\n## Evidence\n\n## Asks\n\nA0. No asks.\n';
  const parsed = parseIR(ir);
  assert.equal(parsed.header['footprint'], 'docs/a.md; docs/records/');
  assert.ok(lintIR(ir, { vocab: new Map() }).findings.some((f) => f.rule === 'CK-12'));
});

test('vocabulary: a term beginning with "Term" is not mistaken for the header row', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'mtool-vocab-'));
  try {
    const f = join(tmp, 'vocabulary.md');
    writeFileSync(f, '| Term | Meaning | Status | Site |\n|---|---|---|---|\n| <a id="def-term-lifecycle"></a>Term lifecycle | a path | decided, owner | here |\n');
    assert.equal(vocabularyEntries(f).get('term lifecycle')?.status, 'decided');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('ir check: CK-13 flags two T elements naming one term', () => {
  const ir = 'Reader: RD-1\nPurpose: report. x\nStatus: draft\nSource: s\n\n## Terms\n\nT1. Widget: a thing. [proposed: this IR]\n\nT2. Widget: another. [proposed: this IR]\n\n## Claims\n\nC1. One. [proposed: this IR]\n\n## Relations\n\n## Evidence\n\n## Asks\n\nA0. No asks.\n';
  assert.ok(lintIR(ir, { vocab: new Map() }).findings.some((f) => f.rule === 'CK-13'));
});

console.log(`\n${passed} tests passed`);

// Explicit HTML anchors resolve as link targets (communication-pipeline's
// vocabulary rows carry <a id="def-…"></a>; the pilot links first uses to them).
{
  const dir = mkdtempSync(join(tmpdir(), 'mtool-anchors-'));
  mkdirSync(join(dir, 'docs'), { recursive: true });
  writeFileSync(join(dir, 'docs', 'vocabulary.md'), '# Vocabulary\n\n| Term | Meaning |\n|---|---|\n| <a id="def-widget"></a>Widget | a thing |\n');
  writeFileSync(join(dir, 'docs', 'note.md'), '# Note\n\nA [widget](vocabulary.md#def-widget) and a [missing](vocabulary.md#def-gadget).\n');
  writeFileSync(join(dir, 'README.md'), '# t\n');
  const r = checkLinks(dir);
  const problems = r.findings.map((f) => `${f.problem}:${f.target}`);
  assert.deepEqual(problems, ['missing-anchor:vocabulary.md#def-gadget'], 'explicit id anchors resolve; a missing one is still reported');
  console.log('ok   links: explicit <a id> anchors resolve as link targets');
}
