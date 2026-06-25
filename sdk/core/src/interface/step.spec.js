import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ValidationError } from '#errors';

const validateDefinitionMock = vi.hoisted( () => vi.fn() );
const validateInputMock = vi.hoisted( () => vi.fn() );
const validateOutputMock = vi.hoisted( () => vi.fn() );
const validatorConstructorMock = vi.hoisted( () => vi.fn() );
const createStepMock = vi.hoisted( () => vi.fn( ( { handler } ) => handler ) );

vi.mock( './validations/index.js', () => {
  class StepValidator {
    static validateDefinition( ...args ) {
      return validateDefinitionMock( ...args );
    }

    constructor( ...args ) {
      validatorConstructorMock( ...args );
      this.validateInput = validateInputMock;
      this.validateOutput = validateOutputMock;
    }
  }

  return { StepValidator };
} );

vi.mock( '#helpers/component', () => ( {
  createStep: createStepMock
} ) );

describe( 'step()', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  it( 'validates the definition, creates a runtime validator, and creates a step component', async () => {
    const { step } = await import( './step.js' );
    const inputSchema = { safeParse: vi.fn() };
    const outputSchema = { safeParse: vi.fn() };
    const fn = vi.fn().mockResolvedValue( { ok: true } );
    const options = { activityOptions: { startToCloseTimeout: '1m' } };

    const wrapper = step( {
      name: 'test_step',
      description: 'Test step',
      inputSchema,
      outputSchema,
      fn,
      options
    } );

    expect( validateDefinitionMock ).toHaveBeenCalledWith( {
      name: 'test_step',
      description: 'Test step',
      inputSchema,
      outputSchema,
      fn,
      options
    } );
    expect( validatorConstructorMock ).toHaveBeenCalledWith( {
      name: 'test_step',
      inputSchema,
      outputSchema
    } );

    expect( createStepMock ).toHaveBeenCalledWith( {
      name: 'test_step',
      description: 'Test step',
      inputSchema,
      outputSchema,
      options,
      handler: expect.any( Function )
    } );
    expect( wrapper ).toBe( createStepMock.mock.calls[0][0].handler );
  } );

  it( 'validates input and output around the step function', async () => {
    const { step } = await import( './step.js' );
    const output = { ok: true };
    const fn = vi.fn().mockResolvedValue( output );
    const wrapper = step( {
      name: 'runtime_step',
      inputSchema: undefined,
      outputSchema: undefined,
      fn
    } );

    await expect( wrapper( { value: 'input' } ) ).resolves.toBe( output );

    expect( validateInputMock ).toHaveBeenCalledWith( { value: 'input' } );
    expect( fn ).toHaveBeenCalledWith( { value: 'input' } );
    expect( validateOutputMock ).toHaveBeenCalledWith( output );
  } );

  it( 'does not call the step function when input validation throws', async () => {
    const { step } = await import( './step.js' );
    const error = new ValidationError( 'invalid input' );
    validateInputMock.mockImplementationOnce( () => {
      throw error;
    } );
    const fn = vi.fn();
    const wrapper = step( {
      name: 'invalid_input_step',
      fn
    } );

    await expect( wrapper( { value: 'bad' } ) ).rejects.toBe( error );
    expect( fn ).not.toHaveBeenCalled();
    expect( validateOutputMock ).not.toHaveBeenCalled();
  } );

  it( 'propagates output validation errors after the step function runs', async () => {
    const { step } = await import( './step.js' );
    const error = new ValidationError( 'invalid output' );
    validateOutputMock.mockImplementationOnce( () => {
      throw error;
    } );
    const output = { ok: false };
    const fn = vi.fn().mockResolvedValue( output );
    const wrapper = step( {
      name: 'invalid_output_step',
      fn
    } );

    await expect( wrapper( { value: 'input' } ) ).rejects.toBe( error );
    expect( fn ).toHaveBeenCalledOnce();
    expect( validateOutputMock ).toHaveBeenCalledWith( output );
  } );
} );
