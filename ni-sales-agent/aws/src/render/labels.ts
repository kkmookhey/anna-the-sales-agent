const LABELS: Record<string, string> = {
  pentest_web: 'Web Application VAPT',
  pentest_mobile: 'Mobile Application VAPT',
  pentest_api: 'API Security Testing',
  pentest_network: 'Network Penetration Testing',
  red_team: 'Red Team',
  mdr: 'Managed Detection & Response',
  soc: 'Managed SOC',
  grc: 'Governance, Risk & Compliance',
  compliance: 'Compliance & Audit',
  cloud_security: 'Cloud Security',
  identity: 'Identity & Access',
  ai_security: 'AI Security',
};

/** Human label for a service-line key; falls back to Title Case of the key. */
export function serviceLineLabel(key: string): string {
  if (LABELS[key]) return LABELS[key];
  return key.split(/[_\s]+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
