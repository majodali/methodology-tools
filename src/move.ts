// `mtool links move`: Article 10's move duties, mechanized — the
// tooling transitional Risk R4 awaits. Moves a document, rewrites
// inbound links across the repo and the moved document's own outgoing
// links, warns on heavy linkage (a heavily linked move is a de facto
// decision review), and leaves a tombstone on request. Whether a
// document is externally referenced is operator-supplied knowledge
// until the census maintains an external-reference index — the
// documented limitation the founding plan promised to record.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { git } from './git.js';
import { checkLinks } from './links.js';
import { markdownFiles } from './markdown.js';

const LINK_RE = /(?<!!)\[([^\]]*)\]\(([^)\s]+)\)/g;

export interface MoveReport {
  from: string;
  to: string;
  inbound: { file: string; rewritten: number }[];
  inboundTotal: number;
  selfRewritten: number;
  heavyLinkWarning: boolean;
  tombstone: string | null;
  /** Post-move link check over the whole repo. */
  residualFindings: number;
  notes: string[];
}

const HEAVY_THRESHOLD = 5;

function rewriteLinks(
  content: string,
  fromDir: string,
  match: (resolved: string) => boolean,
  newTarget: (fragment: string | null) => string,
): { content: string; rewritten: number } {
  let rewritten = 0;
  const out = content.replace(LINK_RE, (whole, text: string, target: string) => {
    if (/^(https?:|mailto:|#)/.test(target)) return whole;
    const [pathPart, frag] = target.includes('#')
      ? [target.slice(0, target.indexOf('#')), target.slice(target.indexOf('#') + 1)]
      : [target, null];
    if (pathPart === '') return whole;
    const resolved = normalize(join(fromDir, pathPart));
    if (!match(resolved)) return whole;
    rewritten++;
    return `[${text}](${newTarget(frag)})`;
  });
  return { content: out, rewritten };
}

export function moveDoc(
  repo: string,
  from: string,
  to: string,
  opts: { tombstone?: boolean } = {},
): MoveReport {
  const fromAbs = join(repo, from);
  const toAbs = join(repo, to);
  if (!existsSync(fromAbs)) throw new Error(`${from} does not exist`);
  if (existsSync(toAbs)) throw new Error(`${to} already exists`);
  if (!from.endsWith('.md') || !to.endsWith('.md'))
    throw new Error('links move handles markdown documents');

  const notes: string[] = [];
  const fromNorm = normalize(from);

  // 1. Rewrite inbound links across the repo (Article 10: tooling MUST
  //    update inbound links automatically).
  const inbound: MoveReport['inbound'] = [];
  for (const rel of markdownFiles(repo)) {
    if (normalize(rel) === fromNorm) continue;
    const abs = join(repo, rel);
    const { content, rewritten } = rewriteLinks(
      readFileSync(abs, 'utf8'),
      dirname(rel),
      (resolved) => resolved === fromNorm,
      (frag) => relative(dirname(rel), to) + (frag ? `#${frag}` : ''),
    );
    if (rewritten > 0) {
      writeFileSync(abs, content);
      inbound.push({ file: rel, rewritten });
    }
  }
  const inboundTotal = inbound.reduce((n, i) => n + i.rewritten, 0);
  const heavyLinkWarning = inboundTotal >= HEAVY_THRESHOLD;
  if (heavyLinkWarning) {
    notes.push(
      `heavily linked (${inboundTotal} inbound links): heavy linkage makes this move a de facto decision review (Article 10)`,
    );
  }

  // 2. Re-base the moved document's own relative links (each needs its
  //    own new target, so this pass inlines the rewrite).
  let selfContent = readFileSync(fromAbs, 'utf8');
  let selfRewritten = 0;
  selfContent = selfContent.replace(LINK_RE, (whole, text: string, target: string) => {
    if (/^(https?:|mailto:|#)/.test(target)) return whole;
    const [pathPart, frag] = target.includes('#')
      ? [target.slice(0, target.indexOf('#')), target.slice(target.indexOf('#') + 1)]
      : [target, null];
    if (pathPart === '') return whole;
    const resolved = normalize(join(dirname(fromNorm), pathPart));
    if (!existsSync(join(repo, resolved)) && resolved !== fromNorm) return whole;
    const rebased = relative(dirname(to), resolved === fromNorm ? to : resolved);
    if (rebased === pathPart) return whole;
    selfRewritten++;
    return `[${text}](${rebased}${frag ? `#${frag}` : ''})`;
  });

  // 3. Move (git mv when possible so history follows).
  mkdirSync(dirname(toAbs), { recursive: true });
  writeFileSync(fromAbs, selfContent);
  const moved = git(['mv', from, to], repo);
  if (moved === null) {
    renameSync(fromAbs, toAbs);
    notes.push('moved without git (not a git repo or git mv failed) — stage manually');
  }

  // 4. Tombstone — operator-supplied external-reference knowledge
  //    (Article 10: externally referenced documents are public API).
  let tombstone: string | null = null;
  if (opts.tombstone) {
    const relLink = relative(dirname(fromNorm), to);
    writeFileSync(
      fromAbs,
      `# Moved\n\nThis document moved to [${to}](${relLink}).\nExternal links cannot be rewritten — this tombstone preserves them\n(Article 10).\n`,
    );
    tombstone = from;
  } else {
    notes.push(
      'no tombstone left: whether this document is externally referenced is operator-supplied ' +
        'knowledge until the census maintains an external-reference index (methodology Risk R6) — ' +
        'pass --tombstone if external links point here',
    );
  }

  const residual = checkLinks(repo).findings.length;
  return {
    from,
    to,
    inbound,
    inboundTotal,
    selfRewritten,
    heavyLinkWarning,
    tombstone,
    residualFindings: residual,
    notes,
  };
}

export function renderMove(r: MoveReport): string {
  const lines = [
    `moved ${r.from} → ${r.to}`,
    `inbound links rewritten: ${r.inboundTotal} across ${r.inbound.length} file(s)` +
      (r.inbound.length ? ` (${r.inbound.map((i) => `${i.file}:${i.rewritten}`).join(', ')})` : ''),
    `moved document's own links re-based: ${r.selfRewritten}`,
  ];
  if (r.heavyLinkWarning) lines.push(`WARNING   ${r.notes.find((n) => n.includes('heavily linked'))}`);
  if (r.tombstone) lines.push(`tombstone left at ${r.tombstone}`);
  for (const n of r.notes.filter((n) => !n.includes('heavily linked'))) lines.push(`note: ${n}`);
  lines.push(
    r.residualFindings === 0
      ? 'post-move link check: all relative links and anchors resolve'
      : `post-move link check: ${r.residualFindings} FINDINGS — inspect with mtool links check`,
  );
  return lines.join('\n');
}
