// `mtool hooks install`: the git-level mirror of the same-commit guard
// and staged form audit (W-003 / Article 9). Writes a pre-commit hook
// that runs `mtool audit form --staged`. Until mtool is published to a
// registry, the hook embeds absolute paths to this checkout — a
// documented limitation of the pre-package era.

import { chmodSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { git } from './git.js';

export function installHooks(repo: string, corpus: string): { hookPath: string } {
  const hooksDir = git(['rev-parse', '--git-path', 'hooks'], repo);
  if (hooksDir === null) throw new Error(`${repo} is not a git repository`);
  const toolsRoot = resolve(import.meta.dirname, '..');
  const hookPath = resolve(repo, hooksDir, 'pre-commit');
  const script = [
    '#!/bin/sh',
    '# Installed by `mtool hooks install` — the same-commit documentation',
    '# guard (methodology W-003) and staged form audit (Article 9).',
    '# For an intentional exception, bypass with `git commit --no-verify`',
    '# and record why in the Backlog.',
    `exec ${JSON.stringify(process.execPath)} ${JSON.stringify(join(toolsRoot, 'node_modules', '.bin', 'tsx'))} ${JSON.stringify(join(toolsRoot, 'src', 'cli.ts'))} audit form --staged --repo "$(git rev-parse --show-toplevel)" --corpus ${JSON.stringify(corpus)}`,
    '',
  ].join('\n');
  writeFileSync(hookPath, script);
  chmodSync(hookPath, 0o755);
  return { hookPath };
}
