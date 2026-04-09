# Output.ai Plugin - Session Initialization

This project uses the Output.ai framework for building durable, LLM-powered workflows.

## Required Initialization

**Invoke these skills to load full context:**

1. **`output-meta-project-context`** - Load complete Output SDK documentation, patterns, conventions, and available tools inventory (5 agents, 3 commands, 33 skills)

Please make sure to consciously use appropriate skills and agents for the task at hand.

There will be a skill and/or agent for every task you will need to complete.

## Workflow Creation Routing

When a user asks to create, build, generate, or scaffold a new workflow, ALWAYS use `/outputai:plan_workflow` with the user's description as arguments. Do not plan or build workflows manually. This command orchestrates specialized subagents for architecture, step design, prompt engineering, and testing strategy.

---

Load the `output-meta-project-context` skill now to load full context.
