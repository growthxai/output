import { evalWorkflow } from '@outputai/evals';
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
