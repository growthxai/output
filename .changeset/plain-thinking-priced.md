---
"@outputai/core": patch
---

Fixed LLM cost status for calls with reasoning tokens. A reasoning item with no separate reasoning rate in the pricing catalog is now priced at the output rate with item status `ok`, instead of `fallback`, so these calls (Anthropic, OpenAI and Gemini thinking models) are `precise` rather than `imprecise`. Cache read and cache write items without their own rate still fall back to the input rate and still mark the cost `imprecise`.
