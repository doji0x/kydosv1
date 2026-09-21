import React from 'react';
import { Navigate, useParams } from 'react-router-dom';

export default function LegacyChartRedirect() {
  const { mint } = useParams();
  return <Navigate to={`/solana/${mint}`} replace/>;
}