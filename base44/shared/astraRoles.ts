export const CrewRoleID=['architect','logic','functions','integration','documentation','audit'] as const;
export type CrewRoleID=(typeof CrewRoleID)[number];
export const CrewRoles=[
 {id:'architect',title:'ARCHITECT',brief:'Map structure and return a concrete file-by-file plan.',writes:false,reviewRequired:false,approvalRequired:true,maySelfApprove:false},
 {id:'logic',title:'LOGIC / MATH ENGINEER',brief:'Implement algorithms, state transitions, and edge cases.',writes:true,reviewRequired:true,approvalRequired:true,maySelfApprove:false},
 {id:'functions',title:'FUNCTIONS ENGINEER',brief:'Implement backend handlers, validation, auth, and response contracts.',writes:true,reviewRequired:true,approvalRequired:true,maySelfApprove:false},
 {id:'integration',title:'INTEGRATION ENGINEER',brief:'Wire modules together and ensure imports and contracts agree.',writes:true,reviewRequired:true,approvalRequired:true,maySelfApprove:false},
 {id:'documentation',title:'DOCUMENTATION ENGINEER',brief:'Document exactly what shipped and how to use it.',writes:true,reviewRequired:true,approvalRequired:true,maySelfApprove:false},
 {id:'audit',title:'AUDIT / SECURITY',brief:'Review security, authorization, validation, secrets, and correctness. Never commit.',writes:false,reviewRequired:false,approvalRequired:true,maySelfApprove:false}
];
export const crewOrder=[...CrewRoleID];
export function getCrewRole(role:string){return CrewRoles.find(item=>item.id===role);}
export function assertCrewRegistry(){if(CrewRoles.length!==crewOrder.length||new Set(CrewRoles.map(x=>x.id)).size!==crewOrder.length)throw new Error('Crew registry must define every live role exactly once.');const audit=CrewRoles.find(x=>x.id==='audit');if(CrewRoles.some(x=>x.maySelfApprove)||!audit||audit.writes||crewOrder.at(-1)!=='audit')throw new Error('Audit must be the final, non-writing crew role.');}