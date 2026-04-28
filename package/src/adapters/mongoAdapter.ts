import type { SchedulerStore } from '../types';
import { createMongoStore } from '../store/mongoStore';

export interface MongoAdapterConfig {
  mongoose: unknown;
}

export function createMongoAdapter(config: MongoAdapterConfig): SchedulerStore {
  return createMongoStore(config.mongoose);
}
