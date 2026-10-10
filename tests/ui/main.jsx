import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { PublicKey } from '@solana/web3.js';
import '../../src/index.css';

// Match src/main.jsx: SPL Token needs Buffer during module evaluation, before
// importing the fixture or launch components. setup() runs too late for that.
if (typeof globalThis.Buffer === 'undefined') {
  globalThis.Buffer = new PublicKey('11111111111111111111111111111111').toBuffer().constructor;
}
const { setup } = await import('./runtime.js');
await setup();
const [{ SolanaWalletProvider }, { default: SolanaLaunch }] = await Promise.all([
  import('../../src/lib/SolanaWalletContext.jsx'),
  import('../../src/pages/SolanaLaunch.jsx'),
]);
createRoot(document.getElementById('root')).render(<BrowserRouter><SolanaWalletProvider><SolanaLaunch/></SolanaWalletProvider></BrowserRouter>);
