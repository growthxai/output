---
"@outputai/core": patch
---

Stream trace JSON when writing local files and uploading to S3, avoiding Node.js string length limits for large trace outputs.
