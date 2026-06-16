export type EntityKey = 'us' | 'mea' | 'india';

export interface LegalEntity {
  key: EntityKey;
  legalName: string;
  /** Confirm-by-KK placeholder until a real registered address is provided. */
  address: string;
  taxLabel: 'GST' | 'VAT' | null;
  taxValue: string | null;
  currency: 'USD' | 'AED' | 'INR';
  paymentTerms: string;
  /** Governing-law / jurisdiction clause text. US/UAE venue is a confirm-by-KK placeholder. */
  governingLaw: string;
  signatory: string;
}

const US: LegalEntity = {
  key: 'us',
  legalName: 'Network Intelligence LLC',
  address: '[US ENTITY ADDRESS — confirm]',
  taxLabel: null,
  taxValue: null,
  currency: 'USD',
  paymentTerms: '50% on award, 50% on delivery of the final report. Net 30 days from invoice, in USD.',
  governingLaw: 'This engagement is governed by the laws of the State of [US STATE — confirm], United States, and the parties submit to its exclusive jurisdiction.',
  signatory: 'For and on behalf of Network Intelligence LLC',
};

const MEA: LegalEntity = {
  key: 'mea',
  legalName: 'Network Intelligence Middle East LLC',
  address: '[MIDDLE EAST ENTITY ADDRESS — confirm]',
  taxLabel: 'VAT',
  taxValue: '104043215300003',
  currency: 'AED',
  paymentTerms: '50% on award, 50% on delivery of the final report. Net 30 days from invoice, in AED. Prices are exclusive of 5% VAT, charged where applicable.',
  governingLaw: 'This engagement is governed by the laws of the United Arab Emirates, and the parties submit to the exclusive jurisdiction of the [UAE VENUE — confirm] courts.',
  signatory: 'For and on behalf of Network Intelligence Middle East LLC',
};

const INDIA: LegalEntity = {
  key: 'india',
  legalName: 'Network Intelligence Pvt. Ltd.',
  address: '[INDIA ENTITY ADDRESS — confirm]',
  taxLabel: 'GST',
  taxValue: '27AABCN6183F1ZE',
  currency: 'INR',
  paymentTerms: '50% on award, 50% on delivery of the final report. Net 30 days from invoice, in INR. Prices are exclusive of 18% GST, charged where applicable.',
  governingLaw: 'This engagement is governed by the laws of India, and the parties submit to the exclusive jurisdiction of the courts at Mumbai, Maharashtra.',
  signatory: 'For and on behalf of Network Intelligence Pvt. Ltd.',
};

// Keyword buckets matched case-insensitively against the free-text region string.
const US_KEYS = ['united states', 'usa', ' us', 'us ', 'u.s', 'america', 'canada', 'uk', 'united kingdom',
  'britain', 'england', 'europe', 'european', 'eu', 'eea', 'germany', 'france', 'netherlands', 'ireland',
  'spain', 'italy', 'belgium', 'sweden', 'norway', 'denmark', 'finland', 'switzerland', 'poland', 'portugal', 'austria'];
const MEA_KEYS = ['uae', 'u.a.e', 'emirates', 'dubai', 'abu dhabi', 'sharjah', 'ksa', 'saudi', 'qatar', 'doha',
  'bahrain', 'oman', 'muscat', 'kuwait', 'middle east', 'mena', 'gcc', 'africa', 'african', 'egypt', 'kenya',
  'nigeria', 'south africa', 'morocco', 'ghana', 'tanzania'];
const INDIA_KEYS = ['india', 'indian', 'bharat', 'mumbai', 'delhi', 'bengaluru', 'bangalore', 'hyderabad',
  'chennai', 'pune', 'kolkata', 'gurgaon', 'gurugram', 'noida'];

function matches(hay: string, keys: string[]): boolean {
  return keys.some((k) => hay.includes(k));
}

/**
 * Resolve the billing legal entity from the free-text customer region.
 * Unknown / empty region defaults to the India entity and sets `defaulted: true`
 * so the orchestrator can flag it for human geo confirmation.
 */
export function resolveEntity(region: string | null | undefined): { entity: LegalEntity; defaulted: boolean } {
  const hay = ` ${(region ?? '').toLowerCase().trim()} `;
  if (hay.trim() && matches(hay, US_KEYS)) return { entity: US, defaulted: false };
  if (hay.trim() && matches(hay, MEA_KEYS)) return { entity: MEA, defaulted: false };
  if (hay.trim() && matches(hay, INDIA_KEYS)) return { entity: INDIA, defaulted: false };
  return { entity: INDIA, defaulted: true };
}

export const ENTITIES = { US, MEA, INDIA } as const;
