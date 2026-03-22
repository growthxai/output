---
argument-hint: [workflow-name-or-run-id]
description: Show the final result of a local trace file — clean readable markdown
version: 0.1.0
---

Show just the final output of an Output.ai workflow trace — the actual result, rendered as readable markdown.

$ARGUMENTS - Either a workflow name (e.g. `context_competitors`) or a workflow run ID. If empty, use the most recent trace across all workflows.

## Instructions

1. **Find the trace JSON file:**
   - Trace files live in `logs/runs/<workflow_name>/` as JSON files
   - Filenames follow the pattern: `<timestamp>_<workflow_id>.json`
   - If a workflow name is given, find the latest `.json` file in `logs/runs/<workflow_name>/`
   - If a run ID is given, search across all `logs/runs/*/` folders for a file containing that ID in its filename
   - If no argument, find the most recently modified `.json` file across all `logs/runs/*/` folders

2. **Read the trace JSON file.** The final output lives at `output.output` in the JSON root. You only need this field — skip `children` and `input`. Read the file (use `offset`/`limit` if large) and extract the output.

3. **Save a markdown file to `tmp/trace_result_<workflow_name>_<id>.md`** (create the `tmp/` directory if it doesn't exist) with:

   ### Header (brief)
   - One line: workflow name, ID, duration

   ### Result
   Render `output.output` as clean, readable markdown:
   - String fields that contain markdown → render directly
   - Arrays of objects → render each as a sub-section with key fields
   - Arrays of strings → numbered lists
   - Nested objects → sub-sections with key-value pairs
   - URLs → render as links
   - Long text excerpts → render as blockquotes

   The goal is a document you'd want to READ, not debug. Make it look good.

4. **Tell the user** the saved file path.

## Important
- This is a RESULT view — render for readability, not debugging
- Do NOT include step details, inputs/outputs, or timing per step
- Do NOT wrap things in JSON code blocks — this should read like a document
- Include the full output without truncation
