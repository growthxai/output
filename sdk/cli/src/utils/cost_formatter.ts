import Table from 'cli-table3';
import type {
  CostReport,
  ParsedCostData,
  LLMModelSummary,
  HostSummary
} from '#types/cost.js';

function formatNumber( num: number ): string {
  return num.toLocaleString( 'en-US' );
}

function roundGaussian( n: number, d: number = 2 ): number {
  if ( !isFinite( n ) ) {
    return NaN;
  }
  const m = Math.pow( 10, d );
  const num = +( n * m ).toFixed( 8 );
  const i = Math.floor( num );
  const f = num - i;
  const e = 1e-8;
  const isHalf = f > 0.5 - e && f < 0.5 + e;
  const evenRound = i % 2 === 0 ? i : i + 1;
  const r = isHalf ? evenRound : Math.round( num );
  return r / m;
}

function formatCurrency( amount: number ): string {
  if ( amount < 0.01 ) {
    return `$${roundGaussian( amount, 4 ).toFixed( 4 )}`;
  }
  return `$${roundGaussian( amount, 2 ).toFixed( 2 )}`;
}

// The adjusted cell shows the costs.yml figure, annotated when it diverges from
// the as-charged cost (so the override is self-explaining).
function adjustedCell( adjusted: number, note?: string ): string {
  return formatCurrency( adjusted ) + ( note ? ` (${note})` : '' );
}

function pluralize( count: number, singular: string ): string {
  return count === 1 ? `1 ${singular}` : `${count} ${singular}s`;
}

export function parseCostData( report: CostReport ): ParsedCostData {
  const byModel: Record<string, {
    count: number; originalCost: number; adjustedCost: number; note?: string;
  }> = {};
  for ( const r of report.llmCalls ) {
    if ( !byModel[r.model] ) {
      byModel[r.model] = { count: 0, originalCost: 0, adjustedCost: 0, note: r.note };
    }
    byModel[r.model].count++;
    byModel[r.model].originalCost += r.originalCost;
    byModel[r.model].adjustedCost += r.adjustedCost;
    byModel[r.model].note ??= r.note;
  }

  const llmModels: LLMModelSummary[] = Object.entries( byModel )
    .sort( ( a, b ) => b[1].adjustedCost - a[1].adjustedCost )
    .map( ( [ model, s ] ) => ( {
      model, count: s.count, originalCost: s.originalCost, adjustedCost: s.adjustedCost, note: s.note
    } ) );

  const hosts: HostSummary[] = [ ...report.httpCosts ]
    .sort( ( a, b ) => b.adjustedTotalCost - a.adjustedTotalCost )
    .map( h => ( {
      host: h.host,
      callCount: h.calls.length,
      originalCost: h.originalTotalCost,
      adjustedCost: h.adjustedTotalCost
    } ) );

  const httpTotalCalls = hosts.reduce( ( sum, h ) => sum + h.callCount, 0 );

  return {
    traceFile: report.traceFile,
    workflowName: report.workflowName,
    duration: report.durationMs ? `${( report.durationMs / 1000 ).toFixed( 1 )}s` : 'N/A',

    llmModels,
    llmTotalCalls: report.llmCalls.length,
    llmOriginalCost: report.llmOriginalCost,
    llmAdjustedCost: report.llmAdjustedCost,

    hosts,
    httpTotalCalls,
    httpOriginalCost: report.httpOriginalCost,
    httpAdjustedCost: report.httpAdjustedCost,

    verbose: {
      hasReasoning: report.totalReasoningTokens > 0,
      hasCached: report.totalCachedTokens > 0
    },
    llmCalls: report.llmCalls,
    httpDetails: report.httpCosts,

    totalInputTokens: report.totalInputTokens,
    totalOutputTokens: report.totalOutputTokens,
    totalCachedTokens: report.totalCachedTokens,
    totalReasoningTokens: report.totalReasoningTokens,

    originalTotalCost: report.originalTotalCost,
    adjustedTotalCost: report.adjustedTotalCost,
    unconfiguredModels: report.unconfiguredModels,
    isEmpty: report.llmCalls.length === 0 && report.httpCosts.length === 0
  };
}

function formatSummary( data: ParsedCostData ): string {
  const lines: string[] = [];

  if ( data.llmModels.length > 0 ) {
    const table = new Table( {
      head: [ 'Model', 'Calls', 'Original', 'Adjusted' ],
      style: { head: [ 'cyan' ] },
      colAligns: [ 'left', 'right', 'right', 'right' ]
    } );

    for ( const m of data.llmModels ) {
      table.push( [
        m.model,
        pluralize( m.count, 'call' ),
        formatCurrency( m.originalCost ),
        adjustedCell( m.adjustedCost, m.note )
      ] );
    }

    table.push( [
      'Subtotal',
      pluralize( data.llmTotalCalls, 'call' ),
      formatCurrency( data.llmOriginalCost ),
      formatCurrency( data.llmAdjustedCost )
    ] );

    lines.push( 'LLM Costs:' );
    lines.push( table.toString() );
    lines.push( '' );
  }

  if ( data.hosts.length > 0 ) {
    const table = new Table( {
      head: [ 'Host', 'Calls', 'Original', 'Adjusted' ],
      style: { head: [ 'cyan' ] },
      colAligns: [ 'left', 'right', 'right', 'right' ]
    } );

    for ( const h of data.hosts ) {
      table.push( [
        h.host,
        pluralize( h.callCount, 'call' ),
        formatCurrency( h.originalCost ),
        formatCurrency( h.adjustedCost )
      ] );
    }

    table.push( [
      'Subtotal',
      pluralize( data.httpTotalCalls, 'call' ),
      formatCurrency( data.httpOriginalCost ),
      formatCurrency( data.httpAdjustedCost )
    ] );

    lines.push( 'API Costs:' );
    lines.push( table.toString() );
    lines.push( '' );
  }

  return lines.join( '\n' );
}

function formatVerbose( data: ParsedCostData ): string {
  const lines: string[] = [];

  if ( data.llmCalls.length > 0 ) {
    const head = [ 'Step', 'Model', 'Input', 'Output' ];
    const colAligns: Array<'left' | 'right'> = [ 'left', 'left', 'right', 'right' ];

    if ( data.verbose.hasCached ) {
      head.push( 'Cached' );
      colAligns.push( 'right' );
    }
    if ( data.verbose.hasReasoning ) {
      head.push( 'Reasoning' );
      colAligns.push( 'right' );
    }
    head.push( 'Original', 'Adjusted' );
    colAligns.push( 'right', 'right' );

    const table = new Table( {
      head,
      style: { head: [ 'cyan' ] },
      colAligns
    } );

    for ( const r of data.llmCalls ) {
      const row: string[] = [
        r.step,
        r.model,
        formatNumber( r.input ),
        formatNumber( r.output )
      ];
      if ( data.verbose.hasCached ) {
        row.push( formatNumber( r.cached ) );
      }
      if ( data.verbose.hasReasoning ) {
        row.push( formatNumber( r.reasoning ) );
      }
      row.push( formatCurrency( r.originalCost ), adjustedCell( r.adjustedCost, r.note ) );
      table.push( row );
    }

    const totalRow: string[] = [
      'Subtotal',
      '',
      formatNumber( data.totalInputTokens ),
      formatNumber( data.totalOutputTokens )
    ];
    if ( data.verbose.hasCached ) {
      totalRow.push( formatNumber( data.totalCachedTokens ) );
    }
    if ( data.verbose.hasReasoning ) {
      totalRow.push( formatNumber( data.totalReasoningTokens ) );
    }
    totalRow.push( formatCurrency( data.llmOriginalCost ), formatCurrency( data.llmAdjustedCost ) );
    table.push( totalRow );

    lines.push( 'LLM Calls:' );
    lines.push( table.toString() );
    lines.push( '' );
  }

  if ( data.httpDetails.length > 0 ) {
    const table = new Table( {
      head: [ 'Host', 'Step', 'Usage', 'Original', 'Adjusted' ],
      style: { head: [ 'cyan' ] },
      colAligns: [ 'left', 'left', 'right', 'right', 'right' ]
    } );

    for ( const host of data.httpDetails ) {
      for ( const call of host.calls ) {
        table.push( [
          host.host,
          call.step,
          call.usage,
          formatCurrency( call.originalCost ),
          adjustedCell( call.adjustedCost, call.note )
        ] );
      }
    }

    table.push( [
      'Subtotal', '', '',
      formatCurrency( data.httpOriginalCost ),
      formatCurrency( data.httpAdjustedCost )
    ] );

    lines.push( 'API Calls:' );
    lines.push( table.toString() );
    lines.push( '' );
  }

  return lines.join( '\n' );
}

export function formatCostReport( report: CostReport, options: { verbose?: boolean } = {} ): string {
  const data = parseCostData( report );
  const lines: string[] = [];

  lines.push( '' );
  lines.push( `Trace: ${data.traceFile}` );
  lines.push( `Workflow: ${data.workflowName}` );
  lines.push( `Duration: ${data.duration}` );
  lines.push( '' );

  if ( options.verbose ) {
    lines.push( formatVerbose( data ) );
  } else {
    lines.push( formatSummary( data ) );
  }

  if ( !data.isEmpty ) {
    const totalTable = new Table( {
      style: { head: [] },
      colAligns: [ 'left', 'right' ],
      colWidths: [ 36, 12 ]
    } );
    totalTable.push( [ 'TOTAL ESTIMATED COST (adjusted)', formatCurrency( data.adjustedTotalCost ) ] );
    totalTable.push( [ 'As-charged (from trace)', formatCurrency( data.originalTotalCost ) ] );
    lines.push( totalTable.toString() );
  }

  if ( data.unconfiguredModels.length > 0 ) {
    lines.push( '' );
    lines.push(
      `Note: no costs.yml override for: ${data.unconfiguredModels.join( ', ' )} ` +
      '— shown at the as-charged cost from the trace.'
    );
  }

  if ( data.isEmpty ) {
    lines.push( 'No billable calls found in trace.' );
  }

  lines.push( '' );

  return lines.join( '\n' );
}
