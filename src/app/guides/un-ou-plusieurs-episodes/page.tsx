import {
  AudioLines,
  Image as ImageIcon,
  ListChecks,
  Mic,
  Plus,
} from "lucide-react";
import {
  ExternalGuideLink,
  GuideArticle,
  GuideSection,
  LUNII_ADMIN_WEB_URL,
} from "@/components/guide-article";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { guidePage } from "@/lib/seo/site";

const page = guidePage("/guides/un-ou-plusieurs-episodes");

export async function generateMetadata() {
  return buildPageMetadata(page);
}

export default function OneOrManyEpisodesGuidePage() {
  return (
    <GuideArticle path={page.path} title={page.title} lede={page.description}>
      <GuideSection title="Un seul épisode" icon={Mic}>
        <p>
          Tu colles l&apos;URL d&apos;un épisode précis. L&apos;outil prépare
          cette histoire : découpe audio, vignette, puis export d&apos;un pack
          à une histoire.
        </p>
      </GuideSection>
      <GuideSection title="Plusieurs épisodes dans le même pack" icon={ListChecks}>
        <p>
          Tu colles l&apos;URL du podcast (flux RSS ou page de la série). La
          liste des épisodes s&apos;affiche : tu coches ceux que tu veux. Ils
          deviennent les histoires d&apos;un seul pack, avec un menu pour
          naviguer entre elles sur l&apos;appareil.
        </p>
      </GuideSection>
      <GuideSection title="Ce que contient le pack" icon={ImageIcon}>
        <p>
          Le fichier .zip est déjà prêt pour{" "}
          <ExternalGuideLink href={LUNII_ADMIN_WEB_URL}>
            Lunii Admin Web
          </ExternalGuideLink>
          . Il embarque les images (couverture et vignettes), l&apos;audio
          découpé, la navigation entre les histoires, et un titre audio lu
          automatiquement à la sélection (voix synthétique, ou extrait si tu
          préfères).
        </p>
      </GuideSection>
      <GuideSection title="Titre audio automatique" icon={AudioLines}>
        <p>
          Par défaut, chaque histoire annonce son titre à voix haute quand on
          la choisit sur la Fabrique à histoires. Tu peux aussi découper
          quelques secondes d&apos;intro depuis l&apos;épisode lui-même.
        </p>
      </GuideSection>
      <GuideSection title="Ajouter d'autres épisodes" icon={Plus}>
        <p>
          Avant de générer le zip, tu peux revenir à la liste du même podcast
          et en ajouter. Une nouvelle URL repart de zéro.
        </p>
      </GuideSection>
    </GuideArticle>
  );
}
