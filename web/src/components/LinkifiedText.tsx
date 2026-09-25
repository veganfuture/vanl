import { For } from "solid-js";
import { ExternalLinkIcon } from "~/components/icons";

/**
 * Event descriptions are plain text (see event_validation.ts - no rich-text
 * editing), but publishers often paste bare URLs into them. This renders
 * that text with any URLs turned into real links, without ever touching
 * innerHTML - segments are plain Solid text nodes, so nothing here can
 * introduce XSS regardless of what a publisher pastes in.
 */

// Matches either a scheme-prefixed URL, or a bare "www."-prefixed domain -
// publishers often paste the latter without "https://" in front.
const URL_RE = /https?:\/\/[^\s]+|\bwww\.[a-zA-Z0-9-]+\.[^\s]+/g;
// A URL glued to trailing sentence punctuation (a period ending the
// sentence, a closing paren wrapping it, etc.) shouldn't swallow that
// punctuation into the link itself.
const TRAILING_PUNCTUATION_RE = /[.,;:!?)\]}'"]+$/;

// Imported sources (e.g. ARC) sometimes pad every line break with extra
// blank lines (`\n\n\n` between list items is common in their feed) - since
// the caller renders this with `white-space: pre-wrap`, that would otherwise
// show up as visibly uneven, oversized gaps. Collapsing runs of 2+ blank
// lines down to a single one keeps intentional paragraph breaks (a lone
// blank line) while normalizing the excess.
function collapseExcessBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, "\n\n");
}

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

export function LinkifiedText(props: { text: string }) {
  const segments = () => splitTextWithLinks(collapseExcessBlankLines(props.text));

  return (
    <For each={segments()}>
      {(segment) =>
        segment.type === "link" ? (
          <a
            href={/^https?:\/\//.test(segment.value) ? segment.value : `https://${segment.value}`}
            target="_blank"
            rel="noreferrer"
            class="break-words underline"
          >
            {segment.value}
            <ExternalLinkIcon class="ml-0.5 inline h-3.5 w-3.5 shrink-0 align-baseline" />
          </a>
        ) : (
          <>{segment.value}</>
        )
      }
    </For>
  );
}
