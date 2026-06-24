import { afterEach, describe, expect, it, vi } from 'vitest';

const LEVEL = Symbol.for( 'level' );
const MESSAGE = Symbol.for( 'message' );

vi.mock( '#utils', () => ( {
  isPlainObject: v => Object.prototype.toString.call( v ) === '[object Object]',
  shuffleArray: v => v
} ) );

const loadDevelopmentLogger = async () => {
  vi.resetModules();
  return import( './development.js' );
};

describe( 'logger/development', () => {
  afterEach( () => {
    vi.unstubAllEnvs();
  } );

  describe( 'formatJson', () => {
    it( 'formats nested plain objects and arrays', async () => {
      const { formatJson } = await loadDevelopmentLogger();

      expect( formatJson( {
        name: 'foo',
        count: 5,
        nested: { ok: true },
        list: [ 1, 'two', { three: 3 } ]
      } ) ).toBe( '{ name: "foo", count: 5, nested: { ok: true }, list: [ 1, "two", { three: 3 } ] }' );
    } );

    it( 'formats empty objects and arrays', async () => {
      const { formatJson } = await loadDevelopmentLogger();

      expect( formatJson( { emptyObject: {}, emptyArray: [] } ) ).toBe( '{ emptyObject: {}, emptyArray: [] }' );
    } );

    it( 'escapes string values', async () => {
      const { formatJson } = await loadDevelopmentLogger();

      expect( formatJson( { quote: 'hello "world"' } ) ).toBe( '{ quote: "hello \\"world\\"" }' );
    } );
  } );

  describe( 'options.format', () => {
    it( 'uses debug level by default', async () => {
      const { options } = await loadDevelopmentLogger();

      expect( options.level ).toBe( 'debug' );
    } );

    it( 'uses OUTPUT_LOG_LEVEL when configured', async () => {
      vi.stubEnv( 'OUTPUT_LOG_LEVEL', 'http' );
      const { options } = await loadDevelopmentLogger();

      expect( options.level ).toBe( 'http' );
    } );

    it( 'formats level, namespace, message, and metadata fields', async () => {
      const { options } = await loadDevelopmentLogger();
      const info = options.format.transform( {
        [LEVEL]: 'info',
        level: 'info',
        message: 'Worker',
        namespace: 'Telemetry',
        status: { runState: 'RUNNING' },
        memory: { heapUsed: 123 }
      } );

      expect( info[MESSAGE] ).toMatch( /^\[\x1b\[[\d;]+minfo\x1b\[[\d;]+m\] \x1b\[38;5;033mTelemetry: Worker\x1b\[0m /u );
      expect( info[MESSAGE] ).toContain( '{ status: { runState: "RUNNING" }, memory: { heapUsed: 123 } }' );
    } );

    it( 'does not append metadata text when only namespace is present', async () => {
      const { options } = await loadDevelopmentLogger();
      const info = options.format.transform( {
        [LEVEL]: 'debug',
        level: 'debug',
        message: 'Loading config...',
        namespace: 'Worker'
      } );

      expect( info[MESSAGE] ).toMatch( /^\[\x1b\[[\d;]+mdebug\x1b\[[\d;]+m\] \x1b\[38;5;033mWorker: Loading config\.\.\.\x1b\[0m$/u );
    } );
  } );
} );
