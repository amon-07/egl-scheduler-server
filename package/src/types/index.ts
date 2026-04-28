export type SchedulerJobStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed_retryable'
  | 'failed'
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

export interface SchedulerJobRecord<TPayload extends JsonObject = JsonObject> {
  jobId: string;
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
  concurrency?: number;
}

export interface SchedulerDefaults extends JobOptions {
  staleRunningAfterMs?: number;
}

export interface LazySchedulerConfig {
  queueName: string;
  redisConnection: unknown;
  mongoose: unknown;
  logger?: Partial<SchedulerLogger>;
  worker?: WorkerConfig;
  defaults?: SchedulerDefaults;
}

export interface LazyScheduler {
  register(input: RegisterJobInput): void;
  start(): Promise<void>;
  reconcile(): Promise<ReconcileResult>;
  schedule(input: ScheduleJobInput): Promise<ScheduleJobResult>;
  cancel(jobId: string): Promise<{ status: 'ok'; cancelled: boolean; jobId: string }>;
  get(jobId: string): Promise<SchedulerJobRecord | null>;
  list(filter?: ListJobsFilter): Promise<SchedulerJobRecord[]>;
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
}

export interface SchedulerStore {
  upsertScheduledJob(input: ScheduleJobInput, options: JobOptions): Promise<SchedulerJobRecord>;
  markQueued(jobId: string, bullJobId?: string): Promise<SchedulerJobRecord | null>;
  markRunning(jobId: string): Promise<SchedulerJobRecord | null>;
  markCompleted(jobId: string): Promise<SchedulerJobRecord | null>;
  markFailed(jobId: string, error: Error, retryable: boolean): Promise<SchedulerJobRecord | null>;
  markCancelled(jobId: string): Promise<SchedulerJobRecord | null>;
  markExpired(jobId: string): Promise<SchedulerJobRecord | null>;
  findReconcileCandidates(staleRunningAfterMs: number): Promise<SchedulerJobRecord[]>;
  getByJobId(jobId: string): Promise<SchedulerJobRecord | null>;
  list(filter?: ListJobsFilter): Promise<SchedulerJobRecord[]>;
}

export interface SchedulerQueue {
  enqueue(record: SchedulerJobRecord, options: JobOptions): Promise<{ jobId: string }>;
  remove(jobId: string): Promise<boolean>;
  get(jobId: string): Promise<unknown | null>;
  close(): Promise<void>;
}
