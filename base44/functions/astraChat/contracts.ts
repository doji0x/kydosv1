// Types and contracts for AstraChat Effective Crew Workflow

import type { AgentRole } from './roles';

/** Workflow Stage names */
export type CrewWorkflowStage =
  | 'initiate'
  | 'assign_roles'
  | 'agent_task'
  | 'review'
  | 'finalize';

/** Agent Role Assignment structure */
export interface AssignedAgentRole {
  agentId: string;
  role: AgentRole['id'];
}

/** Activity, completion, and error for agent tasking */
export interface CrewAgentActivity {
  agentId: string;
  role: AgentRole['id'];
  stage: CrewWorkflowStage;
  startedAt: string;
  completedAt?: string;
  error?: string;
  output?: any;
}

export interface CrewWorkflowState {
  crewId: string;
  stage: CrewWorkflowStage;
  assignedRoles: AssignedAgentRole[];
  activities: CrewAgentActivity[];
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export interface CrewWorkflowInput {
  prompt: string;
  crewSize: number;
  requiredRoles: AgentRole['id'][];
}

export interface CrewWorkflowResult {
  crewId: string;
  outputs: any[];
  completedAt: string;
  success: boolean;
  error?: string;
}
