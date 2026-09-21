export const CrewRoleID=['builder','audit'] as const;
export type CrewRoleID=(typeof CrewRoleID)[number];
export const CrewRoles=[
 {id:'builder',title:'BUILDER',brief:'Own the approved milestone end to end: inspect, design, implement, integrate, test, fix, and document the complete solution.',writes:true,reviewRequired:true,approvalRequired:true,maySelfApprove:false},
 {id:'audit',title:'AUDITOR',brief:'Perform the final read-only review of the completed milestone for security, authorization, validation, secrets, regressions, and correctness. Never commit.',writes:false,reviewRequired:false,approvalRequired:true,maySelfApprove:false}
];
export const crewOrder=[...CrewRoleID];
export function getCrewRole(role:string){return CrewRoles.find(item=>item.id===role);}
export function assertCrewRegistry(){if(CrewRoles.length!==crewOrder.length||new Set(CrewRoles.map(x=>x.id)).size!==crewOrder.length)throw new Error('Crew registry must define every live role exactly once.');const audit=CrewRoles.find(x=>x.id==='audit');if(CrewRoles.some(x=>x.maySelfApprove)||!audit||audit.writes||crewOrder.at(-1)!=='audit')throw new Error('Audit must be the final, non-writing crew role.');}