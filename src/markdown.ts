// Minimal markdown model: parses documents into the vocabulary shapes
// the rules engine reads (headings, links, Status lines, list entries).
// Deliberately line-based and un-glamorous (tools plan, design
// decisions): parse ambiguity is a finding, never a guess.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export interface Heading {
  level: number;
  text: string;
  slug: string;
  line: number; // 1-based
}

export interface Link {
  text: string;
  target: string;
  line: number;
}

export interface StatusLine {
  value: string;
  line: number;
}

export interface Doc {
  path: string;
  lines: string[];
  headings: Heading[];
  links: Link[];
  /** All `Status: ...` designation lines outside code fences. */
  statusLines: StatusLine[];
}

/** Repo-relative paths of markdown files under `root`, excluded dirs
 *  skipped at any depth. `fixtures` is excluded by default: test data is
 *  not the project's own material (its deliberate sandbox markers and
 *  broken links are the fixture's content, not the repo's state). */
export function* markdownFiles(
  root: string,
  exclude: string[] = ['.git', 'node_modules', 'fixtures'],
  sub = '',
): Generator<string> {
  for (const name of readdirSync(join(root, sub))) {
    if (exclude.includes(name)) continue;
    const rel = sub ? `${sub}/${name}` : name;
    if (statSync(join(root, rel)).isDirectory()) yield* markdownFiles(root, exclude, rel);
    else if (name.endsWith('.md')) yield rel;
  }
}

/** GitHub-style heading slug (lowercase; drop punctuation; spaces to hyphens). */
export function slugify(heading: string): string {
  const stripped = heading.replace(/[*_`]/g, '').trim().toLowerCase();
  let out = '';
  for (const ch of stripped) {
    if (/[\p{L}\p{N}\-_ ]/u.test(ch)) out += ch;
  }
  return out.replace(/ /g, '-');
}

const LINK_RE = /(?<!!)\[([^\]]*)\]\(([^)\s]+)\)/g;

export function parseDoc(path: string): Doc {
  const lines = readFileSync(path, 'utf8').split('\n');
  const headings: Heading[] = [];
  const links: Link[] = [];
  const statusLines: StatusLine[] = [];
  const slugCounts = new Map<string, number>();
  let inFence = false;

  lines.forEach((raw, i) => {
    const line = i + 1;
    if (raw.trimStart().startsWith('```')) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;

    const h = raw.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const base = slugify(h[2]!);
      const n = slugCounts.get(base) ?? 0;
      slugCounts.set(base, n + 1);
      headings.push({
        level: h[1]!.length,
        text: h[2]!.trim(),
        slug: n === 0 ? base : `${base}-${n}`,
        line,
      });
    }

    // Status lines may be blockquoted and carry emphasis — the
    // vocabulary fixes the designation values, not the markdown dress
    // (`> Status: **closed** → …` is a compliant Status line).
    const s = raw.match(/^(?:>\s*)?Status:\s*(.+)$/);
    if (s) statusLines.push({ value: s[1]!.replace(/[*_`]/g, '').trim(), line });

    for (const m of raw.matchAll(LINK_RE)) {
      links.push({ text: m[1]!, target: m[2]!, line });
    }
  });

  return { path, lines, headings, links, statusLines };
}
