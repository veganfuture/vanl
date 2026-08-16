import { createMemo, createSignal, onCleanup, Show } from "solid-js";
import { imageUrl } from "~/lib/image-url";
import type { Locale } from "~/lib/i18n";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp";

/**
 * Picks a file without uploading it - the entity this image belongs to
 * might not exist yet (the create forms), so the actual POST to
 * /api/.../flyer or /logo happens after the parent form's own create/update
 * call succeeds and an id is available. See EventForm/OrganizationForm.
 */
export function ImagePickerField(props: {
  lang: Locale;
  label: string;
  /** The entity's current image, shown until a new file is picked - undefined/null on the create form (no entity yet). */
  currentImageId?: string | null;
  onChange: (file: File | null) => void;
}) {
  const t = (nl: string, en: string) => (props.lang === "nl" ? nl : en);
  const [error, setError] = createSignal<string | null>(null);
  const [objectUrl, setObjectUrl] = createSignal<string | null>(null);

  onCleanup(() => {
    const url = objectUrl();
    if (url) URL.revokeObjectURL(url);
  });

  function onFileChange(e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0] ?? null;
    setError(null);
    const previous = objectUrl();
    if (previous) {
      URL.revokeObjectURL(previous);
      setObjectUrl(null);
    }
    if (!file) {
      props.onChange(null);
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(t("Bestand is te groot (max 8MB).", "File is too large (max 8MB)."));
      e.currentTarget.value = "";
      props.onChange(null);
      return;
    }
    setObjectUrl(URL.createObjectURL(file));
    props.onChange(file);
  }

  const previewUrl = createMemo(
    () => objectUrl() ?? (props.currentImageId ? imageUrl(props.currentImageId) : null),
  );

  return (
    <div class="space-y-2">
      <span class="block text-sm font-medium">{props.label}</span>
      <Show when={previewUrl()}>
        {(url) => (
          <img src={url()} alt="" class="h-24 w-24 rounded border border-zinc-200 object-cover" />
        )}
      </Show>
      <input
        type="file"
        accept={ACCEPTED_TYPES}
        onChange={onFileChange}
        class="block w-full text-sm"
      />
      <p class="text-xs text-zinc-500">
        {t(
          "JPEG, PNG of WebP, max 8MB. Wordt automatisch verkleind en EXIF-gegevens worden verwijderd.",
          "JPEG, PNG, or WebP, max 8MB. It will be automatically resized and EXIF data stripped.",
        )}
      </p>
      <Show when={error()}>{(message) => <p class="text-sm text-red-700">{message()}</p>}</Show>
    </div>
  );
}
