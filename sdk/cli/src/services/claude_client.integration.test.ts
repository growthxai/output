import { describe, it, expect, beforeEach } from 'vitest';
import { invokePlanWorkflow } from './claude_client.js';
import { query } from '@anthropic-ai/claude-agent-sdk';

describe( 'invokePlanWorkflow - Integration Tests', () => {
  beforeEach( () => {
    // Ensure API key is set
    if ( !process.env.ANTHROPIC_API_KEY ) {
      throw new Error( 'ANTHROPIC_API_KEY must be set for integration tests' );
    }
  } );

  it( 'should debug actual message format from Claude Agent SDK', async () => {
    const description = 'Simple test workflow that takes a number and returns it doubled';

    console.log( '\n===== DEBUGGING ACTUAL MESSAGE FORMAT =====' );
    console.log( 'Description:', description );

    const messages: unknown[] = [];

    try {
      for await ( const message of query( {
        prompt: `/outputai:plan_workflow ${description}`,
        options: { maxTurns: 1 }
      } ) ) {
        console.log( '\nReceived message:', JSON.stringify( message, null, 2 ) );
        messages.push( message );
      }
    } catch ( error ) {
      console.error( 'Error during query:', error );
      throw error;
    }

    console.log( `\nTotal messages received: ${messages.length}` );
    console.log( '===== END DEBUG =====' );

    // This test is just for debugging - we expect messages
    expect( messages.length ).toBeGreaterThan( 0 );
  }, 60000 ); // 60 second timeout

  it( 'should successfully invoke /outputai:plan_workflow slash command and return content', async () => {
    const description = 'Simple workflow that takes a number and doubles it';

    const result = await invokePlanWorkflow( description );

    console.log( '\n===== PLAN RESULT =====' );
    console.log( result );
    console.log( '===== END RESULT =====' );

    expect( result ).toBeTruthy();
    expect( result.length ).toBeGreaterThan( 0 );
  }, 60000 ); // 60 second timeout
} );
