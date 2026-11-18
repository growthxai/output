import type { EvaluationNumberResult } from '@outputai/core';

export function createWorkflowOutput(
  blogContent: { url: string; title: string },
  evaluation: EvaluationNumberResult
) {
  return {
    url: blogContent.url,
    title: blogContent.title,
    signalToNoiseScore: evaluation.value,
    confidence: evaluation.confidence,
    reasoning: evaluation.reasoning,
    feedback: evaluation.feedback
  };
}
