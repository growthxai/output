import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
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

const resolveWorkflowImagePath = ( imagePath: string ) =>
  isAbsolute( imagePath ) ? imagePath : join( workflowDir, imagePath );

export const generateNascarImage = step( {
  name: 'generateNascarImage',
  description: 'Generate a NASCAR image from a prompt file',
  inputSchema: z.object( {
    scene: z.string(),
    style: z.string().optional(),
    referenceImagePath: z.string().optional()
  } ),
  outputSchema: z.object( {
    fileName: z.string()
  } ),
  fn: async ( { scene, style, referenceImagePath } ) => {
    const referenceImage = referenceImagePath ? readFileSync( resolveWorkflowImagePath( referenceImagePath ) ) : null;

    const response = await generateImage( {
      prompt: 'nascar_race@v1',
      variables: {
        scene,
        style: style ?? 'cinematic, high-energy motorsport photography',
        referenceInstruction: referenceImage ?
          'Use the provided NASCAR reference image as the base car design, preserving its race-car identity and stance.' :
          'Create an original NASCAR race scene without a reference image.'
      },
      ...( referenceImage && { images: [ referenceImage ] } )
    } );

    if ( !response.result?.base64 ) {
      throw new Error( 'Image generation did not return base64 image data.' );
    }

    mkdirSync( tempDir, { recursive: true } );

    const extension = extensionFromMediaType( response.result.mediaType );
    const fileName = `nascar-race-${randomUUID()}.${extension}`;
    const filePath = join( tempDir, fileName );
    writeFileSync( filePath, Buffer.from( response.result.base64, 'base64' ) );

    return { fileName };
  }
} );
