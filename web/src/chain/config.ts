import { defineChain, parseAbi, type Address } from "viem";
import deployed from "./deployed.json";

const NETS: Record<number, { name: string; rpc: string; explorer: string }> = {
  4663: { name: "Robinhood Chain", rpc: "https://rpc.mainnet.chain.robinhood.com", explorer: "https://robinhoodchain.blockscout.com" },
  46630: { name: "Robinhood Chain Testnet", rpc: "https://rpc.testnet.chain.robinhood.com", explorer: "https://explorer.testnet.chain.robinhood.com" },
  31337: { name: "Anvil", rpc: "http://127.0.0.1:8545", explorer: "" },
};

const net = NETS[deployed.chainId] ?? NETS[4663];

export const chain = defineChain({
  id: deployed.chainId,
  name: net.name,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [net.rpc] } },
  blockExplorers: net.explorer ? { default: { name: "Blockscout", url: net.explorer } } : undefined,
});

export const explorer = net.explorer;

export const addr = {
  tickr: deployed.tickr as Address,
  pool: deployed.pool as Address,
  drop: deployed.drop as Address,
  lp: "0x175d6A654568009273Fd08f1a29BE998b8BCB0dd" as Address,
};

export const live = !/^0x0{40}$/i.test(addr.drop);

export const SUPPLY = 3172;
export const TOP = 100;
export const TOP_PRICE = 5_000_000_000_000_000n;
export const PRICE = 1_000_000_000_000_000n;
export const DROP = 100_000;

export const dropAbi = parseAbi([
  "function phase() view returns (uint8)",
  "function minted() view returns (uint256)",
  "function mintedBits() view returns (uint256[])",
  "function freeMint(address) view returns (bool)",
  "function tokensOf(address) view returns (uint256[])",
  "function book() view returns (uint256[] ids, address[] sellers, uint256[] prices)",
  "function mint(uint256[] ids) payable",
  "function list(uint256 id, uint96 amount)",
  "function unlist(uint256 id)",
  "function buy(uint256 id) payable",
]);

export const poolAbi = parseAbi([
  "function pot() view returns (uint256 eth, uint256 tkn)",
  "function roundCount() view returns (uint256)",
  "function rounds(uint256) view returns (uint32 day, uint16 gainers, uint16 paid, uint32 weight, uint64 blockNo, uint128 eth, uint128 tkn)",
  "function credit(address) view returns (uint256)",
  "function lastDay() view returns (uint32)",
  "function claim()",
  "event Paid(uint32 indexed day, uint256 indexed id, address indexed holder, uint256 gain, uint256 eth, uint256 tkn)",
]);

export const tickrAbi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function liveAt() view returns (uint64)",
]);
