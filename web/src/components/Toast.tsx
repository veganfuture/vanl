import { onCleanup, onMount } from "solid-js";

const AUTO_DISMISS_MS = 6000;

/**
 * Purely a rendering component - no knowledge of message registries or
 * query params (see ~/lib/toast.ts for where the message text comes from).
 */
export function Toast(props: { message: string; onDismiss: () => void }) {
  onMount(() => {
    const timer = setTimeout(props.onDismiss, AUTO_DISMISS_MS);
    onCleanup(() => clearTimeout(timer));
  });

  return (
    <div class="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <div class="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shadow-lg">
        <p>{props.message}</p>
        <button
          type="button"
          onClick={() => props.onDismiss()}
          aria-label="Sluiten"
          class="shrink-0 text-emerald-700 hover:text-emerald-900"
        >
          ×
        </button>
      </div>
    </div>
  );
}
