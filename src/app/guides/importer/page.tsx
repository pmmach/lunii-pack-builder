import { Cable, Download, FolderInput } from "lucide-react";
import {
  ExternalGuideLink,
  GuideArticle,
  GuideSection,
  LUNII_ADMIN_BUILDER_URL,
  LUNII_ADMIN_WEB_URL,
} from "@/components/guide-article";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { guidePage } from "@/lib/seo/site";

const page = guidePage("/guides/importer");

export async function generateMetadata() {
  return buildPageMetadata(page);
}

export default function ImporterGuidePage() {
  return (
    <GuideArticle
      path={page.path}
      title={page.title}
      lede={
        <>
          Après le téléchargement du .zip : l&apos;importer dans{" "}
          <ExternalGuideLink href={LUNII_ADMIN_WEB_URL} prominent>
            Lunii Admin Web
          </ExternalGuideLink>{" "}
          ou{" "}
          <ExternalGuideLink href={LUNII_ADMIN_BUILDER_URL} prominent>
            Lunii Admin Builder
          </ExternalGuideLink>
          , puis l&apos;installer sur la Fabrique à histoires.
        </>
      }
    >
      <GuideSection title="Télécharger le zip" icon={Download}>
        <p>
          Quand les histoires sont prêtes, le bouton de téléchargement
          enregistre une archive .zip. Elle contient déjà{" "}
          <code className="text-foreground">story.json</code> et le dossier{" "}
          <code className="text-foreground">assets</code> : images, audio,
          navigation et titres. Rien à reconstituer à la main.
        </p>
      </GuideSection>
      <GuideSection title="Importer le fichier" icon={FolderInput}>
        <p>
          Ouvre{" "}
          <ExternalGuideLink href={LUNII_ADMIN_BUILDER_URL} prominent>
            Lunii Admin Builder
          </ExternalGuideLink>{" "}
          ou{" "}
          <ExternalGuideLink href={LUNII_ADMIN_WEB_URL} prominent>
            Lunii Admin Web
          </ExternalGuideLink>{" "}
          et importe ce zip. Utilise l&apos;import du fichier, pas le bouton
          qui crée un pack à partir d&apos;une arborescence de dossiers.
        </p>
      </GuideSection>
      <GuideSection title="Installer sur l'appareil" icon={Cable}>
        <p>
          Branche la Fabrique à histoires en USB et lance l&apos;installation
          depuis{" "}
          <ExternalGuideLink href={LUNII_ADMIN_WEB_URL} prominent>
            Lunii Admin Web
          </ExternalGuideLink>
          . Cette étape se fait dans le navigateur, avec l&apos;appareil
          branché : cet outil ne peut pas écrire sur la Lunii.
        </p>
      </GuideSection>
    </GuideArticle>
  );
}
