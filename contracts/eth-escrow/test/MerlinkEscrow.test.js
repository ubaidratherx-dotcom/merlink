const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MerlinkEscrow", function () {
  let escrow;
  let admin, seller, buyer, attacker;
  const tradeId = ethers.encodeBytes32String("trade001");
  const tradeId2 = ethers.encodeBytes32String("trade002");
  const tradeId3 = ethers.encodeBytes32String("trade003");

  beforeEach(async function () {
    [admin, seller, buyer, attacker] = await ethers.getSigners();
    const MerlinkEscrow = await ethers.getContractFactory("MerlinkEscrow");
    escrow = await MerlinkEscrow.deploy(admin.address);
    await escrow.waitForDeployment();
  });

  // ═══════════════════════════════════════════════════════════
  // CRITICAL: Cancel-after-payment protection
  // ═══════════════════════════════════════════════════════════

  describe("CRITICAL: Cancel blocked after payment marked", function () {
    it("should allow cancel before payment is marked", async function () {
      await escrow.connect(seller).lockEth(tradeId, buyer.address, { value: ethers.parseEther("1") });
      const sellerBefore = await ethers.provider.getBalance(seller.address);
      const tx = await escrow.connect(seller).cancel(tradeId);
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;
      const sellerAfter = await ethers.provider.getBalance(seller.address);
      // Seller got refund minus gas
      expect(sellerAfter - sellerBefore + gasCost).to.equal(ethers.parseEther("1"));
      // Escrow deleted
      const e = await escrow.getEscrow(tradeId);
      expect(e.seller).to.equal(ethers.ZeroAddress);
    });

    it("should block cancel after buyer marks payment", async function () {
      await escrow.connect(seller).lockEth(tradeId, buyer.address, { value: ethers.parseEther("1") });
      await escrow.connect(buyer).markPaymentSent(tradeId);
      await expect(escrow.connect(seller).cancel(tradeId)).to.be.revertedWith("Cannot cancel after payment marked");
    });

    it("should only allow buyer to mark payment", async function () {
      await escrow.connect(seller).lockEth(tradeId, buyer.address, { value: ethers.parseEther("1") });
      await expect(escrow.connect(seller).markPaymentSent(tradeId)).to.be.revertedWith("Only buyer");
      await expect(escrow.connect(attacker).markPaymentSent(tradeId)).to.be.revertedWith("Only buyer");
    });

    it("should not allow double mark payment", async function () {
      await escrow.connect(seller).lockEth(tradeId, buyer.address, { value: ethers.parseEther("1") });
      await escrow.connect(buyer).markPaymentSent(tradeId);
      await expect(escrow.connect(buyer).markPaymentSent(tradeId)).to.be.revertedWith("Already marked");
    });

    it("seller can still release after payment is marked", async function () {
      await escrow.connect(seller).lockEth(tradeId, buyer.address, { value: ethers.parseEther("1") });
      await escrow.connect(buyer).markPaymentSent(tradeId);
      const buyerBefore = await ethers.provider.getBalance(buyer.address);
      await escrow.connect(seller).release(tradeId);
      const buyerAfter = await ethers.provider.getBalance(buyer.address);
      expect(buyerAfter - buyerBefore).to.equal(ethers.parseEther("1"));
    });
  });

  // ═══════════════════════════════════════════════════════════
  // CRITICAL: Fee-on-transfer token handling
  // ═══════════════════════════════════════════════════════════

  describe("CRITICAL: Token amount accounting", function () {
    it("should store actual received amount for normal tokens", async function () {
      const MockToken = await ethers.getContractFactory("MockERC20");
      const token = await MockToken.deploy("USDC", "USDC", 6);
      await token.waitForDeployment();
      const tokenAddr = await token.getAddress();

      await escrow.connect(admin).setTokenAllowed(tokenAddr, true);
      await token.mint(seller.address, 1000000000n); // 1000 USDC
      await token.connect(seller).approve(await escrow.getAddress(), 500000000n);

      await escrow.connect(seller).lockToken(tradeId, buyer.address, tokenAddr, 500000000n);
      const e = await escrow.getEscrow(tradeId);
      expect(e.amount).to.equal(500000000n);
    });

    it("should store actual amount for fee-on-transfer tokens", async function () {
      const FeeToken = await ethers.getContractFactory("MockFeeToken");
      const token = await FeeToken.deploy();
      await token.waitForDeployment();
      const tokenAddr = await token.getAddress();

      await escrow.connect(admin).setTokenAllowed(tokenAddr, true);
      await token.mint(seller.address, ethers.parseEther("1000"));
      await token.connect(seller).approve(await escrow.getAddress(), ethers.parseEther("100"));

      await escrow.connect(seller).lockToken(tradeId, buyer.address, tokenAddr, ethers.parseEther("100"));
      const e = await escrow.getEscrow(tradeId);
      expect(e.amount).to.equal(ethers.parseEther("99"));
    });

    it("should release correct amount for fee-on-transfer token", async function () {
      const FeeToken = await ethers.getContractFactory("MockFeeToken");
      const token = await FeeToken.deploy();
      await token.waitForDeployment();
      const tokenAddr = await token.getAddress();

      await escrow.connect(admin).setTokenAllowed(tokenAddr, true);
      await token.mint(seller.address, ethers.parseEther("1000"));
      await token.connect(seller).approve(await escrow.getAddress(), ethers.parseEther("100"));

      await escrow.connect(seller).lockToken(tradeId, buyer.address, tokenAddr, ethers.parseEther("100"));

      await escrow.connect(seller).release(tradeId);
      const buyerBal = await token.balanceOf(buyer.address);
      expect(buyerBal).to.equal(ethers.parseEther("98.01"));
    });

    it("should release correct amount for normal token", async function () {
      const MockToken = await ethers.getContractFactory("MockERC20");
      const token = await MockToken.deploy("USDC", "USDC", 6);
      await token.waitForDeployment();
      const tokenAddr = await token.getAddress();

      await escrow.connect(admin).setTokenAllowed(tokenAddr, true);
      await token.mint(seller.address, 1000000000n);
      await token.connect(seller).approve(await escrow.getAddress(), 500000000n);

      await escrow.connect(seller).lockToken(tradeId, buyer.address, tokenAddr, 500000000n);
      await escrow.connect(seller).release(tradeId);
      expect(await token.balanceOf(buyer.address)).to.equal(500000000n);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // CRITICAL: Double dispute resolution prevention
  // ═══════════════════════════════════════════════════════════

  describe("CRITICAL: Double dispute resolution", function () {
    it("should block disputeRelease after disputeCancel (escrow deleted)", async function () {
      await escrow.connect(seller).lockEth(tradeId, buyer.address, { value: ethers.parseEther("1") });
      await escrow.connect(buyer).markDisputed(tradeId);
      await escrow.connect(admin).disputeCancel(tradeId);
      await expect(escrow.connect(admin).disputeRelease(tradeId)).to.be.revertedWith("Not locked");
    });

    it("should block disputeCancel after disputeRelease (escrow deleted)", async function () {
      await escrow.connect(seller).lockEth(tradeId, buyer.address, { value: ethers.parseEther("1") });
      await escrow.connect(buyer).markDisputed(tradeId);
      await escrow.connect(admin).disputeRelease(tradeId);
      await expect(escrow.connect(admin).disputeCancel(tradeId)).to.be.revertedWith("Not locked");
    });
  });

  // ═══════════════════════════════════════════════════════════
  // HAPPY PATHS
  // ═══════════════════════════════════════════════════════════

  describe("Happy path: ETH lock → release", function () {
    it("should lock ETH and release to buyer", async function () {
      const amount = ethers.parseEther("1");
      await escrow.connect(seller).lockEth(tradeId, buyer.address, { value: amount });

      const e = await escrow.getEscrow(tradeId);
      expect(e.seller).to.equal(seller.address);
      expect(e.buyer).to.equal(buyer.address);
      expect(e.amount).to.equal(amount);
      expect(e.isLocked).to.be.true;

      const buyerBefore = await ethers.provider.getBalance(buyer.address);
      await escrow.connect(seller).release(tradeId);
      const buyerAfter = await ethers.provider.getBalance(buyer.address);
      expect(buyerAfter - buyerBefore).to.equal(amount);
    });
  });

  describe("Happy path: ETH lock → cancel", function () {
    it("should lock ETH and refund to seller", async function () {
      const amount = ethers.parseEther("0.5");
      await escrow.connect(seller).lockEth(tradeId, buyer.address, { value: amount });

      const sellerBefore = await ethers.provider.getBalance(seller.address);
      const tx = await escrow.connect(seller).cancel(tradeId);
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;
      const sellerAfter = await ethers.provider.getBalance(seller.address);
      expect(sellerAfter - sellerBefore + gasCost).to.equal(amount);
    });
  });

  describe("Happy path: Dispute → admin release", function () {
    it("should lock, dispute, and admin releases to buyer", async function () {
      await escrow.connect(seller).lockEth(tradeId, buyer.address, { value: ethers.parseEther("1") });
      await escrow.connect(buyer).markDisputed(tradeId);

      const e1 = await escrow.getEscrow(tradeId);
      expect(e1.isDisputed).to.be.true;

      const buyerBefore = await ethers.provider.getBalance(buyer.address);
      await escrow.connect(admin).disputeRelease(tradeId);
      const buyerAfter = await ethers.provider.getBalance(buyer.address);
      expect(buyerAfter - buyerBefore).to.equal(ethers.parseEther("1"));
    });
  });

  // ═══════════════════════════════════════════════════════════
  // ACCESS CONTROL
  // ═══════════════════════════════════════════════════════════

  describe("Access control", function () {
    it("only seller can release", async function () {
      await escrow.connect(seller).lockEth(tradeId, buyer.address, { value: ethers.parseEther("1") });
      await expect(escrow.connect(buyer).release(tradeId)).to.be.revertedWith("Only seller");
      await expect(escrow.connect(attacker).release(tradeId)).to.be.revertedWith("Only seller");
    });

    it("only seller can cancel", async function () {
      await escrow.connect(seller).lockEth(tradeId, buyer.address, { value: ethers.parseEther("1") });
      await expect(escrow.connect(buyer).cancel(tradeId)).to.be.revertedWith("Only seller");
    });

    it("only admin can dispute resolve", async function () {
      await escrow.connect(seller).lockEth(tradeId, buyer.address, { value: ethers.parseEther("1") });
      await escrow.connect(buyer).markDisputed(tradeId);
      await expect(escrow.connect(seller).disputeRelease(tradeId)).to.be.revertedWith("Only admin");
      await expect(escrow.connect(buyer).disputeCancel(tradeId)).to.be.revertedWith("Only admin");
    });

    it("only buyer/seller/admin can mark disputed", async function () {
      await escrow.connect(seller).lockEth(tradeId, buyer.address, { value: ethers.parseEther("1") });
      await expect(escrow.connect(attacker).markDisputed(tradeId)).to.be.revertedWith("Unauthorized");
    });

    it("only admin can set admin", async function () {
      await expect(escrow.connect(seller).setAdmin(attacker.address)).to.be.revertedWith("Only admin");
    });
  });

  // ═══════════════════════════════════════════════════════════
  // STATE GUARDS
  // ═══════════════════════════════════════════════════════════

  describe("State guards", function () {
    it("cannot release twice (escrow deleted after first)", async function () {
      await escrow.connect(seller).lockEth(tradeId, buyer.address, { value: ethers.parseEther("1") });
      await escrow.connect(seller).release(tradeId);
      await expect(escrow.connect(seller).release(tradeId)).to.be.revertedWith("Not locked");
    });

    it("cannot cancel twice (escrow deleted after first)", async function () {
      await escrow.connect(seller).lockEth(tradeId, buyer.address, { value: ethers.parseEther("1") });
      await escrow.connect(seller).cancel(tradeId);
      await expect(escrow.connect(seller).cancel(tradeId)).to.be.revertedWith("Not locked");
    });

    it("cannot release after cancel", async function () {
      await escrow.connect(seller).lockEth(tradeId, buyer.address, { value: ethers.parseEther("1") });
      await escrow.connect(seller).cancel(tradeId);
      await expect(escrow.connect(seller).release(tradeId)).to.be.revertedWith("Not locked");
    });

    it("cannot cancel after release", async function () {
      await escrow.connect(seller).lockEth(tradeId, buyer.address, { value: ethers.parseEther("1") });
      await escrow.connect(seller).release(tradeId);
      await expect(escrow.connect(seller).cancel(tradeId)).to.be.revertedWith("Not locked");
    });

    it("tradeId can be reused after resolution (storage deleted)", async function () {
      await escrow.connect(seller).lockEth(tradeId, buyer.address, { value: ethers.parseEther("1") });
      await escrow.connect(seller).release(tradeId);
      // Should be able to lock again with same tradeId
      await escrow.connect(seller).lockEth(tradeId, buyer.address, { value: ethers.parseEther("0.5") });
      const e = await escrow.getEscrow(tradeId);
      expect(e.amount).to.equal(ethers.parseEther("0.5"));
    });

    it("cannot release when disputed", async function () {
      await escrow.connect(seller).lockEth(tradeId, buyer.address, { value: ethers.parseEther("1") });
      await escrow.connect(buyer).markDisputed(tradeId);
      await expect(escrow.connect(seller).release(tradeId)).to.be.revertedWith("Under dispute");
    });

    it("cannot dispute resolve without dispute flag", async function () {
      await escrow.connect(seller).lockEth(tradeId, buyer.address, { value: ethers.parseEther("1") });
      await expect(escrow.connect(admin).disputeRelease(tradeId)).to.be.revertedWith("Not disputed");
    });

    it("cannot lock same tradeId twice", async function () {
      await escrow.connect(seller).lockEth(tradeId, buyer.address, { value: ethers.parseEther("1") });
      await expect(escrow.connect(seller).lockEth(tradeId, buyer.address, { value: ethers.parseEther("1") }))
        .to.be.revertedWith("Escrow already exists");
    });

    it("cannot mark disputed twice", async function () {
      await escrow.connect(seller).lockEth(tradeId, buyer.address, { value: ethers.parseEther("1") });
      await escrow.connect(buyer).markDisputed(tradeId);
      await expect(escrow.connect(buyer).markDisputed(tradeId)).to.be.revertedWith("Already disputed");
    });
  });

  // ═══════════════════════════════════════════════════════════
  // EDGE CASES
  // ═══════════════════════════════════════════════════════════

  describe("Edge cases", function () {
    it("cannot self-trade", async function () {
      await expect(escrow.connect(seller).lockEth(tradeId, seller.address, { value: ethers.parseEther("1") }))
        .to.be.revertedWith("Cannot trade with yourself");
    });

    it("cannot lock 0 ETH", async function () {
      await expect(escrow.connect(seller).lockEth(tradeId, buyer.address, { value: 0 }))
        .to.be.revertedWith("Amount must be > 0");
    });

    it("cannot lock with zero buyer address", async function () {
      await expect(escrow.connect(seller).lockEth(tradeId, ethers.ZeroAddress, { value: ethers.parseEther("1") }))
        .to.be.revertedWith("Invalid buyer");
    });

    it("admin transfer works and emits event", async function () {
      await expect(escrow.connect(admin).setAdmin(seller.address))
        .to.emit(escrow, "AdminChanged")
        .withArgs(admin.address, seller.address);
      expect(await escrow.admin()).to.equal(seller.address);
    });

    it("new admin can resolve disputes, old admin cannot", async function () {
      await escrow.connect(seller).lockEth(tradeId, buyer.address, { value: ethers.parseEther("1") });
      await escrow.connect(buyer).markDisputed(tradeId);
      await escrow.connect(admin).setAdmin(attacker.address);
      await expect(escrow.connect(admin).disputeRelease(tradeId)).to.be.revertedWith("Only admin");
      await escrow.connect(attacker).disputeRelease(tradeId); // new admin works
    });
  });

  // ═══════════════════════════════════════════════════════════
  // EVENTS
  // ═══════════════════════════════════════════════════════════

  describe("Events", function () {
    it("emits EscrowLocked on lock", async function () {
      await expect(escrow.connect(seller).lockEth(tradeId, buyer.address, { value: ethers.parseEther("1") }))
        .to.emit(escrow, "EscrowLocked")
        .withArgs(tradeId, seller.address, buyer.address, ethers.ZeroAddress, ethers.parseEther("1"));
    });

    it("emits EscrowReleased on release", async function () {
      await escrow.connect(seller).lockEth(tradeId, buyer.address, { value: ethers.parseEther("1") });
      await expect(escrow.connect(seller).release(tradeId))
        .to.emit(escrow, "EscrowReleased");
    });

    it("emits PaymentMarked", async function () {
      await escrow.connect(seller).lockEth(tradeId, buyer.address, { value: ethers.parseEther("1") });
      await expect(escrow.connect(buyer).markPaymentSent(tradeId))
        .to.emit(escrow, "PaymentMarked")
        .withArgs(tradeId, buyer.address);
    });

    it("emits DisputeResolved on admin resolve", async function () {
      await escrow.connect(seller).lockEth(tradeId, buyer.address, { value: ethers.parseEther("1") });
      await escrow.connect(buyer).markDisputed(tradeId);
      await expect(escrow.connect(admin).disputeRelease(tradeId))
        .to.emit(escrow, "DisputeResolved");
    });
  });

  // ═══════════════════════════════════════════════════════════
  // MEDIUM: Pause mechanism
  // ═══════════════════════════════════════════════════════════

  describe("MEDIUM: Pause mechanism", function () {
    it("admin can pause and unpause", async function () {
      await escrow.connect(admin).pause();
      expect(await escrow.paused()).to.be.true;
      await escrow.connect(admin).unpause();
      expect(await escrow.paused()).to.be.false;
    });

    it("lock blocked when paused", async function () {
      await escrow.connect(admin).pause();
      await expect(escrow.connect(seller).lockEth(tradeId, buyer.address, { value: ethers.parseEther("1") }))
        .to.be.revertedWith("Contract is paused");
    });

    it("release blocked when paused", async function () {
      await escrow.connect(seller).lockEth(tradeId, buyer.address, { value: ethers.parseEther("1") });
      await escrow.connect(admin).pause();
      await expect(escrow.connect(seller).release(tradeId)).to.be.revertedWith("Contract is paused");
    });

    it("non-admin cannot pause", async function () {
      await expect(escrow.connect(seller).pause()).to.be.revertedWith("Only admin");
    });
  });

  // ═══════════════════════════════════════════════════════════
  // MEDIUM: Token allowlist
  // ═══════════════════════════════════════════════════════════

  describe("MEDIUM: Token allowlist", function () {
    it("rejects non-allowed tokens", async function () {
      const MockToken = await ethers.getContractFactory("MockERC20");
      const token = await MockToken.deploy("USDC", "USDC", 6);
      await token.waitForDeployment();
      const tokenAddr = await token.getAddress();

      await token.mint(seller.address, 1000000000n);
      await token.connect(seller).approve(await escrow.getAddress(), 500000000n);

      await expect(escrow.connect(seller).lockToken(tradeId, buyer.address, tokenAddr, 500000000n))
        .to.be.revertedWith("Token not allowed");
    });

    it("accepts allowed tokens", async function () {
      const MockToken = await ethers.getContractFactory("MockERC20");
      const token = await MockToken.deploy("USDC", "USDC", 6);
      await token.waitForDeployment();
      const tokenAddr = await token.getAddress();

      await escrow.connect(admin).setTokenAllowed(tokenAddr, true);
      await token.mint(seller.address, 1000000000n);
      await token.connect(seller).approve(await escrow.getAddress(), 500000000n);

      await escrow.connect(seller).lockToken(tradeId, buyer.address, tokenAddr, 500000000n);
      const e = await escrow.getEscrow(tradeId);
      expect(e.amount).to.equal(500000000n);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // LOW: Two-step admin transfer
  // ═══════════════════════════════════════════════════════════

  describe("LOW: Two-step admin transfer", function () {
    it("propose and accept admin", async function () {
      await escrow.connect(admin).proposeAdmin(seller.address);
      expect(await escrow.pendingAdmin()).to.equal(seller.address);
      await escrow.connect(seller).acceptAdmin();
      expect(await escrow.admin()).to.equal(seller.address);
    });

    it("non-pending cannot accept", async function () {
      await escrow.connect(admin).proposeAdmin(seller.address);
      await expect(escrow.connect(buyer).acceptAdmin()).to.be.revertedWith("Not pending admin");
    });
  });

  // ═══════════════════════════════════════════════════════════
  // MEDIUM: Escrow expiry
  // ═══════════════════════════════════════════════════════════

  describe("MEDIUM: Escrow expiry", function () {
    it("cannot expire before timeout", async function () {
      await escrow.connect(seller).lockEth(tradeId, buyer.address, { value: ethers.parseEther("1") });
      await expect(escrow.expireEscrow(tradeId)).to.be.revertedWith("Not expired yet");
    });

    it("can expire after timeout and funds return to seller", async function () {
      await escrow.connect(seller).lockEth(tradeId, buyer.address, { value: ethers.parseEther("1") });

      // Fast-forward 31 days
      await ethers.provider.send("evm_increaseTime", [31 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);

      const sellerBefore = await ethers.provider.getBalance(seller.address);
      await escrow.connect(attacker).expireEscrow(tradeId); // anyone can call
      const sellerAfter = await ethers.provider.getBalance(seller.address);
      expect(sellerAfter - sellerBefore).to.equal(ethers.parseEther("1"));
    });
  });
});
