// Lets `node --test server/test` work: Node 24 treats that argument as a module path
// (a directory is not expanded into test files), so it loads this file, which imports every
// *.test.mjs next to it. `node --test "server/test/*.test.mjs"` works too.
import { readdirSync } from 'node:fs';

const here = new URL('./', import.meta.url);
for (const file of readdirSync(here).filter((f) => f.endsWith('.test.mjs')).sort()) {
  await import(new URL(file, here));
}
