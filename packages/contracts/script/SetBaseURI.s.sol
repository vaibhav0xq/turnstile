// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {ITurnstileEvent} from "../src/ITurnstileEvent.sol";
import {TurnstileFactory} from "../src/TurnstileFactory.sol";

/// @notice Points every event the broadcaster administers at a metadata host: each event's base URI becomes
///         `BASE_URI + eventId + "/tickets/"`, the relayer's `/api/events/<id>/tickets/<seatId>` route. Run it
///         whenever the public origin changes (placeholder → staging → final domain); events whose admin is
///         someone else are skipped, so it is safe against a factory with third-party events.
///
///   BASE_URI=https://<origin>/api/events/ \
///   forge script script/SetBaseURI.s.sol --rpc-url monad_testnet --account deployer --broadcast --slow
///
///   Reads the factory from `deployments/<chainId>.json`. `EVENT_IDS=1,2` limits the run to those ids.
contract SetBaseURI is Script {
    using stdJson for string;

    function run() external {
        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        // forge-lint: disable-next-line(unsafe-cheatcode)
        TurnstileFactory factory = TurnstileFactory(vm.readFile(path).readAddress(".factory"));
        string memory baseURI = vm.envString("BASE_URI");
        bytes memory raw = bytes(baseURI);
        require(raw.length > 8 && raw[raw.length - 1] == "/", "BASE_URI must be an https origin path ending in /");

        uint256[] memory ids = _eventIds(factory.eventCount());
        // With --account / --private-key forge runs the script as the broadcaster, so msg.sender is the signer.
        address broadcaster = msg.sender;

        vm.startBroadcast();
        // forge-lint: disable-start(calls-loop) — one transaction per event is the job of this script
        for (uint256 i = 0; i < ids.length; i++) {
            address eventAddress = factory.eventAt(ids[i]);
            require(eventAddress != address(0), "unknown event id");
            if (!IAccessControl(eventAddress).hasRole(0x00, broadcaster)) {
                console.log("skip (not admin)", ids[i], eventAddress);
                continue;
            }
            string memory uri = string.concat(baseURI, vm.toString(ids[i]), "/tickets/");
            ITurnstileEvent(eventAddress).setBaseURI(uri);
            console.log("event", ids[i], eventAddress);
            console.log("  ->", uri);
        }
        // forge-lint: disable-end(calls-loop)
        vm.stopBroadcast();
    }

    /// @dev EVENT_IDS="1,2" → those ids; unset → 1..eventCount.
    function _eventIds(uint256 count) internal view returns (uint256[] memory ids) {
        string memory list = vm.envOr("EVENT_IDS", string(""));
        if (bytes(list).length == 0) {
            ids = new uint256[](count);
            for (uint256 i = 0; i < count; i++) {
                ids[i] = i + 1;
            }
            return ids;
        }
        string[] memory parts = vm.split(list, ",");
        ids = new uint256[](parts.length);
        for (uint256 i = 0; i < parts.length; i++) {
            // forge-lint: disable-next-line(calls-loop)
            ids[i] = vm.parseUint(parts[i]);
        }
    }
}
