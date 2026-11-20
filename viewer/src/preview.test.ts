import { describe, expect, it } from "vitest";
// The page the app actually loads. check:app keeps it in step with preview.css.
import { viewerHtml } from "../../app/src/viewerHtml";

const css = viewerHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1] ?? "";

describe("viewer page touch rules (embedded app build)", () => {
  it("turns off text selection and the iOS callout for every element", () => {
    // The minifier may write "*, *::before, *::after" as "*,:before,:after".
    const rule = css.match(/\*\s*,\s*\*?::?before\s*,\s*\*?::?after\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toMatch(/-webkit-user-select:\s*none/);
    expect(rule).toMatch(/(^|[;{\s])user-select:\s*none/);
    expect(rule).toMatch(/-webkit-touch-callout:\s*none/);
  });

  it("keeps the canvas as the touch target for pinch, pan and taps", () => {
    expect(css).toMatch(/canvas\s*\{[^}]*touch-action:\s*none/);
  });
});
