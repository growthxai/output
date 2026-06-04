import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { step, z } from '@outputai/core';
import { generateImage } from '@outputai/llm';

const moduleDir = dirname( fileURLToPath( import.meta.url ) );
const workflowDir = moduleDir.includes( '/dist/workflows/' ) ?
  moduleDir.replace( '/dist/workflows/', '/src/workflows/' ) :
  moduleDir;
const tempDir = join( workflowDir, '_temp' );

const extensionFromMediaType = ( mediaType: string ) =>
  mediaType === 'image/jpeg' ? 'jpg' : mediaType?.split( '/' )[1] ?? 'png';

export const generateNascarImage = step( {
  name: 'generateNascarImage',
  description: 'Generate a NASCAR image from a prompt file',
  inputSchema: z.object( {
    scene: z.string(),
    style: z.string().optional()
  } ),
  outputSchema: z.object( {
    fileName: z.string()
  } ),
  fn: async ( { scene, style } ) => {
    const response = await generateImage( {
      prompt: 'nascar_race@v1',
      variables: {
        scene,
        style: style ?? 'cinematic, high-energy motorsport photography'
      }
    } );

    if ( !response.result?.base64 ) {
      throw new Error( 'Image generation did not return base64 image data.' );
    }

    await mkdir( tempDir, { recursive: true } );

    const extension = extensionFromMediaType( response.result.mediaType );
    const fileName = `nascar-race-${randomUUID()}.${extension}`;
    const filePath = join( tempDir, fileName );
    await writeFile( filePath, Buffer.from( response.result.base64, 'base64' ) );

    return {
      fileName
    };
  }
} );
