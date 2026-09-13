// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {console} from "forge-std/console.sol";
import {ITurnstileEvent} from "../src/ITurnstileEvent.sol";
import {TurnstileEvent} from "../src/TurnstileEvent.sol";
import {TurnstileTestBase} from "./Base.t.sol";

/// @dev Random walks over buy / bind / list / delist / fill / check-in / time, with ghost state that mirrors
///      what the protocol promises. Reverts are expected (bad prices, closed windows) and tolerated.
contract Handler is Test {
    TurnstileEvent public ev;
    address public gate;
    address public organiser;

    address[4] public actors;
    uint256[4] internal actorPks;
    uint256[3] internal doorPks;

    uint256[] public minted;
    mapping(uint256 tokenId => address) public ghostOwner;
    mapping(uint256 tokenId => uint256) public ghostBinds;
    mapping(uint256 tokenId => uint256) public ghostCheckIns;
    mapping(uint256 tokenId => uint256) public ghostDoorPk;
    uint256 public ghostCheckedIn;
    uint256 public ghostFills;

    constructor(TurnstileEvent ev_, address gate_, address organiser_) {
        ev = ev_;
        gate = gate_;
        organiser = organiser_;
        for (uint256 i = 0; i < 4; ++i) {
            actorPks[i] = 0xACC0 + i;
            actors[i] = vm.addr(actorPks[i]);
            vm.deal(actors[i], 100 ether);
        }
        for (uint256 i = 0; i < 3; ++i) {
            doorPks[i] = 0xD000 + i;
        }
    }

    function mintedCount() external view returns (uint256) {
        return minted.length;
    }

    function buy(uint256 actorSeed, uint256 seatSeed) external {
        address actor = actors[actorSeed % 4];
        uint256 seat = bound(seatSeed, 1, 110);
        uint256 price = seat >= 101 ? 0.01 ether : 0;
        vm.prank(actor);
        try ev.buy{value: price}(seat) {
            minted.push(seat);
            ghostOwner[seat] = actor;
        } catch {}
    }

    function bind(uint256 tokenSeed, uint256 doorSeed) external {
        if (minted.length == 0) return;
        uint256 tokenId = minted[tokenSeed % minted.length];
        uint256 pk = doorPks[doorSeed % 3];
        vm.prank(ghostOwner[tokenId]);
        try ev.bindDoorKey(tokenId, vm.addr(pk)) {
            ghostBinds[tokenId] += 1;
            ghostDoorPk[tokenId] = pk;
        } catch {}
    }

    function list(uint256 tokenSeed, uint256 priceSeed) external {
        if (minted.length == 0) return;
        uint256 tokenId = minted[tokenSeed % minted.length];
        uint96 price = uint96(bound(priceSeed, 0, 0.02 ether));
        vm.prank(ghostOwner[tokenId]);
        try ev.list(tokenId, price) {} catch {}
    }

    function delist(uint256 tokenSeed) external {
        if (minted.length == 0) return;
        uint256 tokenId = minted[tokenSeed % minted.length];
        vm.prank(ghostOwner[tokenId]);
        try ev.delist(tokenId) {} catch {}
    }

    function fill(uint256 tokenSeed, uint256 buyerSeed) external {
        if (minted.length == 0) return;
        uint256 tokenId = minted[tokenSeed % minted.length];
        address buyer = actors[buyerSeed % 4];
        ITurnstileEvent.Listing memory l = ev.listingOf(tokenId);
        if (!l.active) return;
        vm.prank(buyer);
        try ev.buyListing{value: l.price}(tokenId) {
            ghostOwner[tokenId] = buyer;
            ghostDoorPk[tokenId] = 0;
            ghostFills += 1;
        } catch {}
    }

    /// @dev List and immediately fill: makes the resale path common enough to matter in a 128-call walk.
    function listAndFill(uint256 tokenSeed, uint256 priceSeed, uint256 buyerSeed) external {
        if (minted.length == 0) return;
        uint256 tokenId = minted[tokenSeed % minted.length];
        address seller = ghostOwner[tokenId];
        address buyer = actors[buyerSeed % 4];
        if (buyer == seller) buyer = actors[(buyerSeed + 1) % 4];
        uint96 price = uint96(bound(priceSeed, 0, ev.resaleCapOf(tokenId)));
        vm.prank(seller);
        try ev.list(tokenId, price) {}
        catch {
            return;
        }
        vm.prank(buyer);
        try ev.buyListing{value: price}(tokenId) {
            ghostOwner[tokenId] = buyer;
            ghostDoorPk[tokenId] = 0;
            ghostFills += 1;
        } catch {}
    }

    function checkIn(uint256 tokenSeed) external {
        if (minted.length == 0) return;
        uint256 tokenId = minted[tokenSeed % minted.length];
        uint256 pk = ghostDoorPk[tokenId];
        if (pk == 0) return;
        uint64 slot = uint64(block.timestamp / 30);
        bytes memory sig = _sign(pk, ev.entryDigest(tokenId, slot));
        vm.prank(gate);
        try ev.checkIn(tokenId, slot, sig) {
            ghostCheckIns[tokenId] += 1;
            ghostCheckedIn += 1;
        } catch {}
    }

    function lazyCheckIn(uint256 tokenSeed, uint256 doorSeed) external {
        if (minted.length == 0) return;
        uint256 tokenId = minted[tokenSeed % minted.length];
        uint256 pk = doorPks[doorSeed % 3];
        uint256 deadline = block.timestamp + 5 minutes;
        uint64 slot = uint64(block.timestamp / 30);
        bytes memory bindSig = _signBind(tokenId, vm.addr(pk), deadline);
        bytes memory entrySig = _sign(pk, ev.entryDigest(tokenId, slot));
        vm.prank(gate);
        try ev.checkInWithBind(tokenId, vm.addr(pk), deadline, bindSig, slot, entrySig) {
            ghostBinds[tokenId] += 1;
            ghostDoorPk[tokenId] = pk;
            ghostCheckIns[tokenId] += 1;
            ghostCheckedIn += 1;
        } catch {}
    }

    function _signBind(uint256 tokenId, address doorKey, uint256 deadline) internal view returns (bytes memory) {
        address holder = ghostOwner[tokenId];
        uint256 holderPk;
        for (uint256 i = 0; i < 4; ++i) {
            if (actors[i] == holder) holderPk = actorPks[i];
        }
        return _sign(holderPk, ev.bindDigest(tokenId, doorKey, ev.bindNonceOf(tokenId), deadline));
    }

    function _sign(uint256 pk, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function transferAttempt(uint256 tokenSeed, uint256 toSeed) external {
        if (minted.length == 0) return;
        uint256 tokenId = minted[tokenSeed % minted.length];
        address from = ghostOwner[tokenId];
        vm.prank(from);
        try ev.transferFrom(from, actors[toSeed % 4], tokenId) {} catch {}
    }

    function warp(uint256 seed) external {
        vm.warp(block.timestamp + bound(seed, 1, 6 hours));
    }
}

contract InvariantsTest is TurnstileTestBase {
    Handler internal handler;

    function setUp() public override {
        super.setUp();
        handler = new Handler(ev, gate, organiser);
        targetContract(address(handler));
    }

    /// @dev Runs after each sequence; with -vv it shows how much of the state space a run actually visited.
    function afterInvariant() public view {
        console.log(
            "minted / fills / checked-in:", handler.mintedCount(), handler.ghostFills(), handler.ghostCheckedIn()
        );
    }

    function invariant_ticketsOnlyMoveThroughResale() public view {
        uint256 n = handler.mintedCount();
        for (uint256 i = 0; i < n; ++i) {
            uint256 tokenId = handler.minted(i);
            assertEq(ev.ownerOf(tokenId), handler.ghostOwner(tokenId), "owner drifted outside buyListing");
        }
    }

    function invariant_oneCheckInPerTicket() public view {
        uint256 n = handler.mintedCount();
        uint256 checkedIn;
        for (uint256 i = 0; i < n; ++i) {
            uint256 tokenId = handler.minted(i);
            uint256 count = handler.ghostCheckIns(tokenId);
            assertLe(count, 1, "double check-in");
            assertEq(ev.checkedInAt(tokenId) != 0, count == 1, "checkedInAt vs ghost");
            if (count == 1) {
                assertFalse(ev.listingOf(tokenId).active, "checked-in ticket still listed");
                checkedIn += 1;
            }
        }
        assertEq(ev.checkedInCount(), checkedIn, "checkedInCount");
        assertEq(handler.ghostCheckedIn(), checkedIn);
    }

    function invariant_bindNonceCountsEveryBind() public view {
        uint256 n = handler.mintedCount();
        for (uint256 i = 0; i < n; ++i) {
            uint256 tokenId = handler.minted(i);
            assertEq(ev.bindNonceOf(tokenId), handler.ghostBinds(tokenId), "bind nonce");
        }
    }

    function invariant_listingsRespectTheCap() public view {
        uint256 n = handler.mintedCount();
        for (uint256 i = 0; i < n; ++i) {
            uint256 tokenId = handler.minted(i);
            ITurnstileEvent.Listing memory l = ev.listingOf(tokenId);
            if (l.active) assertLe(l.price, ev.resaleCapOf(tokenId), "listing above cap");
        }
    }

    function invariant_contractHoldsNoFunds() public view {
        assertEq(address(ev).balance, 0, "funds stuck in the event");
    }

    function invariant_soldMatchesMints() public view {
        assertEq(ev.sold(), handler.mintedCount(), "sold counter");
        assertLe(ev.sold(), ev.capacity());
    }
}
