// Attestcoin proof generation. Carried over from the Creditcoin SDK reference
// `index.ts` (`generateProofFor`) largely as-is — it has no dependency on any
// particular consumer contract, it's generic to (txHash, chainKey). All the
// hard parts (talking to the Proof Builder service, waiting for attestation,
// Merkle / continuity proof construction) live inside `@gluwa/usc-sdk`; this
// only orchestrates them.

import { chainInfo, proofProvider } from "@gluwa/usc-sdk";
import type { JsonRpcApiProvider } from "ethers";
import { env } from "../config/env.js";
import { logger } from "../logger.js";

const log = logger.child({ module: "resolution:proof" });

/**
 * Fetches an inclusion + continuity proof for `transactionHash` on the source
 * chain identified by `chainKey`. Slow by nature: waiting for the source block
 * to be attested on Creditcoin typically takes ~8 minutes, up to ~20 — never
 * call this on a hot path.
 */
export async function generateProofFor(
  transactionHash: string,
  chainKey: number,
  proofBuilderUrl: string,
  creditcoinProvider: JsonRpcApiProvider,
  sourceProvider: JsonRpcApiProvider,
): Promise<proofProvider.ProofResult> {
  try {
    const receipt = await sourceProvider.getTransactionReceipt(transactionHash);
    if (!receipt) {
      return { success: false, error: `source tx ${transactionHash} not found / not mined` };
    }
    const blockNumber = receipt.blockNumber;

    const builder = new proofProvider.service.ProofBuilder(chainKey, proofBuilderUrl);

    // Log how far attestation currently trails the target — purely informational.
    try {
      // `as never`: ethers v6 ships CJS+ESM copies with nominally-distinct class
      // types (private brand). The SDK's .d.ts sees one, our import the other —
      // same runtime object. Cast only at the SDK boundary.
      const info = new chainInfo.PrecompileChainInfoProvider(creditcoinProvider as never);
      const latest = await info.getLatestAttestedHeightAndHash(chainKey);
      log.info(
        {
          transactionHash,
          chainKey,
          targetHeight: blockNumber,
          latestAttested: latest.exists ? latest.height : null,
          behind: latest.exists ? blockNumber - latest.height : null,
        },
        "waiting for attestation",
      );
    } catch (err) {
      log.warn({ err, chainKey }, "could not read latest attested height — proceeding to wait anyway");
    }

    await builder.waitUntilHeightAttested(
      chainKey,
      blockNumber,
      env.PROOF_ATTEST_POLL_INTERVAL_MS,
      env.PROOF_ATTEST_TIMEOUT_MS,
    );

    const proof = await builder.getProof(transactionHash);
    if (proof.success) {
      log.info(
        { transactionHash, chainKey, headerNumber: proof.data?.headerNumber, cached: proof.data?.cached },
        "proof generated",
      );
    }
    return proof;
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
