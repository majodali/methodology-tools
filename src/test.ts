// Chunk-1 gate tests: `status` against fixtures for implicit-C0,
// minimal-C0, and full C2 Classifications, including the precedence
// tie-breaks from the constitution's own examples (Article 4 stage 2.3).
// Runner-native, no framework (methodology practice C2).

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { constraints, inPlay, moreSpecific } from './applicability.js';
import { loadClassification } from './classification.js';
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
    ['T-001', 'T-101', 'T-201'], // T-301 needs deployed
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
  assert.deepEqual(report.inPlay.map((r) => r.id), ['T-001']);
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
} else {
  console.log('skip real-corpus tests (set MTOOL_CORPUS to a methodology checkout)');
}

console.log(`\n${passed} tests passed`);
