// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {ERC2771ContextUpgradeable} from "@openzeppelin/contracts-upgradeable/metatx/ERC2771ContextUpgradeable.sol";
import {ERC721Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import {ContextUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import {EIP712Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ITurnstileEvent} from "./ITurnstileEvent.sol";

/// @title TurnstileEvent — identity-bound tickets for one event.
/// @notice One ERC-721 per seat. A ticket cannot move except through the venue's capped resale path.
///         Entry is proven by an EIP-712 `Entry` signature from the ticket's bound **door key** — a key derived
///         from the holder's passkey (see packages/identity/SPEC.md) that never holds funds and never sends a
///         transaction: the gate submits `checkIn`, once per token.
///
/// @dev Deployed as EIP-1167 clones by `TurnstileFactory`; the implementation is initialised-disabled.
///      Holder actions (`buy`, `bindDoorKey`, `list`, `delist`) honour ERC-2771 so the relayer can pay gas.
///      EIP-712 domain: `{ name: "Turnstile", version: "1", chainId, verifyingContract: <this clone> }`.
contract TurnstileEvent is
    ITurnstileEvent,
    Initializable,
    ERC721Upgradeable,
    AccessControlUpgradeable,
    EIP712Upgradeable,
    ERC2771ContextUpgradeable,
    ReentrancyGuardTransient
{
    // -------------------------------------------------------------------------------------- constants

    bytes32 public constant GATE_ROLE = keccak256("GATE_ROLE");

    /// @dev keccak256("Entry(uint256 eventId,uint256 tokenId,uint64 slot)") — pinned by vectors/entry.json.
    bytes32 public constant ENTRY_TYPEHASH = 0x618c00eee859eabe457a85352232b00110aa50169f60cc14a0d31c8d514fcf06;
    /// @dev keccak256("BindDoorKey(uint256 tokenId,address doorKey,uint256 nonce,uint256 deadline)").
    bytes32 public constant BIND_TYPEHASH =
        keccak256("BindDoorKey(uint256 tokenId,address doorKey,uint256 nonce,uint256 deadline)");

    /// @dev A slot is a 30-second window: `slot = block.timestamp / 30` (the identity package uses unixMs / 30000).
    uint64 public constant SLOT_SECONDS = 30;
    /// @dev `checkIn` accepts `|slot - currentSlot| <= SLOT_TOLERANCE`: the previous slot covers inclusion
    ///      latency and a QR scanned at the very end of its window; the next slot covers a phone clock that
    ///      runs slightly ahead of block time. Replay is impossible regardless: one check-in per token.
    uint64 public constant SLOT_TOLERANCE = 1;

    uint16 public constant BPS = 10_000;
    uint256 public constant MAX_TIERS = 16;

    // ---------------------------------------------------------------------------------------- storage

    uint256 private _eventId;
    address private _organiser;
    bytes32 private _venue;
    uint64 private _startsAt;
    uint64 private _salesEndAt;
    uint16 private _resaleCapBps;
    uint16 private _resaleFeeBps;
    string private _baseTokenURI;

    Tier[] private _tiers;
    uint256 private _capacity;
    uint256 private _sold;
    uint256 private _checkedInCount;

    mapping(uint256 tokenId => uint96) private _faceValue;
    mapping(uint256 tokenId => address) private _doorKey;
    mapping(uint256 tokenId => uint256) private _bindNonce;
    mapping(uint256 tokenId => uint64) private _checkedInAt;
    mapping(uint256 tokenId => Listing) private _listings;

    /// @dev Set only for the duration of a resale transfer; `_update` rejects every other move of an owned token.
    bool private transient _resaleTransfer;

    // ----------------------------------------------------------------------------------- construction

    /// @param trustedForwarder the ERC-2771 forwarder the relayer submits through (shared by every clone).
    constructor(address trustedForwarder) ERC2771ContextUpgradeable(trustedForwarder) {
        _disableInitializers();
    }

    /// @inheritdoc ITurnstileEvent
    function initialize(
        uint256 eventId_,
        address organiser_,
        EventConfig calldata config_,
        Tier[] calldata tiers_,
        address[] calldata gates
    ) external initializer {
        if (
            organiser_ == address(0) || config_.startsAt == 0 || config_.resaleFeeBps > BPS
                || bytes(config_.name).length == 0 || (config_.salesEndAt != 0 && config_.salesEndAt > config_.startsAt)
        ) revert InvalidConfig();

        __ERC721_init(config_.name, config_.symbol);
        __AccessControl_init();
        __EIP712_init("Turnstile", "1");

        _eventId = eventId_;
        _organiser = organiser_;
        _venue = config_.venue;
        _startsAt = config_.startsAt;
        _salesEndAt = config_.salesEndAt == 0 ? config_.startsAt : config_.salesEndAt;
        _resaleCapBps = config_.resaleCapBps;
        _resaleFeeBps = config_.resaleFeeBps;
        _baseTokenURI = config_.baseURI;
        _setTiers(tiers_);

        _grantRole(DEFAULT_ADMIN_ROLE, organiser_);
        for (uint256 i = 0; i < gates.length; ++i) {
            _grantRole(GATE_ROLE, gates[i]);
        }
    }

    function _setTiers(Tier[] calldata tiers_) private {
        uint256 n = tiers_.length;
        if (n == 0 || n > MAX_TIERS) revert InvalidTiers();
        uint256 total = 0;
        for (uint256 i = 0; i < n; ++i) {
            Tier calldata t = tiers_[i];
            if (t.seatCount == 0) revert InvalidTiers();
            uint256 start = t.firstSeat;
            uint256 end = start + t.seatCount; // exclusive; fits easily (uint32 + uint32)
            for (uint256 j = 0; j < i; ++j) {
                uint256 s2 = tiers_[j].firstSeat;
                uint256 e2 = s2 + tiers_[j].seatCount;
                if (start < e2 && s2 < end) revert InvalidTiers(); // overlap
            }
            _tiers.push(t);
            total += t.seatCount;
        }
        _capacity = total;
    }

    // ------------------------------------------------------------------------------------ primary sale

    /// @inheritdoc ITurnstileEvent
    /// @dev `msg.value` must equal the tier's face value exactly. Proceeds go to the organiser in the same
    ///      transaction. Works through the forwarder for free tiers (the relayer never fronts value).
    function buy(uint256 seatId) external payable nonReentrant {
        if (block.timestamp > _salesEndAt) revert SalesClosed();
        (uint8 tierIndex, Tier memory tier) = tierOf(seatId);
        if (msg.value != tier.price) revert WrongPrice(tier.price, msg.value);
        _mintSeat(seatId, _msgSender(), tierIndex, tier.price, false);
        if (msg.value != 0) _pay(_organiser, msg.value);
    }

    /// @inheritdoc ITurnstileEvent
    /// @dev Organiser comp / guest list. Face value is recorded as 0, so a comp can be passed on at price 0 but
    ///      never sold: the resale cap of a free ticket is 0.
    function mintTo(uint256 seatId, address to) external onlyRole(DEFAULT_ADMIN_ROLE) {
        (uint8 tierIndex,) = tierOf(seatId);
        _mintSeat(seatId, to, tierIndex, 0, true);
    }

    function _mintSeat(uint256 seatId, address to, uint8 tierIndex, uint96 faceValue, bool comp) private {
        if (_ownerOf(seatId) != address(0)) revert SeatTaken(seatId);
        _faceValue[seatId] = faceValue;
        unchecked {
            ++_sold;
        }
        _mint(to, seatId);
        emit TicketMinted(seatId, to, tierIndex, faceValue, comp);
    }

    // --------------------------------------------------------------------------------------- door keys

    /// @inheritdoc ITurnstileEvent
    /// @dev Holder-only (direct call or through the trusted forwarder). Re-binding rotates the key; every bind
    ///      bumps the token's bind nonce, which also voids any outstanding `BindDoorKey` authorisation.
    function bindDoorKey(uint256 tokenId, address doorKey) external {
        address holder = _requireOwned(tokenId);
        address caller = _msgSender();
        if (caller != holder) revert NotTicketHolder(tokenId, caller);
        _bind(tokenId, doorKey, caller);
    }

    /// @inheritdoc ITurnstileEvent
    /// @dev Anyone may submit; authority is the holder's EIP-712 `BindDoorKey` signature over
    ///      `(tokenId, doorKey, bindNonceOf(tokenId), deadline)`.
    function bindDoorKeyWithSig(uint256 tokenId, address doorKey, uint256 deadline, bytes calldata signature) external {
        _bindWithSig(tokenId, doorKey, deadline, signature);
    }

    function _bindWithSig(uint256 tokenId, address doorKey, uint256 deadline, bytes calldata signature) private {
        if (block.timestamp > deadline) revert SignatureExpired(deadline);
        address holder = _requireOwned(tokenId);
        bytes32 digest = _bindDigest(tokenId, doorKey, _bindNonce[tokenId], deadline);
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecoverCalldata(digest, signature);
        if (err != ECDSA.RecoverError.NoError || recovered != holder) revert BadBindSignature(tokenId, recovered);
        _bind(tokenId, doorKey, holder);
    }

    function _bind(uint256 tokenId, address doorKey, address by) private {
        if (doorKey == address(0)) revert ZeroDoorKey();
        if (_checkedInAt[tokenId] != 0) revert AlreadyCheckedIn(tokenId);
        address previous = _doorKey[tokenId];
        _doorKey[tokenId] = doorKey;
        unchecked {
            ++_bindNonce[tokenId];
        }
        emit DoorKeyBound(tokenId, doorKey, previous, by);
    }

    // -------------------------------------------------------------------------------------------- gate

    /// @inheritdoc ITurnstileEvent
    /// @dev Happy path: the door key was bound right after purchase; the gate scans one rotating code and
    ///      submits it. Verifies `Entry(eventId, tokenId, slot)` against the bound door key.
    function checkIn(uint256 tokenId, uint64 slot, bytes calldata signature) external onlyRole(GATE_ROLE) {
        address doorKey = _doorKey[tokenId];
        if (doorKey == address(0)) revert NoDoorKey(tokenId);
        _checkIn(tokenId, doorKey, slot, signature);
    }

    /// @inheritdoc ITurnstileEvent
    /// @dev Fallback for a ticket that reaches the door without a door key (or whose holder rotated passkeys):
    ///      the code carries the holder's `BindDoorKey` authorisation next to the `Entry` signature, and the
    ///      gate binds and checks in within one transaction.
    function checkInWithBind(
        uint256 tokenId,
        address doorKey,
        uint256 deadline,
        bytes calldata bindSignature,
        uint64 slot,
        bytes calldata entrySignature
    ) external onlyRole(GATE_ROLE) {
        _bindWithSig(tokenId, doorKey, deadline, bindSignature);
        _checkIn(tokenId, doorKey, slot, entrySignature);
    }

    function _checkIn(uint256 tokenId, address doorKey, uint64 slot, bytes calldata signature) private {
        address holder = _requireOwned(tokenId);
        if (_checkedInAt[tokenId] != 0) revert AlreadyCheckedIn(tokenId);
        uint64 current = currentSlot();
        if (!_slotAcceptable(slot, current)) revert SlotOutOfWindow(slot, current);

        bytes32 digest = _entryDigest(tokenId, slot);
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecoverCalldata(digest, signature);
        if (err != ECDSA.RecoverError.NoError || recovered != doorKey) revert BadEntrySignature(tokenId, recovered);

        // forge-lint: disable-next-line(unsafe-typecast)
        _checkedInAt[tokenId] = uint64(block.timestamp); // fits until year 2554
        unchecked {
            ++_checkedInCount;
        }
        if (_listings[tokenId].active) {
            delete _listings[tokenId];
            emit Delisted(tokenId);
        }
        emit CheckedIn(tokenId, holder, doorKey, _msgSender(), slot);
    }

    // ------------------------------------------------------------------------------------------ resale

    /// @inheritdoc ITurnstileEvent
    /// @dev The only door out of a wallet. Price ≤ face value × resaleCapBps; closes at `startsAt`.
    function list(uint256 tokenId, uint96 price) external {
        address holder = _requireOwned(tokenId);
        address caller = _msgSender();
        if (caller != holder) revert NotTicketHolder(tokenId, caller);
        if (_resaleCapBps == 0) revert ResaleDisabled();
        if (block.timestamp >= _startsAt) revert ResaleClosed();
        if (_checkedInAt[tokenId] != 0) revert AlreadyCheckedIn(tokenId);
        uint256 cap = resaleCapOf(tokenId);
        if (price > cap) revert PriceAboveCap(price, cap);
        _listings[tokenId] = Listing({active: true, price: price});
        emit Listed(tokenId, holder, price);
    }

    /// @inheritdoc ITurnstileEvent
    function delist(uint256 tokenId) external {
        address holder = _requireOwned(tokenId);
        address caller = _msgSender();
        if (caller != holder) revert NotTicketHolder(tokenId, caller);
        if (!_listings[tokenId].active) revert NotListed(tokenId);
        delete _listings[tokenId];
        emit Delisted(tokenId);
    }

    /// @inheritdoc ITurnstileEvent
    /// @dev Instant split: organiser fee and seller proceeds are paid in this transaction. The door key is
    ///      cleared — the ticket now answers to the buyer's passkey only once the buyer binds.
    function buyListing(uint256 tokenId) external payable nonReentrant {
        Listing memory listing = _listings[tokenId];
        if (!listing.active) revert NotListed(tokenId);
        if (block.timestamp >= _startsAt) revert ResaleClosed();
        if (msg.value != listing.price) revert WrongPrice(listing.price, msg.value);
        address seller = _requireOwned(tokenId);
        address buyer = _msgSender();
        if (buyer == seller) revert SelfPurchase();

        delete _listings[tokenId];
        address previousKey = _doorKey[tokenId];
        if (previousKey != address(0)) {
            delete _doorKey[tokenId];
            emit DoorKeyCleared(tokenId, previousKey);
        }

        _resaleTransfer = true;
        _update(buyer, tokenId, address(0));
        _resaleTransfer = false;

        // forge-lint: disable-next-line(unsafe-typecast)
        uint96 fee = uint96((uint256(listing.price) * _resaleFeeBps) / BPS); // ≤ price: resaleFeeBps ≤ BPS
        emit ListingFilled(tokenId, seller, buyer, listing.price, fee);
        if (fee != 0) _pay(_organiser, fee);
        if (listing.price - fee != 0) _pay(seller, listing.price - fee);
    }

    // --------------------------------------------------------------------------------------- organiser

    /// @inheritdoc ITurnstileEvent
    function setSalesEnd(uint64 salesEndAt_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (salesEndAt_ == 0 || salesEndAt_ > _startsAt) revert InvalidConfig();
        _salesEndAt = salesEndAt_;
        emit SalesEndUpdated(salesEndAt_);
    }

    /// @inheritdoc ITurnstileEvent
    function setBaseURI(string calldata baseURI_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _baseTokenURI = baseURI_;
        emit BaseURIUpdated(baseURI_);
    }

    // ------------------------------------------------------------------------------------------- views

    function eventId() external view returns (uint256) {
        return _eventId;
    }

    function organiser() external view returns (address) {
        return _organiser;
    }

    function venue() external view returns (bytes32) {
        return _venue;
    }

    function startsAt() external view returns (uint64) {
        return _startsAt;
    }

    function salesEndAt() external view returns (uint64) {
        return _salesEndAt;
    }

    function resaleCapBps() external view returns (uint16) {
        return _resaleCapBps;
    }

    function resaleFeeBps() external view returns (uint16) {
        return _resaleFeeBps;
    }

    function tierCount() external view returns (uint256) {
        return _tiers.length;
    }

    function tierAt(uint256 index) external view returns (Tier memory) {
        return _tiers[index];
    }

    /// @inheritdoc ITurnstileEvent
    function tierOf(uint256 seatId) public view returns (uint8 index, Tier memory tier) {
        uint256 n = _tiers.length;
        for (uint256 i = 0; i < n; ++i) {
            Tier storage t = _tiers[i];
            uint256 start = t.firstSeat;
            // forge-lint: disable-next-line(unsafe-typecast)
            if (seatId >= start && seatId < start + t.seatCount) return (uint8(i), t); // i < MAX_TIERS
        }
        revert UnknownSeat(seatId);
    }

    function capacity() external view returns (uint256) {
        return _capacity;
    }

    function sold() external view returns (uint256) {
        return _sold;
    }

    function checkedInCount() external view returns (uint256) {
        return _checkedInCount;
    }

    function faceValueOf(uint256 tokenId) external view returns (uint96) {
        return _faceValue[tokenId];
    }

    function doorKeyOf(uint256 tokenId) external view returns (address) {
        return _doorKey[tokenId];
    }

    function bindNonceOf(uint256 tokenId) external view returns (uint256) {
        return _bindNonce[tokenId];
    }

    function checkedInAt(uint256 tokenId) external view returns (uint64) {
        return _checkedInAt[tokenId];
    }

    function listingOf(uint256 tokenId) external view returns (Listing memory) {
        return _listings[tokenId];
    }

    /// @inheritdoc ITurnstileEvent
    function seatStates(uint256 firstSeat, uint256 count) external view returns (SeatState[] memory states) {
        states = new SeatState[](count);
        for (uint256 i = 0; i < count; ++i) {
            uint256 id = firstSeat + i;
            Listing storage listing = _listings[id];
            states[i] = SeatState({
                holder: _ownerOf(id),
                doorKey: _doorKey[id],
                checkedInAt: _checkedInAt[id],
                listingPrice: listing.active ? listing.price : 0,
                listed: listing.active
            });
        }
    }

    /// @inheritdoc ITurnstileEvent
    function resaleCapOf(uint256 tokenId) public view returns (uint256) {
        return (uint256(_faceValue[tokenId]) * _resaleCapBps) / BPS;
    }

    /// @inheritdoc ITurnstileEvent
    function currentSlot() public view returns (uint64) {
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint64(block.timestamp / SLOT_SECONDS);
    }

    /// @inheritdoc ITurnstileEvent
    function isSlotAcceptable(uint64 slot) external view returns (bool) {
        return _slotAcceptable(slot, currentSlot());
    }

    function _slotAcceptable(uint64 slot, uint64 current) private pure returns (bool) {
        return slot + SLOT_TOLERANCE >= current && slot <= current + SLOT_TOLERANCE;
    }

    /// @inheritdoc ITurnstileEvent
    function entryDigest(uint256 tokenId, uint64 slot) external view returns (bytes32) {
        return _entryDigest(tokenId, slot);
    }

    function _entryDigest(uint256 tokenId, uint64 slot) private view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(ENTRY_TYPEHASH, _eventId, tokenId, slot)));
    }

    /// @inheritdoc ITurnstileEvent
    function bindDigest(uint256 tokenId, address doorKey, uint256 nonce, uint256 deadline)
        external
        view
        returns (bytes32)
    {
        return _bindDigest(tokenId, doorKey, nonce, deadline);
    }

    function _bindDigest(uint256 tokenId, address doorKey, uint256 nonce, uint256 deadline)
        private
        view
        returns (bytes32)
    {
        return _hashTypedDataV4(keccak256(abi.encode(BIND_TYPEHASH, tokenId, doorKey, nonce, deadline)));
    }

    // ------------------------------------------------------------------------------- ERC-721 overrides

    /// @dev Tickets are locked: the only owner-to-owner move is the resale path (`buyListing`).
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        if (_ownerOf(tokenId) != address(0) && !_resaleTransfer) revert TransferLocked(tokenId);
        return super._update(to, tokenId, auth);
    }

    /// @dev Approvals are meaningless for a locked token; refusing them keeps marketplaces from listing what
    ///      they cannot deliver.
    function approve(address, uint256) public pure override {
        revert ApprovalsDisabled();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert ApprovalsDisabled();
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721Upgradeable, AccessControlUpgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    // ------------------------------------------------------------------------------ ERC-2771 plumbing

    function _msgSender() internal view override(ContextUpgradeable, ERC2771ContextUpgradeable) returns (address) {
        return ERC2771ContextUpgradeable._msgSender();
    }

    function _msgData() internal view override(ContextUpgradeable, ERC2771ContextUpgradeable) returns (bytes calldata) {
        return ERC2771ContextUpgradeable._msgData();
    }

    function _contextSuffixLength()
        internal
        view
        override(ContextUpgradeable, ERC2771ContextUpgradeable)
        returns (uint256)
    {
        return ERC2771ContextUpgradeable._contextSuffixLength();
    }

    // ---------------------------------------------------------------------------------------- payments

    /// @dev Push payment to the organiser or a seller — the "instant split". Both destinations are fixed by the
    ///      protocol rules (organiser at creation, seller = current holder); a failing recipient only blocks
    ///      its own sale.
    function _pay(address to, uint256 amount) private {
        // forge-lint: disable-next-line(arbitrary-send-eth,low-level-calls)
        (bool ok,) = payable(to).call{value: amount}("");
        if (!ok) revert PayoutFailed(to);
    }
}
