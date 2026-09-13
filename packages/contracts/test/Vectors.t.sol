// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ERC2771Forwarder} from "@openzeppelin/contracts/metatx/ERC2771Forwarder.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ITurnstileEvent} from "../src/ITurnstileEvent.sol";
import {TurnstileEvent} from "../src/TurnstileEvent.sol";

/// @dev Cross-package conformance: the EIP-712 vectors frozen by packages/identity/SPEC.md must verify on-chain.
///      `entry.json`  — door key signs Entry(eventId 1, tokenId 42, slot 59640000) for the event at 0x…E0E1 on 10143.
///      `bind.json`   — the holder's account key authorises that door key for token 42 (gate fallback).
///      The clone is etched at the vector address so `domainSeparator` (which hashes address(this)) matches.
contract VectorsTest is Test {
    address internal constant VECTOR_EVENT = 0x000000000000000000000000000000000000E0E1;
    uint256 internal constant VECTOR_CHAIN = 10_143;
    uint256 internal constant VECTOR_EVENT_ID = 1;
    uint256 internal constant VECTOR_TOKEN = 42;

    string internal entryJson;
    string internal bindJson;
    TurnstileEvent internal ev;
    address internal organiser = makeAddr("organiser");
    address internal gate = makeAddr("gate");

    // entry vector
    uint64 internal slot;
    address internal doorKey;
    uint256 internal doorKeyPk;
    bytes internal entrySig;
    // bind vector
    address internal holder;
    uint256 internal holderPk;
    uint256 internal bindDeadline;
    bytes internal bindSig;

    function setUp() public {
        entryJson = vm.readFile("../identity/vectors/entry.json");
        bindJson = vm.readFile("../identity/vectors/bind.json");

        assertEq(vm.parseJsonUint(entryJson, ".domain.chainId"), VECTOR_CHAIN, "vector chain");
        assertEq(vm.parseJsonAddress(entryJson, ".domain.verifyingContract"), VECTOR_EVENT, "vector address");
        assertEq(vm.parseJsonUint(entryJson, ".message.eventId"), VECTOR_EVENT_ID, "vector event id");
        assertEq(vm.parseJsonUint(entryJson, ".message.tokenId"), VECTOR_TOKEN, "vector token id");
        slot = uint64(vm.parseJsonUint(entryJson, ".message.slot"));
        doorKey = vm.parseJsonAddress(entryJson, ".signer");
        doorKeyPk = uint256(vm.parseJsonBytes32(entryJson, ".doorKeyPrivateKey"));
        entrySig = vm.parseJsonBytes(entryJson, ".signature");

        assertEq(vm.parseJsonUint(bindJson, ".message.tokenId"), VECTOR_TOKEN, "bind token id");
        assertEq(vm.parseJsonAddress(bindJson, ".message.doorKey"), doorKey, "bind door key");
        assertEq(vm.parseJsonUint(bindJson, ".message.nonce"), 0, "bind nonce");
        bindDeadline = vm.parseJsonUint(bindJson, ".message.deadline");
        holder = vm.parseJsonAddress(bindJson, ".signer");
        holderPk = uint256(vm.parseJsonBytes32(bindJson, ".signerPrivateKey"));
        bindSig = vm.parseJsonBytes(bindJson, ".signature");
        assertEq(vm.addr(holderPk), holder, "kdf account key");
        assertEq(vm.addr(doorKeyPk), doorKey, "kdf door key");

        // Stand the event up exactly where the vectors expect it.
        vm.chainId(VECTOR_CHAIN);
        ERC2771Forwarder forwarder = new ERC2771Forwarder("Turnstile Forwarder");
        TurnstileEvent implementation = new TurnstileEvent(address(forwarder));
        address clone = Clones.clone(address(implementation));
        vm.etch(VECTOR_EVENT, clone.code);
        ev = TurnstileEvent(VECTOR_EVENT);

        ITurnstileEvent.Tier[] memory tiers = new ITurnstileEvent.Tier[](1);
        tiers[0] = ITurnstileEvent.Tier({name: "GA", price: 0, firstSeat: 1, seatCount: 100});
        address[] memory gates = new address[](1);
        gates[0] = gate;
        uint64 startsAt = uint64(slot) * 30 - 1 hours; // doors opened an hour before the vector's slot
        ev.initialize(
            VECTOR_EVENT_ID,
            organiser,
            ITurnstileEvent.EventConfig({
                name: "Vector Event",
                symbol: "VEC",
                venue: bytes32(0),
                startsAt: startsAt,
                salesEndAt: 0,
                resaleCapBps: 0,
                resaleFeeBps: 0,
                baseURI: ""
            }),
            tiers,
            gates
        );
        vm.warp(startsAt - 1 days);
        vm.prank(holder);
        ev.buy(VECTOR_TOKEN);
    }

    function test_constantsMatchVectors() public view {
        assertEq(ev.ENTRY_TYPEHASH(), vm.parseJsonBytes32(entryJson, ".typeHash"), "ENTRY_TYPEHASH");
        assertEq(ev.ENTRY_TYPEHASH(), keccak256(bytes(vm.parseJsonString(entryJson, ".typeString"))));
        assertEq(ev.BIND_TYPEHASH(), vm.parseJsonBytes32(bindJson, ".typeHash"), "BIND_TYPEHASH");
        assertEq(ev.BIND_TYPEHASH(), keccak256(bytes(vm.parseJsonString(bindJson, ".typeString"))));
        assertEq(ev.SLOT_SECONDS(), 30);
    }

    function test_entryDigestMatchesVector() public view {
        bytes32 domainSeparator = vm.parseJsonBytes32(entryJson, ".domainSeparator");
        bytes32 structHash = vm.parseJsonBytes32(entryJson, ".structHash");
        bytes32 digest = vm.parseJsonBytes32(entryJson, ".digest");

        (,,,,, bytes32 salt,) = ev.eip712Domain();
        assertEq(salt, bytes32(0));
        assertEq(
            keccak256(abi.encode(ev.ENTRY_TYPEHASH(), VECTOR_EVENT_ID, VECTOR_TOKEN, slot)), structHash, "structHash"
        );
        assertEq(keccak256(abi.encodePacked(hex"1901", domainSeparator, structHash)), digest, "digest by hand");
        assertEq(ev.entryDigest(VECTOR_TOKEN, slot), digest, "entryDigest()");
        assertEq(ECDSA.recover(digest, entrySig), doorKey, "recover");

        // RFC 6979 determinism: Foundry's signer reproduces the exact bytes the TypeScript side produced.
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(doorKeyPk, digest);
        assertEq(abi.encodePacked(r, s, v), entrySig, "vm.sign reproduces the vector");
    }

    function test_bindDigestMatchesVector() public view {
        bytes32 digest = vm.parseJsonBytes32(bindJson, ".digest");
        assertEq(vm.parseJsonBytes32(bindJson, ".domainSeparator"), vm.parseJsonBytes32(entryJson, ".domainSeparator"));
        assertEq(
            keccak256(abi.encode(ev.BIND_TYPEHASH(), VECTOR_TOKEN, doorKey, uint256(0), bindDeadline)),
            vm.parseJsonBytes32(bindJson, ".structHash"),
            "structHash"
        );
        assertEq(ev.bindDigest(VECTOR_TOKEN, doorKey, 0, bindDeadline), digest, "bindDigest()");
        assertEq(ECDSA.recover(digest, bindSig), holder, "recover");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(holderPk, digest);
        assertEq(abi.encodePacked(r, s, v), bindSig, "vm.sign reproduces the vector");
    }

    function test_vectorEntryCode_checksInAfterRelayedBind() public {
        vm.prank(holder);
        ev.bindDoorKey(VECTOR_TOKEN, doorKey);
        vm.warp(uint256(slot) * 30 + 7); // inside the vector's slot
        vm.prank(gate);
        ev.checkIn(VECTOR_TOKEN, slot, entrySig);
        assertEq(ev.checkedInAt(VECTOR_TOKEN), block.timestamp);
    }

    function test_vectorEntryCode_checksInWithLazyBind() public {
        assertEq(ev.doorKeyOf(VECTOR_TOKEN), address(0));
        vm.warp(uint256(slot) * 30 + 7);
        assertLe(block.timestamp, bindDeadline);
        vm.prank(gate);
        ev.checkInWithBind(VECTOR_TOKEN, doorKey, bindDeadline, bindSig, slot, entrySig);
        assertEq(ev.doorKeyOf(VECTOR_TOKEN), doorKey);
        assertEq(ev.bindNonceOf(VECTOR_TOKEN), 1);
        assertEq(ev.checkedInCount(), 1);
    }

    function test_vectorEntryCode_isSlotBound() public {
        vm.prank(holder);
        ev.bindDoorKey(VECTOR_TOKEN, doorKey);
        vm.warp((uint256(slot) + 2) * 30); // two slots later → stale
        vm.prank(gate);
        vm.expectRevert(abi.encodeWithSelector(ITurnstileEvent.SlotOutOfWindow.selector, slot, slot + 2));
        ev.checkIn(VECTOR_TOKEN, slot, entrySig);
    }

    function test_vectorEntryCode_isChainBound() public {
        vm.prank(holder);
        ev.bindDoorKey(VECTOR_TOKEN, doorKey);
        vm.chainId(143); // same contract address on mainnet → different domain → different signer
        vm.warp(uint256(slot) * 30 + 7);
        vm.prank(gate);
        vm.expectRevert(); // BadEntrySignature(42, <some other address>)
        ev.checkIn(VECTOR_TOKEN, slot, entrySig);
    }
}
