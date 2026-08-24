import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { CopyButton } from "./CopyButton";

describe("<CopyButton />", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it("copies the text and shows the success label", async () => {
    const { getByRole } = render(() => (
      <CopyButton text="https://example.com/group" label="Copy link" success="Link copied!" />
    ));
    const button = getByRole("button");
    expect(button).toHaveTextContent("Copy link");

    await userEvent.click(button);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("https://example.com/group");
    expect(button).toHaveTextContent("Link copied!");
  });
});
