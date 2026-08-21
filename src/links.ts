// `mtool links check`: deterministic link integrity across a repo
// (Constitution Article 10: dangling links are audit findings; Article 9
// form audits include link integrity). Replaces the bootstrap's ad-hoc
// script — methodology Risk R2's awaited tooling.

import { existsSync, statSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { markdownFiles, parseDoc } from './markdown.js';

export interface LinkFinding {
  file: string;
  line: number;
  target: string;
  problem: 'missing-file' | 'missing-anchor';
  /** The normative source each finding cites (tools plan: every check cites its rule). */
  cites: string;
}

export interface LinkReport {
  repo: string;
  filesScanned: number;
  linksChecked: number;
  externalSkipped: number;
  findings: LinkFinding[];
}

const CITES =
  'constitution.md Article 10 (dangling links are audit findings); Article 9 (form audit: link integrity)';

export function checkLinks(repo: string): LinkReport {
  const findings: LinkFinding[] = [];
  let filesScanned = 0;
  let linksChecked = 0;
  let externalSkipped = 0;
  const slugCache = new Map<string, Set<string>>();

  const slugsOf = (path: string): Set<string> => {
    let s = slugCache.get(path);
    if (!s) {
      s = new Set(parseDoc(path).headings.map((h) => h.slug));
      slugCache.set(path, s);
    }
    return s;
  };

  for (const rel of markdownFiles(repo)) {
    filesScanned++;
    const doc = parseDoc(join(repo, rel));
    for (const link of doc.links) {
      if (/^(https?:|mailto:)/.test(link.target)) {
        externalSkipped++;
        continue;
      }
      linksChecked++;
      const [pathPart, frag] = link.target.includes('#')
        ? [link.target.slice(0, link.target.indexOf('#')), link.target.slice(link.target.indexOf('#') + 1)]
        : [link.target, null];
      const dest =
        pathPart === '' ? join(repo, rel) : normalize(join(repo, dirname(rel), pathPart));
      if (!existsSync(dest)) {
        findings.push({ file: rel, line: link.line, target: link.target, problem: 'missing-file', cites: CITES });
        continue;
      }
      if (frag !== null && !statSync(dest).isDirectory() && !slugsOf(dest).has(frag)) {
        findings.push({ file: rel, line: link.line, target: link.target, problem: 'missing-anchor', cites: CITES });
      }
    }
  }

  return { repo, filesScanned, linksChecked, externalSkipped, findings };
}

export function renderLinkReport(r: LinkReport): string {
  const lines = [
    `${r.filesScanned} markdown files; ${r.linksChecked} relative links checked; ` +
      `${r.externalSkipped} external links skipped (not fetched)`,
  ];
  if (r.findings.length === 0) {
    lines.push('all relative links and anchors resolve');
  } else {
    lines.push(`FINDINGS (${r.findings.length}) — cites ${CITES}:`);
    for (const f of r.findings) {
      lines.push(`  ${f.file}:${f.line}: ${f.problem}: ${f.target}`);
    }
  }
  return lines.join('\n');
}
