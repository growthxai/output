---
"@outputai/cli": patch
---

Fixed `output credentials edit` modifying the encrypted credentials file on disk even when the user made no changes in their editor. Because AES-GCM uses a fresh nonce per encryption, the unconditional re-write produced new ciphertext bytes and left the file dirty in git on every invocation. The command now skips the write when the post-editor plaintext is identical to the original.
