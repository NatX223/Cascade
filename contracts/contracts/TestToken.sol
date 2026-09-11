// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title TestToken
/// @notice A plain 18-decimal ERC20 for exercising Cascade end-to-end on Sepolia:
///         deploy it, mint yourself a balance, then create a market predicated on
///         its `Transfer(address,address,uint256)` events. Not for production.
contract TestToken is ERC20, Ownable {
    /// @param initialHolder receives the initial supply (pass address(0) to mint to the deployer)
    /// @param initialSupply amount minted at deploy time, in whole tokens (scaled by 1e18 here)
    constructor(address initialHolder, uint256 initialSupply)
        ERC20("Cascade Test Token", "CTT")
        Ownable(msg.sender)
    {
        address holder = initialHolder == address(0) ? msg.sender : initialHolder;
        if (initialSupply > 0) {
            _mint(holder, initialSupply * 10 ** decimals());
        }
    }

    /// @notice Mint more tokens. Owner-only — this is a test faucet, not a fair launch.
    /// @param to recipient
    /// @param amount whole-token amount (scaled by 1e18)
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount * 10 ** decimals());
    }
}
