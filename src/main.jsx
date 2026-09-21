import React from 'react'
import ReactDOM from 'react-dom/client'
import { PublicKey } from '@solana/web3.js'
import '@/index.css'

// Reuse the browser Buffer implementation already bundled with Solana web3.
// SPL Token needs this global during module evaluation, before App is imported.
if (typeof globalThis.Buffer === 'undefined') {
  globalThis.Buffer = new PublicKey('11111111111111111111111111111111').toBuffer().constructor
}

import('@/App.jsx').then(({ default: App }) => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <App />
  )
})