---
"@outputai/core": patch
---

Fixed the error serializer splitting an emoji in two when it truncated a long string, which left an unpaired UTF-16 surrogate in the serialized error. A string the serializer cuts now ends before the whole character. Content that is not cut is not changed.

Changed the serialized RegExp sources, function names and buffer type names to go through the same truncation as other strings. They had no length limit before, so a very long one is now cut at 16,384 characters and ends with the `... [N more characters omitted]` marker.
