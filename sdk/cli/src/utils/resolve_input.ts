import { ux } from '@oclif/core';
import { parseInputFlag } from '#utils/input_parser.js';
import { resolveScenarioPath, getScenarioNotFoundMessage } from '#utils/scenario_resolver.js';

export type ResolveInputOptions = {
  workflowName: string;
  scenario?: string;
  inputFlag?: string;
  commandName: string;
  catalog?: string;
  json?: boolean;
};

export async function resolveInput( options: ResolveInputOptions ): Promise<unknown> {
  const { workflowName, scenario, inputFlag, commandName, catalog, json } = options;

  if ( inputFlag && scenario ) {
    return ux.error(
      'Cannot use both scenario argument and --input flag. Choose one.',
      { exit: 1 }
    );
  }

  if ( inputFlag ) {
    return parseInputFlag( inputFlag );
  }

  if ( scenario ) {
    const resolution = await resolveScenarioPath( workflowName, scenario, undefined, undefined, catalog );
    if ( !resolution.found ) {
      return ux.error(
        getScenarioNotFoundMessage( workflowName, scenario, resolution.searchedPaths ),
        { exit: 1 }
      );
    }
    // Advisory notice goes to stderr so stdout stays clean for piping, and is
    // skipped entirely under --json where even stderr is noise to a script
    // consuming the structured output (same rule as the init hook's banner).
    if ( !json ) {
      ux.stderr( `Using scenario: ${resolution.path}` );
    }
    return parseInputFlag( resolution.path! );
  }

  return ux.error(
    'Input required. Provide either:\n' +
    `  - A scenario name: output workflow ${commandName} <workflow> <scenario>\n` +
    `  - An input flag: output workflow ${commandName} <workflow> --input <json-or-file>`,
    { exit: 1 }
  );
}
