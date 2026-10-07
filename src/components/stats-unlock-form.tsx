"use client";

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

export function StatsUnlockForm({ error }: { error?: string | null }) {
  return (
    <Card className="mx-auto w-full max-w-md border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle>Statistiques</CardTitle>
        <CardDescription>
          Page réservée. Le mot de passe est celui défini dans STATS_TOKEN.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={unlockStatsAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="stats-password">Mot de passe</Label>
            <Input
              id="stats-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="min-h-11"
            />
          </div>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Button type="submit" className="min-h-11 w-full">
            Voir les statistiques
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
