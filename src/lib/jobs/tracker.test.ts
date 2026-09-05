import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupOldJobs,
  createJob,
  getJob,
  updateJob,
  _resetJobsForTests,
} from "../jobs/tracker";

afterEach(() => {
  _resetJobsForTests();
});

describe("job tracker", () => {
  it("crée, met à jour et lit un job", () => {
    const id = createJob();
    expect(getJob(id)?.status).toBe("pending");
    updateJob(id, { status: "running", progress: 42, message: "…" });
    const job = getJob(id);
    expect(job?.status).toBe("running");
    expect(job?.progress).toBe(42);
  });

  it("cleanupOldJobs supprime les jobs trop vieux", () => {
    const id = createJob();
    updateJob(id, { createdAt: Date.now() - 10_000 });
    cleanupOldJobs(5_000);
    expect(getJob(id)).toBeUndefined();
  });
});
