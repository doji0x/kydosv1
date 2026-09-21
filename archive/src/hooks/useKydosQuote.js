import { useEffect, useState } from "react";
import { Contract, JsonRpcProvider, parseEther, parseUnits, formatUnits } from "ethers";
import { base44 } from "@/api/base44Client";
import { CURVE_ABI, V4_CURVE_ABI, RH_CHAINS } from "@/lib/kydosContracts";

export default function useKydosQuote(token, side, amount) {
  const [quote, setQuote] = useState(0);
  useEffect(() => {
    let live = true;
    const run = async () => {
      const n = Number(amount);
      if (!token?.curve_address || !n) return setQuote(0);
      const [config] = await base44.entities.KydosConfig.filter({ active: true }, "-deployed_at", 1);
      const provider = new JsonRpcProvider(RH_CHAINS[token.chain_id || config?.chain_id || 46630].rpc);
      if (config?.protocol_version !== "pons_v4") {
        const curve = new Contract(token.curve_address, CURVE_ABI, provider);
        const out = side === "buy" ? await curve.quoteBuy(parseEther(amount)) : await curve.quoteSell(parseUnits(amount, 18));
        if (live) setQuote(Number(formatUnits(out, 18)));
        return;
      }
      const curve = new Contract(token.curve_address, V4_CURVE_ABI, provider);
      const [q, t, fee, tax] = await Promise.all([curve.quoteReserve(), curve.tokenReserve(), curve.feeBps(), curve.creatorTaxBps()]);
      const input = side === "buy" ? parseEther(amount) : parseUnits(amount, 18);
      const net = side === "buy" ? input * (10000n - fee - tax) / 10000n : input;
      const gross = side === "buy" ? t - (q * t) / (q + net) : q - (q * t) / (t + input);
      const out = side === "buy" ? gross : gross * (10000n - fee - tax) / 10000n;
      if (live) setQuote(Number(formatUnits(out, 18)));
    };
    run();
    return () => { live = false; };
  }, [token?.curve_address, token?.chain_id, side, amount]);
  return quote;
}