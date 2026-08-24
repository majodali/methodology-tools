// Chunk-1 gate tests: `status` against fixtures for implicit-C0,
// minimal-C0, and full C2 Classifications, including the precedence
// tie-breaks from the constitution's own examples (Article 4 stage 2.3).
// Runner-native, no framework (methodology practice C2).

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { constraints, inPlay, moreSpecific } from './applicability.js';
import { buildAudit, fingerprint } from './audit.js';
import { reconcile } from './census.js';
import { classify } from './classify.js';
import { buildDelivery, parseBaseline } from './deliver.js';
import { installHooks } from './hooks.js';
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
    for (const id of ['K-001', 'K-009', 'W-001', 'W-007', 'M-001', 'M-003', 'M-004', 'S-001', 'S-002'])
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

  test('real corpus: delta-ratio is honest about the missing semantic audit', () => {
    const report = buildStatus(realCorpus, realCorpus);
    // docs/audits.md exists (1.1.0) but holds only the bootstrap form
    // entry — no semantic audit yet.
    assert.equal(report.deltaRatio.value, null);
    assert.ok(report.deltaRatio.note.includes('no semantic audit recorded yet'));
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

console.log(`\n${passed} tests passed`);
