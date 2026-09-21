export const CrewRoleID=['builder'] as const;
export type CrewRoleID=(typeof CrewRoleID)[number];
export const CrewRoles=[
 {id:'builder',title:'BUILDER',brief:'Own the approved milestone end to end: inspect, design, implement, integrate, test, fix, and document the complete solution.',writes:true,reviewRequired:false,approvalRequired:true,maySelfApprove:false}
];
export const crewOrder=[...CrewRoleID];
export function getCrewRole(role:string){return CrewRoles.find(item=>item.id===role);}
export function assertCrewRegistry(){if(CrewRoles.length!==crewOrder.length||new Set(CrewRoles.map(x=>x.id)).size!==crewOrder.length)throw new Error('Crew registry must define every live role exactly once.');if(CrewRoles.some(x=>x.maySelfApprove))throw new Error('Crew roles cannot self-approve consequential decisions.');}