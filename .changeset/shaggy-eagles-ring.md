---
"@outputai/llm": patch
---

- Add runtime image inputs to `generateImage()`, including image-to-image generation and optional masks for image editing;
- Add validation and TypeScript types for `generateImage()` `images` and `mask` arguments;
- Map AI SDK non-retryable API errors to `FatalError` across `generateText()`, `streamText()`, and `generateImage()` so permanent provider failures do not trigger workflow/activity retries.
