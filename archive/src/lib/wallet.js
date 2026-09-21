// Simulated wallet identity until real Robinhood Chain wallet connect is wired.
const KEY = "kydos_wallet";

export function getWallet() {
  let addr = localStorage.getItem(KEY);
  if (!addr) {
    const hex = Array.from({ length: 40 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
    addr = `0x${hex}`;
    localStorage.setItem(KEY, addr);
  }
  return addr;
}

export function shortAddr(addr) {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}