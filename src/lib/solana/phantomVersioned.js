// A separate versioned signer leaves the launchpad's legacy signer unchanged.
export default function phantomVersioned(provider, publicKey) {
  return async transaction => {
    const validate = tx => {
      if (!provider?.isPhantom || !publicKey || !provider.publicKey?.equals(publicKey)) throw new Error('Wallet changed or disconnected. Reconnect before signing.');
      const keys = tx.message?.staticAccountKeys || tx.message?.accountKeys;
      if (tx.message?.header.numRequiredSignatures !== 1 || !keys?.[0]?.equals(publicKey)) throw new Error('Swap fee payer does not match your connected wallet.');
    };
    validate(transaction);
    const message = transaction.message.serialize().slice();
    const signed = await provider.signTransaction(transaction);
    validate(signed);
    const next = signed.message.serialize();
    if (message.length !== next.length || message.some((value, index) => value !== next[index])) throw new Error('The wallet changed the quoted transaction. Nothing was submitted.');
    if (!signed.signatures[0]?.some(Boolean)) throw new Error('The swap was not signed.');
    return signed;
  };
}