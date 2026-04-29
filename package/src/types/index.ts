export type SchedulerJobStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed_retryable'
  | 'failed'
  | 'dead_letter'
  | 'cancelled'
  | 'expired';

export type JsonObject = Record<string, unknown>;

export interface SchedulerLogger {
  debug(tag: string, message: string, context?: unknown): void;
  info(tag: string, message: string, context?: unknown): void;
  warn(tag: string, message: string, context?: unknown): void;
  error(tag: string, message: string, context?: unknown): void;
}

export interface BackoffOptions {
  type?: 'fixed' | 'exponential';
  delay?: number;
}

export interface JobOptions {
  attempts?: number;
  backoff?: BackoffOptions;
  removeOnComplete?: number | { count?: number; age?: number };
  removeOnFail?: number | { count?: number; age?: number };
}

export interface JobContext {
  jobId: string;
  attempt: number;
  maxAttempts: number;
  runAt: Date;
  record: SchedulerJobRecord;
}

export type JobHandler<TPayload extends JsonObject = JsonObject, TResult = unknown> = (
  payload: TPayload,
  context: JobContext
) => Promise<TResult> | TResult;

export interface RegisterJobInput<TPayload extends JsonObject = JsonObject, TResult = unknown> {
  name: string;
  handler: JobHandler<TPayload, TResult>;
  defaultOptions?: JobOptions;
}

export interface ScheduleJobInput<TPayload extends JsonObject = JsonObject> {
  name: string;
  jobId: string;
  payload: TPayload;
  runAt: Date | string | number;
  ttlMs?: number;
  attempts?: number;
  backoff?: BackoffOptions;
  replaceExisting?: boolean;
  createdBy?: string | null;
  metadata?: JsonObject;
}

export interface ScheduleJobResult {
  status: 'ok';
  action: 'scheduled' | 'rescheduled' | 'queued_immediately';
  jobId: string;
  name: string;
  runAt: string;
  delayMs: number;
  record: SchedulerJobRecord;
}

export interface ScheduleRecurringInput<TPayload extends JsonObject = JsonObject> {
  name: string;
  jobId: string;
  payload: TPayload;
  pattern: string;
  tz?: string;
  ttlMs?: number;
  attempts?: number;
  backoff?: BackoffOptions;
  replaceExisting?: boolean;
  createdBy?: string | null;
  metadata?: JsonObject;
}

export interface ScheduleRecurringResult {
  status: 'ok';
  action: ScheduleJobResult['action'];
  jobId: string;
  name: string;
  pattern: string;
  tz?: string;
  nextRunAt: string;
  delayMs: number;
}

export interface SchedulerJobRecord<TPayload extends JsonObject = JsonObject> {
  jobId: string;
  version: number;
  name: string;
  payload: TPayload;
  runAt: Date;
  ttlMs?: number;
  status: SchedulerJobStatus;
  attempts: number;
  attemptsMade: number;
  backoff?: BackoffOptions;
  bullJobId?: string;
  lockedAt?: Date | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  deadLetterAt?: Date | null;
  lastError?: string | null;
  createdBy?: string | null;
  metadata?: JsonObject;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ListJobsFilter {
  status?: SchedulerJobStatus | SchedulerJobStatus[];
  name?: string;
  limit?: number;
}

export interface WorkerConfig {
  concurrency?: number | 'auto';
}

export interface SchedulerDefaults extends JobOptions {
  staleRunningAfterMs?: number;
  deadLetterOnExhausted?: boolean;
  reconcileBatchSize?: number;
}

export interface LazySchedulerConfig {
  queueName: string;
  redisConnection: unknown;
  mongoose?: unknown;
  store?: SchedulerStore;
  logger?: Partial<SchedulerLogger>;
  worker?: WorkerConfig;
  defaults?: SchedulerDefaults;
  locks?: {
    enabled?: boolean;
    keyPrefix?: string;
    ttlMs?: number;
    instanceId?: string;
  };
}

export interface LazyScheduler {
  register(input: RegisterJobInput): void;
  listRegistered(): string[];
  start(): Promise<void>;
  reconcile(): Promise<ReconcileResult>;
  schedule(input: ScheduleJobInput): Promise<ScheduleJobResult>;
  scheduleRecurring(input: ScheduleRecurringInput): Promise<ScheduleRecurringResult>;
  cancel(jobId: string): Promise<{ status: 'ok'; cancelled: boolean; jobId: string }>;
  get(jobId: string): Promise<SchedulerJobRecord | null>;
  list(filter?: ListJobsFilter): Promise<SchedulerJobRecord[]>;
  listDeadLetters(filter?: Omit<ListJobsFilter, 'status'>): Promise<SchedulerJobRecord[]>;
  shutdown(): Promise<void>;
}

export interface RegisteredJob {
  name: string;
  handler: JobHandler;
  defaultOptions: JobOptions;
}

export interface ReconcileResult {
  checked: number;
  enqueued: number;
  expired: number;
  staleRetried: number;
  skipped: number;
  lockAcquired: boolean;
}

export interface SchedulerStore {
  upsertScheduledJob(input: ScheduleJobInput, options: JobOptions): Promise<SchedulerJobRecord>;
  markQueued(jobId: string, bullJobId?: string): Promise<SchedulerJobRecord | null>;
  markRunning(jobId: string, version: number): Promise<SchedulerJobRecord | null>;
  markCompleted(jobId: string, version: number): Promise<SchedulerJobRecord | null>;
  markFailed(jobId: string, version: number, error: Error, retryable: boolean): Promise<SchedulerJobRecord | null>;
  markDeadLetter(jobId: string, version: number, error: Error): Promise<SchedulerJobRecord | null>;
  markCancelled(jobId: string): Promise<SchedulerJobRecord | null>;
  markExpired(jobId: string): Promise<SchedulerJobRecord | null>;
  findReconcileCandidates(staleRunningAfterMs: number, limit: number): Promise<SchedulerJobRecord[]>;
  getByJobId(jobId: string): Promise<SchedulerJobRecord | null>;
  list(filter?: ListJobsFilter): Promise<SchedulerJobRecord[]>;
}

export type StorageAdapter = SchedulerStore;

export interface SchedulerQueue {
  enqueue(record: SchedulerJobRecord, options: JobOptions): Promise<{ jobId: string; existing: boolean }>;
  remove(bullJobId: string): Promise<boolean>;
  get(bullJobId: string): Promise<unknown | null>;
  close(): Promise<void>;
}
