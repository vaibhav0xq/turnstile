// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC2771Forwarder} from "@openzeppelin/contracts/metatx/ERC2771Forwarder.sol";
import {Errors} from "@openzeppelin/contracts/utils/Errors.sol";
import {ITurnstileEvent} from "../src/ITurnstileEvent.sol";
import {TurnstileEvent} from "../src/TurnstileEvent.sol";
import {TurnstileTestBase} from "./Base.t.sol";

/// @dev The gasless path: the holder signs an ERC-2771 request with their account key, the relayer pays.
///      The event must see the *holder* as `_msgSender()`, not the forwarder.
contract ForwarderTest is TurnstileTestBase {
    function test_relayed_buy_freeSeat_costsHolderNothing() public {
        address holder = vm.addr(ALICE_PK);
        assertEq(holder.balance, 10 ether);
        relay(ALICE_PK, holder, abi.encodeCall(TurnstileEvent.buy, (7)), 0);
        assertEq(ev.ownerOf(7), holder);
        assertEq(holder.balance, 10 ether); // relayer paid the gas
    }

    function test_relayed_buy_paidSeat_valueForwarded() public {
        uint256 before = organiser.balance;
        relay(BOB_PK, bob, abi.encodeCall(TurnstileEvent.buy, (105)), BOOTH_PRICE);
        assertEq(ev.ownerOf(105), bob);
        assertEq(organiser.balance - before, BOOTH_PRICE); // relayer fronted the value in this test
    }

    function test_relayed_bindDoorKey_happyPathBeforeTheGate() public {
        buyFree(alice, 7);
        vm.expectEmit(address(ev));
        emit ITurnstileEvent.DoorKeyBound(7, door, address(0), alice);
        relay(ALICE_PK, alice, abi.encodeCall(TurnstileEvent.bindDoorKey, (7, door)), 0);
        assertEq(ev.doorKeyOf(7), door);

        // ...and at the door: one presence prompt, one signature, one gate tx.
        vm.warp(START + 1 minutes);
        uint64 slot = slotNow();
        bytes memory entry = signEntry(DOOR_PK, 7, slot);
        vm.prank(gate);
        ev.checkIn(7, slot, entry);
        assertEq(ev.checkedInCount(), 1);
    }

    function test_relayed_list_and_delist() public {
        buyBooth(alice, 105);
        relay(ALICE_PK, alice, abi.encodeCall(TurnstileEvent.list, (105, BOOTH_PRICE)), 0);
        assertTrue(ev.listingOf(105).active);
        relay(ALICE_PK, alice, abi.encodeCall(TurnstileEvent.delist, (105)), 0);
        assertFalse(ev.listingOf(105).active);
    }

    function test_relayed_callFromNonHolderIsStillRejected() public {
        buyFree(alice, 7);
        // Forwarder checks pass (bob signed for bob) but the inner call reverts: the event sees bob, not a holder.
        // OZ's single `execute` does not bubble the inner error; the relayer sees `FailedCall()`.
        ERC2771Forwarder.ForwardRequestData memory req = ERC2771Forwarder.ForwardRequestData({
            from: bob,
            to: address(ev),
            value: 0,
            gas: 400_000,
            deadline: uint48(block.timestamp + 1 hours),
            data: abi.encodeCall(TurnstileEvent.bindDoorKey, (7, door)),
            signature: ""
        });
        bytes32 structHash = keccak256(
            abi.encode(
                FORWARD_REQUEST_TYPEHASH,
                req.from,
                req.to,
                req.value,
                req.gas,
                forwarder.nonces(bob),
                req.deadline,
                keccak256(req.data)
            )
        );
        req.signature =
            signDigest(BOB_PK, keccak256(abi.encodePacked(hex"1901", forwarderDomainSeparator(), structHash)));
        vm.prank(relayer);
        vm.expectRevert(Errors.FailedCall.selector);
        forwarder.execute(req);
        assertEq(ev.doorKeyOf(7), address(0));
    }

    function test_untrustedForwarderIsJustACaller() public {
        buyFree(alice, 7);
        // Someone appending an address suffix without being the trusted forwarder is treated as themselves.
        bytes memory data = abi.encodePacked(abi.encodeCall(TurnstileEvent.bindDoorKey, (7, door)), alice);
        vm.prank(stranger);
        (bool ok, bytes memory ret) = address(ev).call(data);
        assertFalse(ok);
        assertEq(bytes4(ret), ITurnstileEvent.NotTicketHolder.selector);
    }

    function test_forwarderDomain() public view {
        (, string memory name, string memory version,, address verifyingContract,,) = forwarder.eip712Domain();
        assertEq(name, "Turnstile Forwarder");
        assertEq(version, "1");
        assertEq(verifyingContract, address(forwarder));
    }
}
