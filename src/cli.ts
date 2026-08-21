// mtool CLI. Output is JSON findings + human summary; nonzero exit on
// MUST violations. Surfaces decide severity handling, not the checks
// (tools plan, design decisions).

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { classify, renderClassifyResult } from './classify.js';
import { checkLinks, renderLinkReport } from './links.js';
import { buildStatus, renderHuman } from './status.js';
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
    ].join('\n'),
  );
  process.exit(2);
}

function findCorpus(explicit: string | undefined, repo: string): string {
  const candidates = [
    explicit,
    process.env['MTOOL_CORPUS'],
    resolve(repo, '..', 'methodology'),
  ].filter((c): c is string => Boolean(c));
  for (const c of candidates) {
    if (existsSync(resolve(c, 'docs', 'rules'))) return resolve(c);
  }
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
  },
});

const repo = resolve(values.repo ?? process.cwd());
const command = positionals[0];

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
