"use client";

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Loader2,
  Trash2,
  CheckCircle2,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/theme-toggle";
import { WaveformEditor } from "@/components/waveform-editor";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { exportPackAction } from "@/lib/actions/export-pack";
import {
  getJobStatusAction,
  prepareEpisodeAction,
  trimEpisodeAction,
} from "@/lib/actions/media";
import {
  addStoryToPack,
  createPackDraft,
} from "@/lib/pack/model";
import { validatePackDraftClient } from "@/lib/pack/validate-client";
import type { PackDraft } from "@/lib/pack/types";
import {
  formatDuration,
  loadSession,
  saveSession,
  type PreparedStory,
  type SessionState,
} from "@/lib/session/client-store";
import type { EpisodeMeta } from "@/lib/sources/types";

type Draft = {
  title: string;
  start: number;
  end: number;
  peaks: number[];
  audioPath: string;
  storyPath: string;
  coverPath: string;
  duration: number;
};

function SortableStoryItem({
  story,
  onRemove,
}: {
  story: PreparedStory;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: story.episode.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-card flex items-center gap-3 rounded-lg border p-3"
    >
      <button
        type="button"
        className="text-muted-foreground min-h-11 min-w-11 touch-none"
        aria-label={`Réordonner ${story.title}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="mx-auto size-5" />
      </button>
      <div className="bg-muted relative size-12 shrink-0 overflow-hidden rounded">
        {story.episode.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={story.episode.imageUrl}
            alt=""
            className="size-full object-cover"
          />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{story.title}</p>
        <p className="text-muted-foreground text-sm">
          {formatDuration(story.durationSeconds)}
        </p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="min-h-11 min-w-11"
        aria-label={`Supprimer ${story.title}`}
        onClick={onRemove}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

async function waitJob(
  jobId: string,
  onProgress?: (p: number, msg?: string) => void
): Promise<{ ok: true; resultRef?: string } | { ok: false; error: string }> {
  for (let i = 0; i < 180; i++) {
    const status = await getJobStatusAction(jobId);
    if (!status.ok) return { ok: false, error: status.error };
    onProgress?.(status.data.progress, status.data.message);
    if (status.data.status === "done") {
      return { ok: true, resultRef: status.data.resultRef };
    }
    if (status.data.status === "error") {
      return {
        ok: false,
        error: status.data.message ?? "Échec du traitement",
      };
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return { ok: false, error: "Délai dépassé" };
}

export default function PackWorkshopPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;
  const router = useRouter();
  const [state, setState] = useState<SessionState | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [progressMsg, setProgressMsg] = useState("");
  const [progress, setProgress] = useState(0);
  const [activeTab, setActiveTab] = useState<string>("");
  const [draftStories, setDraftStories] = useState<Record<string, Draft>>({});
  const [removeId, setRemoveId] = useState<string | null>(null);
  const autoPrepared = useRef(false);

  useEffect(() => {
    const loaded = loadSession(sessionId);
    if (!loaded) {
      router.replace("/");
      return;
    }
    setState(loaded);
  }, [sessionId, router]);

  const persist = useCallback((next: SessionState) => {
    setState(next);
    saveSession(next);
  }, []);

  const episodes = useMemo(
    () => state?.source.episodes ?? [],
    [state?.source.episodes]
  );
  const filtered = useMemo(() => {
    if (!query.trim()) return episodes;
    const q = query.toLowerCase();
    return episodes.filter((e) => e.title.toLowerCase().includes(q));
  }, [episodes, query]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const prepareSelected = useCallback(
    async (current: SessionState) => {
      setBusy(true);
      setProgress(5);
      setProgressMsg("Préparation des épisodes…");
      const selected = current.source.episodes.filter((e) =>
        current.selectedEpisodeIds.includes(e.id)
      );
      const drafts: Record<string, Draft> = {};

      try {
        for (let i = 0; i < selected.length; i++) {
          const ep = selected[i];
          if (!ep) continue;
          setProgressMsg(`Préparation : ${ep.title}`);

          const prep = await prepareEpisodeAction(sessionId, ep);
          if (!prep.ok) {
            toast.error(prep.error);
            return false;
          }

          const waited = await waitJob(prep.data.jobId, (p, msg) => {
            setProgress(p);
            if (msg) setProgressMsg(msg);
          });
          if (!waited.ok) {
            toast.error(waited.error);
            return false;
          }

          const ref = waited.resultRef
            ? (JSON.parse(waited.resultRef) as {
                audioPath: string;
                storyPath: string;
                coverPath?: string;
                peaks: number[];
              })
            : null;
          if (!ref?.coverPath) {
            toast.error(
              "Vignette manquante pour cet épisode (image source indisponible)."
            );
            // Continuer si possible avec un placeholder impossible — mieux d'échouer clairement
            return false;
          }

          const duration = ep.durationSeconds && ep.durationSeconds > 0
            ? ep.durationSeconds
            : 30;

          drafts[ep.id] = {
            title: ep.title,
            start: 0,
            end: duration,
            peaks: ref.peaks,
            audioPath: ref.audioPath,
            storyPath: ref.storyPath,
            coverPath: ref.coverPath,
            duration,
          };
        }

        setDraftStories(drafts);
        setActiveTab(selected[0]?.id ?? "");
        persist({ ...current, step: 3 });
        return true;
      } finally {
        setBusy(false);
        setProgress(0);
        setProgressMsg("");
      }
    },
    [persist, sessionId]
  );

  // Auto-préparer si on arrive directement en étape 3 (épisode unique)
  useEffect(() => {
    if (!state || autoPrepared.current) return;
    if (state.step === 3 && Object.keys(draftStories).length === 0) {
      autoPrepared.current = true;
      void prepareSelected(state);
    }
  }, [state, draftStories, prepareSelected]);

  function toggleEpisode(id: string) {
    if (!state) return;
    const selected = state.selectedEpisodeIds.includes(id)
      ? state.selectedEpisodeIds.filter((x) => x !== id)
      : [...state.selectedEpisodeIds, id];
    persist({ ...state, selectedEpisodeIds: selected });
  }

  async function validateStoriesAndGoToPack() {
    if (!state) return;
    setBusy(true);
    try {
      const prepared: PreparedStory[] = [];
      for (const epId of state.selectedEpisodeIds) {
        const draft = draftStories[epId];
        const ep = episodes.find((e) => e.id === epId);
        if (!draft || !ep) continue;

        setProgressMsg(`Découpe : ${draft.title}`);
        const trim = await trimEpisodeAction(sessionId, epId, {
          startSeconds: draft.start,
          endSeconds: draft.end,
        });
        if (!trim.ok) {
          toast.error(trim.error);
          return;
        }
        const waited = await waitJob(trim.data.jobId, (p, msg) => {
          setProgress(p);
          if (msg) setProgressMsg(msg);
        });
        if (!waited.ok) {
          toast.error(waited.error);
          return;
        }
        const ref = waited.resultRef
          ? (JSON.parse(waited.resultRef) as {
              storyPath: string;
              durationSeconds: number;
            })
          : null;

        prepared.push({
          episode: ep,
          title: draft.title,
          storyAudioPath: ref?.storyPath ?? draft.storyPath,
          coverImagePath: draft.coverPath,
          peaks: draft.peaks,
          trimStart: draft.start,
          trimEnd: draft.end,
          durationSeconds: ref?.durationSeconds ?? draft.end - draft.start,
        });
      }

      if (prepared.length === 0) {
        toast.error("Aucune histoire prête");
        return;
      }

      persist({ ...state, stories: prepared, step: 4 });
    } finally {
      setBusy(false);
      setProgressMsg("");
      setProgress(0);
    }
  }

  async function doExport() {
    if (!state || state.stories.length === 0) return;
    setBusy(true);
    setProgressMsg("Assemblage du pack…");
    try {
      let pack: PackDraft = createPackDraft(sessionId, {
        title: state.packTitle,
        description: state.packDescription,
      });
      for (const s of state.stories) {
        pack = addStoryToPack(pack, {
          id: s.episode.id,
          title: s.title,
          storyAudioPath: s.storyAudioPath,
          coverImagePath: s.coverImagePath,
          titleAudioPath: s.titleAudioPath,
        });
      }

      const clientValidation = validatePackDraftClient(pack);
      if (!clientValidation.ok) {
        toast.error(clientValidation.error);
        return;
      }

      setProgressMsg("Compression…");
      const result = await exportPackAction(pack);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      persist({
        ...state,
        downloadUrl: result.data.downloadUrl,
        downloadSizeBytes: result.data.sizeBytes,
      });
    } finally {
      setBusy(false);
      setProgressMsg("");
    }
  }

  function onDragEnd(event: DragEndEvent) {
    if (!state) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = state.stories.map((s) => s.episode.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    persist({
      ...state,
      stories: arrayMove(state.stories, oldIndex, newIndex),
    });
  }

  if (!state) {
    return (
      <main className="mx-auto max-w-3xl space-y-4 p-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </main>
    );
  }

  const step = state.step;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-border/60 sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <div>
            <Link href="/" className="text-primary font-semibold">
              Lunii Pack Builder
            </Link>
            <div className="mt-1 flex flex-wrap gap-2">
              <Badge variant={step === 2 ? "default" : "secondary"}>
                1. Épisodes
              </Badge>
              <Badge variant={step === 3 ? "default" : "secondary"}>
                2. Édition
              </Badge>
              <Badge variant={step === 4 ? "default" : "secondary"}>
                3. Pack
              </Badge>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        {busy && (
          <Card>
            <CardContent className="space-y-2 pt-6">
              <Progress value={progress || null} />
              <p className="text-muted-foreground text-sm">
                {progressMsg || "Traitement…"}
              </p>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <section className="space-y-4">
            <div className="flex items-start gap-4">
              {state.source.showImageUrl ? (
                <Image
                  src={state.source.showImageUrl}
                  alt=""
                  width={80}
                  height={80}
                  className="rounded-lg object-cover"
                  unoptimized
                />
              ) : (
                <div className="bg-muted size-20 rounded-lg" />
              )}
              <div>
                <h1 className="text-2xl font-bold">{state.source.showTitle}</h1>
                <p className="text-muted-foreground text-sm">
                  {episodes.length} épisode(s)
                </p>
              </div>
            </div>

            {state.source.resolvedFrom === "directory-search" ? (
              <Alert>
                <AlertTitle>Flux RSS public retrouvé</AlertTitle>
                <AlertDescription>
                  Cette émission a été retrouvée via son flux RSS public (
                  {state.source.feedUrl}).
                </AlertDescription>
              </Alert>
            ) : null}

            {episodes.length > 10 ? (
              <div className="space-y-2">
                <Label htmlFor="search">Rechercher</Label>
                <Input
                  id="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filtrer par titre…"
                  className="min-h-11"
                />
              </div>
            ) : null}

            <div className="space-y-2">
              {filtered.map((ep: EpisodeMeta) => {
                const checked = state.selectedEpisodeIds.includes(ep.id);
                return (
                  <label
                    key={ep.id}
                    className="hover:bg-muted/40 flex cursor-pointer items-center gap-3 rounded-lg border p-3"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleEpisode(ep.id)}
                      aria-label={`Sélectionner ${ep.title}`}
                    />
                    <div className="bg-muted relative size-16 shrink-0 overflow-hidden rounded">
                      {ep.imageUrl ? (
                        <Image
                          src={ep.imageUrl}
                          alt=""
                          width={64}
                          height={64}
                          className="size-full object-cover"
                          unoptimized
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{ep.title}</p>
                      <p className="text-muted-foreground text-sm">
                        {formatDuration(ep.durationSeconds)}
                        {ep.publishedAt
                          ? ` · ${new Date(ep.publishedAt).toLocaleDateString("fr-FR")}`
                          : ""}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>

            <Button
              className="bg-accent text-accent-foreground hover:bg-accent/90 min-h-11"
              disabled={state.selectedEpisodeIds.length === 0 || busy}
              onClick={() => void prepareSelected(state)}
            >
              Continuer avec {state.selectedEpisodeIds.length} histoire(s)
            </Button>
          </section>
        )}

        {step === 3 && (
          <section className="space-y-4">
            <h1 className="text-2xl font-bold">Édition des histoires</h1>
            {Object.keys(draftStories).length === 0 ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="flex h-auto flex-wrap">
                  {state.selectedEpisodeIds.map((id) => {
                    const d = draftStories[id];
                    return (
                      <TabsTrigger key={id} value={id} className="min-h-11">
                        {d?.title?.slice(0, 24) ?? id.slice(0, 8)}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
                {state.selectedEpisodeIds.map((id) => {
                  const d = draftStories[id];
                  if (!d) {
                    return (
                      <TabsContent key={id} value={id}>
                        <Skeleton className="h-48 w-full" />
                      </TabsContent>
                    );
                  }
                  return (
                    <TabsContent key={id} value={id} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor={`title-${id}`}>Titre</Label>
                        <Input
                          id={`title-${id}`}
                          value={d.title}
                          className="min-h-11"
                          onChange={(e) =>
                            setDraftStories((prev) => ({
                              ...prev,
                              [id]: { ...d, title: e.target.value },
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Audio — début / fin de l&apos;histoire</Label>
                        <WaveformEditor
                          peaks={d.peaks}
                          durationSeconds={d.duration}
                          start={d.start}
                          end={d.end}
                          onChange={(start, end) =>
                            setDraftStories((prev) => ({
                              ...prev,
                              [id]: { ...d, start, end },
                            }))
                          }
                        />
                        <p className="text-muted-foreground text-xs">
                          Intro par défaut : 8 premières secondes si aucun extrait
                          dédié n&apos;est fourni.
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label>Vignette</Label>
                        <div className="bg-muted size-40 overflow-hidden rounded-lg">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={
                              episodes.find((e) => e.id === id)?.imageUrl ?? ""
                            }
                            alt=""
                            className="size-full object-cover"
                          />
                        </div>
                      </div>
                    </TabsContent>
                  );
                })}
              </Tabs>
            )}
            <Button
              className="bg-accent text-accent-foreground hover:bg-accent/90 min-h-11"
              disabled={busy || Object.keys(draftStories).length === 0}
              onClick={() => void validateStoriesAndGoToPack()}
            >
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Traitement…
                </>
              ) : (
                "Valider et passer au pack"
              )}
            </Button>
          </section>
        )}

        {step === 4 && (
          <section className="space-y-4">
            <h1 className="text-2xl font-bold">Composition du pack</h1>
            <div className="space-y-2">
              <Label htmlFor="pack-title">Titre du pack</Label>
              <Input
                id="pack-title"
                className="min-h-11"
                value={state.packTitle}
                onChange={(e) =>
                  persist({ ...state, packTitle: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pack-desc">Description</Label>
              <Textarea
                id="pack-desc"
                value={state.packDescription}
                onChange={(e) =>
                  persist({ ...state, packDescription: e.target.value })
                }
              />
            </div>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={onDragEnd}
            >
              <SortableContext
                items={state.stories.map((s) => s.episode.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {state.stories.map((s) => (
                    <SortableStoryItem
                      key={s.episode.id}
                      story={s}
                      onRemove={() => setRemoveId(s.episode.id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="min-h-11"
                onClick={() => persist({ ...state, step: 2 })}
              >
                Ajouter une autre histoire (même émission)
              </Button>
              <Button
                variant="outline"
                className="min-h-11"
                onClick={() => router.push("/")}
              >
                Nouvelle URL
              </Button>
            </div>

            <Button
              className="bg-accent text-accent-foreground hover:bg-accent/90 min-h-11"
              disabled={
                busy || !state.packTitle.trim() || state.stories.length === 0
              }
              onClick={() => void doExport()}
            >
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Génération…
                </>
              ) : (
                "Générer le pack"
              )}
            </Button>

            {state.downloadUrl ? (
              <Card className="border-primary/40">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="text-primary size-5" />
                    Pack prêt
                  </CardTitle>
                  <CardDescription>
                    {state.packTitle} · {state.stories.length} histoire(s)
                    {state.downloadSizeBytes
                      ? ` · ${(state.downloadSizeBytes / 1024).toFixed(0)} Ko`
                      : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <a
                    href={state.downloadUrl}
                    download
                    className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-medium"
                  >
                    Télécharger le .zip
                  </a>
                  <p className="text-muted-foreground text-sm">
                    Importez ce fichier via le bouton <em>create pack</em> sur{" "}
                    <a
                      href="https://lunii-admin-web.pages.dev/"
                      className="text-primary underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Lunii Admin Web
                    </a>
                    .
                  </p>
                </CardContent>
              </Card>
            ) : null}
          </section>
        )}
      </main>

      <Dialog open={!!removeId} onOpenChange={() => setRemoveId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer cette histoire ?</DialogTitle>
            <DialogDescription>
              Elle sera retirée du pack. Tu pourras en rajouter ensuite.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveId(null)}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!state || !removeId) return;
                persist({
                  ...state,
                  stories: state.stories.filter(
                    (s) => s.episode.id !== removeId
                  ),
                });
                setRemoveId(null);
              }}
            >
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
