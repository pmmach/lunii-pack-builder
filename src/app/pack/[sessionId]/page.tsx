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
  CircleAlert,
  Clock,
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
import {
  IntroModeCard,
  PackTitleTtsPreview,
} from "@/components/intro-mode-card";
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { exportPackAction } from "@/lib/actions/export-pack";
import {
  getJobStatusAction,
  prepareEpisodeAction,
  trimEpisodeAction,
} from "@/lib/actions/media";
import { getTtsStatusAction } from "@/lib/actions/tts";
import { PackCoverEditor } from "@/components/pack-cover-editor";
import {
  clampTitleClipSeconds,
  DEFAULT_TITLE_CLIP_SECONDS,
} from "@/lib/pack/constants";
import { resolvePackCoverImagePath } from "@/lib/pack/cover";
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

type PreparePhase = "idle" | "running" | "error";
type PrepareItemStatus = "queued" | "running" | "done" | "error";
type JobPollStatus = "pending" | "running" | "done" | "error";

type PrepareItem = {
  episodeId: string;
  title: string;
  status: PrepareItemStatus;
  progress: number;
  message: string;
};

function jobPollToItemStatus(status: JobPollStatus): PrepareItemStatus {
  if (status === "pending") return "queued";
  if (status === "done") return "done";
  if (status === "error") return "error";
  return "running";
}

function prepareOverallProgress(items: PrepareItem[]): number {
  if (items.length === 0) return 0;
  return Math.round(
    items.reduce((sum, item) => sum + item.progress, 0) / items.length
  );
}

function prepareItemLabel(item: PrepareItem): string {
  if (item.status === "done") return item.message || "Prête";
  if (item.status === "queued") return item.message || "En file d'attente";
  if (item.status === "error") return item.message || "Échec";
  return item.message || "En cours…";
}

function PrepareItemIcon({ status }: { status: PrepareItemStatus }) {
  if (status === "done") {
    return <CheckCircle2 className="text-primary size-4 shrink-0" aria-hidden />;
  }
  if (status === "error") {
    return (
      <CircleAlert className="text-destructive size-4 shrink-0" aria-hidden />
    );
  }
  if (status === "running") {
    return (
      <Loader2
        className="text-primary size-4 shrink-0 animate-spin motion-reduce:animate-none"
        aria-hidden
      />
    );
  }
  return <Clock className="text-muted-foreground size-4 shrink-0" aria-hidden />;
}

function PrepareCorridor({
  items,
  phase,
  error,
  canChangeSelection,
  onCancel,
  onRetry,
  onBackToSelection,
  onChangeUrl,
}: {
  items: PrepareItem[];
  phase: PreparePhase;
  error: string | null;
  canChangeSelection: boolean;
  onCancel: () => void;
  onRetry: () => void;
  onBackToSelection: () => void;
  onChangeUrl: () => void;
}) {
  const total = items.length;
  const doneCount = items.filter((item) => item.status === "done").length;
  const failedCount = items.filter((item) => item.status === "error").length;
  const runningCount = items.filter((item) => item.status === "running").length;
  const overall = prepareOverallProgress(items);
  const isError = phase === "error";
  const countLabel = total > 1 ? `${total} histoires` : "1 histoire";
  const onlyItem = total === 1 ? items[0] : undefined;
  const summary =
    total === 0
      ? "Préparation…"
      : onlyItem
        ? onlyItem.status === "done"
          ? "Histoire prête"
          : prepareItemLabel(onlyItem)
        : doneCount === total
          ? "Toutes les histoires sont prêtes"
          : `${doneCount} sur ${total} prêtes`;
  const retryLabel =
    doneCount > 0 && failedCount > 0
      ? `Réessayer ${failedCount} échec${failedCount > 1 ? "s" : ""}`
      : "Réessayer";

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          {!isError ? (
            <Loader2
              className="size-5 shrink-0 animate-spin motion-reduce:animate-none"
              aria-hidden
            />
          ) : null}
          {isError
            ? "Préparation interrompue"
            : `Préparation de ${countLabel}`}
        </CardTitle>
        <CardDescription>
          {isError
            ? doneCount > 0
              ? `${doneCount} histoire${doneCount > 1 ? "s" : ""} déjà prête${doneCount > 1 ? "s" : ""} — tu peux ne relancer que les échecs.`
              : "Les fichiers n'ont pas pu être préparés. Tu peux réessayer sans perdre ta sélection."
            : "Téléchargement puis conversion — quelques minutes par histoire, surtout en m4a."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isError ? (
          <>
            {items.length > 0 ? (
              <PrepareEpisodeList items={items} />
            ) : null}
            <Alert variant="destructive">
              <AlertTitle>Échec de la préparation</AlertTitle>
              <AlertDescription>
                {error ?? "Une erreur est survenue."}
              </AlertDescription>
            </Alert>
            <div className="flex flex-wrap gap-2">
              <Button
                className="bg-accent text-accent-foreground hover:bg-accent/90 min-h-11"
                onClick={onRetry}
              >
                {retryLabel}
              </Button>
              {canChangeSelection ? (
                <Button
                  variant="outline"
                  className="min-h-11"
                  onClick={onBackToSelection}
                >
                  Modifier la sélection
                </Button>
              ) : (
                <Button
                  variant="outline"
                  className="min-h-11"
                  onClick={onChangeUrl}
                >
                  Changer d&apos;URL
                </Button>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="space-y-2" aria-busy="true">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium" aria-live="polite">
                  {summary}
                  {runningCount > 0 && total > 1
                    ? ` · ${runningCount} en cours`
                    : ""}
                </p>
                <span className="text-muted-foreground text-sm tabular-nums">
                  {doneCount}/{total || "—"}
                </span>
              </div>
              <Progress
                value={overall}
                className="[&_[data-slot=progress-track]]:h-2"
                aria-valuetext={summary}
              />
            </div>
            <PrepareEpisodeList items={items} />
            <p className="text-muted-foreground text-sm">
              La conversion peut prendre 2 à 3 minutes par histoire. Les
              suivantes commencent dès qu&apos;une place se libère.
            </p>
            <Button variant="outline" className="min-h-11" onClick={onCancel}>
              Annuler
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PrepareEpisodeList({ items }: { items: PrepareItem[] }) {
  if (items.length === 0) return null;
  return (
    <ol
      className={
        items.length > 4
          ? "max-h-72 space-y-2 overflow-y-auto pr-1"
          : "space-y-2"
      }
      aria-label="Progression par histoire"
    >
      {items.map((item, index) => {
        const label = prepareItemLabel(item);
        return (
          <li
            key={item.episodeId}
            className="bg-muted/40 flex items-start gap-3 rounded-lg border p-3"
          >
            <PrepareItemIcon status={item.status} />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-start justify-between gap-3">
                <p className="truncate text-sm font-medium">
                  <span className="text-muted-foreground mr-1.5 tabular-nums">
                    {index + 1}.
                  </span>
                  {item.title}
                </p>
                {item.status === "running" ? (
                  <span className="text-muted-foreground shrink-0 text-xs font-medium tabular-nums">
                    {item.progress}%
                  </span>
                ) : null}
              </div>
              <p
                className={
                  item.status === "error"
                    ? "text-destructive text-xs"
                    : "text-muted-foreground text-xs"
                }
              >
                {label}
              </p>
              {item.status === "running" ? (
                <Progress
                  value={item.progress}
                  aria-valuetext={`${item.title} : ${label}`}
                />
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function TrimProgressCard({ items }: { items: PrepareItem[] }) {
  const total = items.length;
  const doneCount = items.filter((item) => item.status === "done").length;
  const runningCount = items.filter((item) => item.status === "running").length;
  const overall = prepareOverallProgress(items);
  const countLabel = total > 1 ? `${total} histoires` : "1 histoire";
  const onlyItem = total === 1 ? items[0] : undefined;
  const summary =
    total === 0
      ? "Découpe…"
      : onlyItem
        ? onlyItem.status === "done"
          ? "Histoire découpée"
          : prepareItemLabel(onlyItem)
        : doneCount === total
          ? "Toutes les histoires sont découpées"
          : `${doneCount} sur ${total} découpées`;

  return (
    <Card className="border-primary/40 scroll-mt-20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Loader2
            className="size-5 shrink-0 animate-spin motion-reduce:animate-none"
            aria-hidden
          />
          Découpe de {countLabel}
        </CardTitle>
        <CardDescription>
          Copie de la plage choisie vers l&apos;audio final de chaque histoire.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2" aria-busy="true">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium" aria-live="polite">
              {summary}
              {runningCount > 0 && total > 1
                ? ` · ${runningCount} en cours`
                : ""}
            </p>
            <span className="text-muted-foreground text-sm tabular-nums">
              {doneCount}/{total || "—"}
            </span>
          </div>
          <Progress
            value={overall}
            className="[&_[data-slot=progress-track]]:h-2"
            aria-valuetext={summary}
          />
        </div>
        <PrepareEpisodeList items={items} />
        {total > 1 ? (
          <p className="text-muted-foreground text-sm">
            Les suivantes commencent dès qu&apos;une place se libère.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

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

/**
 * Lisse l'affichage d'une progression reçue par paliers (10, 40, 55…) :
 * anime en continu vers la dernière valeur connue, et fait "ramper" la
 * barre entre deux paliers pour donner un retour visuel constant même
 * quand le serveur ne renvoie rien de neuf pendant un moment.
 */
function useAnimatedProgress(rawProgress: number, active: boolean): number {
  const [display, setDisplay] = useState(0);
  const rawRef = useRef(rawProgress);
  const lastChangeRef = useRef(Date.now());

  useEffect(() => {
    if (rawProgress !== rawRef.current) {
      rawRef.current = rawProgress;
      lastChangeRef.current = Date.now();
    }
  }, [rawProgress]);

  useEffect(() => {
    if (!active) {
      setDisplay(0);
      lastChangeRef.current = Date.now();
      return;
    }
    let rafId: number;
    const tick = () => {
      const elapsed = Date.now() - lastChangeRef.current;
      // Plafond qui grimpe lentement le temps qu'on attend une vraie
      // mise à jour, sans jamais dépasser 97% avant la fin réelle.
      const creepCeiling = Math.min(97, rawRef.current + elapsed / 120);
      const target = Math.max(rawRef.current, Math.min(creepCeiling, 97), 0);
      const finalTarget = rawRef.current >= 100 ? 100 : target;
      setDisplay((prev) => {
        const next = prev + (finalTarget - prev) * 0.12;
        return Math.abs(finalTarget - next) < 0.15 ? finalTarget : next;
      });
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [active]);

  return Math.round(display);
}

/** Intervalle de polling du tracker de job (spec 04). */
const JOB_POLL_INTERVAL_MS = 1_000;
/**
 * Plafond de sécurité du couloir de préparation.
 * Un ré-encodage m4a→mp3 Radio France dure souvent ~3 min par épisode ;
 * avec le sémaphore (2 jobs à la fois), une sélection de plusieurs
 * histoires dépasse largement les 3 min d'attente côté client.
 */
const JOB_MAX_WAIT_MS = 45 * 60 * 1000;

async function waitJob(
  jobId: string,
  onProgress?: (p: number, msg?: string, status?: JobPollStatus) => void,
  isCancelled?: () => boolean
): Promise<
  | { ok: true; resultRef?: string }
  | { ok: false; error: string; cancelled?: boolean }
> {
  const deadline = Date.now() + JOB_MAX_WAIT_MS;
  while (Date.now() < deadline) {
    if (isCancelled?.()) {
      return { ok: false, error: "cancelled", cancelled: true };
    }
    const status = await getJobStatusAction(jobId);
    if (isCancelled?.()) {
      return { ok: false, error: "cancelled", cancelled: true };
    }
    if (!status.ok) return { ok: false, error: status.error };
    onProgress?.(
      status.data.progress,
      status.data.message,
      status.data.status
    );
    if (status.data.status === "done") {
      return { ok: true, resultRef: status.data.resultRef };
    }
    if (status.data.status === "error") {
      return {
        ok: false,
        error: status.data.message ?? "Échec du traitement",
      };
    }
    await new Promise((r) => setTimeout(r, JOB_POLL_INTERVAL_MS));
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
  const [openStoryId, setOpenStoryId] = useState<string>("");
  const [draftStories, setDraftStories] = useState<Record<string, Draft>>({});
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [preparePhase, setPreparePhase] = useState<PreparePhase>("idle");
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [prepareItems, setPrepareItems] = useState<PrepareItem[]>([]);
  const [trimItems, setTrimItems] = useState<PrepareItem[]>([]);
  const [ttsConfigured, setTtsConfigured] = useState(false);
  const autoPrepared = useRef(false);
  const cancelledRef = useRef(false);
  const progressCardRef = useRef<HTMLDivElement | null>(null);
  const draftStoriesRef = useRef(draftStories);
  draftStoriesRef.current = draftStories;
  const prepareItemsRef = useRef(prepareItems);
  prepareItemsRef.current = prepareItems;
  const displayProgress = useAnimatedProgress(
    progress,
    busy || preparePhase === "running"
  );

  useEffect(() => {
    const loaded = loadSession(sessionId);
    if (!loaded) {
      router.replace("/");
      return;
    }
    setState(loaded);
    if (loaded.step === 3) {
      setPreparePhase("running");
    }
  }, [sessionId, router]);

  useEffect(() => {
    void getTtsStatusAction().then((result) => {
      if (result.ok) setTtsConfigured(result.data.configured);
    });
  }, []);

  // Recentre la vue sur la barre de progression à chaque grande étape
  // de traitement (préparation, découpe, export), où que soit défilée la page.
  useEffect(() => {
    if (!busy) return;
    const id = requestAnimationFrame(() => {
      progressCardRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
    return () => cancelAnimationFrame(id);
  }, [busy]);

  const persist = useCallback((next: SessionState) => {
    setState(next);
    saveSession(next);
  }, []);

  useEffect(() => {
    if (!state || state.packCover?.type !== "story") return;
    const resolved = resolvePackCoverImagePath(
      state.packCover,
      state.stories.map((s) => ({
        id: s.episode.id,
        coverImagePath: s.coverImagePath,
      }))
    );
    if (resolved.effectiveSource.type === "auto") {
      persist({ ...state, packCover: { type: "auto" } });
      toast(
        "L'histoire utilisée comme image du pack a été retirée : image automatique réappliquée."
      );
    }
  }, [persist, state]);

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
    async (
      current: SessionState,
      episodeIdsToPrepare?: string[]
    ) => {
      cancelledRef.current = false;
      setPreparePhase("running");
      setPrepareError(null);
      setBusy(true);
      setProgress(0);
      setProgressMsg("Préparation des épisodes…");

      const selected = current.source.episodes.filter((e) =>
        current.selectedEpisodeIds.includes(e.id)
      );
      const retryIds =
        episodeIdsToPrepare && episodeIdsToPrepare.length > 0
          ? new Set(episodeIdsToPrepare)
          : null;
      const toPrepare = retryIds
        ? selected.filter((ep) => retryIds.has(ep.id))
        : selected;

      const drafts: Record<string, Draft> = { ...draftStoriesRef.current };
      if (!retryIds) {
        for (const key of Object.keys(drafts)) {
          if (!selected.some((ep) => ep.id === key)) {
            delete drafts[key];
          }
        }
      }

      const isCancelled = () => cancelledRef.current;
      const patchItem = (episodeId: string, patch: Partial<PrepareItem>) => {
        setPrepareItems((prev) =>
          prev.map((item) =>
            item.episodeId === episodeId ? { ...item, ...patch } : item
          )
        );
      };

      const previousItems = new Map(
        prepareItemsRef.current.map((item) => [item.episodeId, item])
      );
      setPrepareItems(
        selected.map((ep) => {
          const kept = previousItems.get(ep.id);
          if (
            retryIds &&
            !retryIds.has(ep.id) &&
            (kept?.status === "done" || drafts[ep.id])
          ) {
            return (
              kept ?? {
                episodeId: ep.id,
                title: ep.title,
                status: "done" as const,
                progress: 100,
                message: "Prête",
              }
            );
          }
          return {
            episodeId: ep.id,
            title: ep.title,
            status: "queued" as const,
            progress: 0,
            message: "En file d'attente",
          };
        })
      );

      const persistPartialDrafts = () => {
        draftStoriesRef.current = drafts;
        setDraftStories({ ...drafts });
      };

      const fail = (message: string) => {
        if (cancelledRef.current) return false;
        persistPartialDrafts();
        setPrepareError(message);
        setPreparePhase("error");
        setBusy(false);
        setProgress(0);
        setProgressMsg("");
        return false;
      };

      try {
        if (toPrepare.length === 0) {
          if (selected.every((ep) => drafts[ep.id])) {
            setDraftStories(drafts);
            setOpenStoryId(selected[0]?.id ?? "");
            const latest = loadSession(sessionId) ?? current;
            persist({ ...latest, step: 3 });
            setPreparePhase("idle");
            return true;
          }
          return fail("Aucune histoire à préparer.");
        }

        // Lancer les préparations ciblées en parallèle ; le sémaphore
        // serveur (MAX_CONCURRENT_JOBS) borne la charge réelle.
        const started = await Promise.all(
          toPrepare.map(async (ep) => {
            const prep = await prepareEpisodeAction(sessionId, ep);
            return { ep, prep };
          })
        );

        if (cancelledRef.current) return false;

        let startError: string | null = null;
        for (const { ep, prep } of started) {
          if (!prep.ok) {
            patchItem(ep.id, {
              status: "error",
              message: prep.error,
            });
            startError ??= prep.error;
          }
        }
        if (startError) {
          return fail(startError);
        }

        const results = await Promise.all(
          started.map(async ({ ep, prep }) => {
            if (!prep.ok) return { ep, waited: null as null };
            const waited = await waitJob(
              prep.data.jobId,
              (p, msg, jobStatus) => {
                if (cancelledRef.current) return;
                patchItem(ep.id, {
                  progress: p,
                  message: msg ?? "En cours…",
                  status: jobStatus
                    ? jobPollToItemStatus(jobStatus)
                    : "running",
                });
              },
              isCancelled
            );
            return { ep, waited };
          })
        );

        if (cancelledRef.current) return false;

        let waitError: string | null = null;
        for (const { ep, waited } of results) {
          if (!waited) continue;
          if (!waited.ok) {
            if (waited.cancelled) return false;
            patchItem(ep.id, {
              status: "error",
              message: waited.error,
            });
            waitError ??= waited.error;
            continue;
          }

          const ref = waited.resultRef
            ? (JSON.parse(waited.resultRef) as {
                audioPath: string;
                storyPath: string;
                coverPath?: string;
                peaks: number[];
                durationSeconds?: number;
              })
            : null;
          if (!ref?.coverPath) {
            const message =
              "Vignette manquante pour cet épisode (image source indisponible).";
            patchItem(ep.id, { status: "error", message });
            waitError ??= message;
            continue;
          }

          const duration =
            ref.durationSeconds && ref.durationSeconds > 0
              ? ref.durationSeconds
              : ep.durationSeconds && ep.durationSeconds > 0
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
          patchItem(ep.id, {
            status: "done",
            progress: 100,
            message: "Prête",
          });
        }

        if (waitError) {
          return fail(waitError);
        }

        if (cancelledRef.current) return false;

        const missing = selected.filter((ep) => !drafts[ep.id]);
        if (missing.length > 0) {
          return fail(
            missing.length === 1
              ? "Une histoire n'a pas pu être préparée."
              : `${missing.length} histoires n'ont pas pu être préparées.`
          );
        }

        setDraftStories(drafts);
        draftStoriesRef.current = drafts;
        setOpenStoryId(selected[0]?.id ?? "");
        const latest = loadSession(sessionId) ?? current;
        persist({ ...latest, step: 3 });
        setBusy(false);
        setProgress(0);
        setProgressMsg("");
        setPreparePhase("idle");
        return true;
      } finally {
        setBusy(false);
        setProgress(0);
        setProgressMsg("");
      }
    },
    [persist, sessionId]
  );

  const stateRef = useRef(state);
  stateRef.current = state;

  // Auto-préparer si on arrive directement en étape 3 (épisode unique).
  // Ne pas relancer à chaque persist (slider) : ça retélécharge et abort.
  useEffect(() => {
    const current = stateRef.current;
    if (!current || autoPrepared.current) return;
    if (current.step === 3 && Object.keys(draftStories).length === 0) {
      autoPrepared.current = true;
      void prepareSelected(current);
    }
  }, [state?.step, draftStories, prepareSelected]);

  function leavePrepareCorridor(nextStep: 2 | "home") {
    cancelledRef.current = true;
    setPreparePhase("idle");
    setPrepareError(null);
    setPrepareItems([]);
    setDraftStories({});
    draftStoriesRef.current = {};
    setBusy(false);
    setProgress(0);
    setProgressMsg("");
    const current = stateRef.current;
    if (nextStep === "home" || !current) {
      router.push("/");
      return;
    }
    persist({ ...current, step: 2 });
  }

  function retryPrepare() {
    const current = stateRef.current;
    if (!current) return;
    autoPrepared.current = true;
    const failedIds = prepareItemsRef.current
      .filter((item) => item.status !== "done")
      .map((item) => item.episodeId);
    const missingIds = current.selectedEpisodeIds.filter(
      (id) => !draftStoriesRef.current[id]
    );
    const toRetry = [...new Set([...failedIds, ...missingIds])];
    void prepareSelected(current, toRetry.length > 0 ? toRetry : undefined);
  }

  function toggleEpisode(id: string) {
    if (!state) return;
    const selected = state.selectedEpisodeIds.includes(id)
      ? state.selectedEpisodeIds.filter((x) => x !== id)
      : [...state.selectedEpisodeIds, id];
    persist({ ...state, selectedEpisodeIds: selected });
  }

  async function validateStoriesAndGoToPack() {
    if (!state) return;
    const targets = state.selectedEpisodeIds
      .map((epId) => {
        const draft = draftStories[epId];
        const ep = episodes.find((e) => e.id === epId);
        if (!draft || !ep) return null;
        return { epId, draft, ep };
      })
      .filter((t): t is NonNullable<typeof t> => t !== null);

    if (targets.length === 0) {
      toast.error("Aucune histoire prête");
      return;
    }

    const patchTrimItem = (episodeId: string, patch: Partial<PrepareItem>) => {
      setTrimItems((prev) =>
        prev.map((item) =>
          item.episodeId === episodeId ? { ...item, ...patch } : item
        )
      );
    };

    setBusy(true);
    setTrimItems(
      targets.map((t) => ({
        episodeId: t.epId,
        title: t.draft.title,
        status: "queued" as const,
        progress: 0,
        message: "En file d'attente",
      }))
    );

    try {
      const started = await Promise.all(
        targets.map(async (t) => {
          const trim = await trimEpisodeAction(sessionId, t.epId, {
            startSeconds: t.draft.start,
            endSeconds: t.draft.end,
          });
          return { ...t, trim };
        })
      );

      let startError: string | null = null;
      for (const row of started) {
        if (!row.trim.ok) {
          patchTrimItem(row.epId, {
            status: "error",
            message: row.trim.error,
          });
          startError ??= row.trim.error;
        }
      }
      if (startError) {
        toast.error(startError);
        return;
      }

      const results = await Promise.all(
        started.map(async ({ epId, draft, ep, trim }) => {
          if (!trim.ok) return { epId, draft, ep, waited: null as null };
          const waited = await waitJob(trim.data.jobId, (p, msg, jobStatus) => {
            patchTrimItem(epId, {
              progress: p,
              message: msg ?? "Découpe…",
              status: jobStatus
                ? jobPollToItemStatus(jobStatus)
                : "running",
            });
          });
          return { epId, draft, ep, waited };
        })
      );

      const prepared: PreparedStory[] = [];
      for (const row of results) {
        if (!row.waited) continue;
        if (!row.waited.ok) {
          patchTrimItem(row.epId, {
            status: "error",
            message: row.waited.error,
          });
          toast.error(row.waited.error);
          return;
        }

        let ref: { storyPath: string; durationSeconds: number } | null = null;
        if (row.waited.resultRef) {
          try {
            const parsed: unknown = JSON.parse(row.waited.resultRef);
            if (
              typeof parsed === "object" &&
              parsed !== null &&
              "storyPath" in parsed &&
              "durationSeconds" in parsed
            ) {
              const rec = parsed as {
                storyPath: unknown;
                durationSeconds: unknown;
              };
              if (
                typeof rec.storyPath === "string" &&
                typeof rec.durationSeconds === "number"
              ) {
                ref = {
                  storyPath: rec.storyPath,
                  durationSeconds: rec.durationSeconds,
                };
              }
            }
          } catch {
            ref = null;
          }
        }
        if (!ref?.storyPath) {
          const message = "Découpe incomplète pour cette histoire.";
          patchTrimItem(row.epId, { status: "error", message });
          toast.error(message);
          return;
        }

        patchTrimItem(row.epId, {
          status: "done",
          progress: 100,
          message: "Découpée",
        });
        prepared.push({
          episode: row.ep,
          title: row.draft.title,
          storyAudioPath: ref.storyPath,
          coverImagePath: row.draft.coverPath,
          peaks: row.draft.peaks,
          trimStart: row.draft.start,
          trimEnd: row.draft.end,
          durationSeconds: ref.durationSeconds,
        });
      }

      if (prepared.length === 0) {
        toast.error("Aucune histoire prête");
        return;
      }

      persist({ ...state, stories: prepared, step: 4 });
    } finally {
      setBusy(false);
      setTrimItems([]);
      setProgressMsg("");
      setProgress(0);
    }
  }

  async function doExport() {
    if (!state || state.stories.length === 0) return;
    setBusy(true);
    const introMode = state.introMode === "clip" ? "clip" : "tts";
    setProgressMsg(
      introMode === "tts" ? "Voix des titres…" : "Assemblage du pack…"
    );
    try {
      let pack: PackDraft = createPackDraft(sessionId, {
        title: state.packTitle,
        author: state.packAuthor,
        description: state.packDescription,
      });
      pack = {
        ...pack,
        introMode,
        defaultTitleClipSeconds: clampTitleClipSeconds(
          state.defaultTitleClipSeconds ?? DEFAULT_TITLE_CLIP_SECONDS
        ),
      };
      for (const s of state.stories) {
        pack = addStoryToPack(pack, {
          id: s.episode.id,
          title: s.title,
          storyAudioPath: s.storyAudioPath,
          coverImagePath: s.coverImagePath,
          titleAudioPath: s.titleAudioPath,
        });
      }
      const resolvedCover = resolvePackCoverImagePath(
        state.packCover ?? { type: "auto" },
        state.stories.map((s) => ({
          id: s.episode.id,
          coverImagePath: s.coverImagePath,
        }))
      );
      pack = { ...pack, coverImagePath: resolvedCover.path };

      const clientValidation = validatePackDraftClient(pack);
      if (!clientValidation.ok) {
        toast.error(clientValidation.error);
        return;
      }

      setProgressMsg(
        introMode === "tts"
          ? "Voix des titres et assemblage…"
          : "Compression…"
      );
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
  const introSeconds = clampTitleClipSeconds(
    state.defaultTitleClipSeconds ?? DEFAULT_TITLE_CLIP_SECONDS
  );
  const introMode = state.introMode === "clip" ? "clip" : "tts";
  const previewTitle =
    (openStoryId && draftStories[openStoryId]?.title) ||
    episodes.find((e) => e.id === openStoryId)?.title ||
    Object.values(draftStories)[0]?.title ||
    "";
  const hasDrafts = Object.keys(draftStories).length > 0;
  const showSelection = step === 2 && preparePhase === "idle";
  const showEdition =
    step === 3 && hasDrafts && preparePhase === "idle" && !busy;
  const showCorridor =
    preparePhase === "running" ||
    preparePhase === "error" ||
    (step === 3 && !hasDrafts && preparePhase === "idle");
  const corridorItems =
    prepareItems.length > 0
      ? prepareItems
      : (state?.source.episodes ?? [])
          .filter((e) => state?.selectedEpisodeIds.includes(e.id))
          .map((ep) => ({
            episodeId: ep.id,
            title: ep.title,
            status: "queued" as const,
            progress: 0,
            message: "En file d'attente",
          }));
  const onPack = step === 4;
  const onSelection = showSelection;
  const onEditionOrCorridor = !onSelection && !onPack;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-border/60 sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <div>
            <Link href="/" className="text-primary font-semibold">
              Lunii Pack Builder
            </Link>
            <div className="mt-1 flex flex-wrap gap-2">
              <Badge variant={onSelection ? "default" : "secondary"}>
                1. Épisodes
              </Badge>
              <Badge variant={onEditionOrCorridor ? "default" : "secondary"}>
                2. Édition
              </Badge>
              <Badge variant={onPack ? "default" : "secondary"}>
                3. Pack
              </Badge>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        {busy && trimItems.length > 0 ? (
          <div ref={progressCardRef}>
            <TrimProgressCard items={trimItems} />
          </div>
        ) : null}

        {busy && trimItems.length === 0 && preparePhase === "idle" && (
          <Card ref={progressCardRef} className="border-primary/40 scroll-mt-20">
            <CardContent className="space-y-2 pt-6">
              <div className="flex items-center justify-between gap-3">
                <p className="text-muted-foreground text-sm">
                  {progressMsg || "Traitement…"}
                </p>
                <span className="text-muted-foreground text-sm font-medium tabular-nums">
                  {displayProgress}%
                </span>
              </div>
              <Progress value={displayProgress} />
            </CardContent>
          </Card>
        )}

        {showCorridor && (
          <PrepareCorridor
            items={corridorItems}
            phase={preparePhase === "idle" ? "running" : preparePhase}
            error={prepareError}
            canChangeSelection={state.source.kind === "show"}
            onCancel={() =>
              leavePrepareCorridor(
                state.source.kind === "show" ? 2 : "home"
              )
            }
            onRetry={retryPrepare}
            onBackToSelection={() => leavePrepareCorridor(2)}
            onChangeUrl={() => leavePrepareCorridor("home")}
          />
        )}

        {showSelection && (
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
              onClick={() => {
                autoPrepared.current = true;
                void prepareSelected(state);
              }}
            >
              Continuer avec {state.selectedEpisodeIds.length} histoire(s)
            </Button>
          </section>
        )}

        {showEdition && (
          <section className="space-y-4">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold">Édition des histoires</h1>
              <p className="text-muted-foreground text-sm">
                {state.selectedEpisodeIds.length} histoire
                {state.selectedEpisodeIds.length > 1 ? "s" : ""} — déplie pour
                ajuster le titre et le découpage audio.
              </p>
            </div>
            <IntroModeCard
              introMode={introMode}
              clipSeconds={introSeconds}
              ttsConfigured={ttsConfigured}
              disabled={busy}
              previewTitle={previewTitle}
              sessionId={sessionId}
              onIntroModeChange={(mode) =>
                persist({ ...state, introMode: mode })
              }
              onClipSecondsCommit={(seconds) =>
                persist({ ...state, defaultTitleClipSeconds: seconds })
              }
            />
            {Object.keys(draftStories).length === 0 ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <Accordion
                value={openStoryId ? [openStoryId] : []}
                onValueChange={(next) => setOpenStoryId(next[0] ?? "")}
                className="gap-3"
              >
                {state.selectedEpisodeIds.map((id, index) => {
                  const d = draftStories[id];
                  const episode = episodes.find((e) => e.id === id);
                  const title =
                    d?.title?.trim() || episode?.title || `Histoire ${index + 1}`;
                  const total = state.selectedEpisodeIds.length;

                  return (
                    <AccordionItem
                      key={id}
                      value={id}
                      className="bg-card not-last:border-b-0 rounded-xl border px-4 shadow-none"
                    >
                      <AccordionTrigger className="min-h-11 gap-3 py-3 hover:no-underline">
                        <span className="flex min-w-0 flex-1 items-start gap-3 text-left">
                          <Badge
                            variant="secondary"
                            className="mt-0.5 shrink-0 tabular-nums"
                          >
                            {index + 1}/{total}
                          </Badge>
                          <span className="min-w-0 flex-1 space-y-1">
                            <span className="block text-sm leading-snug font-medium text-balance wrap-break-word">
                              {title}
                            </span>
                            {episode?.durationSeconds !== undefined && (
                              <span className="text-muted-foreground block text-xs font-normal">
                                {formatDuration(episode.durationSeconds)}
                              </span>
                            )}
                          </span>
                          {d ? (
                            <Badge variant="outline" className="mt-0.5 shrink-0">
                              Prête
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="mt-0.5 shrink-0">
                              Chargement…
                            </Badge>
                          )}
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-4 pb-4">
                        {!d ? (
                          <Skeleton className="h-48 w-full" />
                        ) : (
                          <>
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
                              <Label>
                                Audio — début / fin de l&apos;histoire
                              </Label>
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
                                {introMode === "tts"
                                  ? "Intro : titre lu (voix enfant)."
                                  : `Intro : ${introSeconds} s (réglage commun au pack)${
                                      introSeconds === 0
                                        ? " — aucune intro audio"
                                        : ""
                                    }.`}
                              </p>
                            </div>
                            <div className="space-y-2">
                              <Label>Vignette</Label>
                              <div className="bg-muted size-40 overflow-hidden rounded-lg">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={episode?.imageUrl ?? ""}
                                  alt={
                                    episode?.imageUrl
                                      ? `Vignette de ${title}`
                                      : ""
                                  }
                                  className="size-full object-cover"
                                />
                              </div>
                            </div>
                          </>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
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
            <PackCoverEditor
              sessionId={sessionId}
              stories={state.stories}
              packCover={state.packCover ?? { type: "auto" }}
              onChange={(packCover) => persist({ ...state, packCover })}
            />
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
              {introMode === "tts" && state.stories.length >= 2 ? (
                <PackTitleTtsPreview
                  sessionId={sessionId}
                  packTitle={state.packTitle}
                  disabled={busy}
                />
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="pack-author">Auteur</Label>
              <Input
                id="pack-author"
                className="min-h-11"
                value={state.packAuthor}
                onChange={(e) =>
                  persist({ ...state, packAuthor: e.target.value })
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
                busy ||
                !state.packTitle.trim() ||
                !state.packAuthor.trim() ||
                state.stories.length === 0
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
                    Importez ce zip dans{" "}
                    <a
                      href="https://lunii-admin-builder.pages.dev/"
                      className="text-primary underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Lunii Admin Builder
                    </a>{" "}
                    ou{" "}
                    <a
                      href="https://lunii-admin-web.pages.dev/"
                      className="text-primary underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Lunii Admin Web
                    </a>{" "}
                    pour l&apos;installer sur l&apos;appareil.
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
