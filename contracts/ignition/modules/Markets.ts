import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/// Deploys the single `Markets` contract. Its constructor takes no arguments —
/// the deployer becomes `owner` (authorized to cancel misconfigured markets) and
/// the Native Query Verifier precompile is resolved on-chain in `MarketBase`.
export default buildModule("MarketsModule", (m) => {
  const markets = m.contract("Markets", []);

  return { markets };
});
