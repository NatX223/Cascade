// Cascade only needs wallet connect/sign via RainbowKit's default connector
// list, never Coinbase's server-side Developer Platform SDK. That SDK is
// pulled in transitively only through an unused optional code path — Base
// Account's subscription/payment helper (@base-org/account) imports
// `CdpClient` from @coinbase/cdp-sdk, which in turn statically imports the
// @x402/* payment packages we don't have installed and don't need. Aliasing
// the whole package to this stub (see turbopack.resolveAlias in
// next.config.ts) keeps the bundler from trying to resolve those packages;
// CdpClient itself is never instantiated by this app.
export class CdpClient {}
