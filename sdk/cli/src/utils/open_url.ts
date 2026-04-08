import { execFile } from 'node:child_process';

export const openUrl = ( url: string ): void => {
  execFile( 'open', [ url ] );
};
