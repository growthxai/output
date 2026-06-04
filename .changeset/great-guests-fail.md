---
"@outputai/llm": minor
---

- Added the `generateImage()` function for image generation, including image model loading, image prompt options, and wrapped image responses;
- Improved public TS types by deriving AI SDK options and results from the upstream `ai` package;
- Removed unused TS types;
- Added validation for prompt skills, text generation arguments, and image prompt options;
- Updated `streamText()` to support prompt skills and tools consistently with `generateText()`.
