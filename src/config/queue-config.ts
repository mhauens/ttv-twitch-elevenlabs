import type { AppEnv } from './env.js';

export interface QueueConfig {
  readonly inMemoryLimit: number;
  readonly deferredLimit: number;
  readonly recentFailureLimit: number;
  readonly recentRejectionLimit: number;
  readonly shutdownPolicy: AppEnv['SHUTDOWN_POLICY'];
}

export function createQueueConfig(env: AppEnv): QueueConfig {
  return {
    inMemoryLimit: env.QUEUE_MEMORY_LIMIT,
    deferredLimit: env.QUEUE_DEFERRED_LIMIT,
    recentFailureLimit: env.QUEUE_RECENT_FAILURE_LIMIT,
    recentRejectionLimit: env.QUEUE_RECENT_REJECTION_LIMIT,
    shutdownPolicy: env.SHUTDOWN_POLICY
  };
}