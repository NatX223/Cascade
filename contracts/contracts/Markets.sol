// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {MarketBase} from "./MarketBase.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EvmV1Decoder} from "@gluwa/asc-contracts/contracts/common/EvmV1Decoder.sol";

/// @title Markets
/// @notice Single contract managing all prediction markets. Each market resolves only
///         when the Attestcoin Protocol verifies, on-chain, that its registered
///         source-chain condition actually occurred — no admin, no committee, no
///         dispute window. If a market's deadline passes with no verified event,
///         it resolves NO by default via `expireMarket`.
contract Markets is MarketBase, ReentrancyGuard {
    // ─────────────────────────────────────────────────────────────────────────
    // Known event signatures / contracts — convenience constants for createMarket
    // callers; createMarket itself remains generic and does not enforce these.
    // ─────────────────────────────────────────────────────────────────────────

    address public constant AAVE_V3_POOL = 0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951;
    bytes32 public constant AAVE_SUPPLY_SIG = 0x2b627736bca15cd5381dcf80b0bf11fd197d01a037c52b927a881a10fb73ba61;
    bytes32 public constant AAVE_BORROW_SIG = 0xb3d084820fb1a9decffb176436bd02558d15fac9b0ddfed8c465bc7359d7dce0;
    bytes32 public constant UNISWAP_V3_SWAP_SIG = 0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67;
    bytes32 public constant ERC20_TRANSFER_SIG = 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef;

    // ─────────────────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────────────────

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

    /// @notice How a decoded/accumulated value is compared against a market's `threshold`.
    enum ComparisonOperator {
        GTE,
        LTE,
        EQ
    }

    /// @notice Selects which hardcoded decode shape `_resolveMarket` applies to a
    ///         matching log. Each template corresponds to a known, real event layout —
    ///         not a fully generic decoder — so every market must map onto one of these.
    enum EventTemplate {
        /// @dev The event occurring at all (from the trusted emitter, optionally from a
        ///      specific `watchedAddress` via topics[1]) is itself the trigger. No `data`
        ///      decoding. Resolves YES immediately on first match.
        Occurrence,
        /// @dev One non-indexed uint256 in `data` (e.g. ERC20 Transfer's `value`).
        ///      Used for: whale-moves-above-X markets.
        SingleWordValue,
        /// @dev `data` begins with (address, uint256, ...) — the uint256 is taken, any
        ///      trailing fields ignored (e.g. Aave Supply/Borrow's `user, amount, ...`).
        ///      Used for: cumulative reserve-volume markets.
        AddressPrefixedValue,
        /// @dev No `data` decoding — each matching log counts as 1 toward accumulation.
        ///      Used for: Aave per-reserve / whole-pool event counts, Uniswap swap counts.
        EventCount
    }

    /// @notice A single prediction market.
    struct Market {
        MarketType marketType;
        uint64 chainKey;
        MarketStatus status;
        bool outcome;
        EventTemplate eventTemplate;
        address sourceContract;
        //   Aave: the reserve token being tracked (or zero, for whole-pool counts)
        //   Whale: the "from" address being watched
        //   Uniswap: unused (zero) for pool-wide swap counts
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

    // ─────────────────────────────────────────────────────────────────────────
    // Storage
    // ─────────────────────────────────────────────────────────────────────────
    mapping(uint256 => Market) private _markets;
    uint256 public nextMarketId;

    /// @notice marketId => bettor => outcome (true=YES, false=NO) => staked amount.
    mapping(uint256 => mapping(address => mapping(bool => uint256))) public stakes;

    /// @notice marketId => bettor => whether they've already claimed.
    mapping(uint256 => mapping(address => bool)) public claimed;

    /// @notice marketId => bettor => whether they've already been refunded (Cancelled markets only).
    mapping(uint256 => mapping(address => bool)) public refunded;

    /// @notice Contract deployer, authorized to cancel markets before resolution.
    address public immutable owner;

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// @notice Reads a market. Explicit getter (rather than `public` on `_markets`) so the
    ///         struct is returned as one value instead of Solidity's default flattened
    ///         15-return-value getter — see the storage declaration above.
    function getMarket(uint256 marketId) external view returns (Market memory) {
        return _markets[marketId];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    event MarketCancelled(uint256 indexed marketId);
    event Refunded(uint256 indexed marketId, address indexed bettor, uint256 amount);

    event MarketCreated(
        uint256 indexed marketId,
        address indexed creator,
        MarketType marketType,
        EventTemplate eventTemplate,
        address sourceContract,
        bytes32 eventSignature,
        address watchedAddress,
        uint256 threshold,
        uint256 deadline
    );
    event MarketResolved(uint256 indexed marketId, bool outcome);
    event BetPlaced(uint256 indexed marketId, address indexed bettor, bool outcome, uint256 amount);
    event Claimed(uint256 indexed marketId, address indexed bettor, uint256 amount);

    // ─────────────────────────────────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────────────────────────────────

    error ZeroAddress();
    error DeadlineInPast();
    error InvalidThreshold();
    error MarketNotOpen();
    error DeadlineNotReached();
    error MarketExpired();
    error ZeroAmount();
    error MarketDoesNotExist();
    error MarketNotResolved();
    error AlreadyClaimed();
    error NoWinningStake();
    error PayoutTransferFailed();
    error MarketDoesNotExistOrClosed();
    error MarketPastDeadline();
    error SourceTransactionNotSuccessful();
    error NoMatchingEvent();
    error UnsupportedEventTemplate();
    error UnexpectedDataLength();
    error MissingActorTopic();
    error NotOwner();
    error AlreadyRefunded();
    error MarketNotCancelled();

    // ─────────────────────────────────────────────────────────────────────────
    // Market creation
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Creates a new prediction market on a verifiable source-chain condition.
    /// @dev Permissionless — anyone may create a market. Safety comes from the condition
    ///      being independently re-verified at resolution time via Attestcoin, not from
    ///      restricting who may propose a question. `eventTemplate` must match the real
    ///      decode shape of `eventSignature`'s non-indexed data — see the enum's docs.
    function createMarket(
        MarketType marketType,
        EventTemplate eventTemplate,
        uint64 chainKey,
        address sourceContract,
        bytes32 eventSignature,
        address watchedAddress,
        ComparisonOperator comparisonOperator,
        uint256 threshold,
        uint64 deadline
    ) external returns (uint256 marketId) {
        if (sourceContract == address(0)) revert ZeroAddress();
        if (deadline <= block.timestamp) revert DeadlineInPast();
        if (eventTemplate != EventTemplate.Occurrence && threshold == 0) revert InvalidThreshold();

        marketId = nextMarketId++;

        Market storage m = _markets[marketId];
        m.marketType = marketType;
        m.chainKey = chainKey;
        m.status = MarketStatus.Open;
        m.eventTemplate = eventTemplate;
        m.sourceContract = sourceContract;
        m.watchedAddress = watchedAddress;
        m.comparisonOperator = comparisonOperator;
        m.eventSignature = eventSignature;
        m.threshold = threshold;
        m.creator = msg.sender;
        m.deadline = deadline;

        emit MarketCreated(
            marketId, msg.sender, marketType, eventTemplate, sourceContract, eventSignature, watchedAddress, threshold, deadline
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Expiry — resolves NO if the deadline passes with no verified event
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Resolves a market to NO if its deadline has passed without verification.
    /// @dev Permissionless — anyone may trigger expiry once the deadline is objectively past.
    function expireMarket(uint256 marketId) external {
        Market storage m = _markets[marketId];
        if (m.status != MarketStatus.Open) revert MarketNotOpen();
        if (block.timestamp < m.deadline) revert DeadlineNotReached();

        m.status = MarketStatus.Resolved;
        m.outcome = false;

        emit MarketResolved(marketId, false);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Cancellation — owner-only escape hatch (e.g. a misconfigured market:
    // wrong sourceContract, wrong eventSignature, impossible condition)
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Cancels a market before it resolves, allowing all bettors to reclaim
    ///         their exact stake. Owner-only: cancellation is a judgment call about
    ///         whether a market was validly formed, not something resolution can
    ///         determine on its own — unlike `resolve`/`expireMarket`, which stay
    ///         permissionless because their triggers are objective.
    function cancelMarket(uint256 marketId) external onlyOwner {
        Market storage m = _markets[marketId];
        if (m.status != MarketStatus.Open) revert MarketNotOpen();

        m.status = MarketStatus.Cancelled;

        emit MarketCancelled(marketId);
    }

    /// @notice Reclaims a bettor's full stake (both YES and NO sides) from a
    ///         cancelled market.
    function refund(uint256 marketId) external nonReentrant {
        Market storage m = _markets[marketId];
        if (m.status != MarketStatus.Cancelled) revert MarketNotCancelled();
        if (refunded[marketId][msg.sender]) revert AlreadyRefunded();

        uint256 amount = stakes[marketId][msg.sender][true] + stakes[marketId][msg.sender][false];
        if (amount == 0) revert NoWinningStake();

        refunded[marketId][msg.sender] = true;

        emit Refunded(marketId, msg.sender, amount);

        (bool sent, ) = msg.sender.call{value: amount}("");
        if (!sent) revert PayoutTransferFailed();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Betting
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Stakes native CTC on a market's YES or NO outcome.
    function bet(uint256 marketId, bool outcome) external payable {
        Market storage m = _markets[marketId];

        if (m.creator == address(0)) revert MarketDoesNotExist();
        if (m.status != MarketStatus.Open) revert MarketNotOpen();
        if (block.timestamp >= m.deadline) revert MarketExpired();
        if (msg.value == 0) revert ZeroAmount();

        if (outcome) {
            m.yesPool += msg.value;
        } else {
            m.noPool += msg.value;
        }

        stakes[marketId][msg.sender][outcome] += msg.value;

        emit BetPlaced(marketId, msg.sender, outcome, msg.value);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Claim
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Claims a bettor's payout after a market resolves. If the winning
    ///         side has zero stake (nobody bet on the outcome that occurred), this
    ///         instead refunds the caller's own stake on the losing-by-default side,
    ///         rather than leaving the pool permanently unclaimable.
    function claim(uint256 marketId) external nonReentrant {
        Market storage m = _markets[marketId];

        if (m.status != MarketStatus.Resolved) revert MarketNotResolved();
        if (claimed[marketId][msg.sender]) revert AlreadyClaimed();

        uint256 winningPool = m.outcome ? m.yesPool : m.noPool;
        uint256 losingPool = m.outcome ? m.noPool : m.yesPool;

        uint256 payout;
        if (winningPool == 0) {
            // No one was on the winning side — refund this caller's own stake
            // instead of leaving the losing pool stuck with no claimant.
            payout = stakes[marketId][msg.sender][!m.outcome];
            if (payout == 0) revert NoWinningStake();
        } else {
            uint256 winningStake = stakes[marketId][msg.sender][m.outcome];
            if (winningStake == 0) revert NoWinningStake();
            payout = winningStake + (winningStake * losingPool) / winningPool;
        }

        claimed[marketId][msg.sender] = true;

        emit Claimed(marketId, msg.sender, payout);

        (bool sent, ) = msg.sender.call{value: payout}("");
        if (!sent) revert PayoutTransferFailed();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Resolution — the core Attestcoin-gated logic
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice MarketBase hook, invoked only after the precompile has verified the
    ///         proof's inclusion/continuity and confirmed this queryId is unused.
    function _resolveMarket(uint256 marketId, bytes32 /* queryId */, bytes memory encodedTransaction) internal override {
        Market storage m = _markets[marketId];

        if (m.creator == address(0)) revert MarketDoesNotExistOrClosed();
        if (m.status != MarketStatus.Open) revert MarketDoesNotExistOrClosed();
        if (block.timestamp >= m.deadline) revert MarketPastDeadline();

        // The precompile proves inclusion only, not success — checked explicitly.
        EvmV1Decoder.ReceiptFields memory receipt = EvmV1Decoder.decodeReceiptFields(encodedTransaction);
        if (receipt.receiptStatus != 1) revert SourceTransactionNotSuccessful();

        EvmV1Decoder.LogEntry memory log = _findMatchingLog(m, receipt);
        _checkActorFilter(m, log);

        if (m.eventTemplate == EventTemplate.Occurrence) {
            _finalizeResolution(m, marketId, true);
            return;
        }

        uint256 value = _decodeValue(m.eventTemplate, log);

        uint256 compareValue;
        if (m.marketType == MarketType.Cumulative) {
            m.accumulatedValue += value;
            compareValue = m.accumulatedValue;
        } else {
            compareValue = value;
        }

        bool conditionMet = _compare(compareValue, m.threshold, m.comparisonOperator);

        if (m.marketType == MarketType.Cumulative && !conditionMet) {
            // Not yet crossed — state updated, market stays Open for future proofs.
            return;
        }

        _finalizeResolution(m, marketId, conditionMet);
    }

    /// @dev Finds the log matching this market's signature AND trusted emitter — signature
    ///      match alone is insufficient, since any contract can emit a same-signature log.
    function _findMatchingLog(Market storage m, EvmV1Decoder.ReceiptFields memory receipt)
        private
        view
        returns (EvmV1Decoder.LogEntry memory)
    {
        EvmV1Decoder.LogEntry[] memory candidates =
            EvmV1Decoder.getLogsByEventSignature(receipt, m.eventSignature);

        for (uint256 i = 0; i < candidates.length; i++) {
            if (candidates[i].address_ == m.sourceContract) {
                return candidates[i];
            }
        }
        revert NoMatchingEvent();
    }

    /// @dev Checks the log's topics[1] against `watchedAddress`, per Q8: `from`/gas-payer
    ///      is not the reliable actor identity, the indexed event field is. Skipped
    ///      entirely if `watchedAddress` is unset (address(0)) — e.g. whole-pool counts.
    function _checkActorFilter(Market storage m, EvmV1Decoder.LogEntry memory log) private view {
        if (m.watchedAddress == address(0)) return;
        if (log.topics.length < 2) revert MissingActorTopic();
        address actor = address(uint160(uint256(log.topics[1])));
        if (actor != m.watchedAddress) revert NoMatchingEvent();
    }

    /// @dev Dispatches to the decode shape for the market's template. Occurrence is
    ///      handled by the caller before reaching here (no value to decode).
    function _decodeValue(EventTemplate template, EvmV1Decoder.LogEntry memory log) private pure returns (uint256) {
        if (template == EventTemplate.SingleWordValue) {
            if (log.data.length != 32) revert UnexpectedDataLength();
            return abi.decode(log.data, (uint256));
        }
        if (template == EventTemplate.AddressPrefixedValue) {
            if (log.data.length < 64) revert UnexpectedDataLength();
            (, uint256 amount) = abi.decode(log.data, (address, uint256));
            return amount;
        }
        if (template == EventTemplate.EventCount) {
            return 1;
        }
        revert UnsupportedEventTemplate();
    }

    function _finalizeResolution(Market storage m, uint256 marketId, bool outcome) private {
        m.status = MarketStatus.Resolved;
        m.outcome = outcome;
        emit MarketResolved(marketId, outcome);
    }

    function _compare(uint256 value, uint256 threshold, ComparisonOperator op) private pure returns (bool) {
        if (op == ComparisonOperator.GTE) return value >= threshold;
        if (op == ComparisonOperator.LTE) return value <= threshold;
        return value == threshold; // EQ
    }
}
