# web

The SnapKYC Video Next.js app: customer, agent, reviewer and verify screens,
plus every API route. Business rules live in `@repo/kyc`, data access in
`@repo/db`, and the signaling contract in `@repo/signaling`. See the
[root README](../../README.md) for setup, architecture and deployment.

```sh
npm run dev          # http://localhost:3000
npm run lint
npm run check-types
```

Tests for the approval rules and tokens live in `packages/kyc` (`npm test`
from the repo root runs them).
