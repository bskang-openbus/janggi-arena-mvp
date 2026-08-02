/**
 * Zero-dependency resolution hook so plain `node scripts/*.ts` can run the engine sources.
 *
 * The engine uses ESM-correct `./foo.js` specifiers (required by tsc + bundlers), but on disk
 * only `./foo.ts` exists. Node 24 strips types natively; it just needs the specifier remapped.
 *
 *   node --import ./scripts/ts-resolve.mjs scripts/generate-fixtures.ts
 */
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (/^\.{1,2}\//.test(specifier) && specifier.endsWith(".js") && context.parentURL) {
      const asJs = new URL(specifier, context.parentURL);
      const asTs = new URL(specifier.slice(0, -3) + ".ts", context.parentURL);
      if (!existsSync(fileURLToPath(asJs)) && existsSync(fileURLToPath(asTs))) {
        return nextResolve(specifier.slice(0, -3) + ".ts", context);
      }
    }
    return nextResolve(specifier, context);
  },
});
