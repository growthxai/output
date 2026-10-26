import { evalWorkflow } from '@outputai/core/evals';
import { evaluateSum } from './evaluators.js';

export default evalWorkflow( {
  name: 'simple_eval',
  evals: [
    {
      evaluator: evaluateSum,
      criticality: 'required',
      interpret: { type: 'boolean' }
    }
  ]
} );
