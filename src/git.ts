// Shared git plumbing. Every caller treats a null return as "history
// unavailable" and reports honestly rather than guessing.

import { execFileSync } from 'node:child_process';

export const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

export function git(args: string[], cwd: string): string | null {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

/** Highest `vX.Y.Z` tag in a checkout, as `X.Y.Z`; null when untagged. */
export function latestSemverTag(repo: string): string | null {
  const out = git(['tag', '-l', 'v*'], repo);
  if (!out) return null;
  const versions = out
    .split('\n')
    .map((t) => t.match(/^v(\d+)\.(\d+)\.(\d+)$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => [Number(m[1]), Number(m[2]), Number(m[3])] as const);
  if (versions.length === 0) return null;
  versions.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  const [x, y, z] = versions[versions.length - 1]!;
  return `${x}.${y}.${z}`;
}
