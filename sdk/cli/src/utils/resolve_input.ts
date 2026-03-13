import { ux } from '@oclif/core';
import { parseInputFlag } from '#utils/input_parser.js';
import { resolveScenarioPath, getScenarioNotFoundMessage } from '#utils/scenario_resolver.js';

export async function resolveInput(
  workflowName: string,
  scenario: string | undefined,
  inputFlag: string | undefined,
  commandName: string
): Promise<unknown> {
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
    const resolution = await resolveScenarioPath( workflowName, scenario );
    if ( !resolution.found ) {
      return ux.error(
        getScenarioNotFoundMessage( workflowName, scenario, resolution.searchedPaths ),
        { exit: 1 }
      );
    }
    ux.stdout( `Using scenario: ${resolution.path}\n` );
    return parseInputFlag( resolution.path! );
  }

  return ux.error(
    'Input required. Provide either:\n' +
    `  - A scenario name: output workflow ${commandName} <workflow> <scenario>\n` +
    `  - An input flag: output workflow ${commandName} <workflow> --input <json-or-file>`,
    { exit: 1 }
  );
}
