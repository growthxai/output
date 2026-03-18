---
name: output-meta-post-flight
description: Post-flight validation for Output SDK workflow operations. Systematic verification of step completion, convention compliance, quality validation, and deliverable verification.
allowed-tools: [Read]
---

# Post-Flight Rules for Output SDK Workflows

## Execution Verification

After completing all steps in the process_flow, systematically verify:

### Step Completion Audit
- [ ] Every numbered step has been read, executed, and delivered according to its instructions
- [ ] All steps that specified a subagent were delegated to the correct subagent
- [ ] If any subagent was not used as specified, document why and report to the user
- [ ] If any step was not executed according to instructions, explain which part was misread or skipped

### Output SDK Convention Compliance

Verify the following conventions were followed:

#### Import Conventions
- [ ] All TypeScript/JavaScript imports use `.js` extension for ES modules
- [ ] No direct axios usage - HttpClient wrapper used throughout
- [ ] Proper import paths for Output SDK packages (@flowsdk/core, @flowsdk/llm, etc.)

#### Workflow Structure
- [ ] Workflow exported in entrypoint.ts: `export * from './path/to/workflow.js';`
- [ ] All external operations wrapped in Temporal activities (steps)
- [ ] Proper error handling with ApplicationFailure patterns
- [ ] Retry policies configured appropriately

#### Documentation & Testing
- [ ] Comprehensive plan document created with all required sections
- [ ] Testing strategy defined with specific test scenarios
- [ ] Implementation checklist provided for developers
- [ ] All code examples are complete and would compile

## Quality Validation

### Plan Completeness Check
Ensure the workflow plan includes:
- [ ] **Overview**: Clear purpose and use case definition
- [ ] **Technical Specifications**: Complete input/output schemas with Zod validation
- [ ] **Activity Definitions**: Each activity fully specified with purpose, I/O, and error handling
- [ ] **Prompt Engineering**: LLM prompts designed (if applicable) with template variables
- [ ] **Orchestration Logic**: Step-by-step workflow execution flow
- [ ] **Retry Policies**: Configured for each activity with appropriate timeouts
- [ ] **Testing Requirements**: Comprehensive test scenarios and commands

### Implementation Readiness
Confirm the plan is ready for implementation:
- [ ] All schemas defined with exact field types and descriptions
- [ ] Every activity specified with input/output/processing logic
- [ ] External services identified with specific SDK client references
- [ ] Error handling complete for all failure scenarios
- [ ] Testing scenarios documented with expected outcomes
- [ ] Performance requirements clear with measurable criteria

## Deliverable Verification

### Required Outputs
Verify these deliverables were created or updated:
- [ ] Workflow plan document with full specifications
- [ ] Activity schemas with Zod validation
- [ ] Prompt templates (if LLM integration required)
- [ ] Testing strategy with specific commands
- [ ] Implementation checklist for developers

### Next Steps Documentation
Ensure the following guidance is provided:
- [ ] Clear handoff to implementation phase
- [ ] Specific Output SDK CLI commands to execute
- [ ] Dependencies to install (if any)
- [ ] Configuration requirements documented
- [ ] Success criteria clearly defined

## Error Reporting

If any issues were encountered:
1. Document the specific issue and step where it occurred
2. Explain any deviations from the planned process
3. Provide recommendations for resolution
4. Note any missing information that prevented completion

## Final Validation

Before marking the workflow planning complete:
- [ ] Developer can implement without additional clarification
- [ ] All Output SDK patterns and conventions are followed
- [ ] Testing approach is comprehensive and executable
- [ ] Documentation is clear and complete
- [ ] Plan aligns with project's existing workflow patterns
