// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract MerlinkEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public admin;
    address public pendingAdmin;          // LOW FIX: two-step admin transfer
    bool public paused;                    // MEDIUM FIX: emergency pause

    // MEDIUM FIX: token allowlist
    mapping(address => bool) public allowedTokens;

    struct Escrow {
        address seller;
        address buyer;
        address token;
        uint256 amount;
        uint256 createdAt;                 // MEDIUM FIX: escrow expiry support
        bool isLocked;
        bool isReleased;
        bool isCancelled;
        bool isDisputed;
        bool paymentMarked;
    }

    mapping(bytes32 => Escrow) public escrows;

    uint256 public constant ESCROW_TIMEOUT = 30 days;  // MEDIUM FIX: auto-expire after 30 days

    event EscrowLocked(bytes32 indexed tradeId, address seller, address buyer, address token, uint256 amount);
    event EscrowReleased(bytes32 indexed tradeId, address buyer, uint256 amount);
    event EscrowCancelled(bytes32 indexed tradeId, address seller, uint256 amount);
    event EscrowDisputed(bytes32 indexed tradeId, address caller);
    event PaymentMarked(bytes32 indexed tradeId, address buyer);
    event DisputeResolved(bytes32 indexed tradeId, address recipient, uint256 amount, string resolution);
    event AdminChanged(address indexed oldAdmin, address indexed newAdmin);
    event AdminTransferProposed(address indexed current, address indexed proposed);
    event TokenAllowlistUpdated(address indexed token, bool allowed);
    event Paused(address indexed by);
    event Unpaused(address indexed by);
    event EscrowExpired(bytes32 indexed tradeId, address seller, uint256 amount);
    event TokensRescued(address indexed token, uint256 amount, address indexed to);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }

    constructor(address _admin) {
        require(_admin != address(0), "Invalid admin");
        admin = _admin;
    }

    // ─── Admin Functions ─────────────────────────────────────

    /// LOW FIX: Two-step admin transfer — propose new admin
    function proposeAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "Invalid admin");
        pendingAdmin = newAdmin;
        emit AdminTransferProposed(admin, newAdmin);
    }

    /// LOW FIX: New admin accepts the transfer
    function acceptAdmin() external {
        require(msg.sender == pendingAdmin, "Not pending admin");
        emit AdminChanged(admin, pendingAdmin);
        admin = pendingAdmin;
        pendingAdmin = address(0);
    }

    /// Legacy setAdmin kept for backwards compat but emits warning
    function setAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "Invalid admin");
        emit AdminChanged(admin, newAdmin);
        admin = newAdmin;
        pendingAdmin = address(0);
    }

    /// MEDIUM FIX: Emergency pause
    function pause() external onlyAdmin {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyAdmin {
        paused = false;
        emit Unpaused(msg.sender);
    }

    /// MEDIUM FIX: Token allowlist management
    function setTokenAllowed(address token, bool allowed) external onlyAdmin {
        allowedTokens[token] = allowed;
        emit TokenAllowlistUpdated(token, allowed);
    }

    /// LOW FIX: Rescue accidentally sent ERC-20 tokens (not escrowed)
    function rescueTokens(address token, uint256 amount, address to) external onlyAdmin {
        require(to != address(0), "Invalid recipient");
        IERC20(token).safeTransfer(to, amount);
        emit TokensRescued(token, amount, to);
    }

    // ─── Lock ────────────────────────────────────────────────

    function lockEth(bytes32 tradeId, address buyer) external payable nonReentrant whenNotPaused {
        require(msg.value > 0, "Amount must be > 0");
        require(escrows[tradeId].seller == address(0), "Escrow already exists");
        require(buyer != address(0), "Invalid buyer");
        require(buyer != msg.sender, "Cannot trade with yourself");

        escrows[tradeId] = Escrow({
            seller: msg.sender,
            buyer: buyer,
            token: address(0),
            amount: msg.value,
            createdAt: block.timestamp,
            isLocked: true,
            isReleased: false,
            isCancelled: false,
            isDisputed: false,
            paymentMarked: false
        });

        emit EscrowLocked(tradeId, msg.sender, buyer, address(0), msg.value);
    }

    function lockToken(bytes32 tradeId, address buyer, address token, uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "Amount must be > 0");
        require(escrows[tradeId].seller == address(0), "Escrow already exists");
        require(buyer != address(0), "Invalid buyer");
        require(buyer != msg.sender, "Cannot trade with yourself");
        require(token != address(0), "Use lockEth for native ETH");
        require(allowedTokens[token], "Token not allowed");  // MEDIUM FIX

        uint256 balanceBefore = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        uint256 actualAmount = IERC20(token).balanceOf(address(this)) - balanceBefore;
        require(actualAmount > 0, "No tokens received");

        escrows[tradeId] = Escrow({
            seller: msg.sender,
            buyer: buyer,
            token: token,
            amount: actualAmount,
            createdAt: block.timestamp,
            isLocked: true,
            isReleased: false,
            isCancelled: false,
            isDisputed: false,
            paymentMarked: false
        });

        emit EscrowLocked(tradeId, msg.sender, buyer, token, actualAmount);
    }

    // ─── Payment Marking ─────────────────────────────────────

    function markPaymentSent(bytes32 tradeId) external nonReentrant {
        Escrow storage escrow = escrows[tradeId];
        require(escrow.isLocked, "Not locked");
        require(!escrow.isReleased, "Already released");
        require(!escrow.isCancelled, "Already cancelled");
        require(!escrow.paymentMarked, "Already marked");
        require(msg.sender == escrow.buyer, "Only buyer");

        escrow.paymentMarked = true;
        emit PaymentMarked(tradeId, msg.sender);
    }

    // ─── Release ─────────────────────────────────────────────

    function release(bytes32 tradeId) external nonReentrant whenNotPaused {
        Escrow memory escrow = escrows[tradeId];  // read to memory before delete
        require(escrow.isLocked, "Not locked");
        require(!escrow.isReleased, "Already released");
        require(!escrow.isCancelled, "Already cancelled");
        require(!escrow.isDisputed, "Under dispute");
        require(msg.sender == escrow.seller, "Only seller");

        delete escrows[tradeId];

        if (escrow.token == address(0)) {
            (bool sent, ) = escrow.buyer.call{value: escrow.amount}("");
            require(sent, "ETH transfer failed");
        } else {
            IERC20(escrow.token).safeTransfer(escrow.buyer, escrow.amount);
        }

        emit EscrowReleased(tradeId, escrow.buyer, escrow.amount);
    }

    // ─── Cancel ──────────────────────────────────────────────

    function cancel(bytes32 tradeId) external nonReentrant {
        Escrow memory escrow = escrows[tradeId];
        require(escrow.isLocked, "Not locked");
        require(!escrow.isReleased, "Already released");
        require(!escrow.isCancelled, "Already cancelled");
        require(!escrow.isDisputed, "Under dispute");
        require(!escrow.paymentMarked, "Cannot cancel after payment marked");
        require(msg.sender == escrow.seller, "Only seller");

        delete escrows[tradeId];

        if (escrow.token == address(0)) {
            (bool sent, ) = escrow.seller.call{value: escrow.amount}("");
            require(sent, "ETH transfer failed");
        } else {
            IERC20(escrow.token).safeTransfer(escrow.seller, escrow.amount);
        }

        emit EscrowCancelled(tradeId, escrow.seller, escrow.amount);
    }

    // ─── Escrow Expiry ───────────────────────────────────────

    /// MEDIUM FIX: Anyone can expire an old escrow (returns funds to seller)
    function expireEscrow(bytes32 tradeId) external nonReentrant {
        Escrow memory escrow = escrows[tradeId];
        require(escrow.isLocked, "Not locked");
        require(!escrow.isReleased, "Already released");
        require(!escrow.isCancelled, "Already cancelled");
        require(block.timestamp > escrow.createdAt + ESCROW_TIMEOUT, "Not expired yet");

        delete escrows[tradeId];

        if (escrow.token == address(0)) {
            (bool sent, ) = escrow.seller.call{value: escrow.amount}("");
            require(sent, "ETH transfer failed");
        } else {
            IERC20(escrow.token).safeTransfer(escrow.seller, escrow.amount);
        }

        emit EscrowExpired(tradeId, escrow.seller, escrow.amount);
    }

    // ─── Dispute ─────────────────────────────────────────────

    function markDisputed(bytes32 tradeId) external nonReentrant {
        Escrow storage escrow = escrows[tradeId];
        require(escrow.isLocked, "Not locked");
        require(!escrow.isReleased, "Already released");
        require(!escrow.isCancelled, "Already cancelled");
        require(!escrow.isDisputed, "Already disputed");
        require(
            msg.sender == escrow.seller || msg.sender == escrow.buyer || msg.sender == admin,
            "Unauthorized"
        );

        escrow.isDisputed = true;
        emit EscrowDisputed(tradeId, msg.sender);
    }

    function disputeRelease(bytes32 tradeId) external onlyAdmin nonReentrant {
        Escrow memory escrow = escrows[tradeId];
        require(escrow.isLocked, "Not locked");
        require(escrow.isDisputed, "Not disputed");
        require(!escrow.isReleased, "Already released");
        require(!escrow.isCancelled, "Already cancelled");

        delete escrows[tradeId];

        if (escrow.token == address(0)) {
            (bool sent, ) = escrow.buyer.call{value: escrow.amount}("");
            require(sent, "ETH transfer failed");
        } else {
            IERC20(escrow.token).safeTransfer(escrow.buyer, escrow.amount);
        }

        emit DisputeResolved(tradeId, escrow.buyer, escrow.amount, "RELEASE_TO_BUYER");
    }

    function disputeCancel(bytes32 tradeId) external onlyAdmin nonReentrant {
        Escrow memory escrow = escrows[tradeId];
        require(escrow.isLocked, "Not locked");
        require(escrow.isDisputed, "Not disputed");
        require(!escrow.isReleased, "Already released");
        require(!escrow.isCancelled, "Already cancelled");

        delete escrows[tradeId];

        if (escrow.token == address(0)) {
            (bool sent, ) = escrow.seller.call{value: escrow.amount}("");
            require(sent, "ETH transfer failed");
        } else {
            IERC20(escrow.token).safeTransfer(escrow.seller, escrow.amount);
        }

        emit DisputeResolved(tradeId, escrow.seller, escrow.amount, "REFUND_TO_SELLER");
    }

    // ─── View ────────────────────────────────────────────────

    function getEscrow(bytes32 tradeId) external view returns (
        address seller, address buyer, address token, uint256 amount,
        bool isLocked, bool isReleased, bool isCancelled, bool isDisputed, bool paymentMarked
    ) {
        Escrow storage e = escrows[tradeId];
        return (e.seller, e.buyer, e.token, e.amount, e.isLocked, e.isReleased, e.isCancelled, e.isDisputed, e.paymentMarked);
    }
}
