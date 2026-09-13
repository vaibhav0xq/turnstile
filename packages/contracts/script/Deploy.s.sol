// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {ERC2771Forwarder} from "@openzeppelin/contracts/metatx/ERC2771Forwarder.sol";
import {TurnstileEvent} from "../src/TurnstileEvent.sol";
import {TurnstileFactory} from "../src/TurnstileFactory.sol";

/// @notice Deploys the protocol: ERC2771Forwarder → TurnstileEvent implementation → TurnstileFactory.
///         Writes `deployments/<chainId>.json`, which the indexer, relayer and apps read.
///
///   forge script script/Deploy.s.sol --rpc-url monad_testnet --account deployer --broadcast --slow --verify \
///       --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org/   (trailing slash matters)
///
///   Runbook: docs/deploy-monad-testnet.md
///
///   FORWARDER=0x… reuses an existing forwarder (e.g. redeploying only the implementation + factory).
contract Deploy is Script {
    using stdJson for string;

    function run() external returns (address forwarder, address implementation, address factory) {
        address existingForwarder = vm.envOr("FORWARDER", address(0));

        vm.startBroadcast();
        forwarder =
            existingForwarder == address(0) ? address(new ERC2771Forwarder("Turnstile Forwarder")) : existingForwarder;
        implementation = address(new TurnstileEvent(forwarder));
        factory = address(new TurnstileFactory(implementation));
        vm.stopBroadcast();

        console.log("chainId        ", block.chainid);
        console.log("forwarder      ", forwarder);
        console.log("implementation ", implementation);
        console.log("factory        ", factory);

        _writeDeployment(forwarder, implementation, factory);
    }

    function _writeDeployment(address forwarder, address implementation, address factory) internal {
        string memory root = "deployment";
        root.serialize("chainId", block.chainid);
        root.serialize("forwarder", forwarder);
        root.serialize("implementation", implementation);
        root.serialize("factory", factory);
        root.serialize("deployedAtBlock", block.number);
        root.serialize("deployedAt", block.timestamp);
        string memory json = root.serialize("solc", string("0.8.28"));
        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);
        console.log("wrote", path);
    }
}
