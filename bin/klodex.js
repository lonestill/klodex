#!/usr/bin/env bun
import { join } from "node:path";

// Execute src/index.ts from package root
const rootDir = join(import.meta.dir, "..");
await import(join(rootDir, "src", "index.ts"));
