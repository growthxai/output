/**
 * @typedef {object} NodeEntry
 * @property {string} id
 * @property {string} kind
 * @property {string} name
 * @property {number} startedAt
 * @property {number} endedAt
 * @property {object} [input]
 * @property {object} [output]
 * @property {object} [error]
 * @property {NodeTree[]} children
 */
/**
 * Create a node entry for the tree.
 *
 * Properties are sorted the way they should be in the final file, as this makes it easier to read.
 *
 * @param {string} id - Node id
 * @returns {NodeEntry} The entry without any values
 */
const createEntry = id => ( {
  id,
  kind: '',
  name: '',
  startedAt: 0,
  endedAt: null,
  input: undefined,
  output: undefined,
  error: undefined,
  children: []
} );

/**
 * Build a tree of nodes from a list of entries
 *
 * Each node will have: id, name, kind, children, input, output or error, startedAt, endedAt.
 *
 * Entries with same id will be combined according to their phase (start, end OR error).
 * - The details of the start phase becomes input, timestamp becomes startedAt;
 * - The details of the end phase become output, timestamp becomes endedAt;
 * - The details of the error phase become error, timestamp becomes endedAt;
 * - Only start phase's kind and name are used;
 *
 *
 * Children are added according to the parentId of each entry.
 * The result tree has a single root: the only node without parentId, normally the workflow itself.
 *
 * @param {object[]} entries - The list of entries
 * @returns {object}
 */
export default entries => {
  const nodes = new Map();
  const ensureNode = id => nodes.get( id ) ?? nodes.set( id, createEntry( id ) ).get( id );

  for ( const entry of entries ) {
    const { kind, id, name, parentId, details, phase, timestamp } = entry;
    const node = ensureNode( id );

    if ( phase === 'start' ) {
      Object.assign( node, { input: details, startedAt: timestamp, kind, name } );
    } else if ( phase === 'end' ) {
      Object.assign( node, { output: details, endedAt: timestamp } );
    } else if ( phase === 'error' ) {
      Object.assign( node, { error: details, endedAt: timestamp } );
    }

    if ( parentId && phase === 'start' ) {
      const parent = ensureNode( parentId );
      parent.children.push( node );
      parent.children.sort( ( a, b ) => a.startedAt - b.startedAt );
    }
  }

  const rootNode = nodes.get( entries.find( e => !e.parentId )?.id );
  if ( !rootNode ) {
    return null;
  }
  if ( !rootNode.endedAt ) {
    rootNode.output = '<<Workflow did not finish yet. If this workflows is supposed to have been completed already, \
this can indicate it timed out or was interrupted.>>';
  }
  return rootNode;
};
