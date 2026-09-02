import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

describe("Lock (TypeScript)", function () {
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

  describe("Deployment", function () {
    it("sets the right unlockTime", async function () {
      const { lock, unlockTime } = await loadFixture(deployLockFixture);
      expect(await lock.unlockTime()).to.equal(unlockTime);
    });

    it("sets the right owner", async function () {
      const { lock, owner } = await loadFixture(deployLockFixture);
      expect(await lock.owner()).to.equal(owner.address);
    });

    it("receives and stores the funds to lock", async function () {
      const { lock, lockedAmount } = await loadFixture(deployLockFixture);
      expect(await ethers.provider.getBalance(await lock.getAddress())).to.equal(lockedAmount);
    });
  });

  describe("Withdrawals", function () {
    it("reverts with TooEarly if called too soon", async function () {
      const { lock } = await loadFixture(deployLockFixture);
      await expect(lock.withdraw()).to.be.revertedWithCustomError(lock, "TooEarly");
    });

    it("reverts with NotOwner if called from another account", async function () {
      const { lock, unlockTime, otherAccount } = await loadFixture(deployLockFixture);
      await time.increaseTo(unlockTime);
      await expect(lock.connect(otherAccount).withdraw()).to.be.revertedWithCustomError(lock, "NotOwner");
    });

    it("transfers the funds to the owner", async function () {
      const { lock, unlockTime, lockedAmount, owner } = await loadFixture(deployLockFixture);
      await time.increaseTo(unlockTime);
      await expect(lock.withdraw()).to.changeEtherBalances([owner], [lockedAmount]);
    });

    it("emits a Withdrawal event", async function () {
      const { lock, unlockTime, lockedAmount } = await loadFixture(deployLockFixture);
      await time.increaseTo(unlockTime);
      await expect(lock.withdraw()).to.emit(lock, "Withdrawal").withArgs(lockedAmount, anyValue);
    });
  });
});
