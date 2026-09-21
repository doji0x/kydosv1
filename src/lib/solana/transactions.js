// Transaction outcomes are separate from RPC transport errors. Never auto-resubmit.
export function encodeSignature(bytes) {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let n = 0n;
  for (const byte of bytes) n = n * 256n + BigInt(byte);
  let result = '';
  while (n) { result = alphabet[Number(n % 58n)] + result; n /= 58n; }
  for (const byte of bytes) { if (byte !== 0) break; result = '1' + result; }
  return result;
}

export async function checkTransaction(connection, signature) {
  const { value } = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true });
  const status = value[0];
  if (!status) return { state: 'unknown', signature, message: 'Signature not found. This does not prove failure; do not resubmit.' };
  if (status.err) return { state: 'failed', signature, message: `Failed on chain: ${JSON.stringify(status.err)}` };
  if (['confirmed', 'finalized'].includes(status.confirmationStatus)) {
    return { state: 'confirmed', signature, message: 'Transaction confirmed.' };
  }
  return { state: 'unknown', signature, message: 'Transaction observed but not yet confirmed. Do not resubmit.' };
}

export function outcomeError(cause, signature, state = 'unknown') {
  const error = new Error(state === 'unknown'
    ? 'Submission or confirmation unavailable. This transaction may have landed. Check its signature; do not resubmit.'
    : `Transaction failed on chain: ${JSON.stringify(cause)}`);
  error.cause = cause;
  error.signature = signature;
  error.state = state;
  return error;
}
