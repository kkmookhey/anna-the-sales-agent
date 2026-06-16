// DRAFT commercials boilerplate — KK / legal MUST review before any real send.
// Entity-specific data (name, address, tax id, payment terms, governing law) lives in
// ./legal-entities.ts and is selected per customer geography. This file holds only the
// clauses that are identical across all entities.

export const VALIDITY_DAYS = 30;

export const EXCLUSIONS = [
  'Remediation of identified vulnerabilities (advisory only).',
  'Source-code review unless explicitly scoped.',
  'Testing of third-party / external systems not owned by the client.',
  'Any work outside the agreed scope, handled via a written change request.',
];

// Shared clauses. The governing-law clause is appended per-entity from
// LegalEntity.governingLaw by the commercials builder.
export const BASE_TERMS = [
  'This proposal and its commercials are confidential and valid for the stated validity period.',
  "Testing is performed against the agreed scope with the client's written authorisation.",
  'Findings are reported to the client; no data is disclosed to third parties.',
  'Liability is limited to the fees paid for the engagement.',
];
