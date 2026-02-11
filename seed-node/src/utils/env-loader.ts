import { logger } from './logger.js';

/**
 * DISABLED: Seeder now uses only its own .env file (scripts/seed/.env)
 */
export function loadServiceEnv(serviceName: string): Record<string, string> {
  logger.debug(`Using seed project .env for ${serviceName}`);
  return {};
}

/**
 * DISABLED: Seeder now uses only its own .env file
 */
export function applyServiceEnv(serviceName: string): () => void {
  return () => {};
}
