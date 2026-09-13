// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {ITurnstileEvent} from "./ITurnstileEvent.sol";
import {TurnstileEvent} from "./TurnstileEvent.sol";

/// @title TurnstileFactory — deploys and registers `TurnstileEvent` clones.
/// @notice Permissionless: whoever calls `createEvent` is the organiser (admin + payout address) of that
///         event. Clones are deterministic per event id, so an address can be shown before the transaction
///         lands. Only events in this registry are indexed and rendered.
contract TurnstileFactory {
    using Clones for address;

    address public immutable implementation;
    address public immutable trustedForwarder;

    uint256 public eventCount;
    mapping(uint256 eventId => address eventAddress) public eventAt;
    mapping(address eventAddress => uint256 eventId) public eventIdOf;

    event EventCreated(
        uint256 indexed eventId,
        address indexed eventAddress,
        address indexed organiser,
        string name,
        bytes32 venue,
        uint64 startsAt
    );

    error ZeroAddress();

    constructor(address implementation_) {
        if (implementation_ == address(0)) revert ZeroAddress();
        implementation = implementation_;
        trustedForwarder = TurnstileEvent(implementation_).trustedForwarder();
    }

    /// @notice Create an event. `msg.sender` becomes its organiser.
    /// @param config collection, timing and resale rules (see `ITurnstileEvent.EventConfig`).
    /// @param tiers contiguous, non-overlapping seat ranges with a face value each.
    /// @param gates addresses that may call `checkIn` from day one (more can be granted later).
    function createEvent(
        ITurnstileEvent.EventConfig calldata config,
        ITurnstileEvent.Tier[] calldata tiers,
        address[] calldata gates
    ) external returns (uint256 eventId, address eventAddress) {
        eventId = ++eventCount;
        eventAddress = implementation.cloneDeterministic(bytes32(eventId));
        ITurnstileEvent(eventAddress).initialize(eventId, msg.sender, config, tiers, gates);
        eventAt[eventId] = eventAddress;
        eventIdOf[eventAddress] = eventId;
        emit EventCreated(eventId, eventAddress, msg.sender, config.name, config.venue, config.startsAt);
    }

    /// @notice Address the clone for `eventId` has or will have.
    function predictEventAddress(uint256 eventId) public view returns (address) {
        return implementation.predictDeterministicAddress(bytes32(eventId), address(this));
    }

    function isTurnstileEvent(address eventAddress) external view returns (bool) {
        return eventIdOf[eventAddress] != 0;
    }
}
