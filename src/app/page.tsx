"use client";

import { Link2, Scissors, Download, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resolveSourceAction } from "@/lib/actions/resolve-source";
import { saveSession } from "@/lib/session/client-store";

function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export default function HomePage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showInlineError = touched && url.length > 0 && !isValidHttpUrl(url);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (!isValidHttpUrl(url)) return;

    setLoading(true);
    try {
      const result = await resolveSourceAction(url.trim());
      if (!result.ok) {
        setError(result.error);
        return;
      }

      const { sessionId, ...source } = result.data;
      const step = source.kind === "episode" ? 3 : 2;
      saveSession({
        sessionId,
        source,
        selectedEpisodeIds:
          source.kind === "episode" && source.episodes[0]
            ? [source.episodes[0].id]
            : [],
        stories: [],
        packTitle: source.showTitle,
        packDescription: "",
        step,
      });
      router.push(`/pack/${sessionId}`);
    } catch {
      setError("Une erreur inattendue est survenue. Réessaie.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-teal-100 via-background to-background dark:from-teal-950/40">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
        <p className="text-lg font-semibold tracking-tight text-primary">
          Lunii Pack Builder
        </p>
        <ThemeToggle />
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-10 px-4 pb-16 pt-6">
        <section className="space-y-3 text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Lunii Pack Builder
          </h1>
          <p className="text-muted-foreground mx-auto max-w-xl text-balance">
            Colle l&apos;URL d&apos;un podcast, on en fait un pack Lunii
          </p>
        </section>

        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle>Analyser un podcast</CardTitle>
            <CardDescription>
              Épisode unique ou émission complète — flux RSS publics uniquement.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="podcast-url">URL du podcast</Label>
                <Input
                  id="podcast-url"
                  type="url"
                  inputMode="url"
                  placeholder="https://…"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onBlur={() => setTouched(true)}
                  aria-invalid={showInlineError}
                  disabled={loading}
                  className="min-h-11"
                />
                {showInlineError ? (
                  <p className="text-destructive text-sm" role="alert">
                    Entre une URL http(s) valide.
                  </p>
                ) : null}
              </div>

              {error ? (
                <Alert variant="destructive">
                  <AlertTitle>Impossible d&apos;analyser</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              <Button
                type="submit"
                className="bg-accent text-accent-foreground hover:bg-accent/90 min-h-11 w-full"
                disabled={loading || !url.trim()}
              >
                {loading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Analyse en cours…
                  </>
                ) : (
                  "Analyser"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <section className="grid gap-4 sm:grid-cols-3">
          {[
            {
              icon: Link2,
              title: "Lien",
              text: "Colle l'URL d'un épisode ou d'une émission.",
            },
            {
              icon: Scissors,
              title: "Découpe",
              text: "Ajuste le début/fin et la vignette.",
            },
            {
              icon: Download,
              title: "Export",
              text: "Télécharge un .zip prêt pour Lunii Admin Web.",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="flex flex-col items-start gap-2 rounded-lg border border-transparent p-3 motion-safe:transition-colors hover:border-border"
            >
              <item.icon className="text-primary size-5" aria-hidden />
              <h2 className="font-semibold">{item.title}</h2>
              <p className="text-muted-foreground text-sm">{item.text}</p>
            </div>
          ))}
        </section>

        <footer className="text-muted-foreground space-y-1 text-center text-xs">
          <p>Usage personnel — respecte les droits des créateurs</p>
          <p>
            Ensuite :{" "}
            <Link
              href="https://lunii-admin-web.pages.dev/"
              className="text-primary underline-offset-2 hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              Lunii Admin Web
            </Link>
          </p>
        </footer>
      </main>
    </div>
  );
}
