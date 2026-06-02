import { App } from 'aws-cdk-lib';
import { NiSalesAgentStack } from './ni-sales-agent-stack.js';

const app = new App();
new NiSalesAgentStack(app, 'NiSalesAgentStack', {
  env: { account: '331145994818', region: 'ap-south-1' },
});
