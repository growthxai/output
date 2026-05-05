import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { listScenariosForWorkflow } from '#utils/scenario_resolver.js';
import { SelectionIndicator } from '#views/dev/chrome/selection_indicator.js';
import { useUiState } from '#views/dev/state/ui_state.js';
import { startWorkflow } from '#views/dev/services/run_workflow.js';
import { readScenario, writeScenario } from '#views/dev/services/scenario_io.js';
import { JsonEditor } from '#views/dev/utils/json_editor.js';

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
  list.push( { kind: 'custom', label: 'Custom input' } );
  return list;
};

const Frame: React.FC<{ title: string; children: React.ReactNode }> = ( { title, children } ) => (
  <Box flexDirection="column" marginTop={1} borderStyle="round" paddingX={1} paddingY={0}>
    <Text bold>{title}</Text>
    {children}
  </Box>
);

const TextPrompt: React.FC<{
  label: string;
  value: string;
}> = ( { label, value } ) => (
  <Box marginTop={1}>
    <Text>{label} </Text>
    <Text>{value}</Text>
    <Text inverse>{' '}</Text>
  </Box>
);

export const RunModal: React.FC<{ workflowName: string }> = ( { workflowName } ) => {
  const ui = useUiState();
  const scenarios = useMemo( () => listScenariosForWorkflow( workflowName ), [ workflowName ] );
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
      const input = await readScenario( workflowName, scenarioName );
      await submit( input, scenarioName );
    } catch ( err ) {
      setErrorMessage( err instanceof Error ? err.message : String( err ) );
      setMode( 'error' );
    }
  };

  const startDuplicate = async ( scenarioName: string ): Promise<void> => {
    try {
      const sourceContent = await readScenario( workflowName, scenarioName );
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
      const writtenPath = await writeScenario( workflowName, name, value );
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
      <Frame title={`${editFrameTitle} → ${editName}.json`}>
        <JsonEditor
          seed={editSeed}
          title={`${editName}.json`}
          isActive
          onSubmit={value => {
            void handleEditorSubmit( value );
          }}
          onCancel={handleEditorCancel}
        />
      </Frame>
    );
  }

  if ( mode === 'edit_name' ) {
    return (
      <Frame title={editFrameTitle}>
        <TextPrompt label="Scenario name:" value={editName} />
        {nameError ? (
          <Box marginTop={1}>
            <Text color="red">{nameError}</Text>
          </Box>
        ) : null}
        <Box marginTop={1}>
          <Text dimColor>enter</Text>
          <Text> next   </Text>
          <Text dimColor>esc</Text>
          <Text> back</Text>
        </Box>
      </Frame>
    );
  }

  if ( mode === 'submitting' ) {
    return (
      <Frame title={`Run ${workflowName}`}>
        <Box marginTop={1}>
          <Text color="yellow"><Spinner type="dots" /></Text>
          <Text> Starting workflow…</Text>
        </Box>
      </Frame>
    );
  }

  if ( mode === 'error' ) {
    return (
      <Frame title={`Run ${workflowName}`}>
        <Box marginTop={1} flexDirection="column">
          <Text color="red" bold>✗ {errorMessage ?? 'Something went wrong.'}</Text>
          <Box marginTop={1}><Text dimColor>Press enter or esc to return.</Text></Box>
        </Box>
      </Frame>
    );
  }

  return (
    <Frame title={`Run ${workflowName}`}>
      {entries.length === 0 ? (
        <Box marginTop={1}>
          <Text dimColor>No scenarios on disk. Choose Custom input.</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {entries.map( ( entry, i ) => {
            const prev = i > 0 ? entries[i - 1] : undefined;
            const showSeparator = prev?.kind === 'scenario' && entry.kind !== 'scenario';
            return (
              <React.Fragment key={`${entry.kind}-${entry.scenarioName ?? i}`}>
                {showSeparator && (
                  <Box marginY={0}>
                    <Text dimColor>{'─'.repeat( 40 )}</Text>
                  </Box>
                )}
                <Box>
                  <SelectionIndicator selected={i === index} />
                  <Text bold={i === index}>{' '}{entry.label}</Text>
                </Box>
              </React.Fragment>
            );
          } )}
        </Box>
      )}
      <Box marginTop={1}>
        <Text dimColor>↑/↓</Text>
        <Text> navigate   </Text>
        <Text dimColor>enter</Text>
        <Text> run   </Text>
        <Text dimColor>d</Text>
        <Text> duplicate   </Text>
        <Text dimColor>esc</Text>
        <Text> cancel</Text>
      </Box>
    </Frame>
  );
};
