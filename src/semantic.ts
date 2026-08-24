// `mtool audit semantic`: assembles the semantic-audit packet — the
// context a human or agent adjudicates from. Assembly only, never
// judgment (tools plan non-goal): the packet gathers what Article 9's
// semantic audit examines; adjudication stays with people.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inPlay } from './applicability.js';
import { loadClassification } from './classification.js';
import { git } from './git.js';
import { checkLinks } from './links.js';
import { markdownFiles, parseDoc } from './markdown.js';
import { loadRules } from './rules.js';
import { buildStatus } from './status.js';
import { deriveState } from './types.js';

export function assembleSemanticPacket(repo: string, corpus: string): string {
  const c = loadClassification(repo);
  const status = buildStatus(repo, corpus);
  const rules = loadRules(corpus).rules.filter((r) => inPlay(r, deriveState(c)));
  const sha = git(['rev-parse', '--short', 'HEAD'], repo) ?? 'unknown';
  const lines: string[] = [];

  lines.push(`# Semantic-audit packet`);
  lines.push('');
  lines.push(
    `Project state at assembly: ${status.classification.implicit ? 'implicit ' : ''}C${c.ctier} / S${c.slevel} / ${c.type} / ${c.target}; ` +
      `compliance target ${c.pinned ?? 'latest'}; audited commit ${sha}.`,
  );
  lines.push(
    'Assembled per Article 9 (semantic audits verify that traceability links support ' +
      'what citing content claims, and that documents are substantively current). ' +
      'This packet is context only — adjudication is human (tools plan non-goal).',
  );

  lines.push('', '## Article 8 call-outs', '');
  lines.push(`- Version lag: ${status.version.note}`);
  lines.push(
    `- Deviations: ${c.deviations.length === 0 ? 'none recorded' : ''}`,
  );
  for (const d of c.deviations) lines.push(`  - ${d.text}`);

  lines.push('', '## Changes since the last semantic audit', '');
  if (status.deltaRatio.sinceSemanticAudit) {
    lines.push(`Last semantic audit: ${status.deltaRatio.sinceSemanticAudit}. ${status.deltaRatio.note}.`);
    const log = git(
      ['log', `--since=${status.deltaRatio.sinceSemanticAudit}`, '--oneline', '--', '.'],
      repo,
    );
    if (log) {
      lines.push('', '```');
      lines.push(log);
      lines.push('```');
    }
  } else {
    lines.push(status.deltaRatio.note + '.');
  }

  lines.push('', '## In-play rule checklist', '');
  for (const r of rules) lines.push(`- [ ] ${r.id} — ${r.title} (\`${r.appliesRaw}\`)`);

  lines.push('', '## Document inventory', '');
  for (const rel of markdownFiles(repo)) {
    const doc = parseDoc(join(repo, rel));
    const status0 = doc.statusLines[0];
    lines.push(
      `- ${rel} — ${doc.headings.length} headings, ${doc.links.length} links` +
        (status0 ? `, Status: ${status0.value}` : ''),
    );
  }

  lines.push('', '## Link integrity (form-level input)', '');
  const links = checkLinks(repo);
  lines.push(
    `${links.linksChecked} relative links; ${links.findings.length === 0 ? 'all resolve' : `${links.findings.length} FINDINGS (see form audit)`}.`,
  );

  lines.push('', '## Sandbox designations', '');
  if (status.sandbox.length === 0) lines.push('none.');
  for (const s of status.sandbox)
    lines.push(`- ${s.file}:${s.line} — ${s.designation}${s.ageDays !== null ? ` (${s.ageDays}d)` : ''}`);

  lines.push('', '## Adjudication prompts (from Article 9)', '');
  lines.push('- Do traceability links actually support what the citing content claims?');
  lines.push('- Are the registers substantively current, not merely well-shaped?');
  lines.push('- Do checked Backlog entries describe what actually shipped (K-003)?');
  lines.push('- Are plan Status lines live claims of current intent (K-007)?');
  if (existsSync(join(repo, 'docs', 'audits.md'))) {
    lines.push('- On completion, record the semantic entry in docs/audits.md (audit process).');
  } else {
    lines.push('- On completion, the first Audit delivery creates docs/audits.md (audit process).');
  }

  return lines.join('\n') + '\n';
}
