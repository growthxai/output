---
"@outputai/credentials": minor
"@outputai/cli": minor
---

## Asymmetric (sealed) credentials

Adds an opt-in **sealed** credentials mode alongside the existing symmetric scheme.
Sealed credentials are encrypted to a **committed public key** and decrypted with a
**private key that only the runtime needs** — so contributors can add credentials
without any secret on their machine, and there is no secret encryption key to
misconfigure.

Each value is sealed individually (libsodium `crypto_box_seal`-style: ephemeral X25519
ECDH → HKDF-SHA256 → AES-256-GCM), so the credential file is plain YAML with visible
keys and `sealed:` values plus a `__format__`/`__recipient__` header.

**`@outputai/credentials`**
- New crypto/format API: `generateKeypair`, `publicKeyFromPrivate`, `seal`, `open`,
  `sealTree`, `openTree`, `resealTree`, `detectFormat`, `parseSealedDocument`,
  `serializeSealedDocument`, `openSealedDocument`, `isSealedValue`, `isValidKeyHex`, and
  `resolvePublicKeyPath` / `resolveWorkflowPublicKeyPath`.
- The provider auto-detects sealed files and opens them with the configured private key.
  The recipient header is mandatory and must match the key, so a wrong or missing key
  fails fast with `SealedRecipientMismatchError` (never opens blindly). `seal` validates
  the recipient public key and `open` rejects malformed tokens. Legacy symmetric files
  keep working unchanged.

**`@outputai/cli`**
- `output credentials init --sealed` — generate a keypair, write the gitignored private
  key and the committed public key, and create a sealed file.
- `output credentials set` — seals the value with the public key; no private key needed.
- `output credentials verify` — verifies a file was sealed for the committed public key.
  This check needs **no secret**, so it is safe to run in CI.
- `output credentials migrate --to-sealed` — convert a legacy symmetric file to sealed
  form and emit the new private key to configure in the runtime. Writes are atomic with
  rollback so a failed migration is non-destructive, and key files are written `0600`.
- `edit` / `show` / `get` transparently support sealed files (private key required).
  `edit` preserves the ciphertext of unchanged values so a single edit only diffs what
  actually changed.

Because the public key is committed, anyone with repo write access can add a credential
value (but not read existing ones). Guard the credential files with CODEOWNERS + branch
protection; see the operations guide. The key-free `verify` command is safe to run in CI.
