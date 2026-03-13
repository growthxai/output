import { Command, Flags } from '@oclif/core';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getDefaultDockerComposePath } from '#services/docker.js';
import { getErrorMessage } from '#utils/error_utils.js';
import { getEjectSuccessMessage } from '#services/messages.js';

export default class DevEject extends Command {
  static description = 'Eject the Docker Compose configuration to your project root for customization';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --output ./custom-compose.yml'
  ];

  static args = {};

  static flags = {
    output: Flags.string( {
      description: 'Output path for the docker-compose file',
      required: false,
      char: 'o',
      default: 'docker-compose.yml'
    } ),
    force: Flags.boolean( {
      description: 'Overwrite existing file without prompting',
      required: false,
      char: 'f',
      default: false
    } )
  };

  async run(): Promise<void> {
    const { flags } = await this.parse( DevEject );

    // Source docker-compose file from assets
    const sourcePath = getDefaultDockerComposePath();

    // Destination path (relative to current working directory)
    const destPath = path.resolve( process.cwd(), flags.output );

    try {
      // Check if source file exists
      await fs.access( sourcePath );
    } catch {
      this.error( `Docker Compose template not found at: ${sourcePath}`, { exit: 1 } );
    }

    // Check if destination file already exists
    const fileExists = await fs.access( destPath ).then( () => true ).catch( () => false );

    if ( fileExists && !flags.force ) {
      this.error(
        `File already exists at ${destPath}. Use --force to overwrite or specify a different output path with --output`,
        { exit: 1 }
      );
    }

    try {
      // Read the source file
      const dockerComposeContent = await fs.readFile( sourcePath, 'utf-8' );

      // Write to destination
      await fs.writeFile( destPath, dockerComposeContent, 'utf-8' );

      // Display the styled success message
      this.log( getEjectSuccessMessage( destPath, flags.output, this.config.bin ) );

    } catch ( error ) {
      this.error( `Failed to eject docker-compose configuration: ${getErrorMessage( error )}`, { exit: 1 } );
    }
  }
}
