import { serviceLineLabel } from './labels.js';

export interface MethodologyPhase { name: string; detail: string }
export interface ServiceMethodology {
  key: string;
  label: string;
  phases: MethodologyPhase[];
  frameworks: string[];
  tooling: string[];
  aiAugmentation: string;
}

const AI_TRIAGE =
  'Transilience compresses the raw finding set (~16,000 signals → ~10 prioritized actions, ~95% ' +
  'prioritization accuracy) and removes duplicate noise, so testers spend manual effort only on ' +
  'exploitable, high-impact issues.';

const ENTRIES: Record<string, Omit<ServiceMethodology, 'label'>> = {
  pentest_web: {
    key: 'pentest_web',
    phases: [
      { name: 'Reconnaissance & mapping', detail: 'Crawl, fingerprint the stack, enumerate entry points and the authenticated surface.' },
      { name: 'Authentication & session', detail: 'Test login, session management, MFA, password and recovery flows.' },
      { name: 'Authorization & business logic', detail: 'IDOR/BOLA, privilege boundaries, workflow and rate-limit abuse.' },
      { name: 'Input validation & injection', detail: 'Injection, XSS, SSRF, deserialization, file handling against OWASP Top 10.' },
      { name: 'Reporting & retest', detail: 'Risk-rated findings with reproduction steps, then a verification retest of fixes.' },
    ],
    frameworks: ['OWASP WSTG', 'OWASP ASVS', 'OWASP Top 10', 'PTES', 'NIST SP 800-115'],
    tooling: ['Burp Suite Pro', 'OWASP ZAP', 'nuclei', 'sqlmap', 'custom exploit scripts', 'Transilience triage'],
    aiAugmentation: AI_TRIAGE,
  },
  pentest_api: {
    key: 'pentest_api',
    phases: [
      { name: 'Spec & endpoint discovery', detail: 'Parse OpenAPI/Swagger, enumerate endpoints, methods and parameters.' },
      { name: 'AuthN / AuthZ', detail: 'BOLA, BFLA, broken authentication, token and scope handling.' },
      { name: 'Input & schema validation', detail: 'Mass assignment, injection, schema and content-type abuse.' },
      { name: 'Rate-limit & business logic', detail: 'Resource exhaustion, replay, and workflow abuse.' },
      { name: 'Reporting & retest', detail: 'Risk-rated findings with requests/responses, then fix-verification retest.' },
    ],
    frameworks: ['OWASP API Security Top 10', 'OWASP WSTG', 'OWASP ASVS', 'PTES'],
    tooling: ['Burp Suite Pro', 'Postman', 'nuclei', 'custom scripts', 'Transilience triage'],
    aiAugmentation: AI_TRIAGE,
  },
  pentest_mobile: {
    key: 'pentest_mobile',
    phases: [
      { name: 'Static analysis', detail: 'Reverse-engineer the binary; review storage, secrets and configuration.' },
      { name: 'Dynamic & runtime', detail: 'Runtime manipulation, instrumentation, and platform-control bypass.' },
      { name: 'Network & API', detail: 'Transport security, certificate pinning, and backend API testing.' },
      { name: 'Storage & cryptography', detail: 'Local data protection and cryptographic implementation review.' },
      { name: 'Reporting & retest', detail: 'Risk-rated findings with reproduction, then a verification retest.' },
    ],
    frameworks: ['OWASP MASVS', 'OWASP MASTG', 'PTES'],
    tooling: ['MobSF', 'Frida', 'objection', 'Burp Suite Pro', 'Transilience triage'],
    aiAugmentation: AI_TRIAGE,
  },
  pentest_network: {
    key: 'pentest_network',
    phases: [
      { name: 'Discovery & enumeration', detail: 'Host, service and version discovery across the in-scope ranges.' },
      { name: 'Vulnerability identification', detail: 'Authenticated and unauthenticated checks, validated to remove false positives.' },
      { name: 'Exploitation', detail: 'Controlled exploitation of confirmed weaknesses to prove impact.' },
      { name: 'Post-exploitation & lateral movement', detail: 'Privilege escalation and lateral movement mapped to MITRE ATT&CK.' },
      { name: 'Reporting & retest', detail: 'Risk-rated findings with evidence, then a verification retest.' },
    ],
    frameworks: ['NIST SP 800-115', 'PTES', 'OSSTMM', 'MITRE ATT&CK', 'CIS Benchmarks'],
    tooling: ['Nmap', 'Nessus', 'Metasploit', 'BloodHound', 'custom scripts', 'Transilience triage'],
    aiAugmentation: AI_TRIAGE,
  },
  red_team: {
    key: 'red_team',
    phases: [
      { name: 'Threat intelligence & recon', detail: 'OSINT and target profiling to build realistic attack scenarios.' },
      { name: 'Initial access', detail: 'Phishing, exposed services and supply-chain vectors to gain a foothold.' },
      { name: 'Foothold & command-and-control', detail: 'Establish resilient, evasive C2 aligned to MITRE ATT&CK.' },
      { name: 'Escalation & lateral movement', detail: 'Privilege escalation and movement toward the agreed objectives.' },
      { name: 'Objectives & exfiltration', detail: 'Demonstrate impact against the crown-jewel objectives.' },
      { name: 'Reporting & purple-team', detail: 'Attack narrative, detection gaps, and a joint purple-team replay.' },
    ],
    frameworks: ['MITRE ATT&CK', 'TIBER-EU', 'Lockheed Martin Cyber Kill Chain', 'PTES'],
    tooling: ['Cobalt Strike / Sliver', 'custom implants', 'BloodHound', 'OSINT tooling', 'Transilience triage'],
    aiAugmentation: AI_TRIAGE,
  },
  cloud_security: {
    key: 'cloud_security',
    phases: [
      { name: 'Configuration & posture review', detail: 'Benchmark the account/subscription against CIS and provider guidance.' },
      { name: 'Identity & access', detail: 'IAM roles, trust policies, privilege escalation and key exposure.' },
      { name: 'Data & network exposure', detail: 'Public exposure, storage, encryption and segmentation.' },
      { name: 'Logging & detection', detail: 'Audit-log coverage, alerting and detection readiness.' },
      { name: 'Reporting & remediation', detail: 'Prioritized findings with remediation guidance and a retest.' },
    ],
    frameworks: ['CIS Benchmarks (AWS/Azure/GCP)', 'NIST CSF', 'CSA CCM', 'MITRE ATT&CK Cloud'],
    tooling: ['ScoutSuite', 'Prowler', 'provider-native tooling', 'Transilience posture engine'],
    aiAugmentation:
      'Transilience continuously inventories cloud and AI workloads, maps each finding to frameworks ' +
      'automatically, and prioritizes by real exposure so remediation starts with what actually matters.',
  },
  config_review: {
    key: 'config_review',
    phases: [
      { name: 'Baseline & scope', detail: 'Confirm in-scope systems and the applicable hardening baseline.' },
      { name: 'Automated benchmark scan', detail: 'Assess against CIS Benchmarks and vendor hardening guides.' },
      { name: 'Manual validation', detail: 'Validate results and review controls automation cannot judge.' },
      { name: 'Gap analysis', detail: 'Rate gaps by risk against the baseline.' },
      { name: 'Reporting', detail: 'Prioritized hardening recommendations with evidence.' },
    ],
    frameworks: ['CIS Benchmarks', 'NIST SP 800-53', 'Vendor hardening guides'],
    tooling: ['CIS-CAT', 'provider-native scanners', 'custom checks', 'Transilience triage'],
    aiAugmentation: AI_TRIAGE,
  },
  compliance: {
    key: 'compliance',
    phases: [
      { name: 'Scoping & gap assessment', detail: 'Define the control set in scope and assess the current-state gap.' },
      { name: 'Control testing & evidence', detail: 'Test control design and operating effectiveness; collect evidence.' },
      { name: 'Risk analysis', detail: 'Rate residual risk and map to the relevant regulatory obligations.' },
      { name: 'Remediation roadmap', detail: 'Prioritized, owner-assigned remediation plan.' },
      { name: 'Report & attestation readiness', detail: 'Audit-ready report and readiness for certification/attestation.' },
    ],
    frameworks: ['ISO/IEC 27001', 'PCI DSS', 'SOC 2', 'NIST CSF'],
    tooling: ['evidence workflow', 'control test scripts', 'Transilience compliance crosswalk'],
    aiAugmentation:
      'Transilience auto-maps every finding to the relevant frameworks with per-finding provenance, ' +
      'so auditors receive structured evidence rather than screenshots.',
  },
};

const GENERIC: Omit<ServiceMethodology, 'label'> = {
  key: 'generic',
  phases: [
    { name: 'Scoping & planning', detail: 'Confirm scope, objectives, rules of engagement and success criteria.' },
    { name: 'Assessment & testing', detail: 'Execute the assessment against the agreed scope and standards.' },
    { name: 'Analysis & validation', detail: 'Validate findings and remove false positives.' },
    { name: 'Reporting', detail: 'Risk-rated findings with clear, actionable remediation.' },
    { name: 'Retest', detail: 'Verify that remediated issues are resolved.' },
  ],
  frameworks: ['NIST SP 800-115', 'PTES', 'OWASP', 'CIS Benchmarks'],
  tooling: ['industry-standard tooling', 'custom scripts', 'Transilience triage'],
  aiAugmentation: AI_TRIAGE,
};

export const LIBRARY_KEYS = Object.keys(ENTRIES);

export function methodologyFor(serviceLineKey: string): ServiceMethodology {
  const base = ENTRIES[serviceLineKey] ?? GENERIC;
  return { ...base, label: serviceLineLabel(serviceLineKey) };
}

export const ADVISE_LOOP: MethodologyPhase[] = [
  { name: 'Assess', detail: 'Understand the environment, threats and the regulatory drivers in play.' },
  { name: 'Design', detail: 'Define the testing strategy, scope and standards for the engagement.' },
  { name: 'Visualize', detail: 'Map the attack surface and model the threats that matter.' },
  { name: 'Implement', detail: 'Execute the methodology — test, exploit and validate.' },
  { name: 'Sustain', detail: 'Report, retest and harden against the confirmed weaknesses.' },
  { name: 'Evolve', detail: 'Feed findings into continuous exposure management via Transilience.' },
];
