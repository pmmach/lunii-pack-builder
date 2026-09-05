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

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center justify-center p-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Lunii Pack Builder</CardTitle>
          <CardDescription>
            Colle l&apos;URL d&apos;un podcast pour générer un pack compatible
            Lunii Admin Web.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="podcast-url">URL du podcast</Label>
            <Input
              id="podcast-url"
              type="url"
              placeholder="https://…"
              disabled
            />
          </div>
          <Button disabled className="w-full">
            Analyser
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
