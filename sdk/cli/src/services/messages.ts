/**
 * Success and informational messages for project initialization
 */

import { ux } from '@oclif/core';
import { config } from '#config.js';

/**
 * Creates a colored ASCII art banner for Output.ai
 */
const createOutputBanner = (): string => {
  // ASCII art banner for "Output.ai"
  const banner = `
    ██████╗ ██╗   ██╗████████╗██████╗ ██╗   ██╗████████╗    █████╗ ██╗
   ██╔═══██╗██║   ██║╚══██╔══╝██╔══██╗██║   ██║╚══██╔══╝   ██╔══██╗██║
   ██║   ██║██║   ██║   ██║   ██████╔╝██║   ██║   ██║      ███████║██║
   ██║   ██║██║   ██║   ██║   ██╔═══╝ ██║   ██║   ██║      ██╔══██║██║
   ╚██████╔╝╚██████╔╝   ██║   ██║     ╚██████╔╝   ██║   ██╗██║  ██║██║
    ╚═════╝  ╚═════╝    ╚═╝   ╚═╝      ╚═════╝    ╚═╝   ╚═╝╚═╝  ╚═╝╚═╝`;

  // Apply gradient colors from cyan to magenta
  const colors = [ 'cyan', 'cyan', 'blue', 'blue', 'magenta', 'magenta' ];

  return banner
    .split( '\n' )
    .map( ( line, index ) => {
      return ux.colorize( colors[index], line );
    } )
    .join( '\n' );
};

/**
 * Formats a command for display with proper styling
 */
const formatCommand = ( command: string ): string => {
  return ux.colorize( 'cyan', command );
};

/**
 * Formats a file path for display
 */
const formatPath = ( path: string ): string => {
  return ux.colorize( 'yellow', path );
};

/**
 * Creates a section header with styling
 */
const createSectionHeader = ( title: string, icon: string = '' ): string => {
  const header = icon ? `${icon} ${title}` : title;
  return ux.colorize( 'bold', header );
};

export const getEjectSuccessMessage = (
  destPath: string,
  outputFile: string,
  binName: string
): string => {
  const divider = ux.colorize( 'dim', '─'.repeat( 80 ) );
  const bulletPoint = ux.colorize( 'green', '▸' );

  // Build the customization tips
  const customizationTips = [
    {
      title: 'Environment Variables',
      description: 'Adjust service configurations and API settings'
    },
    {
      title: 'Port Mappings',
      description: 'Change exposed ports to avoid conflicts'
    },
    {
      title: 'Service Versions',
      description: 'Update Docker images to specific versions'
    },
    {
      title: 'Volume Mounts',
      description: 'Add custom volumes for persistent data'
    },
    {
      title: 'Network Configuration',
      description: 'Modify network settings for your infrastructure'
    }
  ];

  const formattedTips = customizationTips.map( tip => {
    return `  ${bulletPoint} ${ux.colorize( 'white', `${tip.title}:` )} ${ux.colorize( 'dim', tip.description )}`;
  } ).join( '\n' );

  // Build common modifications examples
  const examples = [
    {
      title: 'Change Redis port',
      code: 'ports:\n      - \'6380:6379\'  # Changed from 6379'
    },
    {
      title: 'Add environment variable',
      code: 'environment:\n      - MY_CUSTOM_VAR=value'
    },
    {
      title: 'Use specific image version',
      code: 'image: redis:8.0.0-alpine  # Pin to specific version'
    }
  ];

  const formattedExamples = examples.map( ( example, index ) => {
    const number = ux.colorize( 'dim', `${index + 1}.` );
    const title = ux.colorize( 'white', example.title );
    const code = ux.colorize( 'cyan', example.code.split( '\n' ).map( line => `     ${line}` ).join( '\n' ) );
    return `  ${number} ${title}\n${code}`;
  } ).join( '\n\n' );

  return `

${divider}

${ux.colorize( 'bold', ux.colorize( 'green', '✅ SUCCESS!' ) )} ${ux.colorize( 'bold', 'Docker Compose configuration ejected' )}

${divider}

${createSectionHeader( 'CONFIGURATION DETAILS', '📦' )}

  ${bulletPoint} ${ux.colorize( 'white', 'Location:' )} ${formatPath( destPath )}
  ${bulletPoint} ${ux.colorize( 'white', 'Services:' )} Temporal, Redis, PostgreSQL, API, Worker, UI
  ${bulletPoint} ${ux.colorize( 'white', 'Network:' )} Isolated bridge network for all services

${divider}

${createSectionHeader( 'USAGE', '🚀' )}

  ${ux.colorize( 'white', 'Start services with your custom configuration:' )}

    ${formatCommand( `${binName} dev --compose-file ${outputFile}` )}

  ${ux.colorize( 'white', 'Or use Docker Compose directly:' )}

    ${formatCommand( `docker compose -f ${outputFile} up` )}

${divider}

${createSectionHeader( 'CUSTOMIZATION OPTIONS', '🎨' )}

${formattedTips}

${divider}

${createSectionHeader( 'COMMON MODIFICATIONS', '🔧' )}

${formattedExamples}

${divider}

${createSectionHeader( 'IMPORTANT NOTES', '⚠️' )}

  ${bulletPoint} ${ux.colorize( 'yellow', 'Service Dependencies:' )} Maintain the ${ux.colorize( 'cyan', 'depends_on' )} relationships
  ${bulletPoint} ${ux.colorize( 'yellow', 'Health Checks:' )} Keep health check configurations for service reliability
  ${bulletPoint} ${ux.colorize( 'yellow', 'Volume Names:' )} Be careful when changing volume names (data persistence)
  ${bulletPoint} ${ux.colorize( 'yellow', 'Network Mode:' )} The ${ux.colorize( 'cyan', 'main' )} network connects all services

${divider}

${ux.colorize( 'dim', '💡 Tip: Test your changes with ' )}${formatCommand( 'docker compose config' )}${ux.colorize( 'dim', ' to validate the syntax' )}

${ux.colorize( 'green', ux.colorize( 'bold', 'Happy customizing! 🛠️' ) )}
`;
};

export const getProjectSuccessMessage = (
  folderName: string,
  installSuccess: boolean,
  envConfigured: boolean = false
): string => {
  const divider = ux.colorize( 'dim', '─'.repeat( 80 ) );
  const bulletPoint = ux.colorize( 'green', '▸' );

  // Build the next steps array with proper formatting
  const steps: Array<{ step: string; command?: string; note?: string }> = [
    {
      step: 'Navigate to your project',
      command: `cd ${folderName}`
    }
  ];

  if ( !installSuccess ) {
    steps.push( {
      step: 'Install dependencies',
      command: 'npm install',
      note: 'Required before running workflows'
    } );
  }

  if ( !envConfigured ) {
    steps.push( {
      step: 'Configure environment variables',
      command: 'cp .env.example .env',
      note: 'Copy .env.example to .env and add your API keys'
    } );
  }

  steps.push(
    {
      step: 'Start development services',
      command: 'npx output dev',
      note: 'Launches Temporal, Redis, PostgreSQL, API, Worker, and UI'
    },
    {
      step: 'Run example workflow',
      command: 'npx output workflow run blog_evaluator paulgraham_hwh',
      note: 'Execute in a new terminal after services are running'
    },
    {
      step: 'Monitor workflows',
      command: 'open http://localhost:8080',
      note: 'Access Temporal UI for workflow visualization'
    }
  );

  // Format each step with proper indentation and colors
  const formattedSteps = steps.map( ( item, index ) => {
    const stepNumber = ux.colorize( 'dim', `${index + 1}.` );
    const stepText = ux.colorize( 'white', item.step );
    const command = item.command ? `\n     ${bulletPoint} ${formatCommand( item.command )}` : '';
    const note = item.note ? `\n     ${ux.colorize( 'dim', `  ${item.note }` )}` : '';

    return `  ${stepNumber} ${stepText}${command}${note}`;
  } ).join( '\n\n' );

  // Build the complete message using template string
  return `

${createOutputBanner()}

${divider}

${ux.colorize( 'bold', ux.colorize( 'green', '🎉 SUCCESS!' ) )} ${ux.colorize( 'bold', 'Your Output project has been created' )}

${divider}

${createSectionHeader( 'PROJECT DETAILS', '📁' )}

  ${bulletPoint} ${ux.colorize( 'white', 'Name:' )} ${formatPath( folderName )}
  ${bulletPoint} ${ux.colorize( 'white', 'Type:' )} Output Project
  ${bulletPoint} ${ux.colorize( 'white', 'Structure:' )} ${formatPath( '.outputai/' )} (agents), ${formatPath( 'workflows/' )} (implementations)

${divider}

${createSectionHeader( 'NEXT STEPS', '🚀' )}

${formattedSteps}

${divider}

${createSectionHeader( 'QUICK START COMMANDS', '⚡' )}

  ${bulletPoint} ${ux.colorize( 'white', 'Plan a workflow:' )}     ${formatCommand( 'npx output workflow plan' )}
  ${bulletPoint} ${ux.colorize( 'white', 'Generate from plan:' )} ${formatCommand( 'npx output workflow generate' )}
  ${bulletPoint} ${ux.colorize( 'white', 'List workflows:' )}      ${formatCommand( 'npx output workflow list' )}
  ${bulletPoint} ${ux.colorize( 'white', 'View help:' )}           ${formatCommand( 'npx output --help' )}

${divider}

${ux.colorize( 'dim', '💡 Tip: Use ' )}${formatCommand( 'npx output workflow plan' )}${ux.colorize( 'dim', ' to design your first custom workflow' )}
${ux.colorize( 'dim', '         with AI assistance.' )}

${ux.colorize( 'green', ux.colorize( 'bold', 'Happy building with Output! 🚀' ) )}
`;
};

export const getWorkflowGenerateSuccessMessage = (
  workflowName: string,
  targetDir: string,
  filesCreated: string[]
): string => {
  const divider = ux.colorize( 'dim', '─'.repeat( 80 ) );
  const bulletPoint = ux.colorize( 'green', '▸' );

  const formattedFiles = filesCreated.map( file => {
    return `  ${bulletPoint} ${formatPath( file )}`;
  } ).join( '\n' );

  const steps = [
    {
      step: 'Navigate to workflow directory',
      command: `cd ${targetDir}`
    },
    {
      step: 'Edit workflow files',
      note: 'Customize workflow.ts, steps.ts, and prompts to match your requirements'
    },
    {
      step: 'Configure environment',
      command: 'cp .env.example .env',
      note: 'Copy .env.example to .env and add your LLM provider credentials'
    },
    {
      step: 'Test your workflow',
      command: `npx output workflow run ${workflowName} test_input`,
      note: 'Run after starting services with "npx output dev"'
    }
  ];

  const formattedSteps = steps.map( ( item, index ) => {
    const stepNumber = ux.colorize( 'dim', `${index + 1}.` );
    const stepText = ux.colorize( 'white', item.step );
    const command = item.command ? `\n     ${bulletPoint} ${formatCommand( item.command )}` : '';
    const note = item.note ? `\n     ${ux.colorize( 'dim', `  ${item.note}` )}` : '';

    return `  ${stepNumber} ${stepText}${command}${note}`;
  } ).join( '\n\n' );

  return `
${divider}

${ux.colorize( 'bold', ux.colorize( 'green', '✅ SUCCESS!' ) )} ${ux.colorize( 'bold', `Workflow "${workflowName}" created` )}

${divider}

${createSectionHeader( 'WORKFLOW DETAILS', '📁' )}

  ${bulletPoint} ${ux.colorize( 'white', 'Name:' )} ${formatPath( workflowName )}
  ${bulletPoint} ${ux.colorize( 'white', 'Location:' )} ${formatPath( targetDir )}

${divider}

${createSectionHeader( 'FILES CREATED', '📄' )}

${formattedFiles}

${divider}

${createSectionHeader( 'NEXT STEPS', '🚀' )}

${formattedSteps}

${divider}

${ux.colorize( 'dim', '💡 Tip: Check the README.md in your workflow directory for detailed documentation.' )}

${ux.colorize( 'green', ux.colorize( 'bold', 'Happy building! 🛠️' ) )}
`;
};

export const getDevSuccessMessage = ( services: Array<{ name: string }> ): string => {
  const divider = ux.colorize( 'dim', '─'.repeat( 80 ) );
  const bulletPoint = ux.colorize( 'green', '▸' );
  const serviceNames = services.map( s => s.name ).sort().join( '|' );
  const logsCommand = `docker compose -p ${config.dockerServiceName} logs -f <${serviceNames}>`;

  return `
${divider}

${ux.colorize( 'bold', ux.colorize( 'green', '✅ SUCCESS!' ) )} ${ux.colorize( 'bold', 'Development services are running' )}

${divider}

${createSectionHeader( 'SERVICES', '🐳' )}

  ${bulletPoint} ${ux.colorize( 'white', 'Temporal:' )}     ${formatPath( 'localhost:7233' )}
  ${bulletPoint} ${ux.colorize( 'white', 'Temporal UI:' )} ${formatCommand( 'http://localhost:8080' )}
  ${bulletPoint} ${ux.colorize( 'white', 'API Server:' )}  ${formatPath( 'localhost:3001' )}
  ${bulletPoint} ${ux.colorize( 'white', 'Redis:' )}       ${formatPath( 'localhost:6379' )}

${divider}

${createSectionHeader( 'RUN A WORKFLOW', '🚀' )}

  ${ux.colorize( 'white', 'In a new terminal, execute:' )}

    ${formatCommand( 'npx output workflow run blog_evaluator paulgraham_hwh' )}

${divider}

${createSectionHeader( 'USEFUL COMMANDS', '⚡' )}

  ${bulletPoint} ${ux.colorize( 'white', 'Open Temporal UI:' )} ${formatCommand( 'open http://localhost:8080' )}
  ${bulletPoint} ${ux.colorize( 'white', 'View logs:' )}        ${formatCommand( logsCommand )}
  ${bulletPoint} ${ux.colorize( 'white', 'Stop services:' )}    ${formatCommand( 'Press Ctrl+C' )}

${divider}

${ux.colorize( 'dim', '💡 Tip: The Temporal UI lets you monitor workflow executions in real-time' )}
`;
};
