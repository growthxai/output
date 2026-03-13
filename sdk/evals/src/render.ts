import { VERDICT, CRITICALITY } from './schemas.js';
import type { EvalOutput, EvalCase, EvaluatorResult, Verdict } from './schemas.js';

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m'
};

const VERDICT_STYLE: Record<Verdict, { label: string; color: string }> = {
  [VERDICT.PASS]: { label: 'PASS', color: COLORS.green },
  [VERDICT.PARTIAL]: { label: 'PARTIAL', color: COLORS.yellow },
  [VERDICT.FAIL]: { label: 'FAIL', color: COLORS.red }
};

function colorize( text: string, color: string ): string {
  return `${color}${text}${COLORS.reset}`;
}

function padWithDots( label: string, width = 30 ): string {
  const dotCount = Math.max( 2, width - label.length );
  return ` ${'.'.repeat( dotCount )} `;
}

function renderEvaluator( evaluator: EvaluatorResult ): string[] {
  const lines: string[] = [];
  const style = VERDICT_STYLE[evaluator.verdict];
  const prefix = evaluator.criticality === CRITICALITY.INFORMATIONAL ?
    `${COLORS.dim}(info)${COLORS.reset} ` :
    '';
  lines.push( `    ${prefix}${evaluator.name}${padWithDots( evaluator.name, 24 )}${colorize( evaluator.verdict, style.color )}` );

  if ( evaluator.reasoning && evaluator.verdict !== VERDICT.PASS ) {
    lines.push( `      ${COLORS.dim}-> ${evaluator.reasoning}${COLORS.reset}` );
  }

  if ( evaluator.feedback ) {
    for ( const fb of evaluator.feedback ) {
      const item = fb as Record<string, unknown>;
      if ( item.issue ) {
        lines.push( `      ${COLORS.dim}-> ${item.issue}${COLORS.reset}` );
      }
    }
  }

  return lines;
}

function renderCase( evalCase: EvalCase ): string[] {
  const caseStyle = VERDICT_STYLE[evalCase.verdict];
  const lines = [
    `  ${evalCase.datasetName}${padWithDots( evalCase.datasetName )}${colorize( caseStyle.label, caseStyle.color )}`
  ];

  evalCase.evaluators.forEach( evaluator => lines.push( ...renderEvaluator( evaluator ) ) );

  lines.push( '' );
  return lines;
}

export function renderEvalOutput( evalOutput: EvalOutput, evalName?: string ): string {
  const lines: string[] = [];

  if ( evalName ) {
    lines.push( colorize( evalName, COLORS.bold ) );
    lines.push( '' );
  }

  evalOutput.cases.forEach( evalCase => lines.push( ...renderCase( evalCase ) ) );

  const { summary } = evalOutput;
  const parts: string[] = [];
  if ( summary.passed > 0 ) {
    parts.push( colorize( `${summary.passed} passed`, COLORS.green ) );
  }
  if ( summary.partial > 0 ) {
    parts.push( colorize( `${summary.partial} partial`, COLORS.yellow ) );
  }
  if ( summary.failed > 0 ) {
    parts.push( colorize( `${summary.failed} failed`, COLORS.red ) );
  }

  lines.push( `${parts.join( ', ' )} (${Math.round( summary.acceptableRate * 100 )}% acceptable)` );

  return lines.join( '\n' );
}

export function computeExitCode( evalOutput: EvalOutput ): number {
  return evalOutput.cases.some( c => c.verdict === VERDICT.FAIL ) ? 1 : 0;
}
