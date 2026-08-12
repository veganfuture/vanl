import SignalRedirectPage from "../_shared/SignalRedirectPage";

const SIGNAL_EVENTS_URL =
  "https://signal.group/#CjQKIDB9f2aSHUHI7fh0Qw17Us9eCzT4zOC4rtgUo9EBuosxEhAX5OtDPGYorCmmE4rQ3AfU";

export default function EventsRedirectPage() {
  return <SignalRedirectPage url={SIGNAL_EVENTS_URL} />;
}
