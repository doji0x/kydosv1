import { useCallback, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useSolanaWallet } from '@/lib/SolanaWalletContext';
import { quoteInitialBuy } from '@/lib/solana/client';
import { mainnetConnection } from '@/lib/solana/development';
import { parseAmount, transactionError, validateLaunch } from '@/lib/solana/market';
import { getLaunchAvailability, prepareLaunchReview, submitReviewedLaunch, verifyLaunchNetwork } from '@/lib/solana/launchReview';
import { uploadLaunchMetadata, validateLaunchImage, validateMetadataDetails } from '@/lib/solana/launchMetadata';
import { useActivity } from '@/lib/solana/Activity';

const stages = {
  checking: 'Checking launch availability…', 'uploading-image': 'Uploading image…',
  'uploading-metadata': 'Saving token details…', preparing: 'Preparing transaction…',
  simulating: 'Checking launch transaction…',
  signing: 'Approve in Phantom…', submitting: 'Submitting transaction…', confirming: 'Confirming on Solana…',
};

export function useLaunchFlow() {
  const wallet = useSolanaWallet(), walletId = wallet.publicKey?.toBase58();
  const [rpc] = useState(() => { try { return { connection: mainnetConnection() }; } catch (e) { return { error: e.message }; } });
  const activity = useActivity(rpc.connection, walletId, 'create');
  const [form, setForm] = useState({ name: '', symbol: '', description: '', metadataUri: '', initialBuy: '0', slippage: '1', manualMetadata: false });
  const [file, setFile] = useState(null), [imagePreview, setImagePreview] = useState('');
  const [phase, setPhase] = useState('idle'), [error, setError] = useState('');
  const [review, setReview] = useState(null), [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [availability, setAvailability] = useState({ blockedReason: 'Checking launch availability…' });
  const refreshAvailability = useCallback(async () => {
    if (!rpc.connection) return;
    try { setAvailability(await getLaunchAvailability(rpc.connection)); }
    catch (failure) { setAvailability({ blockedReason: transactionError(failure) }); }
  }, [rpc]);
  useEffect(() => { refreshAvailability(); }, [refreshAvailability]);
  // Mint secret stays in memory; never rendered, stored, uploaded or logged.
  const prepared = useRef(null), lock = useRef(false), revision = useRef(0);
  /** @type {import('react').MutableRefObject<{ file?: File, key?: string, imageCid?: string, metadataUri?: string }>} */
  const upload = useRef({});
  const liveWallet = useRef(walletId); liveWallet.current = walletId;
  useEffect(() => {
    revision.current++; prepared.current = null;
    setReview(null); setResult(null); setError(''); setCopied(false);
  }, [walletId]);
  useEffect(() => {
    if (!file) { setImagePreview(''); return; }
    const url = URL.createObjectURL(file); setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const busy = phase !== 'idle';
  const blockedReason = busy ? stages[phase] : rpc.error || availability.blockedReason || activity.error ||
    (!rpc.connection ? 'Solana connection unavailable.' : !activity.chain ? 'Checking the RPC connection…' :
      activity.pending.length ? 'An earlier launch is unresolved. Check transaction activity below.' : '');
  const invalidate = () => { revision.current++; prepared.current = null; setReview(null); setError(''); setResult(null); setCopied(false); };
  const set = key => event => {
    invalidate();
    const value = key === 'manualMetadata' ? event.target.checked : event.target.value;
    setForm(previous => ({ ...previous, [key]: value }));
  };
  const chooseImage = async event => {
    const chosen = event.target.files?.[0];
    if (!chosen) return;
    invalidate(); const version = revision.current;
    try {
      await validateLaunchImage(chosen);
      if (version !== revision.current) return;
      setFile(chosen); upload.current = {};
    } catch (e) { if (version === revision.current) setError(e.message); }
    event.target.value = '';
  };
  const connect = async () => { try { setError(''); await wallet.connect(); } catch (e) { setError(transactionError(e)); } };

  const prepare = async event => {
    event.preventDefault();
    if (lock.current || blockedReason || !wallet.connected || review || result) return;
    lock.current = true; setPhase('checking'); setError(''); setResult(null); setReview(null); prepared.current = null;
    const version = revision.current, payer = walletId;
    const ensureCurrent = () => {
      if (version !== revision.current || payer !== liveWallet.current) throw new Error('Wallet or details changed. Review the launch again.');
    };
    try {
      const details = { name: form.name.trim(), symbol: form.symbol.trim(), description: form.description };
      const initialBuyLamports = parseAmount(form.initialBuy || '0', 9), slippageBps = Number(parseAmount(form.slippage, 2));
      quoteInitialBuy(initialBuyLamports, slippageBps);
      if (form.manualMetadata) validateLaunch({ ...details, metadataUri: form.metadataUri });
      else { validateMetadataDetails(details); await validateLaunchImage(file); }
      await verifyLaunchNetwork(rpc.connection); ensureCurrent();
      let metadataUri = form.metadataUri;
      if (!form.manualMetadata) {
        const key = JSON.stringify(details);
        if (upload.current.file === file && upload.current.key === key && upload.current.metadataUri) {
          metadataUri = upload.current.metadataUri;
        } else {
          const previousCid = upload.current.file === file ? upload.current.imageCid : undefined;
          const uploaded = await uploadLaunchMetadata({ file, details, imageCid: previousCid,
            invoke: (name, body) => base44.functions.invoke(name, body),
            onStage: value => { ensureCurrent(); setPhase(value); },
            onImageUploaded: imageCid => { upload.current = { file, imageCid }; },
          });
          ensureCurrent(); upload.current = { file, key, ...uploaded }; metadataUri = uploaded.metadataUri;
        }
      }
      setPhase('preparing'); ensureCurrent();
      const ready = await prepareLaunchReview({ connection: rpc.connection, wallet, ...details, metadataUri, initialBuyLamports, slippageBps });
      ensureCurrent(); prepared.current = ready.built;
      setReview({ ...ready.review, slippage: form.slippage, imagePreview: form.manualMetadata ? '' : imagePreview });
    } catch (e) { if (payer === liveWallet.current) setError(transactionError(e)); }
    finally { lock.current = false; setPhase('idle'); }
  };

  const launch = async () => {
    if (lock.current || blockedReason || !review?.costs.sufficient || !prepared.current) return;
    lock.current = true; setPhase('preparing'); setError('');
    const payer = walletId;
    try {
      const confirmed = await submitReviewedLaunch({ connection: rpc.connection, wallet, built: prepared.current, review, onStage: setPhase });
      if (payer === liveWallet.current) setResult(confirmed);
    } catch (e) { if (payer === liveWallet.current) setError(transactionError(e)); }
    finally {
      // A fresh review is required after rejection/cost changes/failure. Ambiguous
      // sends additionally stay locked by the persistent transaction journal.
      prepared.current = null; setReview(null); lock.current = false; setPhase('idle');
    }
  };
  const copyMint = async () => {
    try { await navigator.clipboard.writeText(result.mint); setCopied(true); }
    catch { setError('Could not copy. Select the token address below to copy it.'); }
  };
  return { wallet, walletId, rpc, activity, availability, refreshAvailability, form, file, imagePreview, busy, phase, statusText: stages[phase],
    blockedReason, error, review, result, copied, set, chooseImage, connect, prepare, launch, edit: invalidate, copyMint };
}
