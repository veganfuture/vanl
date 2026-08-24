import { SignalRedirectPage } from "~/components/SignalRedirectPage";

const SIGNAL_CHAT_URL =
  "https://signal.group/#CjQKIIB7-NMkrv7nuNEr8P82F9-70Ckj0rEAWmrK_urPnT9zEhCijiRpEbVJWMYpolQR1u-d";

export default function ChatRedirectPage() {
  return <SignalRedirectPage url={SIGNAL_CHAT_URL} />;
}
