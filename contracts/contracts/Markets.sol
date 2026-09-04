// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {MarketBase} from "./MarketBase.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Markets
/// @notice Single contract managing all prediction markets. Each market resolves only
///         when the Attestcoin Protocol verifies, on-chain, that its registered
///         source-chain condition actually occurred — no admin, no committee, no
///         dispute window.
contract Markets is MarketBase, ReentrancyGuard {
    /// @notice Distinguishes a one-shot, single-event market from a market that
    ///         accumulates a value across multiple attested transactions before resolving.
    enum MarketType {
        SingleEvent,
        Cumulative
    }

    /// @notice Lifecycle state of a market. `outcome` is only meaningful once `Resolved`.
    enum MarketStatus {
        Open,
        Resolved,
        Cancelled
    }

    /// @notice How a decoded value is compared against a market's `threshold`.
    enum ComparisonOperator {
        GTE,
        LTE,
        EQ
    }

    /// @notice A prediction market struct.
    struct Market {
        MarketType marketType;
        uint64 chainKey;
        MarketStatus status;
        bool outcome;
        address sourceContract;
        address watchedAddress;
        ComparisonOperator comparisonOperator;
        bytes32 eventSignature;
        uint256 threshold;
        uint256 accumulatedValue;
        uint256 yesPool;
        uint256 noPool;
        address creator;
        uint64 deadline;
    }

    /// @notice marketId => Market.
    mapping(uint256 => Market) public markets;

    /// @notice Next marketId to assign, incremented on each `createMarket` call.
    uint256 public nextMarketId;
}