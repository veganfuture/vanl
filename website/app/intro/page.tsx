import SignalRedirectPage from "../_shared/SignalRedirectPage";

const SIGNAL_INTRO_URL =
  "https://signal.group/#CjQKIEccRwrDsYMpMuf0asj7FsPLQ2ya0U17ybH5dRn6aHeoEhBMxfl0llA0njdUUPvCb9eE";

export default function IntroRedirectPage() {
  return <SignalRedirectPage url={SIGNAL_INTRO_URL} />;
}
