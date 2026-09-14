# Contributing to Kydos

Thanks for taking the time to contribute. Kydos is a mobile-first social
memecoin launchpad, and contributions of every size are welcome.

## Ground rules

- **Mobile first.** Every change must look and feel right at a 390–440px
  viewport before anything else.
- **Small, focused files.** Components stay short and live in their own file
  under `src/components/<domain>/`.
- **Design tokens only.** Use the semantic Tailwind classes backed by the tokens
  in `src/index.css` — no hardcoded hex values or inline font families.
- **Secrets stay server-side.** Anything touching an API key or the chain belongs
  in a backend function under `base44/functions/`.
- **No new market-data dependencies.** Chain data is self-indexed on purpose;
  prefer extending the indexer over adding a third-party aggregator.

## Development setup

```bash
git clone https://github.com/doji0x/kydosv1.git
cd kydosv1
npm install
npm run dev
```

Before opening a pull request:

```bash
npm run lint
npm run build
```

## Commit convention

Commit subjects are imperative, lower-case and scoped, because they become the
release changelog:

```
add holder distribution chart
fix curve rounding on small buys
docs: expand indexer architecture notes
```

## Workflow

1. Fork the repository and create a branch: `git checkout -b feature/my-change`.
2. Keep commits scoped and messages meaningful.
3. Verify the affected flows end to end — launching, trading, posting, profile.
4. Open a pull request describing what changed, why, and how you verified it.
   Screenshots or a short screen recording at a mobile viewport are appreciated.

Pull requests are squash-merged into `main`, which syncs back to the Base44 app
and is then published.

## Reporting bugs

Open an issue with the steps to reproduce, the expected and actual behavior, the
device/viewport, and a screenshot where relevant.

## Code of conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md). Be direct, be
kind, and assume good faith.

## License

By contributing you agree that your contributions are licensed under the
[MIT License](LICENSE).
