# Contributing

Thanks for helping improve `@unopago/checkout-sdk`. Issues and pull requests are welcome.

## How this repository works

The SDK is developed in UnoPago's private repository, next to the API it wraps. This repository is
a copy of it, and changes flow both ways:

- **UnoPago's changes** arrive here as commits from `UnoPago OSS Export`.
- **Your pull request** is reviewed and merged here as usual. Once it is merged, an automated job
  brings it into UnoPago's repository with you as the author, and later exports keep it.

## Before you open a pull request

Run the checks CI runs:

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm format
pnpm test
pnpm build
```

- Don't change `version` in `package.json`. Releases are cut by UnoPago.
- Keep the SDK's types in line with the API: a response field the API does not send makes every
  call that reads it fail validation.
- To report a security issue, email security@unopago.com instead of opening an issue or pull
  request.

## For maintainers

Merging here is the review that counts: a merged pull request is imported into UnoPago's repository
and runs in its CI. Review tests, scripts, configuration and workflow changes as carefully as the
source, and squash-merge. Then run the Checkout SDK import workflow in UnoPago's repository, so the
import doesn't wait for its weekly run.
