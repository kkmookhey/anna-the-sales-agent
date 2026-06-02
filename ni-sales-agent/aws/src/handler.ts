import { runLoop, type RunSummary } from './orchestrator/loop.js';
import { buildDeps } from './bootstrap.js';
import { logger } from './logging.js';

export async function handler(): Promise<RunSummary> {
  logger.info('run_start');
  const deps = await buildDeps();
  const summary = await runLoop(deps);
  logger.info('run_done', { ...summary });
  return summary;
}
