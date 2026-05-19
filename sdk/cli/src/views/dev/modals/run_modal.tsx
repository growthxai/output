import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { listScenariosForWorkflow } from '#utils/scenario_resolver.js';
import { SelectionIndicator } from '#views/dev/chrome/selection_indicator.js';
import { useUiState } from '#views/dev/state/ui_state.js';
import { startWorkflow } from '#views/dev/services/run_workflow.js';
import { readScenario, writeScenario } from '#views/dev/services/scenario_io.js';
import { JsonEditor } from '#views/dev/utils/json_editor.js';
import { ModalFrame, type ModalShortcut } from '#views/dev/modals/modal_frame.js';

type Mode = 'select' | 'edit_name' | 'edit_content' | 'submitting' | 'error';

type EntryKind = 'scenario' | 'custom';

interface Entry {
  kind: EntryKind;
  label: string;
  scenarioName?: string;
}

const CUSTOM_SEED: unknown = { '': '' };
const SCENARIO_NAME_RE = /^[a-zA-Z0-9_-]+$/;

const buildEntries = ( scenarios: string[] ): Entry[] => {
  const list: Entry[] = scenarios.map( s => ( {
    kind: 'scenario' as const,
    label: s,
    scenarioName: s
  } ) );
  list.push( { kind: 'custom', label: '[Create new scenario]' } );
  return list;
};

const SELECT_SHORTCUTS: ModalShortcut[] = [
  [ '↑/↓', 'navigate' ],
  [ 'enter', 'run' ],
  [ 'd', 'duplicate' ],
  [ 'esc', 'cancel' ]
];

const NAME_SHORTCUTS: ModalShortcut[] = [
  [ 'enter', 'next' ],
  [ 'esc', 'back' ]
];

const ERROR_SHORTCUTS: ModalShortcut[] = [
  { key: 'enter', label: 'return' },
  { key: 'esc', label: 'return' }
];

const TextPrompt: React.FC<{
  label: string;
  value: string;
}> = ( { label, value } ) => (
  <Box>
    <Text>{label}</Text>
    <Text>{value}</Text>
    <Text inverse>{' '}</Text>
  </Box>
);

export const RunModal: React.FC<{ workflowName: string; workflowPath?: string }> = ( { workflowName, workflowPath } ) => {
  const ui = useUiState();
  const scenarios = useMemo( () => listScenariosForWorkflow( workflowName, workflowPath ), [ workflowName, workflowPath ] );
  const entries = useMemo( () => buildEntries( scenarios ), [ scenarios ] );

  const [ mode, setMode ] = useState<Mode>( 'select' );
  const [ index, setIndex ] = useState( 0 );
  const [ editName, setEditName ] = useState( '' );
  const [ editSeed, setEditSeed ] = useState<unknown>( CUSTOM_SEED );
  const [ editFrameTitle, setEditFrameTitle ] = useState( '' );
  const [ nameError, setNameError ] = useState<string | null>( null );
  const [ errorMessage, setErrorMessage ] = useState<string | null>( null );

  const closeWith = ( message?: string, tone: 'info' | 'success' | 'error' = 'info' ): void => {
    if ( message ) {
      ui.pushToast( message, tone );
    }
    ui.closeRunModal();
  };

  const submit = async ( input: unknown, label: string ): Promise<void> => {
    setMode( 'submitting' );
    try {
      const started = await startWorkflow( { workflowName, input } );
      const id = started.workflowId ?? '?';
      ui.setSearchQuery( workflowName );
      ui.setTab( 'runs' );
      closeWith( `Started ${workflowName} (${label}) — ${id}`, 'success' );
    } catch ( err ) {
      setErrorMessage( err instanceof Error ? err.message : String( err ) );
      setMode( 'error' );
    }
  };

  const runScenario = async ( scenarioName: string ): Promise<void> => {
    try {
      const input = await readScenario( workflowName, scenarioName, workflowPath );
      await submit( input, scenarioName );
    } catch ( err ) {
      setErrorMessage( err instanceof Error ? err.message : String( err ) );
      setMode( 'error' );
    }
  };

  const startDuplicate = async ( scenarioName: string ): Promise<void> => {
    try {
      const sourceContent = await readScenario( workflowName, scenarioName, workflowPath );
      setEditName( `${scenarioName}_copy` );
      setEditSeed( sourceContent );
      setEditFrameTitle( `Duplicate '${scenarioName}'` );
      setNameError( null );
      setMode( 'edit_name' );
    } catch ( err ) {
      setErrorMessage( err instanceof Error ? err.message : String( err ) );
      setMode( 'error' );
    }
  };

  const startCustom = (): void => {
    setEditName( '' );
    setEditSeed( CUSTOM_SEED );
    setEditFrameTitle( 'New scenario' );
    setNameError( null );
    setMode( 'edit_name' );
  };

  const validateName = ( raw: string ): string | null => {
    const name = raw.trim();
    if ( !name ) {
      return 'Scenario name cannot be empty.';
    }
    if ( !SCENARIO_NAME_RE.test( name ) ) {
      return 'Use letters, numbers, dashes, and underscores only.';
    }
    if ( scenarios.includes( name ) ) {
      return `A scenario named '${name}' already exists.`;
    }
    return null;
  };

  const handleEditorSubmit = async ( value: unknown ): Promise<void> => {
    const name = editName.trim();
    const writeError = validateName( editName );
    if ( writeError ) {
      setNameError( writeError );
      setMode( 'edit_name' );
      return;
    }
    setMode( 'submitting' );
    try {
      const writtenPath = await writeScenario( workflowName, name, value, workflowPath );
      ui.pushToast( `Saved scenario at ${writtenPath}`, 'info' );
      await submit( value, name );
    } catch ( err ) {
      setErrorMessage( err instanceof Error ? err.message : String( err ) );
      setMode( 'error' );
    }
  };

  const handleEditorCancel = (): void => {
    // Bring the user back to the name step so they can adjust it or bail.
    setMode( 'edit_name' );
  };

  useInput( ( input, key ) => {
    if ( mode === 'edit_content' || mode === 'submitting' ) {
      return;
    }
    if ( mode === 'select' ) {
      if ( key.escape ) {
        closeWith();
        return;
      }
      if ( key.upArrow ) {
        setIndex( i => Math.max( 0, i - 1 ) );
        return;
      }
      if ( key.downArrow ) {
        setIndex( i => Math.min( entries.length - 1, i + 1 ) );
        return;
      }
      if ( key.return ) {
        const entry = entries[index];
        if ( entry?.kind === 'scenario' && entry.scenarioName ) {
          void runScenario( entry.scenarioName );
        } else if ( entry?.kind === 'custom' ) {
          startCustom();
        }
        return;
      }
      if ( input === 'd' ) {
        const entry = entries[index];
        if ( entry?.kind === 'scenario' && entry.scenarioName ) {
          void startDuplicate( entry.scenarioName );
        }
      }
      return;
    }
    if ( mode === 'edit_name' ) {
      if ( key.escape ) {
        setMode( 'select' );
        return;
      }
      if ( key.return ) {
        const err = validateName( editName );
        if ( err ) {
          setNameError( err );
          return;
        }
        setNameError( null );
        setMode( 'edit_content' );
        return;
      }
      if ( key.backspace || key.delete ) {
        setEditName( v => v.slice( 0, -1 ) );
        if ( nameError ) {
          setNameError( null );
        }
        return;
      }
      if ( input && !key.ctrl && !key.meta ) {
        setEditName( v => v + input );
        if ( nameError ) {
          setNameError( null );
        }
      }
      return;
    }
    if ( mode === 'error' ) {
      if ( key.escape || key.return ) {
        setMode( 'select' );
        setErrorMessage( null );
      }
    }
  } );

  if ( mode === 'edit_content' ) {
    return (
      <ModalFrame title={editFrameTitle}>
        <JsonEditor
          seed={editSeed}
          title={`${editName}.json`}
          isActive
          onSubmit={value => {
            void handleEditorSubmit( value );
          }}
          onCancel={handleEditorCancel}
        />
      </ModalFrame>
    );
  }

  if ( mode === 'edit_name' ) {
    return (
      <ModalFrame title={editFrameTitle} shortcuts={NAME_SHORTCUTS}>
        <TextPrompt label="Scenario name:" value={editName} />
        {nameError ? (
          <Box marginTop={1}>
            <Text color="red">{nameError}</Text>
          </Box>
        ) : null}
      </ModalFrame>
    );
  }

  if ( mode === 'submitting' ) {
    return (
      <ModalFrame title={`Run ${workflowName}`}>
        <Text color="yellow"><Spinner type="dots" /></Text>
        <Text>&nbsp;Starting workflow…</Text>
      </ModalFrame>
    );
  }

  if ( mode === 'error' ) {
    return (
      <ModalFrame title={`Run workflow "${workflowName}"`} shortcuts={ERROR_SHORTCUTS}>
        <Text color="red" bold>✗ {errorMessage ?? 'Something went wrong.'}</Text>
      </ModalFrame>
    );
  }

  return (
    <ModalFrame title={`Run ${workflowName}`} shortcuts={SELECT_SHORTCUTS}>
      <Box flexDirection="column" gap={1}>
        <Text dimColor>{scenarios.length === 0 ? 'No scenarios found. Create a new one:' : 'Select scenarios:'}</Text>
        <Box flexDirection="column">
          {entries.map( ( entry, i ) => (
            <Box key={`${entry.kind}-${entry.scenarioName ?? i}`}>
              <SelectionIndicator selected={i === index} />
              <Text bold={i === index}>&nbsp;{entry.label}</Text>
            </Box>
          ) )}
        </Box>
      </Box>
    </ModalFrame>
  );
};
