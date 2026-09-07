"use client";

import { Check, ImageUp, Loader2, RotateCcw } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { uploadPackCoverAction } from "@/lib/actions/media";
import { DEFAULT_MAX_COVER_UPLOAD_MB } from "@/lib/pack/constants";
import {
  resolvePackCoverImagePath,
  type PackCoverSource,
} from "@/lib/pack/cover";
import type { PreparedStory } from "@/lib/session/client-store";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = DEFAULT_MAX_COVER_UPLOAD_MB * 1024 * 1024;

function storyPreviewUrl(
  cover: PackCoverSource,
  stories: PreparedStory[]
): { src: string; alt: string; help: string; effective: PackCoverSource } {
  const resolved = resolvePackCoverImagePath(
    cover,
    stories.map((s) => ({
      id: s.episode.id,
      coverImagePath: s.coverImagePath,
    }))
  );

  if (resolved.effectiveSource.type === "upload") {
    return {
      src: resolved.effectiveSource.url,
      alt: "Image importée du pack",
      help: "Image importée.",
      effective: resolved.effectiveSource,
    };
  }

  const storyId =
    resolved.effectiveSource.type === "story"
      ? resolved.effectiveSource.storyId
      : stories[0]?.episode.id;
  const story = stories.find((s) => s.episode.id === storyId);
  const title = story?.title ?? "cette histoire";

  return {
    src: story?.episode.imageUrl ?? "",
    alt: story ? `Image du pack : ${title}` : "Image du pack",
    help:
      resolved.effectiveSource.type === "story"
        ? `Depuis l'histoire « ${title} ».`
        : `Image de la première histoire du pack (« ${title} »).`,
    effective: resolved.effectiveSource,
  };
}

function validateLocalFile(file: File): string | null {
  if (!ALLOWED_TYPES.has(file.type)) {
    return "Le fichier doit être une image JPEG, PNG ou WebP.";
  }
  if (file.size > MAX_BYTES) {
    return `Image trop volumineuse (max ${DEFAULT_MAX_COVER_UPLOAD_MB} Mo).`;
  }
  return null;
}

export function PackCoverEditor({
  sessionId,
  stories,
  packCover,
  onChange,
}: {
  sessionId: string;
  stories: PreparedStory[];
  packCover: PackCoverSource;
  onChange: (cover: PackCoverSource) => void;
}) {
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const preview = storyPreviewUrl(packCover, stories);
  const customized = packCover.type !== "auto";

  useEffect(() => {
    return () => {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    };
  }, [localPreviewUrl]);

  function resetLocalUpload() {
    setPendingFile(null);
    setUploadError(null);
    setUploading(false);
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    setLocalPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) resetLocalUpload();
  }

  function acceptFile(file: File | undefined) {
    if (!file) return;
    const error = validateLocalFile(file);
    if (error) {
      setUploadError(error);
      setPendingFile(null);
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
      setLocalPreviewUrl(null);
      return;
    }
    setUploadError(null);
    setPendingFile(file);
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    setLocalPreviewUrl(URL.createObjectURL(file));
  }

  async function submitUpload() {
    if (!pendingFile) return;
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.set("file", pendingFile);
      const result = await uploadPackCoverAction(sessionId, formData);
      if (!result.ok) {
        setUploadError(result.error);
        return;
      }
      onChange({
        type: "upload",
        path: result.data.path,
        url: result.data.url,
      });
      toast.success("Image du pack mise à jour.");
      handleOpenChange(false);
    } finally {
      setUploading(false);
    }
  }

  function selectStory(storyId: string) {
    onChange({ type: "story", storyId });
    toast.success("Image du pack mise à jour.");
    handleOpenChange(false);
  }

  return (
    <>
      <div className="bg-card flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-start">
        <div className="bg-muted size-24 shrink-0 overflow-hidden rounded-lg">
          {preview.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview.src}
              alt={preview.alt}
              className="size-full max-w-full object-cover"
            />
          ) : null}
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">Image du pack</p>
            <Badge
              variant={
                preview.effective.type === "auto" ? "secondary" : "default"
              }
            >
              {preview.effective.type === "auto"
                ? "Automatique"
                : "Personnalisée"}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">{preview.help}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => setOpen(true)}
            >
              Changer l&apos;image
            </Button>
            {customized ? (
              <Button
                type="button"
                variant="ghost"
                className="min-h-11"
                onClick={() => onChange({ type: "auto" })}
              >
                <RotateCcw className="size-4" />
                Réinitialiser
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Changer l&apos;image du pack</DialogTitle>
            <DialogDescription>
              Choisis une image parmi tes histoires ou importe la tienne.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="stories" className="gap-4">
            <TabsList className="h-11 w-full">
              <TabsTrigger value="stories" className="min-h-11">
                Depuis les histoires
              </TabsTrigger>
              <TabsTrigger value="upload" className="min-h-11">
                Importer une image
              </TabsTrigger>
            </TabsList>

            <TabsContent value="stories" className="space-y-3">
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {stories.map((story) => {
                  const selected =
                    packCover.type === "story" &&
                    packCover.storyId === story.episode.id;
                  return (
                    <button
                      key={story.episode.id}
                      type="button"
                      className={`relative aspect-square min-h-11 overflow-hidden rounded-lg border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                        selected
                          ? "ring-2 ring-primary"
                          : "hover:border-primary/60"
                      }`}
                      aria-label={`Utiliser l'image de ${story.title}`}
                      aria-pressed={selected}
                      onClick={() => selectStory(story.episode.id)}
                    >
                      {story.episode.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={story.episode.imageUrl}
                          alt=""
                          className="size-full max-w-full object-cover"
                        />
                      ) : (
                        <span className="bg-muted block size-full" />
                      )}
                      {selected ? (
                        <span className="bg-primary text-primary-foreground absolute top-1 right-1 rounded-full p-0.5">
                          <Check className="size-3.5" aria-hidden />
                          <span className="sr-only">Sélectionnée</span>
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </TabsContent>

            <TabsContent value="upload" className="space-y-3">
              {uploadError ? (
                <Alert variant="destructive">
                  <AlertTitle>Import impossible</AlertTitle>
                  <AlertDescription>{uploadError}</AlertDescription>
                </Alert>
              ) : null}

              <input
                ref={fileInputRef}
                id={inputId}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(e) => acceptFile(e.target.files?.[0])}
              />

              <button
                type="button"
                className={`flex min-h-32 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                  dragging ? "border-primary bg-muted/40" : "border-border"
                }`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  acceptFile(e.dataTransfer.files[0]);
                }}
              >
                <ImageUp className="text-muted-foreground size-6" aria-hidden />
                <span className="text-sm font-medium">
                  Glisser une image ici ou cliquer pour parcourir
                </span>
                <span className="text-muted-foreground text-xs">
                  JPEG, PNG ou WebP — {DEFAULT_MAX_COVER_UPLOAD_MB} Mo max.
                  Recadrée automatiquement en carré.
                </span>
              </button>

              {localPreviewUrl ? (
                <div className="flex items-center gap-3">
                  <div className="bg-muted size-20 overflow-hidden rounded-lg">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={localPreviewUrl}
                      alt="Aperçu de l'image à importer"
                      className="size-full max-w-full object-cover"
                    />
                  </div>
                  <Button
                    type="button"
                    className="bg-accent text-accent-foreground hover:bg-accent/90 min-h-11"
                    disabled={uploading}
                    onClick={() => void submitUpload()}
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="size-4 animate-spin" /> Import…
                      </>
                    ) : (
                      "Utiliser cette image"
                    )}
                  </Button>
                </div>
              ) : null}
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              onClick={() => handleOpenChange(false)}
            >
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
