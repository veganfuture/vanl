import { describe, expect, it } from "vitest";
import { render } from "@solidjs/testing-library";
import { LinkifiedText } from "./LinkifiedText";

describe("<LinkifiedText />", () => {
  it("renders plain text with no URLs unchanged", () => {
    const { container } = render(() => <LinkifiedText text="Just a normal description." />);
    expect(container).toHaveTextContent("Just a normal description.");
    expect(container.querySelector("a")).toBeNull();
  });

  it("turns a bare URL into a link that opens in a new tab", () => {
    const { getByRole } = render(() => (
      <LinkifiedText text="Come join us, see https://example.com/event for details." />
    ));
    const link = getByRole("link");
    expect(link).toHaveAttribute("href", "https://example.com/event");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
  });

  it("does not swallow trailing sentence punctuation into the link", () => {
    const { getByRole } = render(() => (
      <LinkifiedText text="Details at https://example.com/event, see you there!" />
    ));
    const link = getByRole("link");
    expect(link).toHaveAttribute("href", "https://example.com/event");
    expect(link.nextSibling?.textContent).toBe(", see you there!");
  });

  it("handles a URL wrapped in parentheses", () => {
    const { getByRole } = render(() => (
      <LinkifiedText text="More info (https://example.com/event) right here." />
    ));
    const link = getByRole("link");
    expect(link).toHaveAttribute("href", "https://example.com/event");
  });

  it("renders multiple URLs as separate links", () => {
    const { getAllByRole } = render(() => (
      <LinkifiedText text="See https://a.example.com and also https://b.example.com" />
    ));
    const links = getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", "https://a.example.com");
    expect(links[1]).toHaveAttribute("href", "https://b.example.com");
  });
});
