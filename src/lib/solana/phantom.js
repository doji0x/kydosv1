// Keep wallet/account checks at the provider boundary, including while the
// approval popup is open. No private keys or signed bytes are persisted here.
export function createPhantomSigner(provider, publicKey) {
  const requireWallet = () => {
    if (!provider?.isPhantom || !publicKey || !provider.publicKey?.equals(publicKey)) {
      throw new Error('Wallet account changed or disconnected. Reconnect before signing.');
    }
  };
  const requirePayer = transaction => {
    if (!transaction.feePayer?.equals(publicKey)) {
      throw new Error('Transaction fee payer does not match the connected Phantom wallet. Review again.');
    }
  };
  return {
    signTransaction: async transaction => {
      requireWallet(); requirePayer(transaction);
      const signed = await provider.signTransaction(transaction);
      requireWallet(); requirePayer(signed);
      return signed;
    },
    signAllTransactions: async transactions => {
      requireWallet(); transactions.forEach(requirePayer);
      const signed = await provider.signAllTransactions(transactions);
      requireWallet(); signed.forEach(requirePayer);
      return signed;
    },
  };
}
