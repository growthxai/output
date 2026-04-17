import {
  confirm as inquirerConfirm,
  input as inquirerInput,
  password as inquirerPassword
} from '@inquirer/prompts';
import { isInteractive } from './interactive.js';

type ConfirmOptions = { message: string; default?: boolean };
type InputOptions = { message: string; default?: string; validate?: ( value: string ) => boolean | string };
type PasswordOptions = { message: string; mask?: boolean };

export const confirm = async ( options: ConfirmOptions ): Promise<boolean> => {
  if ( !isInteractive() ) {
    return options.default ?? true;
  }
  return inquirerConfirm( options );
};

export const input = async ( options: InputOptions ): Promise<string> => {
  if ( !isInteractive() ) {
    return options.default ?? '';
  }
  return inquirerInput( options );
};

export const password = async ( options: PasswordOptions ): Promise<string> => {
  if ( !isInteractive() ) {
    return '';
  }
  return inquirerPassword( options );
};
