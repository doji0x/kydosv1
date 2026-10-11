import React from 'react';
import { useLocation } from 'react-router-dom';
import DbcWorkspace from '@/components/solana/DbcWorkspace';

export default function SolanaLaunch() {
  const location = useLocation();
  // New launch/deep-link navigation gets a fresh, isolated review context.
  // The manifest and on-chain checks gate transactions, not an inert UI flag.
  return <DbcWorkspace key={location.search}/>;
}
