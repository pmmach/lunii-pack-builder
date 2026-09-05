export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startWorkspaceCleanupScheduler } = await import(
      "@/lib/jobs/cleanup"
    );
    startWorkspaceCleanupScheduler();
  }
}
