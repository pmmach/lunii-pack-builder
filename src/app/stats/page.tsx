import { lockStatsAction } from "@/lib/actions/stats";
import { StatsDashboard } from "@/components/stats-dashboard";
import { StatsShell } from "@/components/stats-shell";
import { StatsUnlockForm } from "@/components/stats-unlock-form";
import { STATS_COOKIE, readStatsToken, statsCookieMatches } from "@/lib/stats/access";
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

function unlockError(code: string | undefined): string | null {
  if (code === "invalid") return "Mot de passe incorrect.";
  if (code === "limited") {
    return "Trop de tentatives, réessaie dans quelques minutes.";
  }
  return null;
}

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string }>;
}) {
  const token = readStatsToken(env.STATS_TOKEN);
  if (!token) notFound();

  const jar = await cookies();
  if (!statsCookieMatches(jar.get(STATS_COOKIE)?.value, token)) {
    const params = await searchParams;
    return (
      <StatsShell>
        <StatsUnlockForm error={unlockError(params.e)} />
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
