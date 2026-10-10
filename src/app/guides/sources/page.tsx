import { Ban, Link2, Rss, Shield } from "lucide-react";
import {
  GuideArticle,
  GuideSection,
} from "@/components/guide-article";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { guidePage } from "@/lib/seo/site";

const page = guidePage("/guides/sources");

export async function generateMetadata() {
  return buildPageMetadata(page);
}

export default function SourcesGuidePage() {
  return (
    <GuideArticle path={page.path} title={page.title} lede={page.description}>
      <GuideSection title="Ce qui est lu" icon={Rss}>
        <p>
          L&apos;adresse d&apos;un flux RSS public (souvent un fichier .xml ou
          un chemin /feed), ou la page web du podcast quand elle indique ce
          flux.
        </p>
      </GuideSection>
      <GuideSection title="Apple Podcasts, Spotify, Deezer" icon={Link2}>
        <p>
          Un lien vers ces catalogues sert à retrouver le flux RSS public du
          même podcast. L&apos;audio n&apos;est pas extrait depuis Spotify,
          Deezer ou Apple Podcasts.
        </p>
      </GuideSection>
      <GuideSection title="Si aucun flux public" icon={Ban}>
        <p>
          S&apos;il n&apos;existe pas de flux public, l&apos;analyse
          s&apos;arrête et le message l&apos;indique. Il n&apos;y a pas de
          contournement DRM.
        </p>
      </GuideSection>
      <GuideSection title="Usage" icon={Shield}>
        <p>
          L&apos;usage visé est personnel et familial. Chaque podcast garde
          ses propres conditions. Préparer un pack ici ne donne pas le droit
          de republier le contenu.
        </p>
      </GuideSection>
    </GuideArticle>
  );
}
