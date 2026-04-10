import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  confirm as inquirerConfirm,
  input as inquirerInput,
  password as inquirerPassword
} from '@inquirer/prompts';

vi.mock( '@inquirer/prompts', () => ( {
  confirm: vi.fn(),
  input: vi.fn(),
  password: vi.fn()
} ) );

vi.mock( './interactive.js', () => ( {
  isInteractive: vi.fn()
} ) );

describe( 'prompt wrapper', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  describe( 'when interactive', () => {
    beforeEach( async () => {
      const { isInteractive } = await import( './interactive.js' );
      vi.mocked( isInteractive ).mockReturnValue( true );
    } );

    it( 'confirm delegates to inquirer', async () => {
      vi.mocked( inquirerConfirm ).mockResolvedValue( false );
      const { confirm } = await import( './prompt.js' );

      const result = await confirm( { message: 'Continue?', default: true } );

      expect( inquirerConfirm ).toHaveBeenCalledWith( { message: 'Continue?', default: true } );
      expect( result ).toBe( false );
    } );

    it( 'input delegates to inquirer', async () => {
      vi.mocked( inquirerInput ).mockResolvedValue( 'user input' );
      const { input } = await import( './prompt.js' );

      const result = await input( { message: 'Name?', default: 'default' } );

      expect( inquirerInput ).toHaveBeenCalledWith( { message: 'Name?', default: 'default' } );
      expect( result ).toBe( 'user input' );
    } );

    it( 'password delegates to inquirer', async () => {
      vi.mocked( inquirerPassword ).mockResolvedValue( 'secret' );
      const { password } = await import( './prompt.js' );

      const result = await password( { message: 'Token?' } );

      expect( inquirerPassword ).toHaveBeenCalledWith( { message: 'Token?' } );
      expect( result ).toBe( 'secret' );
    } );
  } );

  describe( 'when non-interactive', () => {
    beforeEach( async () => {
      const { isInteractive } = await import( './interactive.js' );
      vi.mocked( isInteractive ).mockReturnValue( false );
    } );

    it( 'confirm returns default value', async () => {
      const { confirm } = await import( './prompt.js' );

      expect( await confirm( { message: 'Continue?', default: false } ) ).toBe( false );
      expect( await confirm( { message: 'Continue?', default: true } ) ).toBe( true );
      expect( inquirerConfirm ).not.toHaveBeenCalled();
    } );

    it( 'confirm defaults to true when no default specified', async () => {
      const { confirm } = await import( './prompt.js' );

      expect( await confirm( { message: 'Continue?' } ) ).toBe( true );
      expect( inquirerConfirm ).not.toHaveBeenCalled();
    } );

    it( 'input returns default value', async () => {
      const { input } = await import( './prompt.js' );

      expect( await input( { message: 'Name?', default: 'fallback' } ) ).toBe( 'fallback' );
      expect( inquirerInput ).not.toHaveBeenCalled();
    } );

    it( 'input returns empty string when no default', async () => {
      const { input } = await import( './prompt.js' );

      expect( await input( { message: 'Name?' } ) ).toBe( '' );
      expect( inquirerInput ).not.toHaveBeenCalled();
    } );

    it( 'password returns empty string', async () => {
      const { password } = await import( './prompt.js' );

      expect( await password( { message: 'Token?' } ) ).toBe( '' );
      expect( inquirerPassword ).not.toHaveBeenCalled();
    } );
  } );
} );
