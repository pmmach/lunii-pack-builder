import { lockStatsAction } from "@/lib/actions/stats";
import { StatsDashboard } from "@/components/stats-dashboard";
import { StatsShell } from "@/components/stats-shell";
import { StatsUnlockForm } from "@/components/stats-unlock-form";
import { STATS_COOKIE, statsCookieMatches } from "@/lib/stats/access";
import { loadUsageReport } from "@/lib/stats/usage";
import { env } from "@/lib/shared/env";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Statistiques — Lunii Pack Builder",
  robots: { index: false, follow: false },
};

export default async function StatsPage() {
  const token = env.STATS_TOKEN;
  if (!token) notFound();

  const jar = await cookies();
  if (!statsCookieMatches(jar.get(STATS_COOKIE)?.value, token)) {
    return (
      <StatsShell>
        <StatsUnlockForm />
      </StatsShell>
    );
  }

  const report = await loadUsageReport();
  return (
    <StatsShell
      toolbar={
        <form action={lockStatsAction}>
          <button
            type="submit"
            className="border-border bg-background hover:bg-muted inline-flex h-8 items-center rounded-lg border px-3 text-sm font-medium"
          >
            Verrouiller
          </button>
        </form>
      }
    >
      <StatsDashboard report={report} />
    </StatsShell>
  );
}
