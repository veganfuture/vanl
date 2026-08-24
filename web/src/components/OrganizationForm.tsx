import { createSignal, Show } from "solid-js";
import type { ErrorMessagesFor } from "~/lib/api-fetch";
import { ImagePickerField } from "./ImagePickerField";
import { makeT, type Locale } from "~/lib/i18n";
import type { OrganizationJson } from "~/routes/api/organizations/organization.schema";

/** Superset of every organizations-route error - a single messages record covers create and update, same approach as EventForm.tsx's eventFormErrorMessages. */
export type OrganizationFormError =
  "unauthorized" | "not_found" | "forbidden" | "validation" | "name_taken" | "internal_error";

export function organizationFormErrorMessages(
  lang: Locale,
): ErrorMessagesFor<{ error: OrganizationFormError }> {
  const t = makeT(lang);
  return {
    unauthorized: {
      message: t("Je moet inloggen om dat te doen.", "You need to log in to do that."),
      isWarn: true,
    },
    not_found: {
      message: t("Deze organisatie bestaat niet meer.", "That organization no longer exists."),
      isWarn: true,
    },
    forbidden: {
      message: t(
        "Je hebt geen toestemming om dat te doen.",
        "You don't have permission to do that.",
      ),
      isWarn: true,
    },
    validation: {
      message: t(
        "Controleer het formulier en probeer het opnieuw.",
        "Please check the form and try again.",
      ),
      isWarn: false,
    },
    name_taken: {
      message: t("Deze naam is al in gebruik.", "That name is already taken."),
      isWarn: true,
    },
    internal_error: {
      message: t(
        "Er is iets misgegaan. Probeer het opnieuw.",
        "Something went wrong. Please try again.",
      ),
      isWarn: false,
    },
  };
}

export type OrganizationFormValues = {
  name: string;
  description: string;
  websiteUrl: string;
};

export function emptyOrganizationFormValues(): OrganizationFormValues {
  return { name: "", description: "", websiteUrl: "" };
}

export function organizationFormValuesFromOrg(org: OrganizationJson): OrganizationFormValues {
  return {
    name: org.name,
    description: org.description ?? "",
    websiteUrl: org.websiteUrl ?? "",
  };
}

export function toOrganizationRequestBody(values: OrganizationFormValues) {
  return {
    name: values.name.trim(),
    description: values.description.trim() || null,
    websiteUrl: values.websiteUrl.trim() || null,
  };
}

export function OrganizationForm(props: {
  lang: Locale;
  initial: OrganizationFormValues;
  submitLabel: string;
  submittingLabel: string;
  /** The org's current logo, shown until a new file is picked - undefined/null on the create form (no org yet). */
  currentLogoImageId?: string | null;
  onSubmit: (
    values: OrganizationFormValues,
    logoFile: File | null,
  ) => Promise<{ ok: true } | { ok: false; message: string }>;
}) {
  const t = (nl: string, en: string) => (props.lang === "nl" ? nl : en);
  const [values, setValues] = createSignal(props.initial);
  const [logoFile, setLogoFile] = createSignal<File | null>(null);
  const [submitting, setSubmitting] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  async function onSubmit(submitEvent: SubmitEvent) {
    submitEvent.preventDefault();
    setError(null);
    if (!values().name.trim()) {
      setError(t("Vul een naam in.", "Enter a name."));
      return;
    }
    setSubmitting(true);
    try {
      const outcome = await props.onSubmit(values(), logoFile());
      if (!outcome.ok) {
        setError(outcome.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form class="space-y-4" onSubmit={onSubmit}>
      <label class="block">
        <span class="block text-sm font-medium">{t("Naam", "Name")}</span>
        <input
          class="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
          required
          value={values().name}
          onInput={(e) => setValues({ ...values(), name: e.currentTarget.value })}
        />
      </label>

      <ImagePickerField
        lang={props.lang}
        label={t("Logo (optioneel)", "Logo (optional)")}
        currentImageId={props.currentLogoImageId}
        onChange={setLogoFile}
      />
      <label class="block">
        <span class="block text-sm font-medium">
          {t("Beschrijving (optioneel)", "Description (optional)")}
        </span>
        <textarea
          class="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
          rows={4}
          value={values().description}
          onInput={(e) => setValues({ ...values(), description: e.currentTarget.value })}
        />
      </label>
      <label class="block">
        <span class="block text-sm font-medium">
          {t("Website (optioneel)", "Website (optional)")}
        </span>
        <input
          type="url"
          class="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
          value={values().websiteUrl}
          onInput={(e) => setValues({ ...values(), websiteUrl: e.currentTarget.value })}
        />
      </label>

      <Show when={error()}>{(message) => <p class="text-red-700">{message()}</p>}</Show>

      <button
        type="submit"
        disabled={submitting()}
        class="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
      >
        {submitting() ? props.submittingLabel : props.submitLabel}
      </button>
    </form>
  );
}
