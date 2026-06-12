import { dirname } from 'node:path';
import generatorModule from '@babel/generator';
import { parse } from '../tools.js';

import rewriteFnBodies from './rewrite_fn_bodies.js';
import collectTargetImports from './collect_target_imports.js';

// Handle CJS/ESM interop for Babel packages when executed as a webpack loader
const generate = generatorModule.default ?? generatorModule;

// Caches to avoid re-reading files during a build
const stepsNameCache = new Map(); // path -> Map<exported, stepName>
const sharedStepsNameCache = new Map(); // path -> Map<exported, stepName> (shared)
const evaluatorsNameCache = new Map(); // path -> Map<exported, evaluatorName>
const sharedEvaluatorsNameCache = new Map(); // path -> Map<exported, evaluatorName> (shared)

/**
 * Webpack loader that rewrites step/evaluator calls by reading names from
 * the respective modules and transforming `fn` bodies accordingly.
 * Preserves sourcemaps.
 *
 * @param {string|Buffer} source - Module source code.
 * @param {any} inputMap - Incoming source map.
 * @this {import('webpack').LoaderContext<{}>}
 * @returns {void}
 */
export default function stepImportRewriterAstLoader( source, inputMap ) {
  this.cacheable?.( true );
  const callback = this.async?.() ?? this.callback;
  const cache = { stepsNameCache, sharedStepsNameCache, evaluatorsNameCache, sharedEvaluatorsNameCache };

  try {
    const filename = this.resourcePath;
    const ast = parse( String( source ), filename );
    const fileDir = dirname( filename );
    const { stepImports, sharedStepImports, evaluatorImports, sharedEvaluatorImports } =
      collectTargetImports( ast, fileDir, cache, filename );

    // No imports
    if ( [].concat( stepImports, sharedStepImports, evaluatorImports, sharedEvaluatorImports ).length === 0 ) {
      return callback( null, source, inputMap );
    }

    const rewrote = rewriteFnBodies( { ast, stepImports, sharedStepImports, evaluatorImports, sharedEvaluatorImports } );
    // No edits performed
    if ( !rewrote ) {
      return callback( null, source, inputMap );
    }

    const { code, map } = generate( ast, {
      sourceMaps: true,
      sourceFileName: filename,
      quotes: 'single',
      jsescOption: { quotes: 'single' }
    }, String( source ) );
    return callback( null, code, map ?? inputMap );
  } catch ( err ) {
    // Fail gracefully as loader error
    return callback( err );
  }
};
