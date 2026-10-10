import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { SolanaWalletProvider } from '../../src/lib/SolanaWalletContext.jsx';
import SolanaLaunch from '../../src/pages/SolanaLaunch.jsx';
import { setup } from './runtime.js';
import '../../src/index.css';
await setup();
createRoot(document.getElementById('root')).render(<BrowserRouter><SolanaWalletProvider><SolanaLaunch/></SolanaWalletProvider></BrowserRouter>);
