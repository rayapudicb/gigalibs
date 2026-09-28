// @gigalibs/workflow-sdk
// Thin TypeScript wrapper around the GigaLibs Workflow Platform REST API.
// Mirrors the gumloop-js pattern: instantiate a client, run workflows, poll or stream.

export interface WorkflowSummary {
  code: string;
  name: string;
  description: string;
  nodeCount: number;
  updatedAt: string;
}

export interface WorkflowRun {
  runId: string;
  workflowCode: string;
  status: 'pending' | 'running' | 'success' | 'error';
  startedAt: string;
  finishedAt?: string;
  output?: Record<string, unknown>;
  error?: string;
  duration_ms?: number;
}

export interface RunWorkflowOptions {
  /** Input data passed to the workflow's first nodes */
  inputs: Record<string, unknown>;
  /** Optional webhook to POST results to when the run completes */
  webhookUrl?: string;
}

export interface PollOptions {
  /** Polling interval in ms (default 1000) */
  interval?: number;
  /** Max wait in ms before throwing (default 60 000) */
  timeout?: number;
}

export interface GigaWorkflowClientOptions {
  /** API key for authentication (falls back to GIGALIBS_API_KEY env var) */
  apiKey?: string;
  /** Base URL of the workflow platform (falls back to GIGALIBS_WORKFLOW_URL or http://localhost:5180) */
  baseUrl?: string;
}

// ─────────────────────────────────────────────────────────
// Core client
// ─────────────────────────────────────────────────────────
export class GigaWorkflowClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: GigaWorkflowClientOptions = {}) {
    this.apiKey =
      options.apiKey ??
      (typeof process !== 'undefined' ? (process.env.GIGALIBS_API_KEY ?? '') : '');
    const resolvedUrl =
      options.baseUrl ??
      (typeof process !== 'undefined' ? (process.env.GIGALIBS_WORKFLOW_URL ?? '') : '');
    if (!resolvedUrl) {
      throw new Error('baseUrl is required or GIGALIBS_WORKFLOW_URL environment variable must be configured');
    }
    this.baseUrl = resolvedUrl;
  }

  // ── internal ─────────────────────────────────────────
  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { ...headers, ...((init?.headers as Record<string, string>) ?? {}) },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`GigaLibs API ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  }

  // ── Workflows ─────────────────────────────────────────
  /** List all workflows available on the platform */
  async listWorkflows(): Promise<WorkflowSummary[]> {
    return this.request<WorkflowSummary[]>('/api/workflow-studio/workflows');
  }

  /** Fetch full DAG definition for a workflow */
  async getWorkflow(code: string): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(`/api/workflow-studio/workflows/${code}`);
  }

  // ── Runs ──────────────────────────────────────────────
  /** Trigger a workflow run; returns immediately with a pending WorkflowRun */
  async runWorkflow(code: string, options: RunWorkflowOptions): Promise<WorkflowRun> {
    return this.request<WorkflowRun>(`/api/workflow-studio/workflows/${code}/execute`, {
      method: 'POST',
      body: JSON.stringify({ inputs: options.inputs, webhookUrl: options.webhookUrl }),
    });
  }

  /** Fetch the current state of a run by its ID */
  async getRun(runId: string): Promise<WorkflowRun> {
    return this.request<WorkflowRun>(`/api/workflow-studio/runs/${runId}`);
  }

  /**
   * Poll a run until it reaches a terminal state (success | error).
   * Throws if the timeout is exceeded.
   */
  async pollRun(runId: string, options: PollOptions = {}): Promise<WorkflowRun> {
    const interval = options.interval ?? 1000;
    const timeout = options.timeout ?? 60_000;
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      const run = await this.getRun(runId);
      if (run.status === 'success' || run.status === 'error') return run;
      await new Promise<void>(r => setTimeout(r, interval));
    }
    throw new Error(`Workflow run ${runId} timed out after ${timeout}ms`);
  }

  /**
   * Convenience: trigger a workflow and wait for it to finish.
   * Returns the completed WorkflowRun.
   */
  async executeAndWait(
    code: string,
    inputs: Record<string, unknown>,
    timeoutMs = 60_000,
  ): Promise<WorkflowRun> {
    const run = await this.runWorkflow(code, { inputs });
    return this.pollRun(run.runId, { timeout: timeoutMs });
  }

  /**
   * Async generator that yields WorkflowRun snapshots as they change.
   * Stops yielding when the run reaches a terminal state.
   *
   * @example
   * for await (const snapshot of client.streamRun('my-wf', { data: 'hello' })) {
   *   console.log(snapshot.status, snapshot.output);
   * }
   */
  async *streamRun(
    code: string,
    inputs: Record<string, unknown>,
    pollIntervalMs = 500,
  ): AsyncGenerator<WorkflowRun> {
    let run = await this.runWorkflow(code, { inputs });
    yield run;

    while (run.status !== 'success' && run.status !== 'error') {
      await new Promise<void>(r => setTimeout(r, pollIntervalMs));
      run = await this.getRun(run.runId);
      yield run;
    }
  }
}

// ─────────────────────────────────────────────────────────
// Convenience factory
// ─────────────────────────────────────────────────────────
/** Create a pre-configured GigaWorkflowClient */
export function createWorkflowClient(options?: GigaWorkflowClientOptions): GigaWorkflowClient {
  return new GigaWorkflowClient(options);
}
