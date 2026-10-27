import { evalWorkflow } from '@outputai/core/evals';
import { outputPresent } from '../../../../shared/evaluators/output.js';
import { evaluateCount, crashOnRequest } from './evaluators.js';

export default evalWorkflow( {
  name: 'word_count_eval',
  evals: [
    {
      evaluator: outputPresent,
      criticality: 'informational',
      interpret: { type: 'boolean' }
    },
    {
      evaluator: evaluateCount,
      criticality: 'required',
      interpret: { type: 'verdict' }
    },
    {
      evaluator: crashOnRequest,
      criticality: 'required',
      interpret: { type: 'boolean' }
    }
  ],
  config: { concurrency: 2 }
} );
