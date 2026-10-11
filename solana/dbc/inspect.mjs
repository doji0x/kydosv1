// Offline output only. This command never creates, signs or sends a transaction.
import { inspectCandidate, toPlain } from './candidate.mjs';
if (process.argv.length !== 2) throw new Error('No arguments accepted; redirect stdout to save the report');
const { report, parameters } = inspectCandidate();
console.log(JSON.stringify({ ...report, candidateParameters: toPlain(parameters) }, null, 2));
