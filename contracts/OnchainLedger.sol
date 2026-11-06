// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title OnchainLedger
/// @notice Shared USDC treasury with immutable cash entries and bookkeeping-only void notes.
/// @dev Amounts are ERC-20 USDC base units (1 USDC = 1_000_000 units), not native gas units.
/// Each Income entry represents a treasury debit / income credit; each Expense entry
/// represents an expense debit / treasury credit. The two legs are implicit in its kind.
/// Only movements through deposit and payExpense are recorded: unsolicited ERC-20
/// transfers, forced native funds and network gas charges cannot be intercepted.
/// Consequently book totals (especially after voids) need not equal treasuryBalance.
/// No native-currency deposit, refund, sweep, arbitrary call or upgrade path is provided.
contract OnchainLedger is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice ADMIN is the self-administered OpenZeppelin default admin role.
    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;
    bytes32 public constant BOOKKEEPER_ROLE = keccak256("BOOKKEEPER_ROLE");
    uint256 public constant MAX_CATEGORY_NAME_BYTES = 64;
    uint256 public constant MAX_MEMO_BYTES = 200;
    uint256 public constant MAX_REASON_BYTES = 200;
    uint256 public constant MAX_PAGE_SIZE = 100;

    enum Kind { Income, Expense }

    struct Category {
        string name;
        Kind kind;
        bool active;
    }

    /// @dev All fields are immutable after creation except the one-way voided flag.
    struct Entry {
        uint256 id;
        uint256 timestamp;
        uint256 categoryId;
        Kind kind;
        address counterparty;
        uint128 amount;
        string memo;
        bytes32 ref;
        address recordedBy;
        bool voided;
    }

    /// @notice Append-only reversal note referencing the original entry's two bookkeeping legs.
    /// @dev This negates that entry's contribution to book totals, not its token transfer.
    /// Notes are separate from cash entries and cannot themselves be voided or edited.
    struct VoidNote {
        uint256 entryId;
        uint256 timestamp;
        string reason;
        address recordedBy;
    }

    IERC20 public immutable usdc;
    uint256 public totalIncome;
    uint256 public totalExpense;
    /// @notice Non-voided total in base units for each category; not a treasury sub-balance.
    mapping(uint256 categoryId => uint256 amount) public categoryTotal;

    Category[] private _categories;
    Entry[] private _entries;
    VoidNote[] private _voidNotes;

    error ZeroAddress();
    error InvalidToken(address token);
    error InvalidAmount(uint256 amount);
    error InvalidCategory(uint256 categoryId);
    error InactiveCategory(uint256 categoryId);
    error WrongCategoryKind(uint256 categoryId, Kind expected);
    error InvalidEntry(uint256 entryId);
    error InvalidVoidNote(uint256 noteId);
    error EntryAlreadyVoided(uint256 entryId);
    error InvalidTextLength(uint256 length, uint256 maximum);
    error CategoryStatusUnchanged(uint256 categoryId);
    error InsufficientTreasuryBalance(uint256 balance, uint256 required);
    error TreasuryCannotBeRecipient();
    error PageTooLarge(uint256 limit);

    event CategoryAdded(uint256 indexed categoryId, string name, Kind kind, address indexed addedBy);
    event CategoryStatusChanged(uint256 indexed categoryId, bool active, address indexed changedBy);
    event EntryRecorded(
        uint256 indexed entryId,
        uint256 indexed categoryId,
        address indexed counterparty,
        Kind kind,
        uint128 amount,
        string memo,
        bytes32 ref,
        address recordedBy
    );
    /// @notice Appends a reversal note. This event NEVER indicates a refund or token transfer.
    event EntryVoided(
        uint256 indexed entryId,
        uint256 indexed noteId,
        address indexed voidedBy,
        string reason
    );

    /// @param usdc_ Standard six-decimal ERC-20 USDC interface address on the target chain.
    /// @param admin Initial ADMIN and BOOKKEEPER; can manage roles with grantRole/revokeRole.
    /// @dev The token's identity and six-decimal behavior are deployment assumptions.
    constructor(address usdc_, address admin) {
        if (usdc_ == address(0) || admin == address(0)) revert ZeroAddress();
        if (usdc_.code.length == 0) revert InvalidToken(usdc_);
        usdc = IERC20(usdc_);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(BOOKKEEPER_ROLE, admin);
        _addCategory("Sales", Kind.Income, admin);
        _addCategory("Other income", Kind.Income, admin);
        _addCategory("Payroll", Kind.Expense, admin);
        _addCategory("Software", Kind.Expense, admin);
        _addCategory("Operations", Kind.Expense, admin);
        _addCategory("Other expense", Kind.Expense, admin);
    }

    /// @notice Add an active category. Category IDs are zero-based and never reused.
    /// @dev Names and kinds cannot later be edited; duplicate names are allowed.
    function addCategory(string calldata name, Kind kind)
        external onlyRole(ADMIN_ROLE) returns (uint256 categoryId)
    {
        return _addCategory(name, kind, _msgSender());
    }

    /// @notice Disable or re-enable a category without changing its history or totals.
    function setCategoryStatus(uint256 categoryId, bool active) external onlyRole(ADMIN_ROLE) {
        Category storage category = _category(categoryId);
        if (category.active == active) revert CategoryStatusUnchanged(categoryId);
        category.active = active;
        emit CategoryStatusChanged(categoryId, active, _msgSender());
    }

    /// @notice Pause deposits and payouts only; bookkeeping and administration remain available.
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    /// @notice Resume deposits and payouts.
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    /// @notice Pull approved USDC into the treasury and append an Income entry.
    /// @dev Caller must first approve this contract. References need not be unique.
    function deposit(uint256 categoryId, uint256 amount, string calldata memo, bytes32 ref)
        external nonReentrant whenNotPaused returns (uint256 entryId)
    {
        _validateMovement(categoryId, Kind.Income, amount, memo);
        entryId = _recordEntry(categoryId, Kind.Income, _msgSender(), uint128(amount), memo, ref);
        usdc.safeTransferFrom(_msgSender(), address(this), amount);
    }

    /// @notice Pay USDC from the treasury and append an Expense entry atomically.
    /// @dev Self-payouts are rejected because they do not represent a treasury outflow.
    function payExpense(
        uint256 categoryId,
        address to,
        uint256 amount,
        string calldata memo,
        bytes32 ref
    ) external onlyRole(BOOKKEEPER_ROLE) nonReentrant whenNotPaused returns (uint256 entryId) {
        if (to == address(0)) revert ZeroAddress();
        if (to == address(this)) revert TreasuryCannotBeRecipient();
        _validateMovement(categoryId, Kind.Expense, amount, memo);
        uint256 balance = treasuryBalance();
        if (balance < amount) revert InsufficientTreasuryBalance(balance, amount);
        entryId = _recordEntry(categoryId, Kind.Expense, to, uint128(amount), memo, ref);
        usdc.safeTransfer(to, amount);
    }

    /// @notice Void a record once and append a reversing note. DOES NOT refund or move USDC.
    /// @dev Only the original entry's voided flag changes. Original data is retained forever.
    /// Active status of its category is irrelevant; voiding is permitted while paused.
    function voidEntry(uint256 entryId, string calldata reason)
        external onlyRole(BOOKKEEPER_ROLE) nonReentrant returns (uint256 noteId)
    {
        if (entryId >= _entries.length) revert InvalidEntry(entryId);
        Entry storage entry = _entries[entryId];
        if (entry.voided) revert EntryAlreadyVoided(entryId);
        uint256 length = bytes(reason).length;
        if (length == 0 || length > MAX_REASON_BYTES) revert InvalidTextLength(length, MAX_REASON_BYTES);

        entry.voided = true;
        categoryTotal[entry.categoryId] -= entry.amount;
        if (entry.kind == Kind.Income) {
            totalIncome -= entry.amount;
        } else {
            totalExpense -= entry.amount;
        }
        noteId = _voidNotes.length;
        _voidNotes.push(VoidNote(entryId, block.timestamp, reason, _msgSender()));
        emit EntryVoided(entryId, noteId, _msgSender(), reason);
    }

    /// @notice Number of cash entries, including voided ones. Notes are counted separately.
    function entryCount() external view returns (uint256) {
        return _entries.length;
    }

    /// @notice Fetch an entry by its zero-based ID, including its current voided flag.
    function getEntry(uint256 id) external view returns (Entry memory) {
        if (id >= _entries.length) revert InvalidEntry(id);
        return _entries[id];
    }

    /// @notice Fetch entries in chronological insertion order; includes voided entries.
    /// @dev Limit must be at most 100. An out-of-range offset or zero limit returns an empty array.
    function getEntries(uint256 offset, uint256 limit) external view returns (Entry[] memory page) {
        if (limit > MAX_PAGE_SIZE) revert PageTooLarge(limit);
        uint256 count = _entries.length;
        if (offset >= count || limit == 0) return new Entry[](0);
        uint256 size = count - offset;
        if (size > limit) size = limit;
        page = new Entry[](size);
        for (uint256 i; i < size; ++i) {
            page[i] = _entries[offset + i];
        }
    }

    /// @notice Number of categories, including inactive categories.
    function categoryCount() external view returns (uint256) {
        return _categories.length;
    }

    /// @notice Fetch a category by its zero-based ID.
    function getCategory(uint256 id) external view returns (Category memory) {
        return _category(id);
    }

    /// @notice Actual ERC-20 USDC balance, independent of bookkeeping voids and direct transfers.
    function treasuryBalance() public view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    /// @notice Number of append-only reversal notes.
    function voidNoteCount() external view returns (uint256) {
        return _voidNotes.length;
    }

    /// @notice Fetch a reversing note; its entryId identifies the original kind, category and amount.
    function getVoidNote(uint256 noteId) external view returns (VoidNote memory) {
        if (noteId >= _voidNotes.length) revert InvalidVoidNote(noteId);
        return _voidNotes[noteId];
    }

    function _category(uint256 id) private view returns (Category storage category) {
        if (id >= _categories.length) revert InvalidCategory(id);
        return _categories[id];
    }

    function _addCategory(string memory name, Kind kind, address addedBy) private returns (uint256 id) {
        uint256 length = bytes(name).length;
        if (length == 0 || length > MAX_CATEGORY_NAME_BYTES) {
            revert InvalidTextLength(length, MAX_CATEGORY_NAME_BYTES);
        }
        id = _categories.length;
        _categories.push(Category(name, kind, true));
        emit CategoryAdded(id, name, kind, addedBy);
    }

    function _validateMovement(uint256 categoryId, Kind kind, uint256 amount, string calldata memo)
        private view
    {
        Category storage category = _category(categoryId);
        if (!category.active) revert InactiveCategory(categoryId);
        if (category.kind != kind) revert WrongCategoryKind(categoryId, kind);
        if (amount == 0 || amount > type(uint128).max) revert InvalidAmount(amount);
        uint256 length = bytes(memo).length;
        if (length > MAX_MEMO_BYTES) revert InvalidTextLength(length, MAX_MEMO_BYTES);
    }

    function _recordEntry(
        uint256 categoryId,
        Kind kind,
        address counterparty,
        uint128 amount,
        string calldata memo,
        bytes32 ref
    ) private returns (uint256 id) {
        id = _entries.length;
        _entries.push(Entry({
            id: id,
            timestamp: block.timestamp,
            categoryId: categoryId,
            kind: kind,
            counterparty: counterparty,
            amount: amount,
            memo: memo,
            ref: ref,
            recordedBy: _msgSender(),
            voided: false
        }));
        categoryTotal[categoryId] += amount;
        if (kind == Kind.Income) {
            totalIncome += amount;
        } else {
            totalExpense += amount;
        }
        emit EntryRecorded(id, categoryId, counterparty, kind, amount, memo, ref, _msgSender());
    }
}
