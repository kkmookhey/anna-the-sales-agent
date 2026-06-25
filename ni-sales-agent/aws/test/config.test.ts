import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';

const base = {
  MAILBOX: 'sales@networkintelligence.ai',
  SLACK_CHANNEL_ID: 'C0B7KEP8D8W',
  APPROVAL_TOKEN: 'SHIP-IT',
  DRY_RUN: 'false',
  FOLLOWUP_CADENCE_DAYS: '3,7,14',
  MAX_FOLLOWUPS: '3',
  BUSINESS_HOURS_ONLY: 'true',
  DEALS_TABLE: 'ni-sales-deals',
  AWS_REGION: 'ap-south-1',
  HUBSPOT_PIPELINE: 'default',
  HUBSPOT_DEAL_STAGE: '39235007',
  HUBSPOT_OWNER_ID: '1667576553',
  APPROVED_SLACK_USER_IDS: 'U07AN5FR86B',
};

describe('loadConfig', () => {
  it('parses a well-formed env', () => {
    const c = loadConfig(base);
    expect(c.mailbox).toBe('sales@networkintelligence.ai');
    expect(c.followupCadenceDays).toEqual([3, 7, 14]);
    expect(c.maxFollowups).toBe(3);
    expect(c.dryRun).toBe(false);
    expect(c.approvedSlackUserIds).toEqual(['U07AN5FR86B']);
    expect(c.bookingUrl).toBeNull(); // optional — absent from base env
  });

  it('reads an optional BOOKING_URL when present', () => {
    expect(loadConfig({ ...base, BOOKING_URL: 'https://cal.ni/kk' }).bookingUrl).toBe('https://cal.ni/kk');
  });

  it('throws when a required key is missing', () => {
    const { MAILBOX, ...rest } = base;
    void MAILBOX;
    expect(() => loadConfig(rest)).toThrow(/MAILBOX/);
  });
});
