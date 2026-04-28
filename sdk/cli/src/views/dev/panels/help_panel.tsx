import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { config } from '#config.js';
import { Footer } from '#views/dev/chrome/footer.js';
import { useUiState } from '#views/dev/state/ui_state.js';

interface Section {
  id: string;
  title: string;
  body: React.ComponentType;
}

const KV: React.FC<{ label: string; value: string; valueColor?: string }> = ( { label, value, valueColor } ) => (
  <Box>
    <Box width={26}><Text>{label}</Text></Box>
    <Text color={valueColor ?? 'cyan'} wrap="truncate-end">{value}</Text>
  </Box>
);

const RunFromCli: React.FC = () => (
  <Box flexDirection="column">
    <Text bold>Run a workflow from the CLI</Text>
    <Box marginTop={1}><Text color="cyan">npx output workflow run blog_evaluator paulgraham_hwh</Text></Box>
    <Box><Text color="cyan">npx output workflow run simple --input {'\'{"values":[1,2,3]}\''}</Text></Box>
    <Box><Text color="cyan">npx output workflow run simple --input scenario.json</Text></Box>
    <Box marginTop={1}>
      <Text dimColor>From the TUI: open Workflows tab, hover a workflow, press </Text>
      <Text bold>r</Text>
      <Text dimColor>.</Text>
    </Box>
    <Box marginTop={1}><Text dimColor>Custom input from the TUI opens $EDITOR (vim by default; respects $EDITOR / $VISUAL).</Text></Box>
  </Box>
);

const Quickstart: React.FC = () => (
  <Box flexDirection="column">
    <Text bold>Quickstart</Text>
    <Box marginTop={1}><Text>`output dev` boots the local Output stack — Temporal, the API, the worker, and Redis.</Text></Box>
    <Box marginTop={1}><Text>Use the four tabs at the top to discover workflows, watch runs, manage services, and read help.</Text></Box>
    <Box marginTop={1}><Text dimColor>Press <Text bold>Ctrl+C</Text> to stop the stack and exit cleanly.</Text></Box>
  </Box>
);

const Tabs: React.FC = () => (
  <Box flexDirection="column">
    <Text bold>Tabs at a glance</Text>
    <Box marginTop={1} flexDirection="column">
      <KV label="Workflows" value="catalog of available workflows; press r to run one" valueColor="white" />
      <KV label="Recent Runs" value="execution history; enter to drill into steps" valueColor="white" />
      <KV label="Services" value="docker stack health + log tail; r/R to restart" valueColor="white" />
      <KV label="Help" value="this page" valueColor="white" />
    </Box>
  </Box>
);

const ServiceUrls: React.FC = () => (
  <Box flexDirection="column">
    <Text bold>Service URLs</Text>
    <Box marginTop={1} flexDirection="column">
      <KV label="Temporal gRPC" value="localhost:7233" valueColor="yellow" />
      <KV label="Temporal UI" value="http://localhost:8080" />
      <KV label="API server" value="localhost:3001" valueColor="yellow" />
      <KV label="Redis" value="localhost:6379" valueColor="yellow" />
    </Box>
  </Box>
);

const GlobalHotkeys: React.FC = () => (
  <Box flexDirection="column">
    <Text bold>Global hotkeys</Text>
    <Box marginTop={1} flexDirection="column">
      <KV label="Switch tab" value="tab / shift+tab / 1-4" valueColor="white" />
      <KV label="Search / filter" value="/  (esc clears, enter applies)" valueColor="white" />
      <KV label="Open this help" value="?" valueColor="white" />
    </Box>
    <Box marginTop={1}>
      <Text dimColor>Stop services & quit lives on the </Text>
      <Text bold>Services</Text>
      <Text dimColor> tab.</Text>
    </Box>
  </Box>
);

const WorkflowsHotkeys: React.FC = () => (
  <Box flexDirection="column">
    <Text bold>Workflows tab</Text>
    <Box marginTop={1} flexDirection="column">
      <KV label="Navigate" value="j/k or arrow keys" valueColor="white" />
      <KV label="Show runs (filtered)" value="enter" valueColor="white" />
      <KV label="Run workflow" value="r  (scenario · custom input · duplicate)" valueColor="white" />
    </Box>
  </Box>
);

const RunsHotkeys: React.FC = () => (
  <Box flexDirection="column">
    <Text bold>Recent Runs tab</Text>
    <Box marginTop={1} flexDirection="column">
      <KV label="Navigate" value="j/k or arrow keys" valueColor="white" />
      <KV label="Open run detail" value="enter  (esc to go back)" valueColor="white" />
      <KV label="Open in Temporal UI" value="o" valueColor="white" />
      <KV label="Switch right pane" value="h / l  (Input · Output · Meta)" valueColor="white" />
    </Box>
  </Box>
);

const ServicesHotkeys: React.FC = () => (
  <Box flexDirection="column">
    <Text bold>Services tab</Text>
    <Box marginTop={1} flexDirection="column">
      <KV label="Navigate" value="j/k or arrow keys" valueColor="white" />
      <KV label="Restart one / all" value="r / R" valueColor="white" />
      <KV label="Pause / resume tail" value="l" valueColor="white" />
      <KV label="Clear log buffer" value="c" valueColor="white" />
      <KV label="Open service URL" value="o" valueColor="white" />
    </Box>
  </Box>
);

const Troubleshooting: React.FC = () => {
  const logsCommand = `docker compose -p ${config.dockerServiceName} logs -f <service>`;
  return (
    <Box flexDirection="column">
      <Text bold>Troubleshooting</Text>
      <Box marginTop={1}><Text>Worker won&apos;t start? <Text color="cyan">output fix</Text> rebuilds the local image.</Text></Box>
      <Box><Text>Tail a service log from the shell: <Text color="cyan">{logsCommand}</Text></Text></Box>
      <Box><Text>Force-pull images: <Text color="cyan">output dev --image-pull-policy always</Text></Text></Box>
    </Box>
  );
};

const SECTIONS: Section[] = [
  { id: 'cli', title: 'Run from CLI', body: RunFromCli },
  { id: 'quickstart', title: 'Quickstart', body: Quickstart },
  { id: 'tabs', title: 'Tabs at a glance', body: Tabs },
  { id: 'urls', title: 'Service URLs', body: ServiceUrls },
  { id: 'global', title: 'Global hotkeys', body: GlobalHotkeys },
  { id: 'workflows-keys', title: 'Workflows hotkeys', body: WorkflowsHotkeys },
  { id: 'runs-keys', title: 'Recent Runs hotkeys', body: RunsHotkeys },
  { id: 'services-keys', title: 'Services hotkeys', body: ServicesHotkeys },
  { id: 'troubleshooting', title: 'Troubleshooting', body: Troubleshooting }
];

const HINTS = [
  { key: 'j/k', label: 'navigate' },
  { key: 'tab', label: 'next tab' },
  { key: 'ctrl+c', label: 'quit' }
];

export const HelpPanel: React.FC = () => {
  const ui = useUiState();
  const [ index, setIndex ] = useState( 0 );
  const isActive = ui.tab === 'help' && !ui.search.open && !ui.runModal.open;

  useInput( ( input, key ) => {
    if ( key.upArrow || input === 'k' ) {
      setIndex( i => Math.max( 0, i - 1 ) );
    } else if ( key.downArrow || input === 'j' ) {
      setIndex( i => Math.min( SECTIONS.length - 1, i + 1 ) );
    }
  }, { isActive } );

  const Section = SECTIONS[index].body;

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box flexDirection="row">
        <Box flexDirection="column" width={28}>
          <Text bold>📖 Help</Text>
          <Box flexDirection="column" marginTop={1}>
            {SECTIONS.map( ( section, i ) => (
              <Box key={section.id} backgroundColor={i === index ? 'magenta' : undefined}>
                <Text bold={i === index} dimColor={i !== index}>
                  {i === index ? '▸ ' : '  '}{section.title}
                </Text>
              </Box>
            ) )}
          </Box>
        </Box>
        <Box
          flexDirection="column"
          flexGrow={1}
          borderStyle="single"
          borderColor="gray"
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
