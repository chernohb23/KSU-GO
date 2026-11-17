import { readFile, writeFile } from "node:fs/promises";

const output = process.argv[2];
if (!output) throw new Error("Usage: node scripts/export-html.mjs <output.ts>");

const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
await writeFile(output, `export const viewerHtml = ${JSON.stringify(html)};\n`);
