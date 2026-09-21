// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

contract TestDeployment {
    uint256 public value;

    function setValue(uint256 newValue) external {
        value = newValue;
    }
}