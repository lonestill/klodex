import { test, expect, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { paths } from "../src/config.ts";
import {
  capturePreview,
  screenshotPath,
  screenshotContext,
  localUrl,
} from "../src/preview.ts";

test("preview accepts only local HTTP URLs", () => {
  expect(() => localUrl("file:///etc/passwd")).toThrow();
  expect(() => localUrl("https://example.com")).toThrow();
  expect(localUrl("http://127.0.0.1:3000")).toBe("http://127.0.0.1:3000/");
});
// Browser smoke checks are opt-in so the unit suite needs no browser download.
test.skipIf(!process.env.KLODEX_BROWSER_TEST)(
  "desktop/mobile capture includes element context and console errors",
  async () => {
    const temp = mkdtempSync(join(tmpdir(), "klodex-preview-"));
    const previous = paths.dataDir;
    paths.dataDir = temp;
    const server = Bun.serve({
      port: 0,
      fetch: () =>
        new Response(
          '<!doctype html><title>Preview test</title><main id="target">Hello preview</main><script>console.error("fixture error")</script>',
          { headers: { "content-type": "text/html" } },
        ),
    });
    try {
      for (const mobile of [false, true]) {
        const result = await capturePreview(
          `http://localhost:${server.port}`,
          mobile,
          mobile ? "#target" : undefined,
        );
        expect(result.title).toBe("Preview test");
        expect(result.errors).toContain("fixture error");
        expect(await Bun.file(screenshotPath(result.id)).exists()).toBe(true);
        if (mobile)
          expect(screenshotContext(result.id)).toContain("Hello preview");
      }
    } finally {
      server.stop(true);
      paths.dataDir = previous;
      rmSync(temp, { recursive: true, force: true });
    }
  },
  45000,
);
