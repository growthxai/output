import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import { existsSync, writeFileSync } from 'fs';

const CLI = './sdk/cli/bin/run.js';
const COMPOSE_FILE = './sdk/cli/dist/assets/docker/docker-compose-dev.yml';

process.env.OUTPUT_API_URL = 'http://localhost:3001';
process.env.OUTPUT_API_VERSION = 'dev';
process.env.OUTPUT_WORKFLOWS_DIR = 'test_workflows';

const sleep = ms => new Promise( resolve => setTimeout( resolve, ms ) );

const dockerComposeDown = () => {
  try {
    execSync(
      `docker compose -f ${COMPOSE_FILE} --project-directory ${process.cwd()} down -v --remove-orphans`,
      { stdio: 'inherit' }
    );
  } catch { /* best-effort cleanup */ }
};

const waitForWorkflowList = async ( maxAttempts = 200 ) => {
  for ( const attempt of Array.from( { length: maxAttempts }, ( _, i ) => i ) ) {
    try {
      execSync( `${CLI} workflow list`, { stdio: 'pipe' } );
      return attempt;
    } catch { /* not ready yet */ }
    await sleep( 3000 );
  }
  try {
    execSync(
      `docker compose -f ${COMPOSE_FILE} --project-directory ${process.cwd()} logs worker --tail 200`,
      { stdio: 'inherit' }
    );
  } catch { /* ignore log errors */ }
  throw new Error( `Worker did not connect after ${maxAttempts * 3}s` );
};

describe( 'CLI dev workflow system integration', () => {
  beforeAll( async () => {
    if ( !existsSync( 'test_workflows/.env' ) ) {
      writeFileSync( 'test_workflows/.env', 'ANTHROPIC_API_KEY=dummy\nOPENAI_API_KEY=dummy\n' );
    }

    const buildCmd = [
      'docker run --rm',
      `-v "${process.cwd()}:/app"`,
      '-e COREPACK_ENABLE_DOWNLOAD_PROMPT=0',
      '-e CI=1',
      '-w /app',
      'node:24.13.0-slim',
      'sh -c "corepack enable && pnpm install --frozen-lockfile && npm run build:packages"'
    ].join( ' ' );
    execSync( buildCmd, { stdio: 'inherit' } );

    execSync( 'npm run dev:build:api', { stdio: 'inherit' } );

    execSync( `${CLI} dev --detached --image-pull-policy missing`, { stdio: 'inherit' } );

    const attempts = await waitForWorkflowList();
    console.log( `Worker connected and catalog available (after ${attempts * 3}s)` );
  }, 600_000 );

  afterAll( dockerComposeDown );

  it( 'runs the simple workflow and returns result=15', () => {
    const output = execSync(
      `${CLI} workflow run simple --input '{"values":[1,2,3,4,5]}' --format json`,
      { encoding: 'utf8' }
    );
    const jsonLine = output.split( '\n' ).find( l => l.trimStart().startsWith( '{' ) );
    const result = JSON.parse( jsonLine ).output.result;
    expect( result ).toBe( 15 );
  }, 30_000 );
} );
