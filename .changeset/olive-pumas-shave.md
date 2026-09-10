---
"@outputai/credentials": patch
"@outputai/cli": patch
"output-api": patch
---

## Dependencies updates

### Published dependency ranges

- js-yaml: `4.3.1` -> `4.3.2` (catalog), shipped by `@outputai/cli` and `@outputai/credentials`

### API runtime

- qs: `6.15.2` -> `6.16.0`, reached through `express`, which also moves `side-channel` from `1.1.0` to `1.1.1`
