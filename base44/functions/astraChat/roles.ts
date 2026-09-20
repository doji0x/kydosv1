/**
 * Typed registry of all specialist roles and their workflow boundaries for crew-based work.
 */

export type CrewRoleID =
  | 'architect'
  | 'logic_math_engineer'
  | 'code_specialist'
  | 'reviewer'
  | 'auditor'
  | 'lead_engineer'
  | 'operator';

export const CrewRoleID = [
  'architect',
  'logic_math_engineer',
  'code_specialist',
  'reviewer',
  'auditor',
  'lead_engineer',
  'operator'
] as const;

export interface CrewRole {
  id: CrewRoleID;
  label: string;
  description: string;
  responsibilities: string[];
  permissions: string[];
  reviewRequired: boolean;
  approvalRequired: boolean;
  maySelfApprove: boolean;
  exampleActions: string[];
  context: string;
}

export const CrewRoles: CrewRole[] = [
  {
    id: 'architect',
    label: 'Architect',
    description: 'Defines requirements, workflow, and structural standards for jobs.',
    responsibilities: [
      'Produce clear plans and rationale.',
      'Enumerate all structural changes first.',
      'Hand off complete reasoning to execution roles.'
    ],
    permissions: [
      'initiate_job',
      'produce_plan',
      'require_rationale'
    ],
    reviewRequired: false,
    approvalRequired: true,
    maySelfApprove: false,
    exampleActions: [
      'Write architecture plan.',
      'Approve foundational workflow change.'
    ],
    context: 'Team leadership, project management.'
  },
  {
    id: 'logic_math_engineer',
    label: 'Logic / Math Engineer',
    description: 'Defines formal requirements, proofs, and types for new workflow/data.',
    responsibilities: [
      'Produce strict types/interfaces.',
      'Show edge-case/risk analysis with rationale.'
    ],
    permissions: [
      'design_type',
      'solidify_contracts'
    ],
    reviewRequired: true,
    approvalRequired: true,
    maySelfApprove: false,
    exampleActions: [
      'Author workflow contract.',
      'Formalize roles registry.'
    ],
    context: 'Critical design, correctness.'
  },
  {
    id: 'code_specialist',
    label: 'Code Specialist',
    description: 'Implements, adapts, and maintains production code per TaskPlan.',
    responsibilities: [
      'Follow designed types.',
      'Make changes per approved plan.'
    ],
    permissions: [
      'implement_feature',
      'make_code_change'
    ],
    reviewRequired: true,
    approvalRequired: true,
    maySelfApprove: false,
    exampleActions: [
      'Commit function using contract.',
      'Refactor per plan.'
    ],
    context: 'Production code, backend, or frontend.'
  },
  {
    id: 'reviewer',
    label: 'Reviewer',
    description: 'Reviews plans, code, or configs for correctness, risk, and clarity.',
    responsibilities: [
      'Spot errors, holes, unauthorized changes.',
      'Flag unclear rationale or missing audit.'
    ],
    permissions: [
      'review_code',
      'require_changes'
    ],
    reviewRequired: false,
    approvalRequired: false,
    maySelfApprove: false,
    exampleActions: [
      'Approve code patch.',
      'Request clarification or rewrite.'
    ],
    context: 'Peer review, safety net.'
  },
  {
    id: 'auditor',
    label: 'Auditor',
    description: 'Final check: documents, records, and reports audit findings to owner.',
    responsibilities: [
      'Record every finding before hand-off.',
      'Never fix own audit finding.'
    ],
    permissions: [
      'run_audit',
      'record_issue'
    ],
    reviewRequired: false,
    approvalRequired: true,
    maySelfApprove: false,
    exampleActions: [
      'Log audit finding to issues.',
      'Produce final merge/safety report.'
    ],
    context: 'Security, compliance, trust.'
  },
  {
    id: 'lead_engineer',
    label: 'Lead Engineer',
    description: 'Coordinates between architect and implementers, ensures plan clarity.',
    responsibilities: [
      'Mediate plan conflicts.',
      'Defend rationale to team or owner.'
    ],
    permissions: [
      'mediate_conflict',
      'clarify_plan'
    ],
    reviewRequired: false,
    approvalRequired: true,
    maySelfApprove: false,
    exampleActions: [
      'Merge after consensus.',
      'Clarify change context.'
    ],
    context: 'Bridge roles, unblock execution.'
  },
  {
    id: 'operator',
    label: 'Operator',
    description: 'Runs standard, repeated, or scripted workflow steps as trusted bot.',
    responsibilities: [
      'Execute automated checklist.',
      'Never self-approve.'
    ],
    permissions: [
      'run_workflow',
      'auto_log_event'
    ],
    reviewRequired: false,
    approvalRequired: false,
    maySelfApprove: false,
    exampleActions: [
      'Auto-log job rotation.',
      'Run automated step.'
    ],
    context: 'Infrastructure, automation.'
  }
];