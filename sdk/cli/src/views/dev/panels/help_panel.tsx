import React from 'react';
import { Box, Text, useInput } from 'ink';
import { config } from '#config.js';
import { openUrl } from '#utils/open_url.js';
import { SelectionIndicator } from '#views/dev/chrome/selection_indicator.js';
import { useUiState } from '#views/dev/state/ui_state.js';
import { useListSelection } from '#views/dev/utils/panel_helpers.js';
import { InlineSnippet } from '../components/inline_snippet.js';

const DOCS_URL = 'https://docs.output.ai';

interface HelpSection {
  id: string;
  title: string;
  body: React.ComponentType;
}

export const Section: React.FC<{ children: React.ReactNode; title: string, direction?: string }> = ( { children, title, direction = 'v' } ) => (
  <Box flexDirection="column" gap={1}>
    <Text bold>{title}</Text>
    <Box flexDirection={direction === 'v' ? 'column' : 'row'} gap={1} flexWrap='wrap'>
      {children}
    </Box>
  </Box>
);

export const SubSection: React.FC<{ children: React.ReactNode, title: string }> = ( { children, title } ) => (
  <Box flexDirection="column" gap={1} borderStyle="single" borderColor="blackBright" paddingLeft={1} paddingRight={1}>
    <Text italic dimColor>{title}</Text>
    <Box flexDirection="column">
      {children}
    </Box>
  </Box>
);

const KV: React.FC<{ label: string; value: string }> = ( { label, value } ) => (
  <Box flexDirection="row">
    <Box width={26}><Text>{label}</Text></Box>
    <Text bold>{value}</Text>
  </Box>
);

const RunFromCli: React.FC = () => (
  <Section title="Running a workflow">
    <SubSection title="From the CLI">
      <InlineSnippet content="npx output workflow run blog_evaluator paulgraham_hwh" />
      <InlineSnippet content='npx output workflow run simple --input {"values":[1,2,3]}' />
      <InlineSnippet content="npx output workflow run simple --input scenario.json" />
    </SubSection>
    <SubSection title="From the TUI">
      <Text>Open Workflows tab, hover a workflow, press <Text bold>r</Text>.</Text>
      <Text>Pick a saved scenario, or edit JSON with live validation.</Text>
      <Text>Press <Text bold>ctrl+r</Text> to run as-is, or <Text bold>ctrl+s</Text> to save it as a scenario first.</Text>
    </SubSection>
  </Section>
);

const ServiceUrls: React.FC = () => (
  <Section title="Service URLs">
    <SubSection title="Where the services are available">
      <KV label="Temporal gRPC" value="localhost:7233" />
      <KV label="Temporal UI" value="http://localhost:8080" />
      <KV label="API server" value="localhost:3001" />
      <KV label="Redis" value="localhost:6379" />
    </SubSection>
  </Section>
);

const UpdatingMigrating: React.FC = () => (
  <Section title="Updating / Migrating">
    <SubSection title="Update">
      <Text wrap="wrap">Update the CLI to the latest published version:</Text>
      <InlineSnippet content="output update" />
    </SubSection>
    <SubSection title="Migrate">
      <Text wrap="wrap">Migrate a workflow project to the SDK version this CLI ships with:</Text>
      <InlineSnippet content="output migrate" />
      <Text wrap="wrap">
        The migration walks `package.json` and project files, updates `@outputai/*` deps, and applies any code-mod steps the SDK ships
        with the new version.
      </Text>
    </SubSection>
  </Section>
);

const ClaudePlugins: React.FC = () => (
  <Section title="Claude Plugins">
    <SubSection title="Reinstall">
      <Text wrap="wrap">
        Command `output init` already installs the Claude Code plugins (skills, commands, agents) into your project during scaffolding.
      </Text>
      <Text wrap="wrap">But if it is necessary to reinstall it, use the update command:</Text>
      <InlineSnippet content="output update --agents" />
      <Text>This pulls the latest plugin bundle that ships with the installed CLI version.</Text>
    </SubSection>
  </Section>
);

const Troubleshooting: React.FC = () => {
  const logsCommand = `docker compose -p ${config.dockerServiceName} logs -f <service>`;
  return (
    <Section title="Troubleshooting">
      <SubSection title="Worker won't start">
        <Text>If the worker won't start, rebuild the local image:</Text>
        <InlineSnippet content="output fix" />
      </SubSection>
      <SubSection title="I need to see more logs">
        <Text>Tail a service log from the shell:</Text>
        <InlineSnippet content={logsCommand} />
      </SubSection>
      <SubSection title="Force pull-images">
        <Text>If the images get stale and a fresh start is necessary, force pull with:</Text>
        <InlineSnippet content="output dev --image-pull-policy always" />
      </SubSection>
    </Section>
  );
};

const SECTIONS: HelpSection[] = [
  { id: 'cli', title: 'Run from CLI', body: RunFromCli },
  { id: 'urls', title: 'Service URLs', body: ServiceUrls },
  { id: 'updating', title: 'Updating / Migrating', body: UpdatingMigrating },
  { id: 'claude-plugins', title: 'Claude Plugins', body: ClaudePlugins },
  { id: 'troubleshooting', title: 'Troubleshooting', body: Troubleshooting }
];

export const HELP_HINTS = [
  { key: '↑/↓', label: 'navigate' },
  { key: 'd', label: 'docs' }
];

export const HELP_SECTION_COUNT = SECTIONS.length;

export const HelpPanel: React.FC = () => {
  const ui = useUiState();
  const { selectedIndex: index, selectPrevious, selectNext } = useListSelection( SECTIONS.length );

  useInput( ( input, key ) => {
    if ( key.upArrow ) {
      selectPrevious();
      return;
    }
    if ( key.downArrow ) {
      selectNext();
      return;
    }
    if ( input === 'd' ) {
      openUrl( DOCS_URL );
    }
  }, { isActive: ui.tab === 'help' && !ui.search.open } );

  const ActiveSection = SECTIONS[index].body;

  return (
    <Box flexDirection="row">
      <Box flexDirection="column" flexShrink={0} paddingRight={2}>
        {SECTIONS.map( ( section, i ) => (
          <Box key={section.id}>
            <SelectionIndicator selected={i === index} />
            <Text bold={i === index} dimColor={i !== index}>
              {' '}{section.title}
            </Text>
          </Box>
        ) )}
      </Box>
      <ActiveSection />
    </Box>
  );
};
