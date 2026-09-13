// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ERC2771Forwarder} from "@openzeppelin/contracts/metatx/ERC2771Forwarder.sol";
import {ITurnstileEvent} from "../src/ITurnstileEvent.sol";
import {TurnstileEvent} from "../src/TurnstileEvent.sol";
import {TurnstileFactory} from "../src/TurnstileFactory.sol";

/// @dev Shared fixture: forwarder → implementation → factory → one event with a free GA tier (seats 1–100)
///      and a paid Booth tier (seats 101–110, 0.01 MON). Time starts one week before doors.
abstract contract TurnstileTestBase is Test {
    ERC2771Forwarder internal forwarder;
    TurnstileEvent internal implementation;
    TurnstileFactory internal factory;
    TurnstileEvent internal ev;
    uint256 internal eventId;
    bytes32 internal gateRole;

    address internal organiser = makeAddr("organiser");
    address internal gate = makeAddr("gate");
    address internal relayer = makeAddr("relayer");
    address internal stranger = makeAddr("stranger");

    uint256 internal constant ALICE_PK = 0xA11CE;
    uint256 internal constant BOB_PK = 0xB0B;
    uint256 internal constant DOOR_PK = 0xD001;
    uint256 internal constant DOOR2_PK = 0xD002;
    address internal alice = vm.addr(ALICE_PK);
    address internal bob = vm.addr(BOB_PK);
    address internal door = vm.addr(DOOR_PK);
    address internal door2 = vm.addr(DOOR2_PK);

    uint64 internal constant START = 1_800_000_000; // doors open
    uint64 internal constant SALES_END = START - 1 hours;
    uint16 internal constant CAP_BPS = 11_000; // 110 %
    uint16 internal constant FEE_BPS = 500; // 5 %
    uint32 internal constant GA_FIRST = 1;
    uint32 internal constant GA_COUNT = 100;
    uint32 internal constant BOOTH_FIRST = 101;
    uint32 internal constant BOOTH_COUNT = 10;
    uint96 internal constant BOOTH_PRICE = 0.01 ether;
    bytes32 internal constant VENUE = keccak256("club-v1");

    bytes32 internal constant FORWARD_REQUEST_TYPEHASH = keccak256(
        "ForwardRequest(address from,address to,uint256 value,uint256 gas,uint256 nonce,uint48 deadline,bytes data)"
    );

    function setUp() public virtual {
        vm.warp(START - 7 days);
        forwarder = new ERC2771Forwarder("Turnstile Forwarder");
        implementation = new TurnstileEvent(address(forwarder));
        factory = new TurnstileFactory(address(implementation));

        vm.prank(organiser);
        (uint256 id, address addr) = factory.createEvent(defaultConfig(), defaultTiers(), defaultGates());
        eventId = id;
        ev = TurnstileEvent(addr);
        gateRole = ev.GATE_ROLE();

        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
        vm.deal(stranger, 10 ether);
        vm.deal(relayer, 10 ether);
    }

    // ------------------------------------------------------------------------------------- fixtures

    function defaultConfig() internal pure returns (ITurnstileEvent.EventConfig memory cfg) {
        cfg = ITurnstileEvent.EventConfig({
            name: "Turnstile: Neon Night",
            symbol: "TSNN",
            venue: VENUE,
            startsAt: START,
            salesEndAt: SALES_END,
            resaleCapBps: CAP_BPS,
            resaleFeeBps: FEE_BPS,
            baseURI: "https://turnstile.example/api/events/1/tickets/"
        });
    }

    function defaultTiers() internal pure returns (ITurnstileEvent.Tier[] memory tiers) {
        tiers = new ITurnstileEvent.Tier[](2);
        tiers[0] = ITurnstileEvent.Tier({name: "GA", price: 0, firstSeat: GA_FIRST, seatCount: GA_COUNT});
        tiers[1] =
            ITurnstileEvent.Tier({name: "Booth", price: BOOTH_PRICE, firstSeat: BOOTH_FIRST, seatCount: BOOTH_COUNT});
    }

    function defaultGates() internal view returns (address[] memory gates) {
        gates = new address[](1);
        gates[0] = gate;
    }

    // -------------------------------------------------------------------------------------- helpers

    function buyFree(address who, uint256 seat) internal {
        vm.prank(who);
        ev.buy(seat);
    }

    function buyBooth(address who, uint256 seat) internal {
        vm.prank(who);
        ev.buy{value: BOOTH_PRICE}(seat);
    }

    function bind(address who, uint256 tokenId, address doorKey) internal {
        vm.prank(who);
        ev.bindDoorKey(tokenId, doorKey);
    }

    function signDigest(uint256 pk, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function signEntry(uint256 doorPk, uint256 tokenId, uint64 slot) internal view returns (bytes memory) {
        return signDigest(doorPk, ev.entryDigest(tokenId, slot));
    }

    function signBind(uint256 holderPk, uint256 tokenId, address doorKey, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        return signDigest(holderPk, ev.bindDigest(tokenId, doorKey, ev.bindNonceOf(tokenId), deadline));
    }

    function slotNow() internal view returns (uint64) {
        return uint64(block.timestamp / 30);
    }

    /// @dev Sign and relay an ERC-2771 request from `from` (signing with `fromPk`) to the event.
    function relay(uint256 fromPk, address from, bytes memory data, uint256 value) internal {
        ERC2771Forwarder.ForwardRequestData memory req = ERC2771Forwarder.ForwardRequestData({
            from: from,
            to: address(ev),
            value: value,
            gas: 400_000,
            deadline: uint48(block.timestamp + 1 hours),
            data: data,
            signature: ""
        });
        bytes32 structHash = keccak256(
            abi.encode(
                FORWARD_REQUEST_TYPEHASH,
                req.from,
                req.to,
                req.value,
                req.gas,
                forwarder.nonces(from),
                req.deadline,
                keccak256(req.data)
            )
        );
        bytes32 digest = keccak256(abi.encodePacked(hex"1901", forwarderDomainSeparator(), structHash));
        req.signature = signDigest(fromPk, digest);
        vm.prank(relayer);
        forwarder.execute{value: value}(req);
    }

    function forwarderDomainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Turnstile Forwarder"),
                keccak256("1"),
                block.chainid,
                address(forwarder)
            )
        );
    }
}
