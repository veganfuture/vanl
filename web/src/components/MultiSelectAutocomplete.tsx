import { createMemo, createSignal, For, Show } from "solid-js";

export type MultiSelectOption = { value: string; label: string };

/**
 * A filter-as-you-type multi-select: a text input with a dropdown of
 * matching options (already-selected ones excluded), and the current
 * selection rendered as removable chips above it. Extends the single-select
 * debounced-dropdown pattern used elsewhere in this app (see
 * organizations/[slug]/members.tsx's account-name picker, EventForm.tsx's
 * place/address pickers) to the multi-value case - unlike those, matching
 * happens client-side against an already-loaded `options` list, so there's
 * no debounce/network round trip here.
 */
export function MultiSelectAutocomplete(props: {
  label: string;
  placeholder: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  noResultsLabel: string;
}) {
  const [query, setQuery] = createSignal("");
  const [open, setOpen] = createSignal(false);

  const selectedOptions = createMemo(() => {
    const byValue = new Map(props.options.map((option) => [option.value, option]));
    return props.selected
      .map((value) => byValue.get(value))
      .filter((option): option is MultiSelectOption => option !== undefined);
  });

  const filteredOptions = createMemo(() => {
    const selectedValues = new Set(props.selected);
    const normalizedQuery = query().trim().toLowerCase();
    return props.options
      .filter((option) => !selectedValues.has(option.value))
      .filter((option) => option.label.toLowerCase().includes(normalizedQuery));
  });

  function addOption(value: string) {
    if (!props.selected.includes(value)) {
      props.onChange([...props.selected, value]);
    }
    setQuery("");
  }

  function removeOption(value: string) {
    props.onChange(props.selected.filter((v) => v !== value));
  }

  return (
    <div class="relative block">
      <label class="block">
        <span class="block text-sm font-medium">{props.label}</span>
        <div class="mt-1 flex flex-wrap items-center gap-1.5 rounded border border-zinc-300 px-2 py-1.5">
          <For each={selectedOptions()}>
            {(option) => (
              <span class="flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-sm text-emerald-800">
                {option.label}
                <button
                  type="button"
                  class="text-emerald-600 hover:text-emerald-900"
                  aria-label={`Remove ${option.label}`}
                  onClick={() => removeOption(option.value)}
                >
                  ×
                </button>
              </span>
            )}
          </For>
          <input
            class="min-w-[8rem] flex-1 py-0.5 outline-none"
            placeholder={props.selected.length === 0 ? props.placeholder : ""}
            autocomplete="off"
            data-1p-ignore="true"
            data-lpignore="true"
            data-bwignore="true"
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
          />
        </div>
      </label>
      <Show when={open()}>
        <ul class="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded border border-zinc-300 bg-white shadow-lg">
          <Show
            when={filteredOptions().length > 0}
            fallback={<li class="px-3 py-2 text-sm text-zinc-500">{props.noResultsLabel}</li>}
          >
            <For each={filteredOptions()}>
              {(option) => (
                <li>
                  <button
                    type="button"
                    class="block w-full px-3 py-2 text-left hover:bg-zinc-100"
                    onClick={() => addOption(option.value)}
                  >
                    {option.label}
                  </button>
                </li>
              )}
            </For>
          </Show>
        </ul>
      </Show>
    </div>
  );
}
