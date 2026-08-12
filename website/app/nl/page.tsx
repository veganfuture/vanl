import {GROUPS} from  "../../lib/groups";
import { Landing } from "../_shared/Landing";

export default function PageNL() {
  return (
    <Landing
      locale="nl"
      dict={{
        siteTitle: "VeganActivists.nl",
        siteTag: "Samen sterk voor dierenrechten • Nederland",
        heroTitleA: "Sluit je aan bij de",
        heroTitleB: "Signal-groepen",
        heroBody: "We coördineren acties, delen materiaal en helpen elkaar om de het einde van de exploitatie van dieren te versnellen. Toegang gaat via Signal voor privacy en veiligheid.",
        groupAccordion: {
          copyLabel: "Link kopiëren",
          openInSignal: "Open in Signal",
          downloadQr: "Download QR-code",
          copySuccess: "Link gekopieerd!",
        },
        bullets1: "End‑to‑end versleuteld via Signal",
        bullets2: "Alleen voor vreedzame, legale acties",
        bullets3: "Iedereen die zich inzet voor dierenrechten is welkom",
        whyTitle: "Waarom Signal?",
        whyBody: "Signal is open‑source, onafhankelijk en end‑to‑end versleuteld. Je telefoonnummer is onzichtbaar voor leden.",
        admissionTitle: "Toelating",
        admissionBody: "Nieuwe leden worden kort welkom geheten. Houd het respectvol en on-topic.",
        safetyTitle: "Veiligheid",
        safetyBody: "Deel geen privégegevens zonder toestemming. Bij twijfel: vraag een mod.",
        footer: "Vrij te gebruiken. Geen rechten voorbehouden. Met liefde van Vegan Future 💚",
        groupsHeading: "Groepen",
      }}
      groups={GROUPS}
    />
  );
}
