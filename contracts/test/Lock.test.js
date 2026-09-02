const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Lock (JavaScript)", function () {
  async function deployLockFixture() {
    const ONE_YEAR_IN_SECS = 365 * 24 * 60 * 60;
    const ONE_GWEI = 1_000_000_000n;

    const lockedAmount = ONE_GWEI;
    const unlockTime = (await time.latest()) + ONE_YEAR_IN_SECS;

    const [owner, otherAccount] = await ethers.getSigners();

    const Lock = await ethers.getContractFactory("Lock");
    const lock = await Lock.deploy(unlockTime, { value: lockedAmount });

    return { lock, unlockTime, lockedAmount, owner, otherAccount };
  }

  it("sets the right unlockTime and owner", async function () {
    const { lock, unlockTime, owner } = await loadFixture(deployLockFixture);
    expect(await lock.unlockTime()).to.equal(unlockTime);
    expect(await lock.owner()).to.equal(owner.address);
  });

  it("reverts withdraw() before the unlock time", async function () {
    const { lock } = await loadFixture(deployLockFixture);
    await expect(lock.withdraw()).to.be.revertedWithCustomError(lock, "TooEarly");
  });

  it("lets the owner withdraw after the unlock time", async function () {
    const { lock, unlockTime, lockedAmount, owner } = await loadFixture(deployLockFixture);
    await time.increaseTo(unlockTime);
    await expect(lock.withdraw()).to.changeEtherBalances([owner], [lockedAmount]);
  });
});
