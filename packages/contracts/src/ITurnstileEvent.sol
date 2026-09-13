// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title ITurnstileEvent — one event, one ERC-721 collection, one seat per token.
/// @notice Shared surface for the app, the relayer and the Envio indexer. Everything the 3D scene renders
///         is derivable from these events; nothing here requires reading storage.
interface ITurnstileEvent {
    // ------------------------------------------------------------------------------------------ types

    /// @dev Immutable after `initialize`, except `salesEndAt` and `baseURI` (organiser-settable).
    struct EventConfig {
        /// ERC-721 collection name, e.g. "Turnstile: Neon Night".
        string name;
        /// ERC-721 symbol.
        string symbol;
        /// Venue template id for the seat picker, e.g. keccak256("club-v1"). Informational.
        bytes32 venue;
        /// Doors open (unix seconds). Resale closes here; check-in is not time-boxed on-chain.
        uint64 startsAt;
        /// Primary sale closes (unix seconds). 0 → `startsAt`.
        uint64 salesEndAt;
        /// Resale ceiling as basis points of face value (11_000 = 110 %). 0 disables resale entirely.
        uint16 resaleCapBps;
        /// Organiser's cut of every resale, basis points of the sale price. ≤ 10_000.
        uint16 resaleFeeBps;
        /// `tokenURI` prefix; the token id is appended in decimal. May be empty.
        string baseURI;
    }

    /// @dev Seats are contiguous per tier: token ids `[firstSeat, firstSeat + seatCount)`. Tiers must not overlap.
    struct Tier {
        /// Display name, e.g. "GA", "Balcony". Informational.
        string name;
        /// Face value in wei of the native token (MON). 0 = free.
        uint96 price;
        /// First seat id of the tier.
        uint32 firstSeat;
        /// Number of seats in the tier (> 0).
        uint32 seatCount;
    }

    struct Listing {
        bool active;
        uint96 price;
    }

    /// @dev One seat as the seat picker and the gate read it — a batch view until the indexer exists.
    ///      `holder == address(0)` means unsold; `listingPrice` is 0 unless `listed`.
    struct SeatState {
        address holder;
        address doorKey;
        uint64 checkedInAt;
        uint96 listingPrice;
        bool listed;
    }

    // ----------------------------------------------------------------------------------------- events

    event TicketMinted(uint256 indexed tokenId, address indexed to, uint8 indexed tier, uint96 faceValue, bool comp);
    /// @param by who authorised the bind: the holder (direct or via forwarder), or the holder's signature
    ///           carried by a third party (`bindDoorKeyWithSig` / `checkInWithBind`).
    event DoorKeyBound(uint256 indexed tokenId, address indexed doorKey, address previous, address by);
    /// @dev Emitted when a resale clears the binding: the new holder must bind their own door key.
    event DoorKeyCleared(uint256 indexed tokenId, address previous);
    event CheckedIn(
        uint256 indexed tokenId, address indexed holder, address indexed doorKey, address gate, uint64 slot
    );
    event Listed(uint256 indexed tokenId, address indexed seller, uint96 price);
    event Delisted(uint256 indexed tokenId);
    event ListingFilled(
        uint256 indexed tokenId, address indexed seller, address indexed buyer, uint96 price, uint96 fee
    );
    event SalesEndUpdated(uint64 salesEndAt);
    event BaseURIUpdated(string baseURI);

    // ----------------------------------------------------------------------------------------- errors

    error InvalidConfig();
    error InvalidTiers();
    error UnknownSeat(uint256 seatId);
    error SeatTaken(uint256 seatId);
    error SalesClosed();
    error WrongPrice(uint256 expected, uint256 actual);
    error NotTicketHolder(uint256 tokenId, address caller);
    error TransferLocked(uint256 tokenId);
    error ApprovalsDisabled();
    error ZeroDoorKey();
    error NoDoorKey(uint256 tokenId);
    error AlreadyCheckedIn(uint256 tokenId);
    error SlotOutOfWindow(uint64 slot, uint64 current);
    error BadEntrySignature(uint256 tokenId, address recovered);
    error BadBindSignature(uint256 tokenId, address recovered);
    error SignatureExpired(uint256 deadline);
    error ResaleDisabled();
    error ResaleClosed();
    error PriceAboveCap(uint256 price, uint256 cap);
    error NotListed(uint256 tokenId);
    error SelfPurchase();
    error PayoutFailed(address to);

    // -------------------------------------------------------------------------------------- functions

    /// @dev Called once by the factory in the same transaction as the clone. `gates` receive `GATE_ROLE`.
    function initialize(
        uint256 eventId_,
        address organiser,
        EventConfig calldata config_,
        Tier[] calldata tiers_,
        address[] calldata gates
    ) external;

    // primary sale
    function buy(uint256 seatId) external payable;
    function mintTo(uint256 seatId, address to) external;

    // door keys
    function bindDoorKey(uint256 tokenId, address doorKey) external;
    function bindDoorKeyWithSig(uint256 tokenId, address doorKey, uint256 deadline, bytes calldata signature) external;

    // gate
    function checkIn(uint256 tokenId, uint64 slot, bytes calldata signature) external;
    function checkInWithBind(
        uint256 tokenId,
        address doorKey,
        uint256 deadline,
        bytes calldata bindSignature,
        uint64 slot,
        bytes calldata entrySignature
    ) external;

    // resale
    function list(uint256 tokenId, uint96 price) external;
    function delist(uint256 tokenId) external;
    function buyListing(uint256 tokenId) external payable;

    // organiser
    function setSalesEnd(uint64 salesEndAt) external;
    function setBaseURI(string calldata baseURI) external;

    // views
    function eventId() external view returns (uint256);
    function organiser() external view returns (address);
    function venue() external view returns (bytes32);
    function startsAt() external view returns (uint64);
    function salesEndAt() external view returns (uint64);
    function resaleCapBps() external view returns (uint16);
    function resaleFeeBps() external view returns (uint16);
    function tierCount() external view returns (uint256);
    function tierAt(uint256 index) external view returns (Tier memory);
    function tierOf(uint256 seatId) external view returns (uint8 index, Tier memory tier);
    function capacity() external view returns (uint256);
    function sold() external view returns (uint256);
    function checkedInCount() external view returns (uint256);
    function faceValueOf(uint256 tokenId) external view returns (uint96);
    function doorKeyOf(uint256 tokenId) external view returns (address);
    function bindNonceOf(uint256 tokenId) external view returns (uint256);
    function checkedInAt(uint256 tokenId) external view returns (uint64);
    function listingOf(uint256 tokenId) external view returns (Listing memory);
    /// @notice Snapshot of `count` seats starting at `firstSeat` (ids outside every tier read as unsold).
    function seatStates(uint256 firstSeat, uint256 count) external view returns (SeatState[] memory states);
    function resaleCapOf(uint256 tokenId) external view returns (uint256);
    function currentSlot() external view returns (uint64);
    function isSlotAcceptable(uint64 slot) external view returns (bool);
    function entryDigest(uint256 tokenId, uint64 slot) external view returns (bytes32);
    function bindDigest(uint256 tokenId, address doorKey, uint256 nonce, uint256 deadline)
        external
        view
        returns (bytes32);
}
