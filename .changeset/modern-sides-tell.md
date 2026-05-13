---
"@outputai/core": patch
---

Avoiding "RangeError: Invalid string length" by streaming trace tree stringification to file/s3 instead of converting in memory with JSON.stringify().
