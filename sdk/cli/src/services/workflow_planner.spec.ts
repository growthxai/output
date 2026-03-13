import { describe, it, expect, beforeEach, vi } from 'vitest';
import { generatePlanName, writePlanFile, updateAgentTemplates } from './workflow_planner.js';
import { initializeAgentConfig } from './coding_agents.js';
import { generateText, GenerateTextResult } from '@outputai/llm';
import fs from 'node:fs/promises';

vi.mock( './coding_agents.js' );
vi.mock( '@outputai/llm' );
vi.mock( 'node:fs/promises' );

const mockGenerateTextResult = ( text: string ): GenerateTextResult => ( {
  text,
  result: text,
  usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
  finishReason: 'stop'
} as unknown as GenerateTextResult );

describe( 'workflow-planner service', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  describe( 'generatePlanName', () => {
    it( 'should generate plan name with date prefix using LLM', async () => {
      vi.mocked( generateText ).mockResolvedValue(
        mockGenerateTextResult( 'customer_order_processing' )
      );

      const testDate = new Date( 2025, 9, 6 );
      const planName = await generatePlanName( 'A workflow that processes customer orders', testDate );

      expect( planName ).toMatch( /^2025_10_06_/ );
      expect( planName ).toBe( '2025_10_06_customer_order_processing' );

      expect( generateText ).toHaveBeenCalledWith( {
        prompt: 'generate_plan_name@v1',
        variables: { description: 'A workflow that processes customer orders' }
      } );
    } );

    it( 'should clean and validate LLM response', async () => {
      vi.mocked( generateText ).mockResolvedValue(
        mockGenerateTextResult( '  User-Auth & Security!@#  ' )
      );

      const testDate = new Date( 2025, 9, 6 );
      const planName = await generatePlanName( 'User authentication workflow', testDate );

      expect( planName ).toBe( '2025_10_06_user_auth_security' );
      expect( planName ).toMatch( /^[0-9_a-z]+$/ );
    } );

    it( 'should handle LLM errors gracefully', async () => {
      vi.mocked( generateText ).mockRejectedValue( new Error( 'API rate limit exceeded' ) );

      await expect(
        generatePlanName( 'Test workflow' )
      ).rejects.toThrow( 'API rate limit exceeded' );
    } );

    it( 'should limit plan name length to 50 characters', async () => {
      vi.mocked( generateText ).mockResolvedValue(
        mockGenerateTextResult( 'this_is_an_extremely_long_plan_name_that_exceeds_the_maximum_allowed_length_for_file_names' )
      );

      const testDate = new Date( 2025, 9, 6 );
      const planName = await generatePlanName( 'Long workflow description', testDate );

      const namePart = planName.replace( /^2025_10_06_/, '' );
      expect( namePart.length ).toBeLessThanOrEqual( 50 );
    } );

    it( 'should handle multiple underscores correctly', async () => {
      vi.mocked( generateText ).mockResolvedValue(
        mockGenerateTextResult( 'user___auth___workflow' )
      );

      const testDate = new Date( 2025, 9, 6 );
      const planName = await generatePlanName( 'Test', testDate );

      expect( planName ).toBe( '2025_10_06_user_auth_workflow' );
      expect( planName ).not.toContain( '__' );
    } );
  } );

  describe( 'writePlanFile', () => {
    it( 'should create plan directory and write PLAN.md', async () => {
      vi.mocked( fs.mkdir ).mockResolvedValue( undefined );
      vi.mocked( fs.writeFile ).mockResolvedValue( undefined );

      const planName = '2025_10_06_test_plan';
      const content = '# Test Plan\n\nThis is a test plan.';
      const projectRoot = '/test/project';

      const planPath = await writePlanFile( planName, content, projectRoot );

      expect( fs.mkdir ).toHaveBeenCalledWith(
        '/test/project/.outputai/plans/2025_10_06_test_plan',
        { recursive: true }
      );

      expect( fs.writeFile ).toHaveBeenCalledWith(
        '/test/project/.outputai/plans/2025_10_06_test_plan/PLAN.md',
        content,
        'utf-8'
      );

      expect( planPath ).toBe( '/test/project/.outputai/plans/2025_10_06_test_plan/PLAN.md' );
    } );

    it( 'should return the plan file path', async () => {
      vi.mocked( fs.mkdir ).mockResolvedValue( undefined );
      vi.mocked( fs.writeFile ).mockResolvedValue( undefined );

      const planPath = await writePlanFile( 'test_plan', 'content', '/root' );

      expect( planPath ).toBe( '/root/.outputai/plans/test_plan/PLAN.md' );
    } );

    it( 'should handle nested directory creation', async () => {
      vi.mocked( fs.mkdir ).mockResolvedValue( undefined );
      vi.mocked( fs.writeFile ).mockResolvedValue( undefined );

      await writePlanFile( '2025_10_06_nested_plan', 'content', '/deep/nested/path' );

      expect( fs.mkdir ).toHaveBeenCalledWith(
        '/deep/nested/path/.outputai/plans/2025_10_06_nested_plan',
        { recursive: true }
      );
    } );

    it( 'should handle UTF-8 content with special characters', async () => {
      vi.mocked( fs.mkdir ).mockResolvedValue( undefined );
      vi.mocked( fs.writeFile ).mockResolvedValue( undefined );

      const content = '# Plan\n\nSpecial characters: quotes and dashes';
      await writePlanFile( 'unicode_test', content, '/test' );

      expect( fs.writeFile ).toHaveBeenCalledWith(
        expect.any( String ),
        content,
        'utf-8'
      );
    } );

    it( 'should throw error when directory creation fails', async () => {
      vi.mocked( fs.mkdir ).mockRejectedValue( new Error( 'Permission denied' ) );

      await expect( writePlanFile( 'test', 'content', '/root' ) )
        .rejects.toThrow( 'Permission denied' );
    } );

    it( 'should throw error when file writing fails', async () => {
      vi.mocked( fs.mkdir ).mockResolvedValue( undefined );
      vi.mocked( fs.writeFile ).mockRejectedValue( new Error( 'Disk full' ) );

      await expect( writePlanFile( 'test', 'content', '/root' ) )
        .rejects.toThrow( 'Disk full' );
    } );
  } );

  describe( 'updateAgentTemplates', () => {
    it( 'should invoke initializeAgentConfig with force flag', async () => {
      vi.mocked( initializeAgentConfig ).mockResolvedValue();

      await updateAgentTemplates( '/test/project' );

      expect( initializeAgentConfig ).toHaveBeenCalledWith( {
        projectRoot: '/test/project',
        force: true
      } );
    } );

    it( 'should propagate errors from initializeAgentConfig', async () => {
      vi.mocked( initializeAgentConfig ).mockRejectedValue(
        new Error( 'Failed to write templates' )
      );

      await expect( updateAgentTemplates( '/test/project' ) )
        .rejects.toThrow( 'Failed to write templates' );
    } );

    it( 'should work with different project roots', async () => {
      vi.mocked( initializeAgentConfig ).mockResolvedValue();

      await updateAgentTemplates( '/different/path' );

      expect( initializeAgentConfig ).toHaveBeenCalledWith(
        expect.objectContaining( {
          projectRoot: '/different/path'
        } )
      );
    } );
  } );
} );
