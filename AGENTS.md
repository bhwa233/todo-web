# Engineering defaults

- Package manager: pnpm (see `package.json`).
- Validation: `pnpm type-check`, `pnpm lint`, `pnpm exec vitest run`.
- Build check for dependency or module-boundary changes: `pnpm build`.
- Reuse UI primitives in `src/components/ui/`; installed libraries are listed in `package.json`.
- Tests use Vitest and colocated `*.test.ts` files. No per-file test registration is required; check scripts before moving or removing tests.
- Prefer focused behavior checks for filtering, sorting, state changes, and failure recovery; do not add component snapshots or tests that repeat configuration.
