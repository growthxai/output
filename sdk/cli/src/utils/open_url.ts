import { execFile } from 'node:child_process';

export const openUrl = ( url: string ): void => {
  if ( process.platform === 'darwin' ) {
    execFile( 'open', [ url ] );
  } else if ( process.platform === 'win32' ) {
    execFile( 'cmd', [ '/c', 'start', url ] );
  } else {
    execFile( 'xdg-open', [ url ] );
  }
};
