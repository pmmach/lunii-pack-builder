"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
import { recordVisitAction } from "@/lib/actions/stats";
import { resolveSourceAction } from "@/lib/actions/resolve-source";
import { DEFAULT_TITLE_CLIP_SECONDS } from "@/lib/pack/constants";
import { saveSession } from "@/lib/session/client-store";

function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function AnalyzeForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showInlineError = touched && url.length > 0 && !isValidHttpUrl(url);

  useEffect(() => {
    void recordVisitAction();
  }, []);

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
        packAuthor: source.showAuthor ?? "",
        packDescription: "",
        packCover: { type: "auto" },
        defaultTitleClipSeconds: DEFAULT_TITLE_CLIP_SECONDS,
        introMode: "tts",
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
    <Card id="analyser" className="border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle>Analyser un podcast</CardTitle>
        <CardDescription>
          Un épisode ou une sélection — flux RSS publics uniquement.
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
  );
}
