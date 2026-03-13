import Table from 'cli-table3';
import { ux } from '@oclif/core';
import { formatOutput } from '#utils/output_formatter.js';
import { formatDuration } from '#utils/date_formatter.js';
import { getErrorMessage } from '#utils/error_utils.js';
import type {
  TraceDetails,
  TraceEvent,
  DebugNode,
  TraceStructure,
  NodeInfo
} from '#types/trace.js';
import { isTraceEvent, isValidTimestamp } from '#types/trace.js';

export { formatDuration };

const TRUNCATION = {
  SHORT: 50,
  STANDARD: 120,
  SUFFIX: '...',
  SUFFIX_VERBOSE: '... (truncated)'
} as const;

const TREE_CHARS = {
  BRANCH: '├─ ',
  LAST: '└─ ',
  VERTICAL: '│  ',
  SPACE: '   ',
  DETAIL_BRANCH: '│    ',
  DETAIL_LAST: '     '
} as const;

const HEADER_DIVIDER = '═'.repeat( 60 ) as string;

const colors = {
  workflowHeader: ( text: string ): string => ux.colorize( 'bold', ux.colorize( 'cyan', text ) ),
  stepHeader: ( text: string ): string => ux.colorize( 'yellow', text ),
  internalStep: ( text: string ): string => ux.colorize( 'dim', text ),
  label: ( text: string ): string => ux.colorize( 'blue', text ),
  error: ( text: string ): string => ux.colorize( 'red', text ),
  success: ( text: string ): string => ux.colorize( 'green', text )
};

const truncate = (
  value: unknown,
  maxLength: number = TRUNCATION.STANDARD,
  suffix: string = TRUNCATION.SUFFIX_VERBOSE,
  recursive: boolean = false
): unknown => {
  if ( value === null || value === undefined ) {
    return value;
  }

  if ( typeof value === 'string' ) {
    if ( value.length <= maxLength ) {
      return value;
    }
    return `${value.substring( 0, maxLength )}${suffix}`;
  }

  if ( typeof value === 'number' || typeof value === 'boolean' ) {
    if ( recursive ) {
      return value;
    }
    return String( value );
  }

  if ( !recursive ) {
    const str = JSON.stringify( value );
    if ( str.length <= maxLength ) {
      return str;
    }
    return `${str.substring( 0, maxLength )}${suffix}`;
  }

  if ( Array.isArray( value ) ) {
    return value.map( item => truncate( item, maxLength, suffix, true ) );
  }

  if ( typeof value === 'object' ) {
    return Object.fromEntries(
      Object.entries( value ).map( ( [ k, v ] ) => [ k, truncate( v, maxLength, suffix, true ) ] )
    );
  }

  return value;
};

const truncateShort = ( value: unknown ): string => {
  return truncate( value, TRUNCATION.SHORT, TRUNCATION.SUFFIX, false ) as string;
};

const truncateRecursive = ( value: unknown ): unknown => {
  return truncate( value, TRUNCATION.STANDARD, TRUNCATION.SUFFIX_VERBOSE, true );
};

const formatPhase = ( phase: string ): string => {
  const phaseMap: Record<string, string> = {
    start: '[START]',
    end: '[END]',
    error: '[ERROR]'
  };
  return phaseMap[phase] ?? phase;
};

const getNodeName = ( node: DebugNode ): string => {
  return node.name || node.workflowName || node.stepName || node.activityName || '';
};

const getNodeKind = ( node: DebugNode ): string => {
  return node.kind || node.type || '';
};

const getEventName = ( event: TraceEvent ): string => {
  const { kind, workflowName, details } = event;
  if ( kind === 'workflow' ) {
    return `Workflow: ${workflowName}`;
  }
  if ( kind === 'activity' ) {
    return `Activity: ${details?.activityName || 'unknown'}`;
  }
  if ( kind === 'step' ) {
    return `Step: ${details?.stepName || details?.name || 'unknown'}`;
  }
  return kind || 'Unknown Event';
};

const colorizeByKind = ( kind: string, text: string ): string => {
  if ( kind === 'workflow' ) {
    return colors.workflowHeader( text );
  }
  if ( kind === 'internal_step' ) {
    return colors.internalStep( text );
  }
  if ( kind === 'step' || kind === 'activity' ) {
    return colors.stepHeader( text );
  }
  return text;
};

const getStatusIndicator = ( node: DebugNode ): string => {
  if ( node.phase === 'error' || node.status === 'failed' ) {
    return colors.error( '[FAILED]' );
  }
  if ( node.phase === 'end' || node.status === 'completed' ) {
    return colors.success( '[COMPLETED]' );
  }
  if ( node.status === 'running' ) {
    return colors.label( '[RUNNING]' );
  }
  return '';
};

const getDebugNodeInfo = ( node: unknown ): string => {
  if ( typeof node === 'string' ) {
    return node;
  }
  if ( typeof node !== 'object' || node === null ) {
    return String( node );
  }

  const debugNode = node as DebugNode;
  const kind = getNodeKind( debugNode );
  const name = getNodeName( debugNode );
  const status = getStatusIndicator( debugNode );

  const parts: string[] = [];
  if ( kind ) {
    parts.push( colorizeByKind( kind, `[${kind}]` ) );
  }
  if ( name ) {
    parts.push( colorizeByKind( kind, name ) );
  }
  if ( status ) {
    parts.push( status );
  }

  if ( parts.length === 0 ) {
    const keys = Object.keys( debugNode ).filter( k => k !== 'children' && k !== 'parent' );
    if ( keys.length > 0 ) {
      return `Node {${keys.slice( 0, 3 ).join( ', ' )}${keys.length > 3 ? ', ...' : ''}}`;
    }
    return 'Node';
  }

  return parts.join( ' ' );
};

const extractNodeInfo = ( node: TraceEvent | DebugNode ): NodeInfo => {
  if ( isTraceEvent( node ) ) {
    return {
      name: getEventName( node ),
      phase: formatPhase( node.phase ),
      duration: node.duration ? ` (${formatDuration( node.duration )})` : ''
    };
  }
  return {
    name: getDebugNodeInfo( node ),
    phase: node.phase ? formatPhase( node.phase ) : '',
    duration: node.duration ? ` (${formatDuration( node.duration )})` : ''
  };
};

const formatDetails = ( details: TraceDetails | undefined ): string => {
  if ( !details ) {
    return '-';
  }
  if ( typeof details === 'string' ) {
    return details;
  }

  const info: string[] = [];
  if ( details.input ) {
    info.push( `Input: ${truncateShort( details.input )}` );
  }
  if ( details.output ) {
    info.push( `Output: ${truncateShort( details.output )}` );
  }
  if ( details.activityName ) {
    info.push( `Activity: ${details.activityName}` );
  }
  if ( details.stepName || details.name ) {
    info.push( `Step: ${details.stepName || details.name}` );
  }

  if ( info.length > 0 ) {
    return info.join( ', ' );
  }
  return truncateShort( details );
};

const formatTreeDetails = ( details: TraceDetails | Record<string, unknown>, depth: number ): string[] => {
  const indent = '  '.repeat( depth );
  const lines: string[] = [];
  if ( details.input !== null && details.input !== undefined ) {
    lines.push( `${indent}Input: ${truncateShort( details.input )}` );
  }
  if ( details.output !== null && details.output !== undefined ) {
    lines.push( `${indent}Output: ${truncateShort( details.output )}` );
  }
  return lines;
};

const formatValueWithIndent = ( value: unknown, indentPrefix: string ): string => {
  if ( value === null || value === undefined ) {
    return String( value );
  }
  if ( typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ) {
    return truncate( value, TRUNCATION.STANDARD, TRUNCATION.SUFFIX_VERBOSE, false ) as string;
  }

  const truncated = truncateRecursive( value );
  const jsonStr = JSON.stringify( truncated, null, 2 );
  const lines = jsonStr.split( '\n' );

  if ( lines.length <= 1 ) {
    return jsonStr;
  }
  return lines.map( ( line, i ) => {
    if ( i === 0 ) {
      return line;
    }
    return indentPrefix + line;
  } ).join( '\n' );
};

const formatHeader = ( root: TraceEvent | DebugNode ): string => {
  const isTrace = isTraceEvent( root );
  const debugRoot = root as DebugNode;

  const workflowName = isTrace ? root.workflowName : ( getNodeName( debugRoot ) || 'Unknown' );
  const workflowId = isTrace ? root.workflowId : 'N/A';
  const timestamp = isTrace ? root.timestamp : debugRoot.startTime;
  const phase = isTrace ? root.phase : debugRoot.phase;
  const status = !isTrace ? debugRoot.status : undefined;

  const lines = [
    HEADER_DIVIDER,
    `Workflow: ${workflowName}`,
    `Workflow ID: ${workflowId}`
  ];

  if ( isValidTimestamp( timestamp ) ) {
    lines.push( `Start Time: ${new Date( timestamp ).toISOString()}` );
  }

  if ( root.duration ) {
    lines.push( `Duration: ${formatDuration( root.duration )}` );
  }

  if ( ( phase === 'error' || status === 'failed' ) && root.error ) {
    lines.push( 'Status: Failed', `Error: ${getErrorMessage( root.error )}` );
  } else if ( phase === 'end' || status === 'completed' ) {
    lines.push( 'Status: Completed' );
  } else {
    lines.push( 'Status: In Progress' );
  }

  lines.push( HEADER_DIVIDER );
  return lines.join( '\n' );
};

const formatEventsTable = ( events: TraceEvent[] ): string => {
  const table = new Table( {
    head: [ 'Time', 'Event', 'Phase', 'Duration', 'Details' ],
    style: { head: [ 'cyan' ] },
    colWidths: [ 20, 25, 10, 12, null ],
    wordWrap: true
  } );

  for ( const event of events ) {
    table.push( [
      new Date( event.timestamp ).toISOString().substring( 11, 23 ),
      getEventName( event ),
      formatPhase( event.phase ),
      event.duration ? formatDuration( event.duration ) : '-',
      formatDetails( event.details )
    ] );
  }

  return table.toString();
};

const formatTree = ( node: TraceEvent | DebugNode, depth: number ): string[] => {
  const indent = '  '.repeat( depth );
  const marker = depth === 0 ? '' : TREE_CHARS.BRANCH;
  const info = extractNodeInfo( node );

  const lines = [ `${indent}${marker} ${info.name} ${info.phase}${info.duration}` ];

  if ( node.error ) {
    lines.push( `${indent}   ${TREE_CHARS.LAST.trim()} ERROR: ${getErrorMessage( node.error )}` );
  }

  if ( node.details && typeof node.details === 'object' ) {
    lines.push( ...formatTreeDetails( node.details, depth + 1 ) );
  }

  if ( node.children && node.children.length > 0 ) {
    for ( const child of node.children ) {
      lines.push( ...formatTree( child, depth + 1 ) );
    }
  }

  return lines;
};

const getDebugNodeDetails = ( node: DebugNode, prefix: string ): string[] => {
  if ( typeof node !== 'object' || node === null ) {
    return [];
  }

  const details: string[] = [];
  const startedAt = node.startedAt || node.timestamp;
  const inputIndentPrefix = prefix + ' '.repeat( 7 );
  const outputIndentPrefix = prefix + ' '.repeat( 8 );

  if ( isValidTimestamp( startedAt ) ) {
    const startDate = new Date( startedAt );
    if ( !isNaN( startDate.getTime() ) ) {
      details.push( `${prefix}${colors.label( 'Started:' )} ${startDate.toISOString()}` );
    }
  }

  if ( isValidTimestamp( node.endedAt ) ) {
    const endDate = new Date( node.endedAt );
    if ( !isNaN( endDate.getTime() ) ) {
      details.push( `${prefix}${colors.label( 'Ended:' )}   ${endDate.toISOString()}` );
    }
  }

  if ( typeof node.startedAt === 'number' && typeof node.endedAt === 'number' ) {
    details.push( `${prefix}${colors.label( 'Duration:' )} ${formatDuration( node.endedAt - node.startedAt )}` );
  } else if ( node.duration ) {
    details.push( `${prefix}${colors.label( 'Duration:' )} ${formatDuration( node.duration )}` );
  }

  if ( node.input !== null && node.input !== undefined ) {
    details.push( `${prefix}${colors.label( 'Input:' )} ${formatValueWithIndent( node.input, inputIndentPrefix )}` );
  }

  if ( node.output !== null && node.output !== undefined ) {
    details.push( `${prefix}${colors.label( 'Output:' )} ${formatValueWithIndent( node.output, outputIndentPrefix )}` );
  }

  if ( node.error ) {
    details.push( `${prefix}${colors.error( 'Error:' )} ${colors.error( getErrorMessage( node.error ) )}` );
  }

  if ( details.length > 0 ) {
    details.push( '' );
  }

  return details;
};

const buildDebugTreeLines = ( node: unknown, depth: number, isLast: boolean, prefix: string ): string[] => {
  if ( node === null || node === undefined ) {
    return [];
  }

  const isRoot = depth === 0;
  const getConnector = (): string => {
    if ( isRoot ) {
      return '';
    }
    return isLast ? TREE_CHARS.LAST : TREE_CHARS.BRANCH;
  };
  const connector = getConnector();
  const indent = isRoot ? '' : prefix + connector;

  const lines = [ indent + getDebugNodeInfo( node ) ];

  const detailPrefix = isRoot ? '  ' : prefix + ( isLast ? TREE_CHARS.DETAIL_LAST : TREE_CHARS.DETAIL_BRANCH );
  if ( typeof node === 'object' && node !== null ) {
    lines.push( ...getDebugNodeDetails( node as DebugNode, detailPrefix ) );
  }

  const childPrefix = isRoot ? '' : prefix + ( isLast ? TREE_CHARS.SPACE : TREE_CHARS.VERTICAL );
  if ( typeof node === 'object' && node !== null ) {
    const debugNode = node as DebugNode;
    if ( Array.isArray( debugNode.children ) ) {
      debugNode.children.forEach( ( child, i ) => {
        const isLastChild = i === debugNode.children!.length - 1;
        lines.push( ...buildDebugTreeLines( child, depth + 1, isLastChild, childPrefix ) );
      } );
    }
  }

  return lines;
};

const formatAsText = ( trace: TraceStructure ): string => {
  const output: string[] = [];

  if ( trace.root ) {
    output.push( formatHeader( trace.root ), '' );
  }

  if ( trace.events && trace.events.length > 0 ) {
    output.push( 'Execution Timeline:', formatEventsTable( trace.events ), '' );
  }

  if ( trace.root ) {
    output.push( 'Execution Tree:', ...formatTree( trace.root, 0 ) );
  }

  return output.join( '\n' );
};

export function format( traceData: string | object, outputFormat: 'json' | 'text' = 'text' ): string {
  const trace = typeof traceData === 'string' ? JSON.parse( traceData ) : traceData;
  if ( outputFormat === 'json' ) {
    return formatOutput( trace, 'json' );
  }
  return formatAsText( trace );
}

export function getSummary( traceData: string | object ): {
  totalDuration: number;
  totalEvents: number;
  totalSteps: number;
  totalActivities: number;
  hasErrors: boolean;
} {
  const trace = typeof traceData === 'string' ? JSON.parse( traceData ) : traceData;

  const stats = {
    totalDuration: trace.root?.duration || 0,
    totalEvents: trace.events?.length || 0,
    totalSteps: 0,
    totalActivities: 0,
    hasErrors: false
  };

  if ( trace.events ) {
    for ( const event of trace.events ) {
      if ( event.kind === 'step' ) {
        stats.totalSteps++;
      }
      if ( event.kind === 'activity' ) {
        stats.totalActivities++;
      }
      if ( event.phase === 'error' ) {
        stats.hasErrors = true;
      }
    }
  }

  return stats;
}

export function displayDebugTree( node: unknown ): string {
  return buildDebugTreeLines( node, 0, false, '' ).join( '\n' );
}
