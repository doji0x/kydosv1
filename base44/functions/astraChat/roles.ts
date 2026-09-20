/**
 * Single source of truth for Astra's live specialist roles and boundaries.
 */

export const CrewRoleID = [
  'architect',
  'logic',
  'functions',
  'integration',
  'documentation',
  'audit'
] as const;

export type CrewRoleID = (typeof CrewRoleID)[number];

export interface CrewRole {
  id: CrewRoleID;
  title: string;
  brief: string;
  writes: boolean;
  reviewRequired: boolean;
  approvalRequired: boolean;
  maySelfApprove: false;
}

export const CrewRoles: CrewRole[] = [
  {
    id: 'architect',
    title: 'ARCHITECT',
    brief: 'Map structure and return a concrete file-by-file plan.',
    writes: false,
    reviewRequired: false,
    approvalRequired: true,
    maySelfApprove: false
  },
  {
    id: 'logic',
    title: 'LOGIC / MATH ENGINEER',
    brief: 'Implement algorithms, state transitions, and edge cases.',
    writes: true,
    reviewRequired: true,
    approvalRequired: true,
    maySelfApprove: false
  },
  {
    id: 'functions',
    title: 'FUNCTIONS ENGINEER',
    brief: 'Implement backend handlers, validation, auth, and response contracts.',
    writes: true,
    reviewRequired: true,
    approvalRequired: true,
    maySelfApprove: false
  },
  {
    id: 'integration',
    title: 'INTEGRATION ENGINEER',
    brief: 'Wire modules together and ensure imports and contracts agree.',
    writes: true,
    reviewRequired: true,
    approvalRequired: true,
    maySelfApprove: false
  },
  {
    id: 'documentation',
    title: 'DOCUMENTATION ENGINEER',
    brief: 'Document exactly what shipped and how to use it.',
    writes: true,
    reviewRequired: true,
    approvalRequired: true,
    maySelfApprove: false
  },
  {
    id: 'audit',
    title: 'AUDIT / SECURITY',
    brief: 'Review security, authorization, validation, secrets, and correctness. Never commit.',
    writes: false,
    reviewRequired: false,
    approvalRequired: true,
    maySelfApprove: false
  }
];

export const crewOrder: CrewRoleID[] = [...CrewRoleID];

export function getCrewRole(role: string): CrewRole | undefined {
  return CrewRoles.find(item => item.id === role);
}

export function assertCrewRegistry(): void {
  if (CrewRoles.length !== crewOrder.length || new Set(CrewRoles.map(role => role.id)).size !== crewOrder.length) {
    throw new Error('Crew registry must define every live role exactly once.');
  }
  if (CrewRoles.some(role => role.maySelfApprove)) {
    throw new Error('Crew roles cannot self-approve.');
  }
  const audit = CrewRoles.find(role => role.id === 'audit');
  if (!audit || audit.writes || crewOrder[crewOrder.length - 1] !== 'audit') {
    throw new Error('Audit must be the final, non-writing crew role.');
  }
}