import Table from 'cli-table3';
import type {
  CostReport,
  ParsedCostData,
  LLMModelSummary,
  ServiceSummary
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

function pluralize( count: number, singular: string ): string {
  return count === 1 ? `1 ${singular}` : `${count} ${singular}s`;
}

export function parseCostData( report: CostReport ): ParsedCostData {
  const byModel: Record<string, { count: number; cost: number }> = {};
  for ( const r of report.llmCalls ) {
    if ( !byModel[r.model] ) {
      byModel[r.model] = { count: 0, cost: 0 };
    }
    byModel[r.model].count++;
    byModel[r.model].cost += r.cost;
  }

  const llmModels: LLMModelSummary[] = Object.entries( byModel )
    .sort( ( a, b ) => b[1].cost - a[1].cost )
    .map( ( [ model, stats ] ) => ( { model, count: stats.count, cost: stats.cost } ) );

  const services: ServiceSummary[] = [ ...report.services ]
    .sort( ( a, b ) => b.totalCost - a.totalCost )
    .map( s => ( { serviceName: s.serviceName, callCount: s.calls.length, cost: s.totalCost } ) );

  const serviceTotalCalls = services.reduce( ( sum, s ) => sum + s.callCount, 0 );

  return {
    traceFile: report.traceFile,
    workflowName: report.workflowName,
    duration: report.durationMs ? `${( report.durationMs / 1000 ).toFixed( 1 )}s` : 'N/A',

    llmModels,
    llmTotalCalls: report.llmCalls.length,
    llmTotalCost: report.llmTotalCost,

    services,
    serviceTotalCalls,
    serviceTotalCost: report.serviceTotalCost,

    verbose: {
      hasReasoning: report.totalReasoningTokens > 0,
      hasCached: report.totalCachedTokens > 0
    },
    llmCalls: report.llmCalls,
    serviceDetails: report.services,

    totalInputTokens: report.totalInputTokens,
    totalOutputTokens: report.totalOutputTokens,
    totalCachedTokens: report.totalCachedTokens,
    totalReasoningTokens: report.totalReasoningTokens,

    totalCost: report.totalCost,
    unknownModels: report.unknownModels,
    isEmpty: report.llmCalls.length === 0 && report.services.length === 0
  };
}

function formatSummary( data: ParsedCostData ): string {
  const lines: string[] = [];

  if ( data.llmModels.length > 0 ) {
    const table = new Table( {
      head: [ 'Model', 'Calls', 'Cost' ],
      style: { head: [ 'cyan' ] },
      colAligns: [ 'left', 'right', 'right' ]
    } );

    for ( const m of data.llmModels ) {
      table.push( [ m.model, pluralize( m.count, 'call' ), formatCurrency( m.cost ) ] );
    }

    table.push( [
      'Subtotal',
      pluralize( data.llmTotalCalls, 'call' ),
      formatCurrency( data.llmTotalCost )
    ] );

    lines.push( 'LLM Costs:' );
    lines.push( table.toString() );
    lines.push( '' );
  }

  if ( data.services.length > 0 ) {
    const table = new Table( {
      head: [ 'Service', 'Calls', 'Cost' ],
      style: { head: [ 'cyan' ] },
      colAligns: [ 'left', 'right', 'right' ]
    } );

    for ( const s of data.services ) {
      table.push( [ s.serviceName, pluralize( s.callCount, 'call' ), formatCurrency( s.cost ) ] );
    }

    table.push( [
      'Subtotal',
      pluralize( data.serviceTotalCalls, 'call' ),
      formatCurrency( data.serviceTotalCost )
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
    head.push( 'Cost' );
    colAligns.push( 'right' );

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
      row.push( formatCurrency( r.cost ) + ( r.warning ? ` (${r.warning})` : '' ) );
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
    totalRow.push( formatCurrency( data.llmTotalCost ) );
    table.push( totalRow );

    lines.push( 'LLM Calls:' );
    lines.push( table.toString() );
    lines.push( '' );
  }

  if ( data.serviceDetails.length > 0 ) {
    const table = new Table( {
      head: [ 'Service', 'Step', 'Usage', 'Cost' ],
      style: { head: [ 'cyan' ] },
      colAligns: [ 'left', 'left', 'right', 'right' ]
    } );

    for ( const service of data.serviceDetails ) {
      for ( const call of service.calls ) {
        table.push( [
          service.serviceName,
          call.step,
          call.usage,
          formatCurrency( call.cost )
        ] );
      }
    }

    table.push( [ 'Subtotal', '', '', formatCurrency( data.serviceTotalCost ) ] );

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
    totalTable.push( [ 'TOTAL ESTIMATED COST', formatCurrency( data.totalCost ) ] );
    lines.push( totalTable.toString() );
  }

  if ( data.unknownModels.length > 0 ) {
    lines.push( '' );
    lines.push(
      `Warning: Unknown models (add to config/costs.yml): ${data.unknownModels.join( ', ' )}`
    );
  }

  if ( data.isEmpty ) {
    lines.push( 'No billable calls found in trace.' );
  }

  lines.push( '' );

  return lines.join( '\n' );
}
