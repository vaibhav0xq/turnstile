// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {ITurnstileEvent} from "../src/ITurnstileEvent.sol";
import {TurnstileFactory} from "../src/TurnstileFactory.sol";

/// @notice Creates the two demo events used by the apps and the video: a club night (free GA + paid booths)
///         and a theatre show (three priced tiers). Reads the factory from `deployments/<chainId>.json`.
///
///   GATE_ADDRESS=0x… START_IN=3888000 BASE_URI=https://… \
///   forge script script/CreateDemoEvent.s.sol --rpc-url monad_testnet --account deployer --broadcast --slow
///
///   START_IN is seconds until doors (default 2 hours). Sales close at `startsAt` (club) / 30 min before
///   (theatre), so seed with weeks, not hours, when the events must outlive a development session.
///
///   The broadcaster becomes the organiser (admin + payout address) of both events.
contract CreateDemoEvent is Script {
    using stdJson for string;

    function run() external returns (address club, address theatre) {
        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        // forge-lint: disable-next-line(unsafe-cheatcode)
        TurnstileFactory factory = TurnstileFactory(vm.readFile(path).readAddress(".factory"));

        address gate = vm.envOr("GATE_ADDRESS", address(0));
        // forge-lint: disable-next-line(unsafe-typecast)
        uint64 startsAt = uint64(block.timestamp + vm.envOr("START_IN", uint256(2 hours)));
        string memory baseURI = vm.envOr("BASE_URI", string("https://turnstile.example/api/events/"));

        address[] memory gates = new address[](gate == address(0) ? 0 : 1);
        if (gate != address(0)) gates[0] = gate;

        vm.startBroadcast();
        club = _createClub(factory, startsAt, baseURI, gates);
        theatre = _createTheatre(factory, startsAt + 1 days, baseURI, gates);
        vm.stopBroadcast();

        console.log("club    ", club);
        console.log("theatre ", theatre);
    }

    function _createClub(TurnstileFactory factory, uint64 startsAt, string memory baseURI, address[] memory gates)
        internal
        returns (address eventAddress)
    {
        ITurnstileEvent.Tier[] memory tiers = new ITurnstileEvent.Tier[](2);
        tiers[0] = ITurnstileEvent.Tier({name: "General Admission", price: 0, firstSeat: 1, seatCount: 300});
        tiers[1] = ITurnstileEvent.Tier({name: "Booth", price: 0.05 ether, firstSeat: 1001, seatCount: 12});
        uint256 eventId = factory.eventCount() + 1;
        uint256 createdId;
        (createdId, eventAddress) = factory.createEvent(
            ITurnstileEvent.EventConfig({
                name: "Neon Night at Metropolis",
                symbol: "NEON",
                venue: keccak256("venue:metropolis-club:v1"),
                startsAt: startsAt,
                salesEndAt: 0,
                resaleCapBps: 11_000, // 110 % of face
                resaleFeeBps: 500, // 5 % to the organiser on every resale
                baseURI: string.concat(baseURI, vm.toString(eventId), "/tickets/")
            }),
            tiers,
            gates
        );
        require(createdId == eventId, "event id drift: baseURI would point at the wrong event");
    }

    function _createTheatre(TurnstileFactory factory, uint64 startsAt, string memory baseURI, address[] memory gates)
        internal
        returns (address eventAddress)
    {
        ITurnstileEvent.Tier[] memory tiers = new ITurnstileEvent.Tier[](3);
        tiers[0] = ITurnstileEvent.Tier({name: "Stalls", price: 0.02 ether, firstSeat: 1, seatCount: 120});
        tiers[1] = ITurnstileEvent.Tier({name: "Circle", price: 0.012 ether, firstSeat: 201, seatCount: 80});
        tiers[2] = ITurnstileEvent.Tier({name: "Balcony", price: 0.006 ether, firstSeat: 401, seatCount: 60});
        uint256 eventId = factory.eventCount() + 1;
        uint256 createdId;
        (createdId, eventAddress) = factory.createEvent(
            ITurnstileEvent.EventConfig({
                name: "The Metropolis Players: Act III",
                symbol: "ACT3",
                venue: keccak256("venue:metropolis-theatre:v1"),
                startsAt: startsAt,
                salesEndAt: startsAt - 30 minutes,
                resaleCapBps: 10_000, // face value only
                resaleFeeBps: 1000, // 10 %
                baseURI: string.concat(baseURI, vm.toString(eventId), "/tickets/")
            }),
            tiers,
            gates
        );
        require(createdId == eventId, "event id drift: baseURI would point at the wrong event");
    }
}
