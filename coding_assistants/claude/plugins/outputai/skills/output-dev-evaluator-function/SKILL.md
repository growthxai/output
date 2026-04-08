---
name: output-dev-evaluator-function
description: Create evaluator functions in evaluators.ts for Output SDK workflows. Use when implementing quality assessment, validation logic, or content evaluation.
allowed-tools: [Read, Write, Edit]
---

# Creating Evaluator Functions

## Overview

This skill documents how to create evaluator functions in `evaluators.ts` for Output SDK workflows. Evaluators are used to assess quality, validate outputs, and provide confidence-scored judgments about workflow results.

## When to Use This Skill

- Implementing quality assessment for workflow outputs
- Adding validation logic with confidence scores
- Creating LLM-powered content evaluation
- Building reusable evaluation components

## File Organization

### Option 1: Flat File (Default)

For smaller workflows, use a single `evaluators.ts` file:

```
src/workflows/{workflow-name}/
├── workflow.ts
├── steps.ts
├── evaluators.ts    # All evaluators in one file
├── types.ts
└── ...
```

### Option 2: Folder-Based (Large workflows)

For larger workflows with many evaluators, use an `evaluators/` folder:

```
src/workflows/{workflow-name}/
├── workflow.ts
├── steps.ts
├── evaluators/      # Evaluators split into individual files
│   ├── quality.ts
│   ├── accuracy.ts
│   └── completeness.ts
├── types.ts
└── ...
```

## Component Location Rules

**Important**: `evaluator()` calls MUST be in files containing 'evaluators' in the path:
- `src/workflows/my_workflow/evaluators.ts` ✓
- `src/workflows/my_workflow/evaluators/quality.ts` ✓
- `src/shared/evaluators/common_evaluators.ts` ✓
- `src/workflows/my_workflow/helpers.ts` ✗ (cannot contain evaluator() calls)

## Activity Isolation Constraints

Evaluators are Temporal activities with strict import rules to ensure deterministic replay.

### Evaluators CAN import from:
- Local workflow files: `./utils.js`, `./types.js`, `./helpers.js`
- Local subdirectories: `./lib/helpers.js`
- Shared utilities: `../../shared/utils/*.js`
- Shared clients: `../../shared/clients/*.js`
- Shared services: `../../shared/services/*.js`

### Evaluators CANNOT import:
- Other evaluator files (activity isolation)
- Step files
- Workflow files

**Example of WRONG imports:**
```typescript
// WRONG - evaluators cannot import other evaluators
import { otherEvaluator } from '../../shared/evaluators/other.js'; // ✗
import { anotherEvaluator } from './other_evaluators.js'; // ✗
```

## Critical Import Patterns

### Core Imports

```typescript
// CORRECT - Import from @outputai/core
import {
  evaluator,
  z,
  EvaluationBooleanResult,
  EvaluationNumberResult,
  EvaluationStringResult,
  EvaluationFeedback
} from '@outputai/core';

// WRONG - Never import z from zod
import { z } from 'zod';
```

### LLM Client Import (for LLM-powered evaluators)

```typescript
// CORRECT - Use @outputai/llm wrapper
import { generateText, Output } from '@outputai/llm';

// WRONG - Never call LLM providers directly
import OpenAI from 'openai';
```

### ES Module Imports

All imports MUST use `.js` extension:

```typescript
// CORRECT
import { BlogContent } from './types.js';

// WRONG - Missing .js extension
import { BlogContent } from './types';
```

## Basic Structure

```typescript
import { evaluator, z, EvaluationBooleanResult } from '@outputai/core';

export const myEvaluator = evaluator({
  name: 'my_evaluator',
  description: 'Description of what this evaluator assesses',
  inputSchema: z.object({ /* input schema */ }),
  fn: async (input) => {
    // Evaluation logic
    return new EvaluationBooleanResult({
      value: true,
      confidence: 0.95
    });
  }
});
```

## Required Properties

### name (string)
Unique identifier for the evaluator. Use `snake_case`.

```typescript
name: 'evaluate_content_quality'
```

### description (string)
Human-readable description of what the evaluator assesses.

```typescript
description: 'Evaluate the quality and completeness of generated content'
```

### inputSchema (Zod schema)
Schema for validating evaluator input.

```typescript
inputSchema: z.object({
  content: z.string(),
  expectedLength: z.number()
})
```

### fn (async function)
The evaluator execution function. Returns an evaluation result with value and confidence.

```typescript
fn: async (input) => {
  const isValid = input.content.length >= input.expectedLength;
  return new EvaluationBooleanResult({
    value: isValid,
    confidence: 0.95
  });
}
```

## Result Types

### EvaluationBooleanResult

Use for pass/fail or true/false evaluations:

```typescript
import { EvaluationBooleanResult } from '@outputai/core';

return new EvaluationBooleanResult({
  value: true,           // boolean result
  confidence: 0.95,      // 0.0 to 1.0
  reasoning: 'Optional explanation of the evaluation'
});
```

### EvaluationNumberResult

Use for numeric scores or ratings:

```typescript
import { EvaluationNumberResult } from '@outputai/core';

return new EvaluationNumberResult({
  value: 85,             // numeric result (e.g., 0-100 score)
  confidence: 0.85,      // 0.0 to 1.0
  reasoning: 'Optional explanation of the score'
});
```

### EvaluationStringResult

Use for categorical or text-based evaluations:

```typescript
import { EvaluationStringResult } from '@outputai/core';

return new EvaluationStringResult({
  value: 'positive',     // string result (e.g., category, sentiment, label)
  confidence: 0.9,       // 0.0 to 1.0
  reasoning: 'Optional explanation of the classification'
});
```

## Result Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `value` | `boolean`, `number`, or `string` | Yes | The evaluation result |
| `confidence` | `number` (0.0-1.0) | Yes | Confidence in the evaluation |
| `reasoning` | `string` | No | Explanation of the evaluation |
| `name` | `string` | No | Name for this specific result (useful in dimensions) |
| `feedback` | `EvaluationFeedback[]` | No | Array of feedback objects with issues and suggestions |
| `dimensions` | `EvaluationResult[]` | No | Nested results for multi-dimensional evaluation |

## Simple Evaluator Examples

### Boolean Evaluator - Content Validation

```typescript
import { evaluator, z, EvaluationBooleanResult } from '@outputai/core';

export const evaluateCompleteness = evaluator({
  name: 'evaluate_completeness',
  description: 'Check if content meets minimum length requirements',
  inputSchema: z.object({
    content: z.string(),
    minLength: z.number().default(100)
  }),
  fn: async ({ content, minLength }) => {
    const isComplete = content.length >= minLength;

    return new EvaluationBooleanResult({
      value: isComplete,
      confidence: 1.0,
      reasoning: isComplete
        ? `Content has ${content.length} characters, meets minimum of ${minLength}`
        : `Content has ${content.length} characters, below minimum of ${minLength}`
    });
  }
});
```

### Boolean Evaluator - Pattern Detection

```typescript
import { evaluator, z, EvaluationBooleanResult } from '@outputai/core';

export const evaluateGibberish = evaluator({
  name: 'evaluate_gibberish',
  description: 'Check if a given string is gibberish',
  inputSchema: z.string(),
  fn: async content => {
    const gibberishPatterns = ['foo', 'bar', 'lorem', 'ipsum'];
    const isGibberish = gibberishPatterns.some(p => content.toLowerCase().includes(p));

    return new EvaluationBooleanResult({
      value: !isGibberish,
      confidence: 0.95
    });
  }
});
```

### Number Evaluator - Quality Score

```typescript
import { evaluator, z, EvaluationNumberResult } from '@outputai/core';

export const evaluateReadability = evaluator({
  name: 'evaluate_readability',
  description: 'Calculate readability score based on sentence structure',
  inputSchema: z.object({
    content: z.string()
  }),
  fn: async ({ content }) => {
    const sentences = content.split(/[.!?]+/).filter(s => s.trim());
    const words = content.split(/\s+/).filter(w => w.trim());
    const avgWordsPerSentence = words.length / Math.max(sentences.length, 1);

    // Simple readability score (lower avg words = more readable)
    const score = Math.max(0, Math.min(100, 100 - (avgWordsPerSentence - 15) * 5));

    return new EvaluationNumberResult({
      value: Math.round(score),
      confidence: 0.8,
      reasoning: `Average ${avgWordsPerSentence.toFixed(1)} words per sentence`
    });
  }
});
```

### String Evaluator - Sentiment Classification

```typescript
import { evaluator, z, EvaluationStringResult } from '@outputai/core';

export const evaluateSentiment = evaluator({
  name: 'evaluate_sentiment',
  description: 'Classify the sentiment of content',
  inputSchema: z.object({
    content: z.string()
  }),
  fn: async ({ content }) => {
    const positiveWords = ['great', 'excellent', 'amazing', 'good', 'love'];
    const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'poor'];

    const lowerContent = content.toLowerCase();
    const positiveCount = positiveWords.filter(w => lowerContent.includes(w)).length;
    const negativeCount = negativeWords.filter(w => lowerContent.includes(w)).length;

    let sentiment: string;
    let confidence: number;

    if (positiveCount > negativeCount) {
      sentiment = 'positive';
      confidence = Math.min(0.95, 0.6 + positiveCount * 0.1);
    } else if (negativeCount > positiveCount) {
      sentiment = 'negative';
      confidence = Math.min(0.95, 0.6 + negativeCount * 0.1);
    } else {
      sentiment = 'neutral';
      confidence = 0.7;
    }

    return new EvaluationStringResult({
      value: sentiment,
      confidence,
      reasoning: `Found ${positiveCount} positive and ${negativeCount} negative indicators`
    });
  }
});
```

## LLM-Powered Evaluator Examples

### Using generateText with Output.object() for Evaluation

```typescript
import { evaluator, z, EvaluationNumberResult } from '@outputai/core';
import { generateText, Output } from '@outputai/llm';

export const evaluateSignalToNoise = evaluator({
  name: 'evaluate_signal_to_noise',
  description: 'Evaluate the signal-to-noise ratio of content',
  inputSchema: z.object({
    title: z.string(),
    content: z.string()
  }),
  fn: async ({ title, content }) => {
    const { output } = await generateText({
      prompt: 'signal_noise@v1',  // References prompts/signal_noise@v1.prompt
      variables: {
        title,
        content
      },
      output: Output.object({
        schema: z.object({
          score: z.number().describe('Signal-to-noise score 0-100')
        })
      })
    });

    return new EvaluationNumberResult({
      value: output.score,
      confidence: 0.85
    });
  }
});
```

### LLM Boolean Evaluation

```typescript
import { evaluator, z, EvaluationBooleanResult } from '@outputai/core';
import { generateText, Output } from '@outputai/llm';

export const evaluateFactualAccuracy = evaluator({
  name: 'evaluate_factual_accuracy',
  description: 'Check if content contains factual claims that can be verified',
  inputSchema: z.object({
    content: z.string(),
    topic: z.string()
  }),
  fn: async ({ content, topic }) => {
    const { output } = await generateText({
      prompt: 'factual_check@v1',
      variables: { content, topic },
      output: Output.object({
        schema: z.object({
          isFactual: z.boolean().describe('Whether content appears factually accurate'),
          confidence: z.number().describe('Confidence in assessment 0-1'),
          issues: z.array(z.string()).optional().describe('Any factual issues found')
        })
      })
    });

    return new EvaluationBooleanResult({
      value: output.isFactual,
      confidence: output.confidence,
      reasoning: output.issues?.length
        ? `Issues found: ${output.issues.join(', ')}`
        : 'No factual issues detected'
    });
  }
});
```

### LLM String Evaluation - Content Classification

```typescript
import { evaluator, z, EvaluationStringResult } from '@outputai/core';
import { generateText, Output } from '@outputai/llm';

export const evaluateContentCategory = evaluator({
  name: 'evaluate_content_category',
  description: 'Classify content into a category',
  inputSchema: z.object({
    content: z.string(),
    categories: z.array(z.string())
  }),
  fn: async ({ content, categories }) => {
    const { output } = await generateText({
      prompt: 'categorize_content@v1',
      variables: {
        content,
        categories: categories.join(', ')
      },
      output: Output.object({
        schema: z.object({
          category: z.string().describe('The best matching category'),
          confidence: z.number().describe('Confidence in classification 0-1'),
          explanation: z.string().describe('Why this category was chosen')
        })
      })
    });

    return new EvaluationStringResult({
      value: output.category,
      confidence: output.confidence,
      reasoning: output.explanation
    });
  }
});
```

## EvaluationResult with Feedback

Use the `feedback` field to provide actionable improvement suggestions alongside your evaluation result. Import `EvaluationFeedback` from `@outputai/core` to create feedback objects.

```typescript
import { evaluator, z, EvaluationStringResult, EvaluationFeedback } from '@outputai/core';

export const evaluateWithFeedback = evaluator({
  name: 'evaluate_with_feedback',
  description: 'Evaluate content quality and provide actionable feedback',
  inputSchema: z.string(),
  fn: async (response) => {
    const feedback = [];

    if (response.length < 50) {
      feedback.push(new EvaluationFeedback({
        issue: 'Response is too short',
        suggestion: 'Expand the response with more detail',
        priority: 'medium'
      }));
    }

    return new EvaluationStringResult({
      value: feedback.length === 0 ? 'good' : 'needs_improvement',
      confidence: 0.85,
      feedback: feedback
    });
  }
});
```

### EvaluationFeedback Properties

| Property | Type | Description |
|----------|------|-------------|
| `issue` | `string` | The problem identified |
| `suggestion` | `string` | Recommended fix |
| `priority` | `string` | Priority level (e.g., `'low'`, `'medium'`, `'high'`) |

## Multi-Dimensional Evaluation

Use the `dimensions` field to nest `EvaluationResult` instances for sub-scores. Each dimension should use the `name` field to identify it.

```typescript
import { evaluator, z, EvaluationStringResult, EvaluationNumberResult } from '@outputai/core';

export const evaluateMultiDimensional = evaluator({
  name: 'evaluate_multi_dimensional',
  description: 'Evaluate content across multiple quality dimensions',
  inputSchema: z.string(),
  fn: async (response) => {
    const coherenceScore = calculateCoherence(response);
    const relevanceScore = calculateRelevance(response);
    const overallScore = (coherenceScore + relevanceScore) / 2;

    return new EvaluationStringResult({
      value: overallScore > 0.7 ? 'high_quality' : 'low_quality',
      confidence: 0.9,
      dimensions: [
        new EvaluationNumberResult({
          value: coherenceScore,
          confidence: 0.85,
          name: 'coherence'
        }),
        new EvaluationNumberResult({
          value: relevanceScore,
          confidence: 0.88,
          name: 'relevance'
        })
      ]
    });
  }
});
```

## Complete Example

Based on a real workflow evaluator file:

```typescript
import { evaluator, z, EvaluationBooleanResult, EvaluationNumberResult } from '@outputai/core';
import { generateText, Output } from '@outputai/llm';
import { blogContentSchema } from './types.js';
import type { BlogContent, QualityMetrics } from './types.js';

// Simple boolean evaluator
export const evaluateMinimumLength = evaluator({
  name: 'evaluate_minimum_length',
  description: 'Check if blog content meets minimum length requirements',
  inputSchema: blogContentSchema,
  fn: async (input: BlogContent) => {
    const MIN_TOKENS = 500;
    const meetsRequirement = input.tokenCount >= MIN_TOKENS;

    return new EvaluationBooleanResult({
      value: meetsRequirement,
      confidence: 1.0,
      reasoning: `Content has ${input.tokenCount} tokens (minimum: ${MIN_TOKENS})`
    });
  }
});

// LLM-powered number evaluator
export const evaluateSignalToNoise = evaluator({
  name: 'evaluate_signal_to_noise',
  description: 'Evaluate the signal-to-noise ratio of blog content',
  inputSchema: blogContentSchema,
  fn: async (input: BlogContent) => {
    const { output } = await generateText({
      prompt: 'signal_noise@v1',
      variables: {
        title: input.title,
        content: input.content
      },
      output: Output.object({
        schema: z.object({
          score: z.number().describe('Signal-to-noise score 0-100')
        })
      })
    });

    return new EvaluationNumberResult({
      value: output.score,
      confidence: 0.85
    });
  }
});

// LLM-powered boolean evaluator
export const evaluateRelevance = evaluator({
  name: 'evaluate_relevance',
  description: 'Check if content is relevant to the stated topic',
  inputSchema: z.object({
    content: z.string(),
    topic: z.string(),
    keywords: z.array(z.string())
  }),
  fn: async ({ content, topic, keywords }) => {
    const { output } = await generateText({
      prompt: 'relevance_check@v1',
      variables: { content, topic, keywords: keywords.join(', ') },
      output: Output.object({
        schema: z.object({
          isRelevant: z.boolean(),
          relevanceScore: z.number().describe('Relevance score 0-1'),
          explanation: z.string()
        })
      })
    });

    return new EvaluationBooleanResult({
      value: output.isRelevant,
      confidence: output.relevanceScore,
      reasoning: output.explanation
    });
  }
});
```

## Best Practices

### 1. Use Appropriate Result Types

```typescript
// Boolean for pass/fail decisions
return new EvaluationBooleanResult({ value: true, confidence: 0.9 });

// Number for scores and ratings
return new EvaluationNumberResult({ value: 85, confidence: 0.85 });

// String for categories, labels, or classifications
return new EvaluationStringResult({ value: 'positive', confidence: 0.9 });
```

### 2. Provide Meaningful Confidence Scores

```typescript
// High confidence for deterministic checks
confidence: 1.0  // e.g., length checks, pattern matching

// Medium confidence for heuristic-based evaluations
confidence: 0.85  // e.g., LLM-based assessments

// Lower confidence for uncertain evaluations
confidence: 0.7  // e.g., subjective quality judgments
```

### 3. Include Reasoning for Transparency

```typescript
return new EvaluationBooleanResult({
  value: false,
  confidence: 0.95,
  reasoning: `Content contains ${errorCount} grammatical errors, exceeding threshold of ${maxErrors}`
});
```

### 4. Keep Evaluators Focused

```typescript
// Good - single responsibility
export const evaluateGrammar = evaluator({ ... });
export const evaluateReadability = evaluator({ ... });
export const evaluateTone = evaluator({ ... });

// Avoid - doing too much in one evaluator
export const evaluateEverything = evaluator({ ... });
```

### 5. Use Descriptive Names

```typescript
// Good - clear what is being evaluated
name: 'evaluate_content_originality'
name: 'evaluate_factual_accuracy'
name: 'evaluate_sentiment_alignment'

// Avoid - vague names
name: 'check'
name: 'validate'
name: 'evaluate_stuff'
```

### 6. Use Feedback for Actionable Improvements

```typescript
feedback: [
  new EvaluationFeedback({
    issue: 'Missing conclusion paragraph',
    suggestion: 'Add a summary paragraph at the end',
    priority: 'high'
  })
]
```

### 7. Use Dimensions for Multi-Criteria Evaluation

```typescript
dimensions: [
  new EvaluationNumberResult({ value: 8, confidence: 0.9, name: 'coherence' }),
  new EvaluationNumberResult({ value: 6, confidence: 0.85, name: 'relevance' })
]
```

## Verification Checklist

- [ ] `evaluator`, `z`, result types imported from `@outputai/core`
- [ ] `generateText` and `Output` imported from `@outputai/llm` if using LLM (not direct provider)
- [ ] LLM output schemas use `.describe()` instead of `.min()/.max()` on `z.number()`
- [ ] All imports use `.js` extension
- [ ] Named exports used for each evaluator
- [ ] Each evaluator has `name`, `description`, `inputSchema`, `fn`
- [ ] Evaluator name uses `snake_case`
- [ ] Returns appropriate result type (`EvaluationBooleanResult`, `EvaluationNumberResult`, or `EvaluationStringResult`)
- [ ] Confidence score between 0.0 and 1.0
- [ ] Evaluators only import allowed dependencies (local files, shared code)
- [ ] No imports of other evaluators, steps, or workflows
- [ ] `EvaluationFeedback` imported from `@outputai/core` when using feedback
- [ ] Feedback objects include `issue`, `suggestion`, and `priority`
- [ ] Dimensions use the `name` field to identify sub-evaluations

## Related Skills

- `output-dev-workflow-function` - Orchestrating evaluators in workflow.ts
- `output-dev-step-function` - Creating step functions
- `output-dev-types-file` - Defining evaluator input schemas
- `output-dev-prompt-file` - Creating prompt files for LLM-powered evaluators
- `output-dev-folder-structure` - Understanding project layout
- `output-eval-error-analysis` — Identify what to evaluate before writing evaluators
