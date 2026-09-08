"use client";

import { Loader2, Volume2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import { synthesizeTitleAction } from "@/lib/actions/tts";
import {
  clampTitleClipSeconds,
  DEFAULT_TITLE_CLIP_SECONDS,
  MAX_TITLE_CLIP_SECONDS,
} from "@/lib/pack/constants";
import type { IntroMode } from "@/lib/pack/types";

function readSliderSeconds(next: number | readonly number[]): number {
  const raw = Array.isArray(next) ? next[0] : next;
  return clampTitleClipSeconds(
    typeof raw === "number" ? raw : DEFAULT_TITLE_CLIP_SECONDS
  );
}

export function IntroModeCard({
  introMode,
  clipSeconds,
  ttsConfigured,
  disabled,
  previewTitle,
  sessionId,
  onIntroModeChange,
  onClipSecondsCommit,
}: {
  introMode: IntroMode;
  clipSeconds: number;
  ttsConfigured: boolean;
  disabled?: boolean;
  previewTitle?: string;
  sessionId: string;
  onIntroModeChange: (mode: IntroMode) => void;
  onClipSecondsCommit: (seconds: number) => void;
}) {
  const [draft, setDraft] = useState(clipSeconds);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    setDraft(clipSeconds);
  }, [clipSeconds]);

  useEffect(() => {
    setPreviewUrl(null);
  }, [previewTitle, introMode]);

  async function playPreview() {
    const title = previewTitle?.trim();
    if (!title) {
      toast.error("Aucun titre à lire pour l'aperçu.");
      return;
    }
    setPreviewLoading(true);
    try {
      const result = await synthesizeTitleAction(sessionId, title);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setPreviewUrl(`${result.data.url}?t=${Date.now()}`);
    } finally {
      setPreviewLoading(false);
    }
  }

  return (
    <div className="bg-card space-y-4 rounded-xl border p-4">
      <div className="space-y-2">
        <Label id="intro-mode-label">Intro audio</Label>
        <RadioGroup
          aria-labelledby="intro-mode-label"
          value={introMode}
          disabled={disabled}
          onValueChange={(value) => {
            if (value === "clip" || value === "tts") {
              onIntroModeChange(value);
            }
          }}
          className="gap-3"
        >
          <label
            htmlFor="intro-mode-clip"
            className="hover:bg-muted/40 flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
          >
            <RadioGroupItem id="intro-mode-clip" value="clip" />
            <span className="space-y-0.5">
              <span className="block text-sm font-medium">Découpée</span>
              <span className="text-muted-foreground block text-xs">
                Extrait du début de chaque histoire
              </span>
            </span>
          </label>
          <label
            htmlFor="intro-mode-tts"
            className="hover:bg-muted/40 flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
          >
            <RadioGroupItem
              id="intro-mode-tts"
              value="tts"
              disabled={!ttsConfigured || disabled}
            />
            <span className="space-y-0.5">
              <span className="block text-sm font-medium">Synthétique</span>
              <span className="text-muted-foreground block text-xs">
                Voix enfant qui lit le titre
              </span>
            </span>
          </label>
        </RadioGroup>
      </div>

      {!ttsConfigured ? (
        <Alert>
          <AlertTitle>Voix synthétique indisponible</AlertTitle>
          <AlertDescription>
            La voix synthétique n&apos;est pas configurée sur ce serveur.
          </AlertDescription>
        </Alert>
      ) : null}

      {introMode === "clip" ? (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <Label htmlFor="intro-duration">Durée de l&apos;intro</Label>
            <span
              id="intro-duration-value"
              className="text-muted-foreground text-sm tabular-nums"
            >
              {draft} s
            </span>
          </div>
          <Slider
            id="intro-duration"
            min={0}
            max={MAX_TITLE_CLIP_SECONDS}
            step={1}
            disabled={disabled}
            value={draft}
            onValueChange={(next) => setDraft(readSliderSeconds(next))}
            onValueCommitted={(next) => {
              const seconds = readSliderSeconds(next);
              setDraft(seconds);
              if (seconds !== clipSeconds) onClipSecondsCommit(seconds);
            }}
            aria-valuetext={`${draft} secondes`}
            aria-describedby="intro-duration-help"
          />
          <p id="intro-duration-help" className="text-muted-foreground text-xs">
            Extrait joué à la sélection de chaque histoire, pris au début du
            contenu découpé. 0 s = pas d&apos;intro.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-muted-foreground text-xs">
            Chaque histoire lira son titre à la sélection (voix enfant).
          </p>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 cursor-pointer"
            disabled={disabled || previewLoading || !previewTitle?.trim()}
            onClick={() => void playPreview()}
          >
            {previewLoading ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Génération…
              </>
            ) : (
              <>
                <Volume2 className="size-4" /> Écouter un aperçu
              </>
            )}
          </Button>
          {previewUrl ? (
            <audio
              key={previewUrl}
              controls
              src={previewUrl}
              className="w-full"
              autoPlay
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

/** Aperçu TTS du titre du pack (étape composition, multi-histoires). */
export function PackTitleTtsPreview({
  sessionId,
  packTitle,
  disabled,
}: {
  sessionId: string;
  packTitle: string;
  disabled?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    setUrl(null);
  }, [packTitle]);

  async function playPreview() {
    const title = packTitle.trim();
    if (!title) {
      toast.error("Renseigne d'abord le titre du pack.");
      return;
    }
    setLoading(true);
    try {
      const result = await synthesizeTitleAction(sessionId, title);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setUrl(`${result.data.url}?t=${Date.now()}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs">
        En multi-histoires, le titre du pack est lu à l&apos;ouverture du menu.
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-11 cursor-pointer"
        disabled={disabled || loading || !packTitle.trim()}
        onClick={() => void playPreview()}
      >
        {loading ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Génération…
          </>
        ) : (
          <>
            <Volume2 className="size-4" /> Aperçu intro du pack
          </>
        )}
      </Button>
      {url ? (
        <audio key={url} controls src={url} className="w-full" autoPlay />
      ) : null}
    </div>
  );
}
