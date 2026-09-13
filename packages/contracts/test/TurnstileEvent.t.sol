// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ITurnstileEvent} from "../src/ITurnstileEvent.sol";
import {TurnstileEvent} from "../src/TurnstileEvent.sol";
import {TurnstileTestBase} from "./Base.t.sol";

contract FactoryTest is TurnstileTestBase {
    function test_createEvent_registersAndConfigures() public view {
        assertEq(eventId, 1);
        assertEq(factory.eventCount(), 1);
        assertEq(factory.eventAt(1), address(ev));
        assertEq(factory.eventIdOf(address(ev)), 1);
        assertTrue(factory.isTurnstileEvent(address(ev)));
        assertFalse(factory.isTurnstileEvent(address(implementation)));
        assertEq(factory.predictEventAddress(1), address(ev));
        assertEq(factory.trustedForwarder(), address(forwarder));

        assertEq(ev.eventId(), 1);
        assertEq(ev.organiser(), organiser);
        assertEq(ev.venue(), VENUE);
        assertEq(ev.startsAt(), START);
        assertEq(ev.salesEndAt(), SALES_END);
        assertEq(ev.resaleCapBps(), CAP_BPS);
        assertEq(ev.resaleFeeBps(), FEE_BPS);
        assertEq(ev.name(), "Turnstile: Neon Night");
        assertEq(ev.symbol(), "TSNN");
        assertEq(ev.tierCount(), 2);
        assertEq(ev.capacity(), GA_COUNT + BOOTH_COUNT);
        assertEq(ev.sold(), 0);
        assertTrue(ev.hasRole(ev.DEFAULT_ADMIN_ROLE(), organiser));
        assertTrue(ev.hasRole(ev.GATE_ROLE(), gate));
        assertTrue(ev.isTrustedForwarder(address(forwarder)));
    }

    function test_createEvent_predictsNextAddress() public {
        address predicted = factory.predictEventAddress(2);
        vm.prank(bob);
        (uint256 id, address addr) = factory.createEvent(defaultConfig(), defaultTiers(), new address[](0));
        assertEq(id, 2);
        assertEq(addr, predicted);
        assertEq(TurnstileEvent(addr).organiser(), bob);
        assertFalse(TurnstileEvent(addr).hasRole(ev.GATE_ROLE(), gate));
    }

    function test_eip712Domain_isPerClone() public view {
        (, string memory name, string memory version, uint256 chainId, address verifyingContract,,) = ev.eip712Domain();
        assertEq(name, "Turnstile");
        assertEq(version, "1");
        assertEq(chainId, block.chainid);
        assertEq(verifyingContract, address(ev));
    }

    function test_implementation_cannotBeInitialised() public {
        vm.expectRevert();
        implementation.initialize(9, organiser, defaultConfig(), defaultTiers(), defaultGates());
    }

    function test_createEvent_rejectsBadConfig() public {
        ITurnstileEvent.EventConfig memory cfg = defaultConfig();
        cfg.startsAt = 0;
        vm.expectRevert(ITurnstileEvent.InvalidConfig.selector);
        factory.createEvent(cfg, defaultTiers(), defaultGates());

        cfg = defaultConfig();
        cfg.resaleFeeBps = 10_001;
        vm.expectRevert(ITurnstileEvent.InvalidConfig.selector);
        factory.createEvent(cfg, defaultTiers(), defaultGates());

        cfg = defaultConfig();
        cfg.salesEndAt = START + 1;
        vm.expectRevert(ITurnstileEvent.InvalidConfig.selector);
        factory.createEvent(cfg, defaultTiers(), defaultGates());

        cfg = defaultConfig();
        cfg.name = "";
        vm.expectRevert(ITurnstileEvent.InvalidConfig.selector);
        factory.createEvent(cfg, defaultTiers(), defaultGates());
    }

    function test_createEvent_rejectsBadTiers() public {
        ITurnstileEvent.Tier[] memory none = new ITurnstileEvent.Tier[](0);
        vm.expectRevert(ITurnstileEvent.InvalidTiers.selector);
        factory.createEvent(defaultConfig(), none, defaultGates());

        ITurnstileEvent.Tier[] memory overlapping = defaultTiers();
        overlapping[1].firstSeat = GA_FIRST + GA_COUNT - 1; // last GA seat
        vm.expectRevert(ITurnstileEvent.InvalidTiers.selector);
        factory.createEvent(defaultConfig(), overlapping, defaultGates());

        ITurnstileEvent.Tier[] memory empty = defaultTiers();
        empty[0].seatCount = 0;
        vm.expectRevert(ITurnstileEvent.InvalidTiers.selector);
        factory.createEvent(defaultConfig(), empty, defaultGates());

        ITurnstileEvent.Tier[] memory many = new ITurnstileEvent.Tier[](17);
        for (uint32 i = 0; i < 17; ++i) {
            many[i] = ITurnstileEvent.Tier({name: "t", price: 0, firstSeat: i * 10, seatCount: 10});
        }
        vm.expectRevert(ITurnstileEvent.InvalidTiers.selector);
        factory.createEvent(defaultConfig(), many, defaultGates());
    }

    function test_salesEnd_defaultsToStart() public {
        ITurnstileEvent.EventConfig memory cfg = defaultConfig();
        cfg.salesEndAt = 0;
        (, address addr) = factory.createEvent(cfg, defaultTiers(), defaultGates());
        assertEq(TurnstileEvent(addr).salesEndAt(), START);
    }
}

contract PrimarySaleTest is TurnstileTestBase {
    function test_buy_freeSeat() public {
        vm.expectEmit(address(ev));
        emit IERC721.Transfer(address(0), alice, 7);
        vm.expectEmit(address(ev));
        emit ITurnstileEvent.TicketMinted(7, alice, 0, 0, false);
        buyFree(alice, 7);

        assertEq(ev.ownerOf(7), alice);
        assertEq(ev.balanceOf(alice), 1);
        assertEq(ev.faceValueOf(7), 0);
        assertEq(ev.sold(), 1);
        (uint8 tierIndex, ITurnstileEvent.Tier memory tier) = ev.tierOf(7);
        assertEq(tierIndex, 0);
        assertEq(tier.name, "GA");
        assertEq(ev.tokenURI(7), "https://turnstile.example/api/events/1/tickets/7");
    }

    function test_buy_paidSeat_paysOrganiserInstantly() public {
        uint256 before = organiser.balance;
        vm.expectEmit(address(ev));
        emit ITurnstileEvent.TicketMinted(105, bob, 1, BOOTH_PRICE, false);
        buyBooth(bob, 105);
        assertEq(ev.ownerOf(105), bob);
        assertEq(ev.faceValueOf(105), BOOTH_PRICE);
        assertEq(organiser.balance - before, BOOTH_PRICE);
        assertEq(address(ev).balance, 0);
    }

    function test_buy_rejectsWrongPrice() public {
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ITurnstileEvent.WrongPrice.selector, BOOTH_PRICE, 0));
        ev.buy(105);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ITurnstileEvent.WrongPrice.selector, 0, 1 wei));
        ev.buy{value: 1 wei}(3);
    }

    function test_buy_rejectsUnknownAndTakenSeats() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ITurnstileEvent.UnknownSeat.selector, 0));
        ev.buy(0);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ITurnstileEvent.UnknownSeat.selector, 111));
        ev.buy(111);

        buyFree(alice, 7);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ITurnstileEvent.SeatTaken.selector, 7));
        ev.buy(7);
    }

    function test_buy_closesAtSalesEnd() public {
        vm.warp(SALES_END);
        buyFree(alice, 1); // inclusive
        vm.warp(SALES_END + 1);
        vm.prank(bob);
        vm.expectRevert(ITurnstileEvent.SalesClosed.selector);
        ev.buy(2);
    }

    function test_setSalesEnd() public {
        vm.prank(organiser);
        vm.expectEmit(address(ev));
        emit ITurnstileEvent.SalesEndUpdated(START);
        ev.setSalesEnd(START);
        assertEq(ev.salesEndAt(), START);

        vm.prank(organiser);
        vm.expectRevert(ITurnstileEvent.InvalidConfig.selector);
        ev.setSalesEnd(START + 1);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, bytes32(0))
        );
        ev.setSalesEnd(START);
    }

    function test_mintTo_compHasZeroFaceValue() public {
        vm.prank(organiser);
        vm.expectEmit(address(ev));
        emit ITurnstileEvent.TicketMinted(108, alice, 1, 0, true);
        ev.mintTo(108, alice);
        assertEq(ev.ownerOf(108), alice);
        assertEq(ev.faceValueOf(108), 0);
        assertEq(ev.resaleCapOf(108), 0);

        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, bob, bytes32(0))
        );
        ev.mintTo(109, bob);
    }

    function test_setBaseURI() public {
        vm.prank(organiser);
        ev.setBaseURI("ipfs://x/");
        buyFree(alice, 1);
        assertEq(ev.tokenURI(1), "ipfs://x/1");
    }

    function testFuzz_tierOf(uint256 seatId) public {
        bool inGa = seatId >= GA_FIRST && seatId < GA_FIRST + GA_COUNT;
        bool inBooth = seatId >= BOOTH_FIRST && seatId < BOOTH_FIRST + BOOTH_COUNT;
        if (inGa || inBooth) {
            (uint8 tierIndex, ITurnstileEvent.Tier memory tier) = ev.tierOf(seatId);
            assertEq(tierIndex, inGa ? 0 : 1);
            assertEq(tier.price, inGa ? 0 : BOOTH_PRICE);
        } else {
            vm.expectRevert(abi.encodeWithSelector(ITurnstileEvent.UnknownSeat.selector, seatId));
            ev.tierOf(seatId);
        }
    }
}

contract TransferLockTest is TurnstileTestBase {
    function setUp() public override {
        super.setUp();
        buyFree(alice, 7);
    }

    function test_transfersAreLocked() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ITurnstileEvent.TransferLocked.selector, 7));
        ev.transferFrom(alice, bob, 7);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ITurnstileEvent.TransferLocked.selector, 7));
        ev.safeTransferFrom(alice, bob, 7);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ITurnstileEvent.TransferLocked.selector, 7));
        ev.safeTransferFrom(alice, bob, 7, "");

        assertEq(ev.ownerOf(7), alice);
    }

    function test_approvalsAreDisabled() public {
        vm.prank(alice);
        vm.expectRevert(ITurnstileEvent.ApprovalsDisabled.selector);
        ev.approve(bob, 7);

        vm.prank(alice);
        vm.expectRevert(ITurnstileEvent.ApprovalsDisabled.selector);
        ev.setApprovalForAll(bob, true);

        assertEq(ev.getApproved(7), address(0));
        assertFalse(ev.isApprovedForAll(alice, bob));
    }
}

contract DoorKeyTest is TurnstileTestBase {
    function setUp() public override {
        super.setUp();
        buyFree(alice, 7);
    }

    function test_bindDoorKey_byHolder() public {
        vm.expectEmit(address(ev));
        emit ITurnstileEvent.DoorKeyBound(7, door, address(0), alice);
        bind(alice, 7, door);
        assertEq(ev.doorKeyOf(7), door);
        assertEq(ev.bindNonceOf(7), 1);
    }

    function test_bindDoorKey_rotates() public {
        bind(alice, 7, door);
        vm.expectEmit(address(ev));
        emit ITurnstileEvent.DoorKeyBound(7, door2, door, alice);
        bind(alice, 7, door2);
        assertEq(ev.doorKeyOf(7), door2);
        assertEq(ev.bindNonceOf(7), 2);
    }

    function test_bindDoorKey_rejectsNonHolderZeroKeyAndUnknownToken() public {
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ITurnstileEvent.NotTicketHolder.selector, 7, bob));
        ev.bindDoorKey(7, door);

        vm.prank(alice);
        vm.expectRevert(ITurnstileEvent.ZeroDoorKey.selector);
        ev.bindDoorKey(7, address(0));

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, 8));
        ev.bindDoorKey(8, door);
    }

    function test_bindDoorKeyWithSig_anyoneMaySubmit() public {
        uint256 deadline = block.timestamp + 10 minutes;
        bytes memory sig = signBind(ALICE_PK, 7, door, deadline);

        vm.prank(stranger);
        vm.expectEmit(address(ev));
        emit ITurnstileEvent.DoorKeyBound(7, door, address(0), alice);
        ev.bindDoorKeyWithSig(7, door, deadline, sig);
        assertEq(ev.doorKeyOf(7), door);
        assertEq(ev.bindNonceOf(7), 1);

        // replay: nonce moved on
        vm.prank(stranger);
        vm.expectRevert(); // BadBindSignature with whatever address the stale digest recovers to
        ev.bindDoorKeyWithSig(7, door, deadline, sig);
    }

    function test_bindDoorKeyWithSig_rejectsWrongSignerExpiryAndTamper() public {
        uint256 deadline = block.timestamp + 10 minutes;

        bytes memory bobSig = signBind(BOB_PK, 7, door, deadline);
        vm.expectRevert(abi.encodeWithSelector(ITurnstileEvent.BadBindSignature.selector, 7, bob));
        ev.bindDoorKeyWithSig(7, door, deadline, bobSig);

        bytes memory sig = signBind(ALICE_PK, 7, door, deadline);
        vm.expectRevert(); // recovered address differs from alice (door2 was not signed)
        ev.bindDoorKeyWithSig(7, door2, deadline, sig);

        vm.expectRevert(abi.encodeWithSelector(ITurnstileEvent.BadBindSignature.selector, 7, address(0)));
        ev.bindDoorKeyWithSig(7, door, deadline, hex"0102");

        vm.warp(deadline + 1);
        vm.expectRevert(abi.encodeWithSelector(ITurnstileEvent.SignatureExpired.selector, deadline));
        ev.bindDoorKeyWithSig(7, door, deadline, sig);
    }

    function test_directBind_voidsOutstandingAuthorisation() public {
        uint256 deadline = block.timestamp + 10 minutes;
        bytes memory sig = signBind(ALICE_PK, 7, door, deadline);
        bind(alice, 7, door2); // nonce 0 → 1
        vm.expectRevert();
        ev.bindDoorKeyWithSig(7, door, deadline, sig);
        assertEq(ev.doorKeyOf(7), door2);
    }
}

contract CheckInTest is TurnstileTestBase {
    function setUp() public override {
        super.setUp();
        buyFree(alice, 7);
        bind(alice, 7, door);
        buyFree(bob, 8); // no door key yet
        buyFree(bob, 9); // no door key yet
        vm.warp(START + 5 minutes);
    }

    function test_checkIn_happyPath() public {
        uint64 slot = slotNow();
        bytes memory sig = signEntry(DOOR_PK, 7, slot);

        vm.prank(gate);
        vm.expectEmit(address(ev));
        emit ITurnstileEvent.CheckedIn(7, alice, door, gate, slot);
        ev.checkIn(7, slot, sig);

        assertEq(ev.checkedInAt(7), uint64(block.timestamp));
        assertEq(ev.checkedInCount(), 1);
        assertEq(ev.ownerOf(7), alice); // check-in does not move the ticket
    }

    function test_checkIn_acceptsPreviousAndNextSlot() public {
        uint64 slot = slotNow();
        assertTrue(ev.isSlotAcceptable(slot - 1));
        assertTrue(ev.isSlotAcceptable(slot));
        assertTrue(ev.isSlotAcceptable(slot + 1));
        assertFalse(ev.isSlotAcceptable(slot - 2));
        assertFalse(ev.isSlotAcceptable(slot + 2));

        bytes memory previous = signEntry(DOOR_PK, 7, slot - 1);
        vm.prank(gate);
        ev.checkIn(7, slot - 1, previous);
    }

    function test_checkIn_rejectsStaleSlot() public {
        uint64 slot = slotNow();
        bytes memory sig = signEntry(DOOR_PK, 7, slot - 2);
        vm.prank(gate);
        vm.expectRevert(abi.encodeWithSelector(ITurnstileEvent.SlotOutOfWindow.selector, slot - 2, slot));
        ev.checkIn(7, slot - 2, sig);

        // a code signed now but scanned 61 s later is also stale
        bytes memory fresh = signEntry(DOOR_PK, 7, slot);
        vm.warp(block.timestamp + 61);
        vm.prank(gate);
        vm.expectRevert(abi.encodeWithSelector(ITurnstileEvent.SlotOutOfWindow.selector, slot, slotNow()));
        ev.checkIn(7, slot, fresh);
    }

    function test_checkIn_rejectsWrongKeyAndTamperedCode() public {
        uint64 slot = slotNow();

        bytes memory wrongKey = signEntry(DOOR2_PK, 7, slot);
        vm.prank(gate);
        vm.expectRevert(abi.encodeWithSelector(ITurnstileEvent.BadEntrySignature.selector, 7, door2));
        ev.checkIn(7, slot, wrongKey);

        // signature for another token id presented for this one
        bind(bob, 8, door2);
        bytes memory otherToken = signEntry(DOOR2_PK, 8, slot);
        vm.prank(gate);
        vm.expectRevert(); // recovers to a random address ≠ door
        ev.checkIn(7, slot, otherToken);

        vm.prank(gate);
        vm.expectRevert(abi.encodeWithSelector(ITurnstileEvent.BadEntrySignature.selector, 7, address(0)));
        ev.checkIn(7, slot, hex"");
    }

    function test_checkIn_onlyGate() public {
        uint64 slot = slotNow();
        bytes memory sig = signEntry(DOOR_PK, 7, slot);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, gateRole)
        );
        ev.checkIn(7, slot, sig);
    }

    function test_checkIn_oncePerToken() public {
        uint64 slot = slotNow();
        bytes memory sig = signEntry(DOOR_PK, 7, slot);
        vm.prank(gate);
        ev.checkIn(7, slot, sig);

        vm.prank(gate);
        vm.expectRevert(abi.encodeWithSelector(ITurnstileEvent.AlreadyCheckedIn.selector, 7));
        ev.checkIn(7, slot, sig);

        // and the key can no longer be rotated
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ITurnstileEvent.AlreadyCheckedIn.selector, 7));
        ev.bindDoorKey(7, door2);
    }

    function test_checkIn_requiresDoorKeyAndToken() public {
        uint64 slot = slotNow();
        bytes memory sig = signEntry(DOOR_PK, 9, slot);
        vm.prank(gate);
        vm.expectRevert(abi.encodeWithSelector(ITurnstileEvent.NoDoorKey.selector, 9));
        ev.checkIn(9, slot, sig);

        vm.prank(gate);
        vm.expectRevert(abi.encodeWithSelector(ITurnstileEvent.NoDoorKey.selector, 10));
        ev.checkIn(10, slot, hex"");
    }

    function test_checkIn_afterRotationOnlyNewKeyWorks() public {
        bind(alice, 7, door2);
        uint64 slot = slotNow();
        bytes memory oldKey = signEntry(DOOR_PK, 7, slot);
        bytes memory newKey = signEntry(DOOR2_PK, 7, slot);
        vm.prank(gate);
        vm.expectRevert(abi.encodeWithSelector(ITurnstileEvent.BadEntrySignature.selector, 7, door));
        ev.checkIn(7, slot, oldKey);
        vm.prank(gate);
        ev.checkIn(7, slot, newKey);
    }

    function test_checkInWithBind_lazyBindAtTheDoor() public {
        uint64 slot = slotNow();
        uint256 deadline = block.timestamp + 10 minutes;
        bytes memory bindSig = signBind(BOB_PK, 9, door2, deadline);
        bytes memory entrySig = signEntry(DOOR2_PK, 9, slot);

        vm.prank(gate);
        vm.expectEmit(address(ev));
        emit ITurnstileEvent.DoorKeyBound(9, door2, address(0), bob);
        vm.expectEmit(address(ev));
        emit ITurnstileEvent.CheckedIn(9, bob, door2, gate, slot);
        ev.checkInWithBind(9, door2, deadline, bindSig, slot, entrySig);

        assertEq(ev.doorKeyOf(9), door2);
        assertEq(ev.bindNonceOf(9), 1);
        assertEq(ev.checkedInCount(), 1);
    }

    function test_checkInWithBind_isAtomic() public {
        uint64 slot = slotNow();
        uint256 deadline = block.timestamp + 10 minutes;
        bytes memory bindSig = signBind(BOB_PK, 9, door2, deadline);
        bytes memory wrongEntry = signEntry(DOOR_PK, 9, slot); // not door2
        bytes memory rightEntry = signEntry(DOOR2_PK, 9, slot);

        vm.prank(gate);
        vm.expectRevert(abi.encodeWithSelector(ITurnstileEvent.BadEntrySignature.selector, 9, door));
        ev.checkInWithBind(9, door2, deadline, bindSig, slot, wrongEntry);
        assertEq(ev.doorKeyOf(9), address(0)); // nothing bound
        assertEq(ev.bindNonceOf(9), 0);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, gateRole)
        );
        ev.checkInWithBind(9, door2, deadline, bindSig, slot, rightEntry);
    }

    function test_checkIn_clearsAnActiveListing() public {
        vm.warp(START - 1 days);
        buyBooth(bob, 105);
        bind(bob, 105, door2);
        vm.prank(bob);
        ev.list(105, BOOTH_PRICE);
        vm.warp(START + 1 minutes);

        uint64 slot = slotNow();
        bytes memory sig = signEntry(DOOR2_PK, 105, slot);
        vm.prank(gate);
        vm.expectEmit(address(ev));
        emit ITurnstileEvent.Delisted(105);
        ev.checkIn(105, slot, sig);
        assertFalse(ev.listingOf(105).active);
    }

    function testFuzz_checkIn_slotWindow(uint64 offsetSeconds) public {
        offsetSeconds = uint64(bound(offsetSeconds, 0, 120));
        uint64 signedSlot = slotNow();
        bytes memory sig = signEntry(DOOR_PK, 7, signedSlot);
        vm.warp(block.timestamp + offsetSeconds);
        uint64 current = slotNow();
        bool acceptable = signedSlot + 1 >= current;
        vm.prank(gate);
        if (!acceptable) {
            vm.expectRevert(abi.encodeWithSelector(ITurnstileEvent.SlotOutOfWindow.selector, signedSlot, current));
        }
        ev.checkIn(7, signedSlot, sig);
        assertEq(ev.checkedInCount(), acceptable ? 1 : 0);
    }
}

contract ResaleTest is TurnstileTestBase {
    function setUp() public override {
        super.setUp();
        buyBooth(alice, 105);
        bind(alice, 105, door);
    }

    function test_list_withinCap() public {
        uint96 cap = uint96(ev.resaleCapOf(105));
        assertEq(cap, (uint256(BOOTH_PRICE) * CAP_BPS) / 10_000);

        vm.prank(alice);
        vm.expectEmit(address(ev));
        emit ITurnstileEvent.Listed(105, alice, cap);
        ev.list(105, cap);
        ITurnstileEvent.Listing memory l = ev.listingOf(105);
        assertTrue(l.active);
        assertEq(l.price, cap);
        assertEq(ev.ownerOf(105), alice); // listing does not escrow
    }

    function test_list_rejectsAboveCapNonHolderAndClosed() public {
        uint256 cap = ev.resaleCapOf(105);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ITurnstileEvent.PriceAboveCap.selector, cap + 1, cap));
        ev.list(105, uint96(cap + 1));

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ITurnstileEvent.NotTicketHolder.selector, 105, bob));
        ev.list(105, 1);

        vm.warp(START);
        vm.prank(alice);
        vm.expectRevert(ITurnstileEvent.ResaleClosed.selector);
        ev.list(105, 1);
    }

    function test_list_disabledWhenCapIsZero() public {
        ITurnstileEvent.EventConfig memory cfg = defaultConfig();
        cfg.resaleCapBps = 0;
        vm.prank(organiser);
        (, address addr) = factory.createEvent(cfg, defaultTiers(), defaultGates());
        TurnstileEvent locked = TurnstileEvent(addr);
        vm.prank(alice);
        locked.buy{value: BOOTH_PRICE}(105);
        vm.prank(alice);
        vm.expectRevert(ITurnstileEvent.ResaleDisabled.selector);
        locked.list(105, 0);
    }

    function test_delist() public {
        vm.prank(alice);
        ev.list(105, BOOTH_PRICE);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ITurnstileEvent.NotTicketHolder.selector, 105, bob));
        ev.delist(105);
        vm.prank(alice);
        vm.expectEmit(address(ev));
        emit ITurnstileEvent.Delisted(105);
        ev.delist(105);
        assertFalse(ev.listingOf(105).active);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ITurnstileEvent.NotListed.selector, 105));
        ev.delist(105);
    }

    function test_buyListing_movesTicketClearsKeyAndSplitsInstantly() public {
        uint96 price = uint96(ev.resaleCapOf(105));
        vm.prank(alice);
        ev.list(105, price);

        uint96 fee = uint96((uint256(price) * FEE_BPS) / 10_000);
        uint256 aliceBefore = alice.balance;
        uint256 organiserBefore = organiser.balance;

        vm.prank(bob);
        vm.expectEmit(address(ev));
        emit ITurnstileEvent.DoorKeyCleared(105, door);
        vm.expectEmit(address(ev));
        emit IERC721.Transfer(alice, bob, 105);
        vm.expectEmit(address(ev));
        emit ITurnstileEvent.ListingFilled(105, alice, bob, price, fee);
        ev.buyListing{value: price}(105);

        assertEq(ev.ownerOf(105), bob);
        assertEq(ev.balanceOf(alice), 0);
        assertEq(ev.balanceOf(bob), 1);
        assertEq(ev.doorKeyOf(105), address(0));
        assertEq(ev.faceValueOf(105), BOOTH_PRICE); // face value follows the seat, not the sale
        assertFalse(ev.listingOf(105).active);
        assertEq(alice.balance - aliceBefore, price - fee);
        assertEq(organiser.balance - organiserBefore, fee);
        assertEq(address(ev).balance, 0);

        // the old holder is out; the new holder binds their own key and can list again within the same cap
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ITurnstileEvent.NotTicketHolder.selector, 105, alice));
        ev.bindDoorKey(105, door);
        bind(bob, 105, door2);
        assertEq(ev.bindNonceOf(105), 2);
        vm.prank(bob);
        ev.list(105, price);
    }

    function test_buyListing_rejectsNotListedWrongPriceSelfAndClosed() public {
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ITurnstileEvent.NotListed.selector, 105));
        ev.buyListing{value: BOOTH_PRICE}(105);

        vm.prank(alice);
        ev.list(105, BOOTH_PRICE);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ITurnstileEvent.WrongPrice.selector, BOOTH_PRICE, BOOTH_PRICE - 1));
        ev.buyListing{value: BOOTH_PRICE - 1}(105);

        vm.prank(alice);
        vm.expectRevert(ITurnstileEvent.SelfPurchase.selector);
        ev.buyListing{value: BOOTH_PRICE}(105);

        vm.warp(START);
        vm.prank(bob);
        vm.expectRevert(ITurnstileEvent.ResaleClosed.selector);
        ev.buyListing{value: BOOTH_PRICE}(105);
    }

    function test_buyListing_freeTransferOfAComp() public {
        vm.prank(organiser);
        ev.mintTo(3, alice); // comp: face value 0 → may only be passed on at 0
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ITurnstileEvent.PriceAboveCap.selector, 1, 0));
        ev.list(3, 1);
        vm.prank(alice);
        ev.list(3, 0);
        vm.prank(bob);
        ev.buyListing(3);
        assertEq(ev.ownerOf(3), bob);
    }

    function test_checkedInTicketCannotBeListed() public {
        vm.warp(START - 1);
        uint64 slot = slotNow();
        bytes memory sig = signEntry(DOOR_PK, 105, slot);
        vm.prank(gate);
        ev.checkIn(105, slot, sig);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ITurnstileEvent.AlreadyCheckedIn.selector, 105));
        ev.list(105, 1);
    }

    function test_payoutFailureRevertsTheSale() public {
        RejectsEther seller = new RejectsEther();
        vm.deal(address(seller), 1 ether);
        seller.buy(ev, 106);
        seller.list(ev, 106, BOOTH_PRICE);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ITurnstileEvent.PayoutFailed.selector, address(seller)));
        ev.buyListing{value: BOOTH_PRICE}(106);
        assertEq(ev.ownerOf(106), address(seller));
    }

    function testFuzz_splitsAlwaysAddUp(uint96 price, uint16 feeBps, uint16 capBps) public {
        feeBps = uint16(bound(feeBps, 0, 10_000));
        capBps = uint16(bound(capBps, 1, 20_000));
        ITurnstileEvent.EventConfig memory cfg = defaultConfig();
        cfg.resaleCapBps = capBps;
        cfg.resaleFeeBps = feeBps;
        vm.prank(organiser);
        (, address addr) = factory.createEvent(cfg, defaultTiers(), defaultGates());
        TurnstileEvent e = TurnstileEvent(addr);

        vm.prank(alice);
        e.buy{value: BOOTH_PRICE}(105);
        price = uint96(bound(price, 0, e.resaleCapOf(105)));
        vm.prank(alice);
        e.list(105, price);

        uint256 aliceBefore = alice.balance;
        uint256 organiserBefore = organiser.balance;
        vm.prank(bob);
        e.buyListing{value: price}(105);
        assertEq((alice.balance - aliceBefore) + (organiser.balance - organiserBefore), price);
        assertEq(address(e).balance, 0);
        assertEq(e.ownerOf(105), bob);
    }
}

contract RejectsEther {
    function buy(TurnstileEvent ev, uint256 seat) external {
        ev.buy{value: 0.01 ether}(seat);
    }

    function list(TurnstileEvent ev, uint256 tokenId, uint96 price) external {
        ev.list(tokenId, price);
    }
}
