/**
 * Workflow Data Contracts for AstraChat Crew
 */

import { CrewRoleID } from "./roles.ts";

export interface JobSpec {
  id: string;
  title: string;
  description: string;
  requirements: string[];
  requestedBy: string;
  createdAt: string; // ISO8601
  crew: CrewAssignment[];
  state: "created" | "in_progress" | "paused" | "completed" | "cancelled";
}

export interface CrewAssignment {
  userId: string;
  role: CrewRoleID;
  assignedAt: string;
}

export interface TaskPlan {
  id: string;
  jobId: string;
  author: string; // userId
  summary: string;
  steps: string[];
  createdAt: string;
  reviewedBy?: string; // reviewer userId
  reviewComment?: string;
  approvedBy?: string; // approver userId
  approvalComment?: string;
  state: "draft" | "reviewed" | "approved" | "rejected";
}

export interface SpecialistResult {
  id: string;
  taskPlanId: string;
  author: string;
  output: string;
  submittedAt: string;
  reviewRequested?: boolean;
  reviewedBy?: string;
  reviewComment?: string;
  approvedBy?: string;
  approvalComment?: string;
  state: "submitted" | "in_review" | "approved" | "rejected";
}

export interface ChangeProposal {
  id: string;
  jobId: string;
  proposedBy: string;
  proposedAt: string;
  summary: string;
  details: string;
  state: "pending" | "approved" | "rejected";
  approvals: ApprovalRecord[];
}

export interface AuditFinding {
  id: string;
  relatedTo: string; // jobId or plan/result/proposal id
  foundBy: string;
  foundAt: string;
  description: string;
  severity: "minor" | "major" | "critical";
  resolved: boolean;
  resolutionNote?: string;
  resolvedAt?: string;
}

export interface ApprovalRecord {
  id: string;
  relatedTo: string; // plan/result/proposal id
  issuedBy: string;
  issuedAt: string;
  comment: string;
  type: "review" | "final_approval";
}

export interface RunEvent {
  id: string;
  timestamp: string;
  actor: string; // userId or botId
  action: string;
  relatedTo?: string;
  data?: Record<string, unknown>;
}

export type CrewWorkflowStage =
  | "initiate"
  | "assign_roles"
  | "agent_task"
  | "review"
  | "finalize";

export interface AssignedAgentRole {
  agentId: string;
  role: CrewRoleID;
}

export interface CrewAgentActivity {
  agentId: string;
  role: CrewRoleID;
  stage: CrewWorkflowStage;
  startedAt: string;
  completedAt?: string;
  error?: string;
  output?: unknown;
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
  requiredRoles: CrewRoleID[];
}

export interface CrewWorkflowResult {
  crewId: string;
  outputs: unknown[];
  completedAt: string;
  success: boolean;
  error?: string;
}
