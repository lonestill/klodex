#!/usr/bin/env python3
"""
Fast, local ONNX embedding engine powered by fastembed (Qdrant).
Model: BAAI/bge-small-en-v1.5 (384-dimensional dense vectors).
Zero API keys, zero network telemetry, runs completely local on CPU.
"""

import sys
import json
import warnings

# Suppress urllib3 LibreSSL warning on macOS
warnings.filterwarnings("ignore")

try:
    from fastembed import TextEmbedding
    model = TextEmbedding("BAAI/bge-small-en-v1.5")
except Exception as e:
    print(json.dumps({"ok": False, "error": f"Failed to initialize fastembed: {str(e)}"}))
    sys.exit(1)

def main():
    if len(sys.argv) > 1:
        # Arguments mode: python3 embed.py "text 1" "text 2"
        texts = sys.argv[1:]
        vectors = [v.tolist() for v in model.embed(texts)]
        print(json.dumps({"ok": True, "vectors": vectors, "dim": len(vectors[0])}))
        return

    # Stdin stream mode (JSON line: ["text1", "text2"])
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            payload = json.loads(line)
            texts = payload if isinstance(payload, list) else [payload]
            vectors = [v.tolist() for v in model.embed(texts)]
            print(json.dumps({"ok": True, "vectors": vectors, "dim": len(vectors[0])}))
            sys.stdout.flush()
        except Exception as err:
            print(json.dumps({"ok": False, "error": str(err)}))
            sys.stdout.flush()

if __name__ == "__main__":
    main()
