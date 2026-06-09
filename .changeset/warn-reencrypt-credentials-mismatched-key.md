---
"@outputai/cli": patch
---

`credentials set` and `credentials edit` now check whether the current key can decrypt the existing credentials file before re-encrypting. On a key mismatch they abort with a clear warning that the wrong key may be in use and the file would be re-encrypted under a different key. Pass `--force` / `-f` to proceed anyway (re-encrypts from empty, discarding the undecryptable values).
