// Maps an enquiry's service lines to the curated deep-reference files worth injecting
// into the proposal grounding prompt. Order here is the priority order used by the cap.
const DEEP_REFERENCES: { name: string; pattern: RegExp }[] = [
  { name: 'deep/autonomous-pentester', pattern: /pentest|penetration|vapt|red.?team|offensive|exploit/i },
  { name: 'deep/brand-darkweb', pattern: /brand|dark.?web|darknet|takedown|threat.?intel|impersonation/i },
  { name: 'deep/ciso-threat-briefing', pattern: /ciso.?brief|threat.?brief|briefing|advisory.?feed/i },
];

const MAX_DEEP_REFERENCES = 2;

/**
 * Select the deep-reference content names relevant to these service lines.
 * Pure and deterministic. De-duplicated, capped at MAX_DEEP_REFERENCES, returned in
 * the fixed priority order of DEEP_REFERENCES. Returns [] when nothing matches.
 */
export function selectDeepReferences(serviceLines: string[]): string[] {
  const haystack = serviceLines.join(' ');
  return DEEP_REFERENCES
    .filter((ref) => ref.pattern.test(haystack))
    .map((ref) => ref.name)
    .slice(0, MAX_DEEP_REFERENCES);
}
