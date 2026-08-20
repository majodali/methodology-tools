// mtool CLI. Output is JSON findings + human summary; surfaces decide
// severity handling, not the checks (tools plan, design decisions).

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { buildStatus, renderHuman } from './status.js';

function usage(): never {
  console.error(
    [
      'usage: mtool status [--repo <path>] [--corpus <path>] [--json] [--brief]',
      '',
      '  --repo    project to report on (default: cwd)',
      '  --corpus  checkout of majodali/methodology (default: $MTOOL_CORPUS,',
      '            else a sibling directory named "methodology")',
      '  --json    machine-readable report',
      '  --brief   few-line summary for SessionStart injection',
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
  },
});

const command = positionals[0];
if (command !== 'status') usage();

const repo = resolve(values.repo ?? process.cwd());
const corpus = findCorpus(values.corpus, repo);
const report = buildStatus(repo, corpus);

if (values.json) console.log(JSON.stringify(report, null, 2));
else console.log(renderHuman(report, values.brief));
