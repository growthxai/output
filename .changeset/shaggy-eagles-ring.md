---
"@outputai/llm": patch
---

- Added runtime image inputs to `generateImage()`, including image-to-image generation and optional masks for image editing;
- Added validation and TypeScript types for `generateImage()` `images` and `mask` arguments;
- Added conversion of AI SDK non-retryable API errors to `FatalError` across `generateText()`, `streamText()`, and `generateImage()` so permanent provider failures do not trigger workflow/activity retries:
  - APICallError (when `.isRetriable() === false` )
  - InvalidArgumentError
  - InvalidDataContentError
  - InvalidPromptError
  - LoadAPIKeyError
  - LoadSettingError
  - NoImageGeneratedError
  - NoSuchModelError
  - NoSuchProviderError
  - UnsupportedFunctionalityError
