// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract RecordAnchor {
    address public owner;

    mapping(address => bool) public authorizedWriters;

    mapping(string => string) public recordHashes;

    event HashAnchored(string indexed recordId, string recordHash, address sender, uint256 timestamp);
    event WriterAuthorized(address writer);
    event WriterRevoked(address writer);

    constructor() {
        owner = msg.sender;
        authorizedWriters[msg.sender] = true; // Kurucu otomatik olarak yetkilidir
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Bu islem icin Owner yetkisi gerekiyor!");
        _;
    }

    modifier onlyAuthorized() {
        require(authorizedWriters[msg.sender], "Bu islem icin yetkiniz yok!");
        _;
    }

    function authorizeWriter(address _writer) public onlyOwner {
        authorizedWriters[_writer] = true;
        emit WriterAuthorized(_writer);
    }

    function revokeWriter(address _writer) public onlyOwner {
        authorizedWriters[_writer] = false;
        emit WriterRevoked(_writer);
    }

    function anchorHash(string memory _recordId, string memory _recordHash) public onlyAuthorized {
        require(bytes(recordHashes[_recordId]).length == 0, "Bu kayit ID'si zaten var!");
        
        recordHashes[_recordId] = _recordHash;
        emit HashAnchored(_recordId, _recordHash, msg.sender, block.timestamp);
    }
}
