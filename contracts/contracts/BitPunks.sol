// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/// @title BitPunks
/// @notice Generative pixel-art punks on Robinhood Chain.
///         Dual-path mint: web (manual) max 5/wallet, agent (skill.md) max 15/wallet.
contract BitPunks is ERC721, ERC721Enumerable, Ownable {
    using Strings for uint256;

    uint256 public constant MAX_SUPPLY = 5555;
    uint256 public constant WEB_MINT_MAX   = 5;
    uint256 public constant AGENT_MINT_MAX = 15;
    uint256 public mintPrice = 0.0005 ether;
    bool public isOpen = false;
    bool public revealed = false;

    mapping(address => uint256) public webMintedPerWallet;
    mapping(address => uint256) public agentMintedPerWallet;

    uint256 public totalMinted;
    string public baseURI;

    event Minted(address indexed to, uint256 indexed path, uint256 qty, uint256 startTokenId);

    constructor() ERC721("BitPunks", "BP") {}

    modifier mintOpenCheck() {
        require(isOpen, "mint closed");
        _;
    }

    function _mintBatch(address to, uint256 qty) internal {
        require(totalMinted + qty <= MAX_SUPPLY, "sold out");
        for (uint256 i = 0; i < qty; i++) {
            _mint(to, totalMinted + i);
        }
        totalMinted += qty;
    }

    // ---------- WEB path (manual, cap 5) ----------
    function webMint(uint256 qty) external payable mintOpenCheck {
        require(qty >= 1 && qty <= WEB_MINT_MAX, "qty invalid");
        uint256 next = webMintedPerWallet[msg.sender] + qty;
        require(next <= WEB_MINT_MAX, "web cap if not");
        require(msg.value == mintPrice * qty, "wrong value");
        webMintedPerWallet[msg.sender] = next;
        _mintBatch(msg.sender, qty);
        emit Minted(msg.sender, 0, qty, totalMinted - qty);
    }

    // ---------- AGENT path (skill.md, cap 15) ----------
    function agentMint(uint256 qty) external payable mintOpenCheck {
        require(qty >= 1 && qty <= AGENT_MINT_MAX, "qty invalid");
        uint256 next = agentMintedPerWallet[msg.sender] + qty;
        require(next <= AGENT_MINT_MAX, "agent cap");
        require(msg.value >= mintPrice * qty, "wrong value");
        agentMintedPerWallet[msg.sender] = next;
        _mintBatch(msg.sender, qty);
        emit Minted(msg.sender, 1, qty, totalMinted - qty);
    }

    // ---------- admin ----------
    function setMintOpen(bool v) external onlyOwner { isOpen = v; }
    function setMintPrice(uint256 p) external onlyOwner { mintPrice = p; }
    function setBaseURI(string calldata uri) external onlyOwner { baseURI = uri; }

    // ---------- reveal (time-gated style; owner flips) ----------
    function reveal() external onlyOwner { revealed = true; }

    // ---------- overrides ----------
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), "nonexistent");
        string memory base = baseURI;
        return bytes(base).length > 0 ? string(abi.encodePacked(base, tokenId.toString())) : "";
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