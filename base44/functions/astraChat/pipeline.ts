import { assertCrewRegistry, crewOrder, getCrewRole } from './roles.ts';

export { crewOrder };

export function createPipeline() {
 assertCrewRegistry();
 let cursor=0; let issues=0;
 return {
  get issues(){return issues;},
  recordIssue(){issues++;},
  claim(role){
   if(issues) return {error:'Audit approval is required before more delegation.'};
   const spec=getCrewRole(role); if(!spec) return {error:'Unknown crew role.'};
   if(spec.maySelfApprove) return {error:'Crew roles cannot self-approve.'};
   const index=crewOrder.indexOf(spec.id);
   if(index<cursor) return {error:'That specialist already completed its turn.'};
   const skipped=crewOrder.slice(cursor,index); cursor=index+1;
   return {skipped};
  }
 };
}