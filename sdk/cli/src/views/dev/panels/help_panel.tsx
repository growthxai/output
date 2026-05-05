import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { config } from '#config.js';
import { openUrl } from '#utils/open_url.js';
import { Footer } from '#views/dev/chrome/footer.js';
import { SelectionIndicator } from '#views/dev/chrome/selection_indicator.js';
import { useUiState } from '#views/dev/state/ui_state.js';

const DOCS_URL = 'https://docs.output.ai';

interface Section {
  id: string;
  title: string;
  body: React.ComponentType;
}

const KV: React.FC<{ label: string; value: string }> = ( { label, value } ) => (
  <Box>
    <Box width={26}><Text>{label}</Text></Box>
    <Text bold wrap="truncate-end">{value}</Text>
  </Box>
);

const RunFromCli: React.FC = () => (
  <Box flexDirection="column">
    <Text bold>Run a workflow from the CLI</Text>
    <Box marginTop={1}><Text bold>npx output workflow run blog_evaluator paulgraham_hwh</Text></Box>
    <Box><Text bold>npx output workflow run simple --input {'\'{"values":[1,2,3]}\''}</Text></Box>
    <Box><Text bold>npx output workflow run simple --input scenario.json</Text></Box>
    <Box marginTop={1}>
      <Text dimColor>From the TUI: open Workflows tab, hover a workflow, press </Text>
      <Text bold>r</Text>
      <Text dimColor>.</Text>
    </Box>
    <Box marginTop={1}>
      <Text dimColor>Custom input from the TUI uses an in-tui editor with live JSON validation.</Text>
    </Box>
  </Box>
);

const Hotkeys: React.FC = () => (
  <Box flexDirection="column">
    <Text bold>Hotkeys</Text>

    <Box marginTop={1}><Text dimColor bold>Global</Text></Box>
    <KV label="Switch tab" value="tab / shift+tab / 1-4" />
    <KV label="Search / filter" value="/  (esc clears, enter applies)" />
    <KV label="Open this help" value="?" />
    <KV label="Open docs.output.ai" value="d" />
    <KV label="Stop services & quit" value="ctrl+c" />

    <Box marginTop={1}><Text dimColor bold>Workflows tab</Text></Box>
    <KV label="Navigate" value="↑/↓" />
    <KV label="Show runs (filtered)" value="enter" />
    <KV label="Run workflow" value="r  (scenario · custom input · duplicate)" />

    <Box marginTop={1}><Text dimColor bold>Recent Runs tab</Text></Box>
    <KV label="Navigate" value="↑/↓" />
    <KV label="Open run detail" value="enter  (esc to go back)" />
    <KV label="Open in Temporal UI" value="o" />
    <KV label="Switch input/output" value="←/→" />
    <KV label="Expand JSON pane" value="e  (↑/↓ scroll, pgup/pgdn page)" />

    <Box marginTop={1}><Text dimColor bold>Services tab</Text></Box>
    <KV label="Navigate" value="↑/↓" />
    <KV label="Restart one / all" value="r / R" />
    <KV label="Pause / resume tail" value="p" />
    <KV label="Clear log buffer" value="c" />
    <KV label="Open service URL" value="o" />

    <Box marginTop={1}><Text dimColor bold>Run modal</Text></Box>
    <KV label="Navigate" value="↑/↓" />
    <KV label="Run scenario" value="enter" />
    <KV label="Duplicate scenario" value="d" />
    <KV label="Cancel" value="esc" />
  </Box>
);

const ServiceUrls: React.FC = () => (
  <Box flexDirection="column">
    <Text bold>Service URLs</Text>
    <Box marginTop={1} flexDirection="column">
      <KV label="Temporal gRPC" value="localhost:7233" />
      <KV label="Temporal UI" value="http://localhost:8080" />
      <KV label="API server" value="localhost:3001" />
      <KV label="Redis" value="localhost:6379" />
    </Box>
  </Box>
);

const UpdatingMigrating: React.FC = () => (
  <Box flexDirection="column">
    <Text bold>Updating / Migrating</Text>
    <Box marginTop={1}>
      <Text dimColor>Update the CLI to the latest published version:</Text>
    </Box>
    <Box><Text bold>output update</Text></Box>
    <Box marginTop={1}>
      <Text dimColor>Migrate a workflow project to the SDK version this CLI ships with:</Text>
    </Box>
    <Box><Text bold>output migrate</Text></Box>
    <Box marginTop={1}>
      <Text dimColor wrap="wrap">
        The migration walks `package.json` and project files, updates `@outputai/*` deps,
        and applies any code-mod steps the SDK ships with the new version.
      </Text>
    </Box>
  </Box>
);

const ClaudePlugins: React.FC = () => (
  <Box flexDirection="column">
    <Text bold>Claude Plugins</Text>
    <Box marginTop={1}>
      <Text dimColor wrap="wrap">
        `output init` installs the Claude Code plugins (skills, commands, agents) into
        your project automatically when scaffolding a new workflow.
      </Text>
    </Box>
    <Box marginTop={1}>
      <Text dimColor>To re-install or refresh the plugins after a CLI update:</Text>
    </Box>
    <Box><Text bold>output update --agents</Text></Box>
    <Box marginTop={1}>
      <Text dimColor>This pulls the latest plugin bundle that ships with the installed CLI version.</Text>
    </Box>
  </Box>
);

const Troubleshooting: React.FC = () => {
  const logsCommand = `docker compose -p ${config.dockerServiceName} logs -f <service>`;
  return (
    <Box flexDirection="column">
      <Text bold>Troubleshooting</Text>
      <Box marginTop={1}><Text>Worker won&apos;t start? <Text bold>output fix</Text> rebuilds the local image.</Text></Box>
      <Box><Text>Tail a service log from the shell: <Text bold>{logsCommand}</Text></Text></Box>
      <Box><Text>Force-pull images: <Text bold>output dev --image-pull-policy always</Text></Text></Box>
    </Box>
  );
};

const SECTIONS: Section[] = [
  { id: 'cli', title: 'Run from CLI', body: RunFromCli },
  { id: 'hotkeys', title: 'Hotkeys', body: Hotkeys },
  { id: 'urls', title: 'Service URLs', body: ServiceUrls },
  { id: 'updating', title: 'Updating / Migrating', body: UpdatingMigrating },
  { id: 'claude-plugins', title: 'Claude Plugins', body: ClaudePlugins },
  { id: 'troubleshooting', title: 'Troubleshooting', body: Troubleshooting }
];

const HINTS = [
  { key: '↑/↓', label: 'navigate' },
  { key: 'd', label: 'docs' },
  { key: 'tab', label: 'next tab' },
  { key: 'ctrl+c', label: 'quit' }
];

export const HelpPanel: React.FC = () => {
  const ui = useUiState();
  const [ index, setIndex ] = useState( 0 );
  const isActive = ui.tab === 'help' && !ui.search.open && !ui.runModal.open;

  useInput( ( input, key ) => {
    if ( key.upArrow ) {
      setIndex( i => Math.max( 0, i - 1 ) );
      return;
    }
    if ( key.downArrow ) {
      setIndex( i => Math.min( SECTIONS.length - 1, i + 1 ) );
      return;
    }
    if ( input === 'd' ) {
      openUrl( DOCS_URL );
    }
  }, { isActive } );

  const Section = SECTIONS[index].body;

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box flexDirection="row">
        <Box flexDirection="column" width={28}>
          <Text bold>Help</Text>
          <Box flexDirection="column" marginTop={1}>
            {SECTIONS.map( ( section, i ) => (
              <Box key={section.id}>
                <SelectionIndicator selected={i === index} />
                <Text bold={i === index} dimColor={i !== index}>
                  {' '}{section.title}
                </Text>
              </Box>
            ) )}
          </Box>
        </Box>
        <Box
          flexDirection="column"
          flexGrow={1}
          borderStyle="single"
          borderTop={false}
          borderBottom={false}
          borderRight={false}
          paddingLeft={2}
        >
          <Section />
        </Box>
      </Box>
      <Footer hints={HINTS} itemCount={SECTIONS.length} itemLabel="sections" />
    </Box>
  );
};
