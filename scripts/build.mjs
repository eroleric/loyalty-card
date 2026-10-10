import { build } from "esbuild";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve, parse } from "node:path";
// Vendor the pinned SDK locally. GitHub Pages needs no build service or remote CDN.
const result = await build({
  stdin: { contents: 'export { createClient } from "@supabase/supabase-js";', resolveDir: process.cwd() },
  bundle: true, format: "esm", platform: "browser", target: "es2022",
  minify: true, outfile: "dist/vendor/supabase.js", legalComments: "external", metafile: true,
});

// Include the licenses of all packages actually included in the browser bundle.
const licenses = new Map();
for (const input of Object.keys(result.metafile.inputs).filter(path => path.includes("node_modules/"))) {
  let directory = dirname(resolve(input));
  while (directory !== parse(directory).root) {
    try {
      const pkg = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
      if (pkg.name) {
        if (!licenses.has(pkg.name)) {
          const files = await readdir(directory);
          const filename = files.find(file => /^licen[cs]e(?:\.[a-z]+)?$/i.test(file));
          if (!filename) throw new Error(`Missing license: ${pkg.name}`);
          licenses.set(pkg.name, `${pkg.name} ${pkg.version}\n\n${(await readFile(join(directory, filename), "utf8")).trim()}`);
        }
        break;
      }
    } catch (error) { if (error.code !== "ENOENT") throw error; }
    directory = dirname(directory);
  }
}
await writeFile("dist/vendor/licenses.txt", [...licenses.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => value).join("\n\n--------------------\n\n") + "\n");
