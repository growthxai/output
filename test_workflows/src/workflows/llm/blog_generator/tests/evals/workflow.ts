import { evalWorkflow } from '@outputai/core/evals';
import { lengthOfOutput, evaluateTopic, evaluateQuality, evaluateContent, evaluateTone, evaluateCallToAction } from './evaluators.js';

export default evalWorkflow( {
  name: 'blog_generator_eval',
  evals: [
    {
      evaluator: lengthOfOutput,
      criticality: 'required',
      interpret: { type: 'boolean' }
    },
    {
      evaluator: evaluateTopic,
      criticality: 'required',
      interpret: { type: 'verdict' }
    },
    {
      evaluator: evaluateQuality,
      criticality: 'required',
      interpret: { type: 'number', pass: 0.7, partial: 0.4 }
    },
    {
      evaluator: evaluateContent,
      criticality: 'informational',
      interpret: { type: 'boolean' }
    },
    {
      evaluator: evaluateTone,
      criticality: 'informational',
      interpret: { type: 'string', pass: [ 'professional', 'informative' ], partial: [ 'casual' ] }
    },
    {
      evaluator: evaluateCallToAction,
      criticality: 'informational',
      interpret: { type: 'boolean' }
    }
  ]
} );
