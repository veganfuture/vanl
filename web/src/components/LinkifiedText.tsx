import { For } from "solid-js";

/**
 * Event descriptions are plain text (see event_validation.ts - no rich-text
 * editing), but publishers often paste bare URLs into them. This renders
 * that text with any URLs turned into real links, without ever touching
 * innerHTML - segments are plain Solid text nodes, so nothing here can
 * introduce XSS regardless of what a publisher pastes in.
 */

const URL_RE = /https?:\/\/[^\s]+/g;
// A URL glued to trailing sentence punctuation (a period ending the
// sentence, a closing paren wrapping it, etc.) shouldn't swallow that
// punctuation into the link itself.
const TRAILING_PUNCTUATION_RE = /[.,;:!?)\]}'"]+$/;

type Segment = { type: "text"; value: string } | { type: "link"; value: string };

function splitTextWithLinks(text: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;

  // Adjacent text pieces (e.g. trailing punctuation stripped off a link,
  // immediately followed by the rest of the sentence) merge into one
  // segment - otherwise they'd render as needlessly separate text nodes.
  function pushText(value: string) {
    if (!value) return;
    const last = segments.at(-1);
    if (last?.type === "text") {
      last.value += value;
    } else {
      segments.push({ type: "text", value });
    }
  }

  for (const match of text.matchAll(URL_RE)) {
    const start = match.index;
    if (start > lastIndex) {
      pushText(text.slice(lastIndex, start));
    }

    let url = match[0];
    const trailing = TRAILING_PUNCTUATION_RE.exec(url)?.[0] ?? "";
    if (trailing) {
      url = url.slice(0, url.length - trailing.length);
    }
    segments.push({ type: "link", value: url });
    pushText(trailing);

    lastIndex = start + match[0].length;
  }

  pushText(text.slice(lastIndex));

  return segments;
}

function ExternalLinkIcon() {
  return (
    <svg
      class="ml-0.5 inline h-3.5 w-3.5 shrink-0 align-baseline"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      stroke-width="2"
      aria-hidden="true"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M13.5 6H18m0 0v4.5M18 6l-8 8m-3-8H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-1.5"
      />
    </svg>
  );
}

export function LinkifiedText(props: { text: string }) {
  const segments = () => splitTextWithLinks(props.text);

  return (
    <For each={segments()}>
      {(segment) =>
        segment.type === "link" ? (
          <a href={segment.value} target="_blank" rel="noreferrer" class="break-words underline">
            {segment.value}
            <ExternalLinkIcon />
          </a>
        ) : (
          <>{segment.value}</>
        )
      }
    </For>
  );
}
