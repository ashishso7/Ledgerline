// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {OnchainLedger} from "./OnchainLedger.sol";

/// @title LedgerFactory
/// @notice Permissionless deployment and append-only registry of bookkeeping ledgers.
/// @dev The factory has no privileged owner, funds handling, or upgrade mechanism.
contract LedgerFactory {
    /// @notice Immutable creation metadata; owner records the original creator, not current roles.
    struct LedgerInfo {
        address ledger;
        address owner;
        string name;
        uint64 createdAt;
    }

    /// @notice Token address supplied to every newly created ledger.
    address public immutable usdc;
    /// @notice Maximum ledger name length in bytes.
    uint256 public constant MAX_NAME_BYTES = 64;
    /// @notice Maximum number of ledgers returned by a paginated query.
    uint256 public constant MAX_PAGE_SIZE = 100;

    LedgerInfo[] private _ledgers;
    mapping(address owner => uint256[] ids) private _ledgerIds;

    /// @notice The token address must not be zero.
    error ZeroAddress();
    /// @notice The supplied token address has no deployed code.
    error InvalidToken(address token);
    /// @notice Ledger names must contain between 1 and 64 bytes.
    error InvalidNameLength(uint256 length);
    /// @notice The requested ledger ID does not exist.
    error InvalidLedger(uint256 id);
    /// @notice The requested page limit exceeds 100.
    error PageTooLarge(uint256 limit);

    /// @notice A ledger was created with the caller as its initial admin and bookkeeper.
    event LedgerCreated(uint256 indexed id, address indexed owner, address indexed ledger, string name);

    /// @param usdc_ Token contract address to use for all ledgers.
    /// @dev Code presence does not verify token identity or ERC-20 behavior.
    constructor(address usdc_) {
        if (usdc_ == address(0)) revert ZeroAddress();
        if (usdc_.code.length == 0) revert InvalidToken(usdc_);
        usdc = usdc_;
    }

    /// @notice Deploy a ledger with the caller as its initial admin and bookkeeper.
    /// @param name Display name containing 1 through 64 bytes; duplicates are allowed.
    /// @return ledger Address of the newly deployed ledger.
    function createLedger(string calldata name) external returns (address ledger) {
        uint256 length = bytes(name).length;
        if (length == 0 || length > MAX_NAME_BYTES) revert InvalidNameLength(length);

        ledger = address(new OnchainLedger(usdc, msg.sender));
        uint256 id = _ledgers.length;
        _ledgers.push(LedgerInfo({
            ledger: ledger,
            owner: msg.sender,
            name: name,
            createdAt: uint64(block.timestamp)
        }));
        _ledgerIds[msg.sender].push(id);
        emit LedgerCreated(id, msg.sender, ledger, name);
    }

    /// @notice Return the total number of registered ledgers.
    function ledgerCount() external view returns (uint256) {
        return _ledgers.length;
    }

    /// @notice Return creation metadata for a zero-based ledger ID.
    /// @param id Ledger ID; reverts with InvalidLedger if out of range.
    function getLedger(uint256 id) external view returns (LedgerInfo memory) {
        if (id >= _ledgers.length) revert InvalidLedger(id);
        return _ledgers[id];
    }

    /// @notice Return all IDs created by an owner, in insertion order.
    /// @dev This list tracks creation, not subsequent changes to ledger roles.
    function ledgerIdsOf(address owner) external view returns (uint256[] memory) {
        return _ledgerIds[owner];
    }

    /// @notice Return a page of ledger metadata in insertion order.
    /// @param offset Zero-based starting index; out-of-range offsets return an empty array.
    /// @param limit Maximum results, at most 100; zero returns an empty array.
    /// @return page Ledger metadata for the requested range.
    function getLedgers(uint256 offset, uint256 limit) external view returns (LedgerInfo[] memory page) {
        if (limit > MAX_PAGE_SIZE) revert PageTooLarge(limit);
        uint256 count = _ledgers.length;
        if (offset >= count || limit == 0) return new LedgerInfo[](0);
        uint256 size = count - offset;
        if (size > limit) size = limit;
        page = new LedgerInfo[](size);
        for (uint256 i; i < size; ++i) {
            page[i] = _ledgers[offset + i];
        }
    }
}
