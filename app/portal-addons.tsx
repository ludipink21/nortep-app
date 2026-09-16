"use client";

import { usePathname } from "next/navigation";
import AdminGovernance from "./admin-governance";
import FounderPilotShortcut from "./founder-pilot-shortcut";
import MobilizationIntelligenceShortcut from "./mobilization-intelligence-shortcut";
import ResearcherProfileShortcut from "./researcher-profile-shortcut";
import SurveyIntroVideo from "./survey-intro-video";

// The electoral app has its own navigation. In particular, founder previews must
// not mount legacy presence/audit writers or survey-interaction observers.
export default function PortalAddons() {
  const pathname = usePathname();
  if (pathname.startsWith("/analise-eleitoral")) return null;
  return <><AdminGovernance/><FounderPilotShortcut/><MobilizationIntelligenceShortcut/><ResearcherProfileShortcut/><SurveyIntroVideo/></>;
}
