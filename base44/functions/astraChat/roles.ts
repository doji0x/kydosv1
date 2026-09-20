// Role registry for effective crew workflow in AstraChat

export interface AgentRole {
  /** Unique role identifier (e.g. 'summarizer', 'fact_checker') */
  id: string;
  /** Display label for UI */
  label: string;
  /** Core description for documentation */
  description: string;
  /** If the role requires another agent to review/result */
  requiresReview?: boolean;
}

// Canonical list of workflow agent roles
export const agentRoles: AgentRole[] = [
  {
    id: 'leader',
    label: 'Crew Leader',
    description: 'Coordinates agent tasks, assigns roles, and ensures completion of objectives.',
    requiresReview: false,
  },
  {
    id: 'researcher',
    label: 'Research Agent',
    description: 'Finds, verifies, and compiles factual information relevant to workflow prompts.',
  },
  {
    id: 'summarizer',
    label: 'Summarizer',
    description: 'Condenses responses or findings from the crew into concise and clear outputs.',
  },
  {
    id: 'fact_checker',
    label: 'Fact Checker',
    description: 'Verifies claims, citations, and complex information for correctness and reliability.',
    requiresReview: false,
  },
  {
    id: 'resolver',
    label: 'Resolution Agent',
    description: 'Assesses disputes, reviews multiple agent outputs, and selects consensus or correct path.',
    requiresReview: true,
  }
];
