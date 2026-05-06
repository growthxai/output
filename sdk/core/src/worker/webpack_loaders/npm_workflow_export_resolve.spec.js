import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parse } from './tools.js';
import {
  isBareNpmSpecifier,
  resolveBareImportSpecifiersAsWorkflows,
  resolveBareDestructuredRequireAsWorkflows,
  resolveBareDefaultRequireAsWorkflow
} from './npm_workflow_export_resolve.js';

/**
 * @param {(dir: string) => void} fn
 */
const withTempProjectDir = fn => {
  const dir = mkdtempSync( join( tmpdir(), 'npm-resolve-' ) );
  try {
    fn( dir );
  } finally {
    rmSync( dir, { recursive: true, force: true } );
  }
};

/**
 * @param {string} source - Single import declaration source line (no newline required).
 * @returns {import('@babel/types').ImportDeclaration['specifiers']}
 */
const importSpecifiersFromSource = source => {
  const ast = parse( `${source}\n`, 'stub.js' );
  const decl = ast.program.body[0];
  if ( decl.type !== 'ImportDeclaration' ) {
    throw new Error( 'expected ImportDeclaration' );
  }
  return decl.specifiers;
};

/**
 * @param {string} source - `const { ... } = require('...');`
 */
const destructuredRequirePropertiesFromSource = source => {
  const ast = parse( `${source}\n`, 'stub.js' );
  const stmt = ast.program.body[0];
  if ( stmt.type !== 'VariableDeclaration' || !stmt.declarations[0] ) {
    throw new Error( 'expected VariableDeclaration' );
  }
  const pat = stmt.declarations[0].id;
  if ( pat.type !== 'ObjectPattern' ) {
    throw new Error( 'expected ObjectPattern' );
  }
  return pat.properties;
};

/**
 * Writes a minimal package under `root/node_modules/<name>` with given files (relative paths).
 *
 * @param {string} root - Project root containing `node_modules`.
 * @param {string} name - Package name e.g. `@test/catalog`.
 * @param {string} main - Relative main entry from package root.
 * @param {Record<string, string>} files - Relative path -> file contents.
 * @param {object} [extraPackageJson] - Extra fields to merge into package.json.
 */
const writeNodeModulesPackage = ( root, name, main, files, extraPackageJson = {} ) => {
  const pkgRoot = name.startsWith( '@' ) ?
    join( root, 'node_modules', ...name.split( '/' ) ) :
    join( root, 'node_modules', name );
  mkdirSync( pkgRoot, { recursive: true } );
  writeFileSync(
    join( pkgRoot, 'package.json' ),
    JSON.stringify( { name, version: '1.0.0', main, ...extraPackageJson }, null, 2 )
  );
  for ( const [ rel, content ] of Object.entries( files ) ) {
    const abs = join( pkgRoot, rel );
    mkdirSync( dirname( abs ), { recursive: true } );
    writeFileSync( abs, content );
  }
  return pkgRoot;
};

describe( 'isBareNpmSpecifier', () => {
  it( 'returns false for empty or non-string', () => {
    expect( isBareNpmSpecifier( '' ) ).toBe( false );
    expect( isBareNpmSpecifier( undefined ) ).toBe( false );
  } );

  it( 'returns false for relative and absolute paths', () => {
    expect( isBareNpmSpecifier( './x' ) ).toBe( false );
    expect( isBareNpmSpecifier( '../x' ) ).toBe( false );
    expect( isBareNpmSpecifier( '/abs' ) ).toBe( false );
  } );

  it( 'returns false for node:, file:, data:, http(s):', () => {
    expect( isBareNpmSpecifier( 'node:fs' ) ).toBe( false );
    expect( isBareNpmSpecifier( 'file:///x' ) ).toBe( false );
    expect( isBareNpmSpecifier( 'data:,x' ) ).toBe( false );
    expect( isBareNpmSpecifier( 'http://x' ) ).toBe( false );
    expect( isBareNpmSpecifier( 'https://x' ) ).toBe( false );
  } );

  it( 'returns true for bare package names', () => {
    expect( isBareNpmSpecifier( 'lodash' ) ).toBe( true );
    expect( isBareNpmSpecifier( '@scope/pkg' ) ).toBe( true );
  } );
} );

describe( 'resolveBareImportSpecifiersAsWorkflows', () => {
  it( 'returns none when the specifier does not resolve', () => {
    withTempProjectDir( dir => {
      const wf = join( dir, 'workflow.js' );
      writeFileSync( wf, 'export default workflow({ name: \'local\' });\n' );

      const out = resolveBareImportSpecifiersAsWorkflows( {
        fromAbsoluteFile: wf,
        specifier: '@missing-scope/missing-pkg-xyz',
        specifiers: importSpecifiersFromSource( 'import x from \'@missing-scope/missing-pkg-xyz\'' ),
        workflowNameCache: new Map()
      } );
      expect( out ).toEqual( { type: 'none' } );
    } );
  } );

  it( 'throws for namespace imports from workflow packages', () => {
    withTempProjectDir( dir => {
      const wf = join( dir, 'workflow.js' );
      writeFileSync( wf, 'export default workflow({ name: \'local\' });\n' );
      writeNodeModulesPackage( dir, '@test/ns', './index.js', {
        'index.js': 'export { default as nsWorkflow } from \'./workflow.js\';\n',
        'workflow.js': 'export default workflow({ name: \'ns.wf\' });\n'
      } );

      expect( () => resolveBareImportSpecifiersAsWorkflows( {
        fromAbsoluteFile: wf,
        specifier: '@test/ns',
        specifiers: importSpecifiersFromSource( 'import * as ns from \'@test/ns\'' ),
        workflowNameCache: new Map()
      } ) ).toThrow(
        'Namespace imports from workflow package "@test/ns" are not supported. ' +
        'Use named imports instead, e.g. import { myWorkflow } from \'@test/ns\'.'
      );
    } );
  } );

  it( 'returns none for namespace imports from non-workflow packages', () => {
    withTempProjectDir( dir => {
      const wf = join( dir, 'workflow.js' );
      writeFileSync( wf, 'export default workflow({ name: \'local\' });\n' );
      writeNodeModulesPackage( dir, '@test/helper', './index.js', {
        'index.js': 'export const helper = () => 1;\n'
      } );

      const out = resolveBareImportSpecifiersAsWorkflows( {
        fromAbsoluteFile: wf,
        specifier: '@test/helper',
        specifiers: importSpecifiersFromSource( 'import * as helper from \'@test/helper\'' ),
        workflowNameCache: new Map()
      } );
      expect( out ).toEqual( { type: 'none' } );
    } );
  } );

  it( 'resolves default import to the package default workflow name', () => {
    withTempProjectDir( dir => {
      const importing = join( dir, 'workflow.js' );
      writeFileSync( importing, 'export default workflow({ name: \'local\' });\n' );
      writeNodeModulesPackage( dir, '@test/wfdef', './workflow.js', {
        'workflow.js': 'export default workflow({ name: \'pkg.default\' });\n'
      } );

      const out = resolveBareImportSpecifiersAsWorkflows( {
        fromAbsoluteFile: importing,
        specifier: '@test/wfdef',
        specifiers: importSpecifiersFromSource( 'import PkgDef from \'@test/wfdef\'' ),
        workflowNameCache: new Map()
      } );
      expect( out ).toEqual( {
        type: 'all',
        bindings: [ { localName: 'PkgDef', workflowName: 'pkg.default' } ]
      } );
    } );
  } );

  it( 'prefers the output workflow bundle export condition over the default entry', () => {
    withTempProjectDir( dir => {
      const importing = join( dir, 'workflow.js' );
      writeFileSync( importing, 'export default workflow({ name: \'local\' });\n' );
      writeNodeModulesPackage( dir, '@test/conditional', './node-entry.js', {
        'node-entry.js': 'export const helper = () => 1;\n',
        'bundle/workflow.js': 'export default workflow({ name: \'bundle.workflow\' });\n'
      }, {
        exports: {
          '.': {
            'output-workflow-bundle': './bundle/workflow.js',
            default: './node-entry.js'
          }
        }
      } );

      const out = resolveBareImportSpecifiersAsWorkflows( {
        fromAbsoluteFile: importing,
        specifier: '@test/conditional',
        specifiers: importSpecifiersFromSource( 'import BundleWorkflow from \'@test/conditional\'' ),
        workflowNameCache: new Map()
      } );
      expect( out ).toEqual( {
        type: 'all',
        bindings: [ { localName: 'BundleWorkflow', workflowName: 'bundle.workflow' } ]
      } );
    } );
  } );

  it( 'supports root conditional exports without an explicit dot key', () => {
    withTempProjectDir( dir => {
      const importing = join( dir, 'workflow.js' );
      writeFileSync( importing, 'export default workflow({ name: \'local\' });\n' );
      writeNodeModulesPackage( dir, '@test/root-conditional', './node-entry.js', {
        'node-entry.js': 'export const helper = () => 1;\n',
        'workflow.js': 'export default workflow({ name: \'root.conditional\' });\n'
      }, {
        exports: {
          'output-workflow-bundle': './workflow.js',
          default: './node-entry.js'
        }
      } );

      const out = resolveBareImportSpecifiersAsWorkflows( {
        fromAbsoluteFile: importing,
        specifier: '@test/root-conditional',
        specifiers: importSpecifiersFromSource( 'import RootWorkflow from \'@test/root-conditional\'' ),
        workflowNameCache: new Map()
      } );
      expect( out ).toEqual( {
        type: 'all',
        bindings: [ { localName: 'RootWorkflow', workflowName: 'root.conditional' } ]
      } );
    } );
  } );

  it( 'uses webpack export condition when workflow bundle condition is absent', () => {
    withTempProjectDir( dir => {
      const importing = join( dir, 'workflow.js' );
      writeFileSync( importing, 'export default workflow({ name: \'local\' });\n' );
      writeNodeModulesPackage( dir, '@test/webpack-conditional', './node-entry.js', {
        'node-entry.js': 'export const helper = () => 1;\n',
        'webpack/workflow.js': 'export default workflow({ name: \'webpack.workflow\' });\n'
      }, {
        exports: {
          '.': {
            webpack: './webpack/workflow.js',
            default: './node-entry.js'
          }
        }
      } );

      const out = resolveBareImportSpecifiersAsWorkflows( {
        fromAbsoluteFile: importing,
        specifier: '@test/webpack-conditional',
        specifiers: importSpecifiersFromSource( 'import WebpackWorkflow from \'@test/webpack-conditional\'' ),
        workflowNameCache: new Map()
      } );
      expect( out ).toEqual( {
        type: 'all',
        bindings: [ { localName: 'WebpackWorkflow', workflowName: 'webpack.workflow' } ]
      } );
    } );
  } );

  it( 'follows re-exports to workflow.js for a named import', () => {
    withTempProjectDir( dir => {
      const importing = join( dir, 'workflow.js' );
      writeFileSync( importing, 'export default workflow({ name: \'local\' });\n' );
      writeNodeModulesPackage( dir, '@test/catalog', './src/index.js', {
        'src/index.js': 'export { default as sumNumbers } from \'./wf/workflow.js\';\n',
        'src/wf/workflow.js': 'export default workflow({ name: \'sum.numbers\' });\n'
      } );

      const out = resolveBareImportSpecifiersAsWorkflows( {
        fromAbsoluteFile: importing,
        specifier: '@test/catalog',
        specifiers: importSpecifiersFromSource( 'import { sumNumbers } from \'@test/catalog\'' ),
        workflowNameCache: new Map()
      } );
      expect( out ).toEqual( {
        type: 'all',
        bindings: [ { localName: 'sumNumbers', workflowName: 'sum.numbers' } ]
      } );
    } );
  } );

  it( 'returns partial when one named import does not resolve to a workflow', () => {
    withTempProjectDir( dir => {
      const importing = join( dir, 'workflow.js' );
      writeFileSync( importing, 'export default workflow({ name: \'local\' });\n' );
      writeNodeModulesPackage( dir, '@test/partial', './index.js', {
        'index.js': 'export { default as Good } from \'./wf/workflow.js\';\n',
        'wf/workflow.js': 'export default workflow({ name: \'good.def\' });\n'
      } );

      const out = resolveBareImportSpecifiersAsWorkflows( {
        fromAbsoluteFile: importing,
        specifier: '@test/partial',
        specifiers: importSpecifiersFromSource( 'import { Good, MissingExport } from \'@test/partial\'' ),
        workflowNameCache: new Map()
      } );
      expect( out.type ).toBe( 'partial' );
    } );
  } );
} );

describe( 'resolveBareDestructuredRequireAsWorkflows', () => {
  it( 'resolves destructured keys to workflow names', () => {
    withTempProjectDir( dir => {
      const importing = join( dir, 'workflow.js' );
      writeFileSync( importing, 'export default workflow({ name: \'local\' });\n' );
      writeNodeModulesPackage( dir, '@test/destr', './index.js', {
        'index.js': 'export { default as alpha } from \'./wf/workflow.js\';\n',
        'wf/workflow.js': 'export default workflow({ name: \'alpha.wf\' });\n'
      } );

      const props = destructuredRequirePropertiesFromSource(
        'const { alpha: A } = require(\'@test/destr\');'
      );
      const out = resolveBareDestructuredRequireAsWorkflows( {
        fromAbsoluteFile: importing,
        specifier: '@test/destr',
        properties: props,
        workflowNameCache: new Map()
      } );
      expect( out ).toEqual( {
        type: 'all',
        bindings: [ { localName: 'A', workflowName: 'alpha.wf' } ]
      } );
    } );
  } );
} );

describe( 'resolveBareDefaultRequireAsWorkflow', () => {
  it( 'returns binding when default resolves to a workflow', () => {
    withTempProjectDir( dir => {
      const importing = join( dir, 'workflow.js' );
      writeFileSync( importing, 'export default workflow({ name: \'local\' });\n' );
      writeNodeModulesPackage( dir, '@test/defreq', './entry.js', {
        'entry.js': 'export { default } from \'./wf/workflow.js\';\n',
        'wf/workflow.js': 'export default workflow({ name: \'chain.def\' });\n'
      } );

      const out = resolveBareDefaultRequireAsWorkflow(
        importing,
        '@test/defreq',
        'Cat',
        new Map()
      );
      expect( out ).toEqual( {
        type: 'binding',
        localName: 'Cat',
        workflowName: 'chain.def'
      } );
    } );
  } );

  it( 'returns none when nothing resolves', () => {
    withTempProjectDir( dir => {
      const importing = join( dir, 'workflow.js' );
      writeFileSync( importing, 'export default workflow({ name: \'local\' });\n' );

      const out = resolveBareDefaultRequireAsWorkflow(
        importing,
        '@ghost/no-such-pkg',
        'X',
        new Map()
      );
      expect( out ).toEqual( { type: 'none' } );
    } );
  } );
} );
