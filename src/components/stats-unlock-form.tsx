"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { unlockStatsAction } from "@/lib/actions/stats";
import { Alert, AlertDescription } from "@/components/ui/alert";
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

export function StatsUnlockForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await unlockStatsAction(new FormData(event.currentTarget));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    } catch {
      setError("Une erreur inattendue est survenue. Réessaie.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="mx-auto w-full max-w-md border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle>Statistiques</CardTitle>
        <CardDescription>
          Page réservée. Le mot de passe est celui défini dans STATS_TOKEN.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="stats-password">Mot de passe</Label>
            <Input
              id="stats-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              disabled={pending}
              className="min-h-11"
            />
          </div>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Button
            type="submit"
            className="min-h-11 w-full"
            disabled={pending}
          >
            {pending ? "Vérification…" : "Voir les statistiques"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
