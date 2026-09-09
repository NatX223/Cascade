// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {
    INativeQueryVerifier,
    NativeQueryVerifierLib
} from "@gluwa/asc-contracts/contracts/write-ability/common/INativeQueryVerifier.sol";

/// @title MarketBase
/// @notice Base contract for the prediction market ASC: verifies a foreign-chain transaction
///         via the native block-prover precompile, dedupes by query id, then delegates to
///         market-resolution logic for the specific market being resolved.
/// @dev    Forked from the Creditcoin ASCBase pattern, with `action` (a generic discriminator)
///         replaced by `marketId`, since resolution here always targets one specific market's
///         stored conditions rather than a fixed set of contract-wide actions.
abstract contract MarketBase {
    /// @notice The Native Query Verifier precompile instance.
    INativeQueryVerifier public immutable VERIFIER;

    /// @notice marketId => queryId => whether this proof has already been used to
    ///         resolve THIS market. Scoped per-market, not global — the same source
    ///         transaction may legitimately be relevant to more than one market (e.g.
    ///         a transfer that matches two different watched conditions), and each
    ///         market must independently be able to consume it once.
    mapping(uint256 => mapping(bytes32 => bool)) public processedQueries;

    constructor() {
        VERIFIER = NativeQueryVerifierLib.getVerifier();
    }

    /// @notice Market-specific handler invoked after proof verification and deduplication.
    /// @param marketId The market this proof is being submitted to resolve.
    /// @param queryId Stable id for this proved transaction.
    /// @param encodedTransaction Raw proved transaction bytes from the block prover.
    function _resolveMarket(
        uint256 marketId,
        bytes32 queryId,
        bytes memory encodedTransaction
    ) internal virtual;

    /// @notice Verify inclusion + continuity, enforce one-time processing, then resolve the market.
    function resolve(
        uint256 marketId,
        uint64 chainKey,
        uint64 blockHeight,
        bytes calldata encodedTransaction,
        INativeQueryVerifier.MerkleProof calldata merkleProof,
        INativeQueryVerifier.ContinuityProof calldata continuityProof
    ) external returns (bool success) {
        bytes32 queryId = _computeQueryId(chainKey, blockHeight, merkleProof);

        require(!processedQueries[marketId][queryId], "Query already processed for this market");

        bool verified = _verifyProof(chainKey, blockHeight, encodedTransaction, merkleProof, continuityProof);
        require(verified, "Proof of inclusion verification failed");

        processedQueries[marketId][queryId] = true;

        _resolveMarket(marketId, queryId, encodedTransaction);

        return true;
    }

    function _verifyProof(
        uint64 chainKey,
        uint64 blockHeight,
        bytes calldata encodedTransaction,
        INativeQueryVerifier.MerkleProof calldata merkleProof,
        INativeQueryVerifier.ContinuityProof calldata continuityProof
    ) internal returns (bool verified) {
        verified = VERIFIER.verifyAndEmit(
            chainKey, blockHeight, encodedTransaction, merkleProof, continuityProof
        );
    }

    function _computeQueryId(
        uint64 chainKey,
        uint64 blockHeight,
        INativeQueryVerifier.MerkleProof calldata merkleProof
    ) internal view returns (bytes32 queryId) {
        uint256 txIndex = VERIFIER.calculateTxIndex(merkleProof);

        assembly ("memory-safe") {
            let ptr := mload(0x40)
            mstore(ptr, chainKey)
            mstore(add(ptr, 32), shl(192, blockHeight))
            mstore(add(ptr, 40), txIndex)
            queryId := keccak256(ptr, 72)
        }
    }
}
