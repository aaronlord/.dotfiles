#!/usr/bin/env python3
"""
Headroom tool-output compressor.

Reads plain text from stdin, outputs compressed text to stdout.
Used by the headroom.ts pi extension to compress bash/read/grep/find outputs.

Exit codes:
  0  Compressed output written to stdout
  1  Error (pass-through unchanged)
  2  Input too short / no improvement — pass through unchanged
"""
from __future__ import annotations

import sys

MIN_CHARS = 500  # don't bother compressing small outputs

text = sys.stdin.read()

if len(text) < MIN_CHARS:
    sys.exit(2)

try:
    from headroom import compress  # type: ignore[import]

    msgs = [
        {
            "role": "user",
            "content": [
                {
                    "type": "tool_result",
                    "tool_use_id": "headroom-pi-compress",
                    "content": text,
                }
            ],
        }
    ]
    result = compress(msgs, protect_recent=0, compress_user_messages=True)

    content = result.messages[-1]["content"]
    compressed: str
    if isinstance(content, list) and content:
        first = content[0]
        compressed = first.get("content", text) if isinstance(first, dict) else text
    elif isinstance(content, str):
        compressed = content
    else:
        sys.exit(1)

    if len(compressed) >= len(text):
        sys.exit(2)

    saved = len(text) - len(compressed)
    pct = int(saved / len(text) * 100)
    suffix = f"\n[headroom: {pct}% compression, {saved} chars saved]"
    sys.stdout.write(compressed + suffix)

except Exception as e:
    print(f"headroom compress error: {e}", file=sys.stderr)
    sys.exit(1)
