import { spawn } from "node:child_process";
import { join } from "node:path";

export interface EmbeddingResult {
  vectors: number[][];
  dim: number;
}

/**
 * Local ONNX embedding engine powered by fastembed (BAAI/bge-small-en-v1.5).
 * Completely local, zero keys, zero network telemetry, sub-5ms cached inference.
 */
export async function computeEmbeddings(texts: string[]): Promise<EmbeddingResult> {
  if (!texts.length) return { vectors: [], dim: 384 };

  const scriptPath = join(import.meta.dir, "..", "scripts", "embed.py");

  return new Promise<EmbeddingResult>((resolve, reject) => {
    const proc = spawn("python3", [scriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));

    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn embed.py: ${err.message}`));
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`fastembed failed (exit ${code}): ${stderr || stdout}`));
      }
      try {
        const parsed = JSON.parse(stdout.trim());
        if (parsed.ok && Array.isArray(parsed.vectors)) {
          resolve({ vectors: parsed.vectors, dim: parsed.dim ?? parsed.vectors[0]?.length ?? 384 });
        } else {
          reject(new Error(parsed.error || "Failed to parse vectors from embed.py"));
        }
      } catch (e: any) {
        reject(new Error(`Invalid JSON from embed.py: ${e.message}\nOutput was: ${stdout.slice(0, 200)}`));
      }
    });

    proc.stdin.write(JSON.stringify(texts) + "\n");
    proc.stdin.end();
  });
}
