import { handler } from './handler.js';

// Usage: set env vars (see RUNBOOK.md "Local run"), then: npm run local
handler()
  .then((summary) => {
    // eslint-disable-next-line no-console
    console.log('Run summary:', JSON.stringify(summary, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Run failed:', err);
    process.exit(1);
  });
