import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

// In tests/local: ../../../skills (prototype dir). In Lambda bundle: ../../skills (copied by build).
const CANDIDATE_ROOTS = [
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
