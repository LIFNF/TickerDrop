// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TickerDrop} from "../src/TickerDrop.sol";
import {Tickr} from "../src/Tickr.sol";
import {MockLiquidityRouter} from "./MockLiquidity.sol";

contract CompanyDataTest is Test {
    struct CompanyInput {
        uint256 cap;
        uint256 id;
        string n;
        string s;
    }
    TickerDrop nft;
    Tickr token;

    function _fund(TickerDrop target) private {
        deal(address(token), address(target), target.supply() * (target.DROP() + target.INVITE_REWARD()));
        token.approve(address(target), target.supply() * target.INVITE_REWARD());
        target.fundReferral(target.supply() * target.INVITE_REWARD());
    }

    function setUp() public {
        token = new Tickr();
        nft = new TickerDrop(IERC20(address(token)), payable(address(this)), hex"41414100004242420000");
    }

    function _pack(string[] memory names, uint128[] memory caps) private pure returns (bytes memory) {
        bytes memory offsets = new bytes((names.length + 1) * 2);
        bytes memory records;
        uint256 cursor = offsets.length;
        for (uint256 i; i < names.length; ++i) {
            offsets[2 * i] = bytes1(uint8(cursor >> 8));
            offsets[2 * i + 1] = bytes1(uint8(cursor));
            records = bytes.concat(records, abi.encodePacked(caps[i], bytes(names[i])));
            cursor += 16 + bytes(names[i]).length;
        }
        offsets[2 * names.length] = bytes1(uint8(cursor >> 8));
        offsets[2 * names.length + 1] = bytes1(uint8(cursor));
        return bytes.concat(offsets, records);
    }

    function _sample() private pure returns (bytes memory) {
        string[] memory names = new string[](2);
        uint128[] memory caps = new uint128[](2);
        names[0] = 'Alpha & "Compute"';
        names[1] = unicode"芯片科技";
        caps[0] = 1;
        caps[1] = type(uint128).max;
        return _pack(names, caps);
    }

    function test_roundTripAndOverridePreserveCount() public {
        nft.setCompanyChunk(_sample());
        (string memory name, uint128 cap) = nft.companies(1);
        assertEq(name, 'Alpha & "Compute"');
        assertEq(cap, 1);
        (name, cap) = nft.companies(2);
        assertEq(name, unicode"芯片科技");
        assertEq(cap, type(uint128).max);
        nft.setCompany(1, "Corrected", 42);
        assertEq(nft.metadataCount(), 2);
        (name, cap) = nft.companies(1);
        assertEq(name, "Corrected");
        assertEq(cap, 42);
        _fund(nft);
        nft.openMint();
        vm.expectRevert();
        nft.setCompanyChunk(_sample());
    }

    function test_invalidOffsetsAndTrailingBytesRejected() public {
        bytes memory data = _sample();
        data[1] = hex"00";
        vm.expectRevert(TickerDrop.BadCount.selector);
        nft.setCompanyChunk(data);
        data = _sample();
        data[3] = hex"01";
        vm.expectRevert(TickerDrop.BadCount.selector);
        nft.setCompanyChunk(data);
        vm.expectRevert(TickerDrop.BadCount.selector);
        nft.setCompanyChunk(bytes.concat(_sample(), hex"ff"));
        vm.expectRevert(TickerDrop.BadCount.selector);
        nft.setCompanyChunk(hex"0000");
        assertEq(nft.metadataCount(), 0);
    }

    function test_emptyLongAndControlNamesRejected() public {
        string[] memory names = new string[](2);
        uint128[] memory caps = new uint128[](2);
        names[1] = "Beta";
        vm.expectRevert(TickerDrop.BadCount.selector);
        nft.setCompanyChunk(_pack(names, caps));
        bytes memory longName = new bytes(161);
        for (uint256 i; i < longName.length; ++i) {
            longName[i] = "A";
        }
        names[0] = string(longName);
        vm.expectRevert(TickerDrop.BadCount.selector);
        nft.setCompanyChunk(_pack(names, caps));
        names[0] = "Bad\nName";
        vm.expectRevert(bytes("Control character"));
        nft.setCompanyChunk(_pack(names, caps));
        assertEq(nft.metadataCount(), 0);
    }

    function test_onlyOwnerAndNoDuplicateChunks() public {
        bytes memory data = _sample();
        vm.prank(address(123));
        vm.expectRevert();
        nft.setCompanyChunk(data);
        nft.setCompanyChunk(data);
        vm.expectRevert(TickerDrop.BadCount.selector);
        nft.setCompanyChunk(data);
    }

    function test_sparseMetadataCannotBeSilentlyReplaced() public {
        nft.setCompany(2, "Existing", 9);
        vm.expectRevert(TickerDrop.BadCount.selector);
        nft.setCompanyChunk(_sample());
        assertEq(nft.metadataCount(), 1);
        nft.setCompany(1, "Alpha", 10);
        _fund(nft);
        nft.openMint();
    }

    function testFuzz_capsAndMaximumName(uint128 cap0, uint128 cap1) public {
        string[] memory names = new string[](2);
        uint128[] memory caps = new uint128[](2);
        bytes memory longName = new bytes(160);
        for (uint256 i; i < longName.length; ++i) {
            longName[i] = "A";
        }
        names[0] = string(longName);
        names[1] = "B";
        caps[0] = cap0;
        caps[1] = cap1;
        nft.setCompanyChunk(_pack(names, caps));
        (string memory name, uint128 cap) = nft.companies(1);
        assertEq(name, names[0]);
        assertEq(cap, cap0);
        (name, cap) = nft.companies(2);
        assertEq(name, "B");
        assertEq(cap, cap1);
        (name, cap) = nft.companies(0);
        assertEq(name, "");
        assertEq(cap, 0);
        (name, cap) = nft.companies(3);
        assertEq(name, "");
        assertEq(cap, 0);
    }

    function test_fullDatasetAllChunkBoundariesAndMintMetadata() public {
        bytes memory table = vm.parseBytes(vm.readFile("data/tickers.hex"));
        CompanyInput[] memory rows = abi.decode(vm.parseJson(vm.readFile("data/tickers.json")), (CompanyInput[]));
        nft = new TickerDrop(IERC20(address(token)), payable(address(this)), table);
        for (uint256 offset; offset < rows.length; offset += 64) {
            uint256 count = rows.length - offset;
            if (count > 64) count = 64;
            string[] memory names = new string[](count);
            uint128[] memory caps = new uint128[](count);
            for (uint256 i; i < count; ++i) {
                names[i] = rows[offset + i].n;
                caps[i] = uint128(rows[offset + i].cap);
            }
            nft.setCompanyChunk(_pack(names, caps));
        }
        assertEq(nft.metadataCount(), 3172);
        for (uint256 i; i < rows.length; ++i) {
            (string memory name, uint128 cap) = nft.companies(i + 1);
            assertEq(name, rows[i].n);
            assertEq(cap, rows[i].cap);
        }
        token.transfer(address(nft), nft.supply() * nft.DROP());
        token.liquidityVault().configure(address(nft), new MockLiquidityRouter());
        token.approve(address(nft), nft.supply() * nft.INVITE_REWARD());
        nft.fundReferral(nft.supply() * nft.INVITE_REWARD());
        nft.openMint();
        address buyer = address(456);
        vm.deal(buyer, 1 ether);
        uint256[] memory ids = new uint256[](1);
        ids[0] = 3172;
        bytes5 root;
        vm.prank(buyer);
        nft.mint{value: 0.001 ether}(ids, root);
        assertGt(bytes(nft.tokenURI(3172)).length, 100);
        vm.expectRevert();
        nft.setCompany(3172, "Changed", 1);
    }

    function test_alignedSparseMetadataCannotOverlapChunk() public {
        bytes memory table;
        for (uint256 i; i < 128; ++i) {
            table = bytes.concat(table, hex"4141410000");
        }
        nft = new TickerDrop(IERC20(address(token)), payable(address(this)), table);
        string[] memory names = new string[](64);
        uint128[] memory caps = new uint128[](64);
        for (uint256 i; i < 64; ++i) {
            nft.setCompany(65 + i, "Existing", 1);
            names[i] = "Packed";
        }
        bytes memory data = _pack(names, caps);
        vm.expectRevert(abi.encodeWithSelector(TickerDrop.BadId.selector, 65));
        nft.setCompanyChunk(data);
        assertEq(nft.metadataCount(), 64);
    }

    function test_packedInitializationCostsLessThanStorage() public {
        bytes memory table;
        for (uint256 i; i < 64; ++i) {
            table = bytes.concat(table, hex"4141410000");
        }
        nft = new TickerDrop(IERC20(address(token)), payable(address(this)), table);
        TickerDrop oldStyle = new TickerDrop(IERC20(address(token)), payable(address(this)), table);
        string[] memory names = new string[](64);
        uint128[] memory caps = new uint128[](64);
        for (uint256 i; i < 64; ++i) {
            names[i] = "A sufficiently long company name for multiple storage slots";
            caps[i] = 1000;
        }
        bytes memory data = _pack(names, caps);
        uint256 before = gasleft();
        nft.setCompanyChunk(data);
        uint256 packedGas = before - gasleft();
        uint256 storageGas;
        for (uint256 offset; offset < 64; offset += 32) {
            uint256[] memory ids = new uint256[](32);
            string[] memory ns = new string[](32);
            uint128[] memory cs = new uint128[](32);
            for (uint256 i; i < 32; ++i) {
                ids[i] = offset + i + 1;
                ns[i] = names[offset + i];
                cs[i] = caps[offset + i];
            }
            before = gasleft();
            oldStyle.setCompanies(ids, ns, cs);
            storageGas += before - gasleft();
        }
        assertLt(packedGas, storageGas * 60 / 100);
    }

    function testFuzz_controlCharacterAnywhereRejected(uint8 position, uint8 value) public {
        bytes memory name = new bytes(160);
        for (uint256 i; i < name.length; ++i) {
            name[i] = "A";
        }
        name[uint256(position) % 160] = bytes1(value % 32);
        string[] memory names = new string[](2);
        uint128[] memory caps = new uint128[](2);
        names[0] = string(name);
        names[1] = "Beta";
        bytes memory data = _pack(names, caps);
        vm.expectRevert(bytes("Control character"));
        nft.setCompanyChunk(data);
        assertEq(nft.metadataCount(), 0);
    }

    receive() external payable {}
}
