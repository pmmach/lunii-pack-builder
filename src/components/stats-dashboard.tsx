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
  window: { today: number; last30: number; semester: number };
  detail?: string;
}) {
  return (
    <Card size="sm" className="border-border/80 shadow-sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl font-semibold tabular-nums">
          {formatCount(window.semester)}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground space-y-1 text-sm">
        <p>
          Aujourd&apos;hui {formatCount(window.today)} · 30 jours{" "}
          {formatCount(window.last30)}
        </p>
        {detail ? <p>{detail}</p> : null}
      </CardContent>
    </Card>
  );
}

function pick(
  report: UsageReport,
  key: keyof UsageTotals
): { today: number; last30: number; semester: number } {
  return {
    today: report.today[key],
    last30: report.last30[key],
    semester: report.semester[key],
  };
}

function TrendChart({
  title,
  points,
  total,
  note,
}: {
  title: string;
  points: Array<{ day: string; value: number }>;
  total: number;
  note?: string;
}) {
  const width = 360;
  const height = 112;
  const padX = 2;
  const padY = 8;
  const max = Math.max(1, ...points.map((point) => point.value));
  const coords = points.map((point, index) => {
    const x =
      padX +
      (index / Math.max(1, points.length - 1)) * (width - padX * 2);
    const y = height - padY - (point.value / max) * (height - padY * 2);
    return { x, y };
  });
  const line = coords.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const first = coords[0];
  const last = coords[coords.length - 1];
  const area =
    first && last
      ? `${first.x.toFixed(1)},${height - padY} ${line} ${last.x.toFixed(1)},${height - padY}`
      : "";
  const start = points[0]?.day;
  const end = points[points.length - 1]?.day;

  return (
    <Card size="sm" className="border-border/80 shadow-sm">
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums">
          {formatCount(total)}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-28 w-full"
          role="img"
          aria-label={`${title} sur 6 mois`}
        >
          <polygon points={area} className="fill-primary/15" />
          <polyline
            points={line}
            fill="none"
            className="stroke-primary"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
        <div className="text-muted-foreground mt-1 flex justify-between text-xs">
          <span>{start ? formatDay(start) : ""}</span>
          <span>{end ? formatDay(end) : ""}</span>
        </div>
        {note ? <p className="text-muted-foreground mt-1 text-xs">{note}</p> : null}
      </CardContent>
    </Card>
  );
}

function chartPoints(
  history: UsageReport["history"],
  value: (day: UsageReport["history"][number]) => number
) {
  return history.map((day) => ({ day: day.day, value: value(day) }));
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
    report.semester.rateLimited > 0
      ? `Résolution ${formatCount(bucket.resolve)} · export ${formatCount(bucket.export)} · voix ${formatCount(bucket.tts)}`
      : undefined;
  const storyDetail =
    report.semester.exports > 0
      ? `${formatCount(report.semester.singleStoryPacks)} pack à une histoire · ${formatCount(report.semester.multiStoryPacks)} à plusieurs`
      : undefined;

  return (
    <>
      <section className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Statistiques</h1>
        <p className="text-muted-foreground max-w-3xl text-sm text-balance">
          Les grands chiffres et les courbes portent sur 6 mois. Les visiteurs
          sont une empreinte d&apos;adresse IP, pas des comptes : une personne
          sur deux réseaux compte deux fois.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Visiteurs · 6 mois" window={pick(report, "visitors")} />
        <MetricCard
          label="Résolutions réussies · 6 mois"
          window={pick(report, "resolvesOk")}
        />
        <MetricCard
          label="Résolutions échouées · 6 mois"
          window={pick(report, "resolvesFail")}
        />
        <MetricCard
          label="Packs générés · 6 mois"
          window={pick(report, "exports")}
        />
        <MetricCard
          label="Packs téléchargés · 6 mois"
          window={pick(report, "downloads")}
        />
        <MetricCard
          label="Histoires · 6 mois"
          window={pick(report, "stories")}
          detail={storyDetail}
        />
        <MetricCard
          label="Aperçus vocaux · 6 mois"
          window={pick(report, "tts")}
        />
        <MetricCard
          label="Requêtes limitées · 6 mois"
          window={pick(report, "rateLimited")}
          detail={rateDetail}
        />
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <TrendChart
          title="Visiteurs par jour"
          total={report.semester.visitors}
          note="Le chiffre compte chaque personne une fois. La courbe compte chaque jour."
          points={chartPoints(report.history, (day) => day.visitors)}
        />
        <TrendChart
          title="Résolutions réussies par jour"
          total={report.semester.resolvesOk}
          points={chartPoints(report.history, (day) => day.resolvesOk)}
        />
        <TrendChart
          title="Packs générés par jour"
          total={report.semester.exports}
          points={chartPoints(report.history, (day) => day.exports)}
        />
        <TrendChart
          title="Packs téléchargés par jour"
          total={report.semester.downloads}
          points={chartPoints(report.history, (day) => day.downloads)}
        />
      </section>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Fréquence</CardTitle>
          <CardDescription>
            Jours distincts de présence sur les 6 derniers mois.
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
            <CardDescription>Résolutions des 6 derniers mois.</CardDescription>
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
            <CardDescription>Codes des 6 derniers mois.</CardDescription>
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
            Trente derniers jours, fuseau Europe/Paris. Les courbes couvrent 6
            mois, et les lignes brutes sont gardées 6 mois.
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
