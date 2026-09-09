---
"@outputai/llm": patch
---

Added `GCP_CREDENTIALS_JSON` support to the built-in `google-vertex` provider. Set it to the contents of a service account key file, either raw JSON or base64 encoded, to authenticate Vertex AI without deploying a credentials file. When the variable is unset the provider keeps using Application Default Credentials, so existing `GOOGLE_APPLICATION_CREDENTIALS`, `gcloud` and metadata server setups are unchanged.
