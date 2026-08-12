import { GROUPS } from "@/lib/groups";
import { Landing } from "../_shared/Landing";

export default function PageEN() {
  return (
    <Landing
      locale="en"
      dict={{
        siteTitle: "VeganActivists.nl",
        siteTag: "Together united for animal rights • Netherlands",
        heroTitleA: "Join the",
        heroTitleB: "Signal group",
        heroBody: "We coordinate actions, share materials, and support each other to accelerate the end of animal exploitation. Access is via Signal for privacy and safety.",
        groupAccordion: {
          copyLabel: "Copy link",
          copySuccess: "Link copied!",
          openInSignal: "Open in Signal",
          downloadQr: "Download QR code",
        },
        bullets1: "End-to-end encrypted via Signal",
        bullets2: "Peaceful, legal actions only",
        bullets3: "Everyone committed to animal rights is welcome.",
        whyTitle: "Why Signal?",
        whyBody: "Signal is open-source, independent and end-to-end encrypted. Your phone number is invisible to members.",
        admissionTitle: "Admission",
        admissionBody: "New members get a short welcome. Keep it respectful and on-topic.",
        safetyTitle: "Safety",
        safetyBody: "Don’t share private info without consent. When in doubt, ask a mod.",
        footer: "Free to use. No rights reserved. With love from Vegan Future 💚",
        groupsHeading: "Groups"
      }}
      groups={GROUPS}
    />
  );
}
