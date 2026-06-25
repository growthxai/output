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

type Mode = 'select' | 'edit_content' | 'name_for_save' | 'submitting' | 'error';

type EntryKind = 'scenario' | 'custom';

interface Entry {
  kind: EntryKind;
  label: string;
  scenarioName?: string;
}

const SCENARIO_NAME_RE = /^[a-zA-Z0-9_-]+$/;

export const buildEntries = ( scenarios: string[] ): Entry[] => {
  const list: Entry[] = scenarios.map( s => ( {
    kind: 'scenario' as const,
    label: s,
    scenarioName: s
  } ) );
  list.push( { kind: 'custom', label: '[Run custom JSON]' } );
  return list;
};

export const validateScenarioName = ( raw: string, existing: string[] ): string | null => {
  const name = raw.trim();
  if ( !name ) {
    return 'Scenario name cannot be empty.';
  }
  if ( !SCENARIO_NAME_RE.test( name ) ) {
    return 'Use letters, numbers, dashes, and underscores only.';
  }
  if ( existing.includes( name ) ) {
    return `A scenario named '${name}' already exists.`;
  }
  return null;
};

const SELECT_SHORTCUTS: ModalShortcut[] = [
  [ '↑/↓', 'navigate' ],
  [ 'enter', 'run' ],
  [ 'd', 'duplicate' ],
  [ 'esc', 'cancel' ]
];

const SAVE_SHORTCUTS: ModalShortcut[] = [
  [ 'enter', 'save & run' ],
  [ 'esc', 'back to editor' ]
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
  const [ editSeed, setEditSeed ] = useState<unknown>( {} );
  const [ editFrameTitle, setEditFrameTitle ] = useState( '' );
  const [ defaultSaveName, setDefaultSaveName ] = useState( '' );
  const [ editName, setEditName ] = useState( '' );
  const [ pendingValue, setPendingValue ] = useState<unknown>( null );
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

  // Custom + duplicate both open the editor first; saving a scenario is opt-in (ctrl+w).
  const startCustom = (): void => {
    setEditSeed( {} );
    setDefaultSaveName( '' );
    setEditFrameTitle( 'Run custom JSON' );
    setMode( 'edit_content' );
  };

  const startDuplicate = async ( scenarioName: string ): Promise<void> => {
    try {
      const sourceContent = await readScenario( workflowName, scenarioName, workflowPath );
      setEditSeed( sourceContent );
      setDefaultSaveName( `${scenarioName}_copy` );
      setEditFrameTitle( `Duplicate '${scenarioName}'` );
      setMode( 'edit_content' );
    } catch ( err ) {
      setErrorMessage( err instanceof Error ? err.message : String( err ) );
      setMode( 'error' );
    }
  };

  // ctrl+s in the editor: run the payload as-is, nothing written to disk.
  const runEphemeral = ( value: unknown ): void => {
    void submit( value, defaultSaveName || 'custom' );
  };

  // ctrl+w in the editor: keep the payload and ask for a name before saving + running.
  const beginSave = ( value: unknown ): void => {
    setPendingValue( value );
    setEditSeed( value );
    setEditName( defaultSaveName );
    setNameError( null );
    setMode( 'name_for_save' );
  };

  const confirmSave = async (): Promise<void> => {
    const validationError = validateScenarioName( editName, scenarios );
    if ( validationError ) {
      setNameError( validationError );
      return;
    }
    setMode( 'submitting' );
    try {
      const writtenPath = await writeScenario( workflowName, editName.trim(), pendingValue, workflowPath );
      ui.pushToast( `Saved scenario at ${writtenPath}`, 'info' );
      await submit( pendingValue, editName.trim() );
    } catch ( err ) {
      setErrorMessage( err instanceof Error ? err.message : String( err ) );
      setMode( 'error' );
    }
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
    if ( mode === 'name_for_save' ) {
      if ( key.escape ) {
        setMode( 'edit_content' );
        return;
      }
      if ( key.return ) {
        void confirmSave();
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
          title={defaultSaveName ? `${defaultSaveName}.json` : 'custom input'}
          isActive
          onSubmit={runEphemeral}
          onSave={beginSave}
          onCancel={() => setMode( 'select' )}
        />
      </ModalFrame>
    );
  }

  if ( mode === 'name_for_save' ) {
    return (
      <ModalFrame title="Save & run" shortcuts={SAVE_SHORTCUTS}>
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
        <Text dimColor>{scenarios.length === 0 ? 'No saved scenarios. Run with custom JSON:' : 'Select a scenario:'}</Text>
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
