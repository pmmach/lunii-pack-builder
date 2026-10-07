import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SOURCE_KIND_LABELS } from "@/lib/stats/source-kind";
import type { UsageReport, UsageTotals } from "@/lib/stats/usage";

const numberFormat = new Intl.NumberFormat("fr-FR");

const ERROR_LABELS: Record<string, string> = {
  INVALID_URL: "URL invalide",
  INVALID_PACK: "Pack incomplet",
  INVALID_SESSION: "Session invalide",
  SSRF_BLOCKED: "URL non autorisée",
  DNS_FAILED: "Hôte introuvable",
  FETCH_FAILED: "Source injoignable",
  TIMEOUT: "Délai dépassé",
  NO_SHOW_NAME: "Émission introuvable",
  ITUNES_ERROR: "Recherche annuaire échouée",
  UNKNOWN: "Erreur non classée",
};

function formatCount(value: number): string {
  return numberFormat.format(value);
}

function formatDay(day: string): string {
  const parts = day.split("-").map(Number);
  const year = parts[0] ?? 1970;
  const month = parts[1] ?? 1;
  const date = parts[2] ?? 1;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, date)));
}

function MetricCard({
  label,
  window,
  detail,
}: {
  label: string;
  window: { today: number; last7: number; last30: number };
  detail?: string;
}) {
  return (
    <Card size="sm" className="border-border/80 shadow-sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl font-semibold tabular-nums">
          {formatCount(window.last30)}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground space-y-1 text-sm">
        <p>
          Aujourd&apos;hui {formatCount(window.today)} · 7 jours{" "}
          {formatCount(window.last7)}
        </p>
        {detail ? <p>{detail}</p> : null}
      </CardContent>
    </Card>
  );
}

function pick(
  report: UsageReport,
  key: keyof UsageTotals
): { today: number; last7: number; last30: number } {
  return {
    today: report.today[key],
    last7: report.last7[key],
    last30: report.last30[key],
  };
}

function hasActivity(totals: UsageTotals): boolean {
  return (
    totals.visitors +
      totals.resolvesOk +
      totals.resolvesFail +
      totals.exports +
      totals.downloads +
      totals.tts +
      totals.rateLimited >
    0
  );
}

export function StatsDashboard({ report }: { report: UsageReport }) {
  const maxVisitors = Math.max(1, ...report.days.map((day) => day.visitors));
  const bucket = report.rateLimitedByBucket;
  const rateDetail =
    report.last30.rateLimited > 0
      ? `Résolution ${formatCount(bucket.resolve)} · export ${formatCount(bucket.export)} · voix ${formatCount(bucket.tts)}`
      : undefined;
  const storyDetail =
    report.last30.exports > 0
      ? `${formatCount(report.last30.singleStoryPacks)} pack à une histoire · ${formatCount(report.last30.multiStoryPacks)} à plusieurs`
      : undefined;

  return (
    <>
      <section className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Statistiques</h1>
        <p className="text-muted-foreground max-w-3xl text-sm text-balance">
          Les grands chiffres portent sur 30 jours. Les visiteurs sont une
          empreinte d&apos;adresse IP, pas des comptes : une personne sur deux
          réseaux compte deux fois.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Visiteurs · 30 jours" window={pick(report, "visitors")} />
        <MetricCard
          label="Résolutions réussies · 30 jours"
          window={pick(report, "resolvesOk")}
        />
        <MetricCard
          label="Résolutions échouées · 30 jours"
          window={pick(report, "resolvesFail")}
        />
        <MetricCard
          label="Packs générés · 30 jours"
          window={pick(report, "exports")}
        />
        <MetricCard
          label="Packs téléchargés · 30 jours"
          window={pick(report, "downloads")}
        />
        <MetricCard
          label="Histoires · 30 jours"
          window={pick(report, "stories")}
          detail={storyDetail}
        />
        <MetricCard
          label="Aperçus vocaux · 30 jours"
          window={pick(report, "tts")}
        />
        <MetricCard
          label="Requêtes limitées · 30 jours"
          window={pick(report, "rateLimited")}
          detail={rateDetail}
        />
      </section>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Fréquence</CardTitle>
          <CardDescription>
            Jours distincts de présence sur les 30 derniers jours.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          {[
            ["Une journée", report.frequency.once],
            ["2 à 3 jours", report.frequency.few],
            ["4 jours et plus", report.frequency.regular],
          ].map(([label, count]) => (
            <div key={String(label)} className="rounded-lg border px-3 py-3">
              <p className="text-muted-foreground text-sm">{label}</p>
              <p className="text-2xl font-semibold tabular-nums">
                {formatCount(Number(count))}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <section className="grid gap-3 lg:grid-cols-2">
        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle>Sources</CardTitle>
            <CardDescription>Résolutions des 30 derniers jours.</CardDescription>
          </CardHeader>
          <CardContent>
            {report.sourceKinds.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Aucune résolution sur cette période.
              </p>
            ) : (
              <ul className="space-y-2">
                {report.sourceKinds.map((item) => (
                  <li
                    key={item.kind}
                    className="flex items-baseline justify-between gap-3 text-sm"
                  >
                    <span>{SOURCE_KIND_LABELS[item.kind]}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {formatCount(item.ok)} ok · {formatCount(item.fail)} échecs
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle>Erreurs</CardTitle>
            <CardDescription>Codes des 30 derniers jours.</CardDescription>
          </CardHeader>
          <CardContent>
            {report.errorCodes.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Aucune erreur sur cette période.
              </p>
            ) : (
              <ul className="space-y-2">
                {report.errorCodes.slice(0, 8).map((item) => (
                  <li
                    key={item.code}
                    className="flex items-baseline justify-between gap-3 text-sm"
                  >
                    <span>{ERROR_LABELS[item.code] ?? item.code}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {formatCount(item.count)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Historique</CardTitle>
          <CardDescription>
            Trente derniers jours, fuseau Europe/Paris. Les lignes brutes sont
            gardées 90 jours.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasActivity(report.last30) ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[46rem] text-left text-sm">
                <caption className="sr-only">
                  Historique d&apos;usage des 30 derniers jours
                </caption>
                <thead className="text-muted-foreground border-b text-xs">
                  <tr>
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Jour
                    </th>
                    <th scope="col" className="px-2 py-2 font-medium">
                      Visiteurs
                    </th>
                    <th scope="col" className="px-2 py-2 font-medium">
                      Résolutions ok / échec
                    </th>
                    <th scope="col" className="px-2 py-2 font-medium">
                      Packs
                    </th>
                    <th scope="col" className="px-2 py-2 font-medium">
                      Téléchargements
                    </th>
                    <th scope="col" className="px-2 py-2 font-medium">
                      Histoires
                    </th>
                    <th scope="col" className="px-2 py-2 font-medium">
                      Voix
                    </th>
                    <th scope="col" className="py-2 pl-2 font-medium">
                      Limites
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.days.map((day) => (
                    <tr key={day.day} className="border-b border-border/60">
                      <th scope="row" className="py-2 pr-3 font-medium whitespace-nowrap">
                        {formatDay(day.day)}
                      </th>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2">
                          <span className="w-8 tabular-nums">{formatCount(day.visitors)}</span>
                          <span
                            className="bg-primary/70 h-2 rounded-full"
                            style={{
                              width: `${Math.round((day.visitors / maxVisitors) * 72)}px`,
                            }}
                            aria-hidden
                          />
                        </div>
                      </td>
                      <td className="px-2 py-2 tabular-nums">
                        {formatCount(day.resolvesOk)}
                        <span className="text-muted-foreground">
                          {" "}
                          / {formatCount(day.resolvesFail)}
                        </span>
                      </td>
                      <td className="px-2 py-2 tabular-nums">
                        {formatCount(day.exports)}
                      </td>
                      <td className="px-2 py-2 tabular-nums">
                        {formatCount(day.downloads)}
                      </td>
                      <td className="px-2 py-2 tabular-nums">
                        {formatCount(day.stories)}
                      </td>
                      <td className="px-2 py-2 tabular-nums">{formatCount(day.tts)}</td>
                      <td className="py-2 pl-2 tabular-nums">
                        {formatCount(day.rateLimited)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Aucune utilisation enregistrée sur les 30 derniers jours.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
