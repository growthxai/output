import { describe, expect, it, vi } from 'vitest';

vi.mock( 'ai', () => ( {
  tool: def => def
} ) );

import { buildLoadSkillTool } from './tools.js';

const skills = [
  { name: 'writer', description: 'Writes copy', instructions: '# Writer\nDo it.' },
  { name: 'reviewer', description: 'Reviews drafts', instructions: 'Review carefully.' }
];

describe( 'buildLoadSkillTool', () => {
  it( 'returns a tool that loads instructions by skill name', () => {
    const tool = buildLoadSkillTool( skills );

    expect( tool.description ).toBe( 'Get detailed instructions for a named skill' );
    expect( tool.execute( { name: 'writer' } ) ).toBe( '# Writer\nDo it.' );
    expect( tool.execute( { name: 'reviewer' } ) ).toBe( 'Review carefully.' );
  } );

  it( 'returns available skill names when the name is unknown', () => {
    const tool = buildLoadSkillTool( skills );

    expect( tool.execute( { name: 'missing' } ) ).toBe(
      'Skill "missing" not found. Available: writer, reviewer'
    );
  } );

  it( 'lists no names when the catalog is empty', () => {
    const tool = buildLoadSkillTool( [] );

    expect( tool.execute( { name: 'writer' } ) ).toBe( 'Skill "writer" not found. Available: ' );
  } );
} );
