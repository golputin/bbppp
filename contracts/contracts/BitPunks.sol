// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/// @title BitPunks (burn-to-mint)
/// @notice Pay a fixed amount of an ERC20 token, burn it, commit to a block,
///         then reveal one block later. The reveal is anchored to the hash of
///         the block you committed in, which did not exist while you signed, so
///         nobody can cherry-pick a good id. Ids come from a lazy Fisher-Yates
///         shuffle: no id repeats and the draw stays uniform over what is left.
contract BitPunks is ERC721, ERC721Enumerable, Ownable {
    using Strings for uint256;

    uint256 public constant MAX_SUPPLY = 3333;

    IERC20 public immutable paymentToken;
    uint256 public burnAmount;                // token amount burned per commit

    bool public isOpen;
    bool public revealed;

    string public baseURI;
    uint256 public totalMinted;

    // ---- commitment state ----
    struct Commit {
        uint256 blockNum;   // block the commitment was paid in
        bool drawn;         // already revealed
    }
    mapping(address => Commit) public commits;

    // ---- lazy Fisher-Yates ----
    uint256 public pendingCount = MAX_SUPPLY;
    // swap[position] holds the real token id at that position (0 means "==position").
    mapping(uint256 => uint256) public swap;

    address public constant DEAD = address(0x000000000000000000000000000000000000dEaD);

    event Committed(address indexed payer, uint256 blockNum);
    event Revealed(address indexed payer, uint256 tokenId);

    constructor(address _token) ERC721("BitPunks", "BP") {
        paymentToken = IERC20(_token);
        burnAmount = 10 * 10 ** 18; // 10 KLANKO (18 decimals) per mint
    }

    modifier mintOpenCheck() { require(isOpen, "mint closed"); _; }

    /// @notice Step 1 — burn `burnAmount` paymentToken into a commitment.
    function commit() external mintOpenCheck {
        require(commits[msg.sender].blockNum == 0, "commit pending");
        require(paymentToken.transferFrom(msg.sender, DEAD, burnAmount), "transfer failed");
        commits[msg.sender] = Commit({ blockNum: block.number, drawn: false });
        emit Committed(msg.sender, block.number);
    }

    /// @notice Step 2 — one block later (window 240 blocks) draw your random id.
    function reveal() external {
        Commit storage c = commits[msg.sender];
        require(c.blockNum != 0, "no commit");
        require(!c.drawn, "already drawn");
        require(block.number >= c.blockNum + 1 && block.number <= c.blockNum + 240, "window");
        bytes32 h = blockhash(c.blockNum);
        uint256 entropy = uint256(keccak256(abi.encodePacked(h, msg.sender, c.blockNum)));
        uint256 tokenId = _pick(entropy % pendingCount);
        _mint(msg.sender, tokenId);
        c.drawn = true;
        pendingCount--;
        totalMinted++;
        emit Revealed(msg.sender, tokenId);
    }

    /// @notice Re-anchor an expired commitment (after 240 blocks) to now, no re-burn.
    function reAnchor() external {
        Commit storage c = commits[msg.sender];
        require(c.blockNum != 0, "no commit");
        require(block.number > c.blockNum + 240, "not expired");
        c.blockNum = block.number;
    }

    function _pick(uint256 idx) internal returns (uint256 id) {
        id = swap[idx] == 0 ? idx : swap[idx];
        uint256 last = pendingCount - 1;
        if (idx != last) {
            uint256 lastId = swap[last] == 0 ? last : swap[last];
            swap[idx] = lastId;
        }
        if (swap[last] != 0) delete swap[last];
    }

    // ---------- admin ----------
    function setMintOpen(bool v) external onlyOwner { isOpen = v; }
    function setBurnAmount(uint256 v) external onlyOwner { burnAmount = v; }
    function setBaseURI(string calldata uri) external onlyOwner { baseURI = uri; }
    function flipReveal() external onlyOwner { revealed = !revealed; }

    // ---------- overrides ----------
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), "nonexistent");
        string memory base = baseURI;
        return bytes(base).length > 0
            ? string(abi.encodePacked(base, tokenId.toString(), ".json"))
            : "";
    }

    function supportsInterface(bytes4 iface) public view override(ERC721, ERC721Enumerable) returns (bool) {
        return super.supportsInterface(iface);
    }

    function _beforeTokenTransfer(address from, address to, uint256 firstTokenId, uint256 batchSize)
        internal override(ERC721, ERC721Enumerable)
    {
        super._beforeTokenTransfer(from, to, firstTokenId, batchSize);
    }
}