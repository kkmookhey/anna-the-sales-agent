import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

// Candidate roots, most-specific first:
// - Lambda bundle: esbuild flattens everything to /var/task/index.mjs, and the build copies
//   skills to /var/task/skills, so `join(here, 'skills')` (and LAMBDA_TASK_ROOT/skills) is correct.
// - Tests/local: source lives at src/judgment/, so ../../../skills resolves to the prototype dir.
const CANDIDATE_ROOTS = [
  join(here, 'skills'),
  ...(process.env.LAMBDA_TASK_ROOT ? [join(process.env.LAMBDA_TASK_ROOT, 'skills')] : []),
  join(here, '..', '..', '..', 'skills'),
  join(here, '..', '..', 'skills'),
];

export function loadSkill(name: string): string {
  for (const root of CANDIDATE_ROOTS) {
    const path = join(root, name, 'SKILL.md');
    if (existsSync(path)) return readFileSync(path, 'utf8');
  }
  throw new Error(`Skill not found: ${name} (looked in ${CANDIDATE_ROOTS.join(', ')})`);
}

const CONTENT_ROOTS = [
  join(here, 'content'),
  ...(process.env.LAMBDA_TASK_ROOT ? [join(process.env.LAMBDA_TASK_ROOT, 'content')] : []),
  join(here, '..', 'content'),
  join(here, '..', '..', 'content'),
];

export function loadContent(name: string): string {
  for (const root of CONTENT_ROOTS) {
    const path = join(root, `${name}.md`);
    if (existsSync(path)) return readFileSync(path, 'utf8');
  }
  throw new Error(`Content not found: ${name} (looked in ${CONTENT_ROOTS.join(', ')})`);
}
