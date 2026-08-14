import { createSignal } from "solid-js";

type CopyButtonProps = {
  text: string;
  label: string;
  success: string;
  class?: string;
};

export function CopyButton(props: CopyButtonProps) {
  const [copied, setCopied] = createSignal(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(props.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (cause) {
      // Clipboard access can be denied by the browser; the user can still select/copy manually.
      console.warn("Clipboard write failed", cause);
    }
  }

  return (
    <button onClick={onCopy} class={props.class}>
      {copied() ? props.success : props.label}
    </button>
  );
}
