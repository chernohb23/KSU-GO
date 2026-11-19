import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

function normalizedHtml(source) {
  const html = JSON.parse(source.trim().replace(/^export const viewerHtml = /, "").replace(/;$/, ""));
  return html.replace(/\r\n?/g, "\n");
}

const temporary = await mkdtemp(join(tmpdir(), "ksugo-viewer-check-"));
try {
  const exported = join(temporary, "viewerHtml.ts");
  await promisify(execFile)(process.execPath, [
    fileURLToPath(new URL("./export-html.mjs", import.meta.url)), exported,
  ]);
  const [fresh, embedded] = await Promise.all([
    readFile(exported, "utf8"),
    readFile(new URL("../../app/src/viewerHtml.ts", import.meta.url), "utf8"),
  ]);
  if (normalizedHtml(fresh) !== normalizedHtml(embedded)) {
    throw new Error("Embedded viewer differs from the current build.");
  }
  console.log("Embedded viewer is up to date.");
} catch (error) {
  console.error(`${error.message}\nrun npm run build:app`);
  process.exitCode = 1;
} finally {
  await rm(temporary, { recursive: true, force: true });
}
