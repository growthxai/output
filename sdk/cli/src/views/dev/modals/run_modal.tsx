import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { listScenariosForWorkflow } from '#utils/scenario_resolver.js';
import { useUiState } from '#views/dev/state/ui_state.js';
import { startWorkflow } from '#views/dev/services/run_workflow.js';
import { readScenario, writeScenario } from '#views/dev/services/scenario_io.js';
import { JsonEditor } from '#views/dev/utils/json_editor.js';

type Mode = 'select' | 'duplicate_name' | 'editing' | 'submitting' | 'error';

type EntryKind = 'scenario' | 'custom' | 'duplicate';

interface Entry {
  kind: EntryKind;
  label: string;
  scenarioName?: string;
}

const buildEntries = ( scenarios: string[] ): Entry[] => {
  const list: Entry[] = scenarios.map( s => ( {
    kind: 'scenario' as const,
    label: s,
    scenarioName: s
  } ) );
  list.push( { kind: 'custom', label: 'Custom input' } );
  for ( const s of scenarios ) {
    list.push( { kind: 'duplicate', label: `Duplicate '${s}' → new scenario`, scenarioName: s } );
  }
  return list;
};

const Frame: React.FC<{ title: string; children: React.ReactNode }> = ( { title, children } ) => (
  <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="magenta" paddingX={1} paddingY={0}>
    <Text bold color="magenta">{title}</Text>
    {children}
  </Box>
);

const TextPrompt: React.FC<{
  label: string;
  value: string;
}> = ( { label, value } ) => (
  <Box marginTop={1}>
    <Text>{label} </Text>
    <Text color="cyan">{value}</Text>
    <Text color="cyan">▌</Text>
  </Box>
);

export const RunModal: React.FC<{ workflowName: string }> = ( { workflowName } ) => {
  const ui = useUiState();
  const scenarios = useMemo( () => listScenariosForWorkflow( workflowName ), [ workflowName ] );
  const entries = useMemo( () => buildEntries( scenarios ), [ scenarios ] );

  const [ mode, setMode ] = useState<Mode>( 'select' );
  const [ index, setIndex ] = useState( 0 );
  const [ duplicateName, setDuplicateName ] = useState( '' );
  const [ duplicateSource, setDuplicateSource ] = useState<string | undefined>( undefined );
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

  const handleSelect = async ( entry: Entry ): Promise<void> => {
    if ( entry.kind === 'scenario' && entry.scenarioName ) {
      try {
        const input = await readScenario( workflowName, entry.scenarioName );
        await submit( input, entry.scenarioName );
      } catch ( err ) {
        setErrorMessage( err instanceof Error ? err.message : String( err ) );
        setMode( 'error' );
      }
      return;
    }
    if ( entry.kind === 'duplicate' && entry.scenarioName ) {
      setDuplicateSource( entry.scenarioName );
      setDuplicateName( `${entry.scenarioName}_copy` );
      setMode( 'duplicate_name' );
      return;
    }
    if ( entry.kind === 'custom' ) {
      setMode( 'editing' );
    }
  };

  const handleEditorSubmit = ( value: unknown ): void => {
    void submit( value, 'custom input' );
  };

  const handleEditorCancel = (): void => {
    setMode( 'select' );
  };

  const submitDuplicate = async (): Promise<void> => {
    if ( !duplicateSource ) {
      setMode( 'select' );
      return;
    }
    const name = duplicateName.trim();
    if ( !name ) {
      setErrorMessage( 'Scenario name cannot be empty.' );
      setMode( 'error' );
      return;
    }
    try {
      const sourceContent = await readScenario( workflowName, duplicateSource );
      const writtenPath = await writeScenario( workflowName, name, sourceContent );
      ui.pushToast( `Saved scenario at ${writtenPath}`, 'info' );
      await submit( sourceContent, name );
    } catch ( err ) {
      setErrorMessage( err instanceof Error ? err.message : String( err ) );
      setMode( 'error' );
    }
  };

  useInput( ( input, key ) => {
    if ( mode === 'editing' ) {
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
        if ( entry ) {
          void handleSelect( entry );
        }
      }
      return;
    }
    if ( mode === 'duplicate_name' ) {
      if ( key.escape ) {
        setMode( 'select' );
        return;
      }
      if ( key.return ) {
        void submitDuplicate();
        return;
      }
      if ( key.backspace || key.delete ) {
        setDuplicateName( v => v.slice( 0, -1 ) );
        return;
      }
      if ( input && !key.ctrl && !key.meta ) {
        setDuplicateName( v => v + input );
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

  if ( mode === 'editing' ) {
    return (
      <Frame title={`Run ${workflowName}`}>
        <JsonEditor
          seed={{}}
          title="custom input"
          isActive
          onSubmit={handleEditorSubmit}
          onCancel={handleEditorCancel}
        />
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

  if ( mode === 'duplicate_name' ) {
    return (
      <Frame title={`Duplicate '${duplicateSource}' for ${workflowName}`}>
        <TextPrompt label="New scenario name:" value={duplicateName} />
        <Box marginTop={1}>
          <Text dimColor>enter</Text>
          <Text> save & run</Text>
          <Text dimColor>   esc</Text>
          <Text> back</Text>
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
          {entries.map( ( entry, i ) => (
            <Box key={`${entry.kind}-${entry.scenarioName ?? i}`}>
              <Text color={i === index ? 'cyan' : undefined} bold={i === index}>
                {i === index ? '▸ ' : '  '}{entry.label}
              </Text>
            </Box>
          ) )}
        </Box>
      )}
      <Box marginTop={1}>
        <Text dimColor>↑/↓</Text>
        <Text> navigate   </Text>
        <Text dimColor>enter</Text>
        <Text> run   </Text>
        <Text dimColor>esc</Text>
        <Text> cancel</Text>
      </Box>
    </Frame>
  );
};
