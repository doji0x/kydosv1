# Agents in Astra

...

## Agent and Crew Workflow Conventions

Astra’s Crew Workflow model uses clear conventions for defining, assigning, and orchestrating role-based agents. Adopt the following practices:

- **Roles** are registered and versioned in code (`base44/functions/astraChat/roles.ts`). Each role has an `id`, `label`, and `description`, and may define if review is required.
- **Types** are defined strictly in `base44/functions/astraChat/contracts.ts` and extend to all agent task workflows.
- **Stages** of workflow (`initiate`, `assign_roles`, `agent_task`, `review`, `finalize`) must be observed in all crew-based task logics. Use `CrewWorkflowStage` and related interfaces.
- **Assignments** pair an `agentId` to a role and track with `AssignedAgentRole` and `CrewAgentActivity` types.
- **Termination** is explicit: workflows document `completedAt` timestamps and clear `success` states.
- **Documentation** for new roles or workflow logic must append to this section and reference code locations.

Review and compliance with these conventions is required for all Astra Crew agent workflows. See code in `base44/functions/astraChat/roles.ts` and `contracts.ts` for the latest definitions.
