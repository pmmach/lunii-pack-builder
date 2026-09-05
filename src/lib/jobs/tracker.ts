import { randomUUID } from "node:crypto";

export type JobStatus = "pending" | "running" | "done" | "error";

export interface JobState {
  id: string;
  status: JobStatus;
  progress: number;
  message?: string;
  errorCode?: string;
  createdAt: number;
  /** JSON stringifié du résultat (chemins, peaks, etc.). */
  resultRef?: string;
}

const jobs = new Map<string, JobState>();

export function createJob(): string {
  const id = randomUUID();
  jobs.set(id, {
    id,
    status: "pending",
    progress: 0,
    createdAt: Date.now(),
  });
  return id;
}

export function updateJob(id: string, patch: Partial<JobState>): void {
  const current = jobs.get(id);
  if (!current) return;
  jobs.set(id, { ...current, ...patch, id });
}

export function getJob(id: string): JobState | undefined {
  return jobs.get(id);
}

export function cleanupOldJobs(maxAgeMs: number): void {
  const cutoff = Date.now() - maxAgeMs;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) {
      jobs.delete(id);
    }
  }
}

/** Exposé pour les tests. */
export function _resetJobsForTests(): void {
  jobs.clear();
}
