import { createContext, useContext, useState, type ReactNode } from "react";

const zh = {
  nav: { engine: "引擎", cutoff: "截断", mint: "铸造", book: "交易簿", vault: "金库" },
  connect: "连接钱包",
  wrongChain: "切换网络",
  offline: "合约未上线",

  hero: {
    kicker: "NASDAQ × ROBINHOOD CHAIN",
    line1: "3172 只纳斯达克股票，3172 张卡。",
    line2: "每个交易日收盘，涨幅榜决定 3% 手续费归谁。",
    stats: [
      ["3172", "张卡，编号即市值排名"],
      ["3%", "Tickr 与 NFT 每笔成交"],
      ["16:00", "美东收盘，链上结算"],
      ["100%", "累计涨幅封顶即止"],
    ],
    die: "DIE MAP · 每格一只股票 · #1 NVDA 起",
    cta: "看机制",
  },

  engine: {
    title: "费用引擎",
    lead: "两条交易流，一个池子，一个结算时刻。",
    tickr: "TICKR 买 / 卖",
    nft: "NFT 成交",
    inTkn: "3% · TICKR",
    inEth: "3% · ETH",
    clock: "美东 16:00",
    board: "当日涨幅榜",
    holder: "持卡人",
    hold: "≥ 1 TICKR",
    roll: "滚存至下一交易日",
    mintEth: "MINT ETH",
    lp: "流动性地址",
    drop: "+100,000 TICKR / 张",
    points: [
      ["双资产", "Tickr 手续费以 Tickr 派发，NFT 手续费以 ETH 派发。同一张卡，两份收入。"],
      ["零裁量", "排序、截断、比例、资格、滚存全部写死在合约里，结算交易无法改写规则。"],
      ["起点", "Tickr 开放交易之后的第一个收盘开始计入。周末与休市日不结算。"],
    ],
  },

  supply: {
    title: "TICKR",
    total: "总量 1,000,000,000 · 全流通 · 无增发函数",
    drop: "铸造派发",
    lp: "流动性",
    tax: "交易对买卖 3%",
  },

  cutoff: {
    title: "截断模型",
    lead: "按当日涨幅从高到低累加，加到 100% 即停。每只股票拿走与自身涨幅等量的池子份额。",
    tabs: ["Σ 涨幅 > 100%", "Σ 涨幅 < 100%", "无正涨幅", "随机交易日"],
    gain: "当日涨幅",
    cum: "累计权重",
    share: "池子份额",
    out: "出局",
    clip: "截断",
    capAt: (s: string, x: string, k: number) => `累计在 ${s} 处触顶：${s} 只取余量 ${x}，其后 ${k} 只正涨幅股票不计。`,
    under: (sum: string) => `全部正涨幅合计 ${sum}，不足 100%：这几只按涨幅占比瓜分整个池子。`,
    none: "当日没有一只股票收涨：不分发，整池滚入下一交易日。",
    rules: [
      ["资格", "持有该股票对应的卡，且钱包内 ≥ 1 TICKR。结算时刻校验。"],
      ["排序", "当日涨幅降序；同涨幅按编号升序。"],
      ["截断", "累计权重达到 100% 立即停止，跨线的那一只取余量。"],
      ["比例", "全部正涨幅不足 100% 时，按各自涨幅占比分配全池。"],
      ["排除", "0% 与负涨幅不参与任何分配。"],
      ["滚存", "未铸造、持有人不足 1 TICKR 的份额，以及无正涨幅的交易日，全部滚入下一次结算。"],
    ],
  },

  mint: {
    title: "铸造",
    lead: "一只股票，一张卡，只属于一个钱包。",
    tiers: [
      ["#1 – #100", "0.005 ETH", "纳斯达克市值前 100"],
      ["#101 – #3172", "0.001 ETH", "其余全部"],
      ["每张", "+100,000", "TICKR 随铸造到账"],
    ],
    route: "铸造所付 ETH 由合约直接转入流动性地址",
    wl: "白名单铸造 0 ETH",
    search: "搜索代码 / 公司",
    filters: ["全部", "前 100", "可铸造", "已铸造"],
    picked: "已选",
    total: "合计",
    clear: "清空",
    go: "铸造",
    max: "单笔最多 100 张",
    phase: ["未开放", "进行中", "已结束"],
    minted: "已铸造",
    you: "你的",
  },

  book: {
    title: "交易簿",
    lead: "合约内置撮合，每笔成交 3% 进入池子。卡片一旦转移，挂单自动作废。",
    cols: ["编号", "代码", "价格", "卖家", ""],
    buy: "买入",
    empty: "暂无挂单",
    mine: "我的卡",
    none: "钱包里还没有卡",
    price: "价格 ETH",
    list: "挂单",
    unlist: "撤单",
    yours: "你的挂单",
  },

  vault: {
    title: "金库",
    potEth: "池内 ETH",
    potTkn: "池内 TICKR",
    rounds: "已结算交易日",
    cols: ["日期", "正涨幅入选", "实际派发", "权重", "ETH", "TICKR"],
    empty: "首个结算尚未发生",
    me: "我的",
    cards: "持卡",
    bal: "TICKR 余额",
    ok: "具备分红资格",
    no: "不具备资格",
    credit: "待领 ETH",
    claim: "领取",
    winners: "获配",
    connect: "连接钱包查看你的卡与分红",
  },

  foot: { contracts: "合约", chain: "网络", source: "源码" },
};

type Dict = typeof zh;

const en: Dict = {
  nav: { engine: "Engine", cutoff: "Cutoff", mint: "Mint", book: "Book", vault: "Vault" },
  connect: "Connect",
  wrongChain: "Switch network",
  offline: "Contracts offline",

  hero: {
    kicker: "NASDAQ × ROBINHOOD CHAIN",
    line1: "3,172 Nasdaq listings. 3,172 cards.",
    line2: "Every close, the gainers board decides who takes the 3%.",
    stats: [
      ["3172", "cards, id = market cap rank"],
      ["3%", "on every Tickr and NFT trade"],
      ["16:00", "New York close, settled on-chain"],
      ["100%", "cumulative gain cap"],
    ],
    die: "DIE MAP · ONE CELL PER LISTING · #1 NVDA FIRST",
    cta: "See the engine",
  },

  engine: {
    title: "Fee engine",
    lead: "Two trade streams. One pool. One settlement clock.",
    tickr: "TICKR BUY / SELL",
    nft: "NFT SALE",
    inTkn: "3% · TICKR",
    inEth: "3% · ETH",
    clock: "16:00 NY",
    board: "Today's gainers",
    holder: "Holder",
    hold: "≥ 1 TICKR",
    roll: "Rolls to next session",
    mintEth: "MINT ETH",
    lp: "Liquidity address",
    drop: "+100,000 TICKR / card",
    points: [
      ["Two assets", "Tickr fees pay out in Tickr, NFT fees in ETH. One card, two income streams."],
      ["No discretion", "Ordering, cutoff, pro rata, eligibility and rollover live in the contract. A settlement call can't bend them."],
      ["Start", "Counting begins at the first close after Tickr opens for trading. Weekends and market holidays are skipped."],
    ],
  },

  supply: {
    title: "TICKR",
    total: "1,000,000,000 supply · fully circulating · no mint function",
    drop: "Mint drop",
    lp: "Liquidity",
    tax: "3% on pair buys and sells",
  },

  cutoff: {
    title: "The cutoff",
    lead: "Stack the day's gainers from the top. Stop at 100%. Each takes a slice of the pool equal to its own gain.",
    tabs: ["Σ gain > 100%", "Σ gain < 100%", "No gainers", "Random session"],
    gain: "Day gain",
    cum: "Cumulative weight",
    share: "Pool share",
    out: "out",
    clip: "clipped",
    capAt: (s: string, x: string, k: number) => `Cap hit at ${s}: it takes the remaining ${x}. The ${k} gainers below it get nothing.`,
    under: (sum: string) => `All positive movers add up to ${sum}, under 100%: they split the entire pool pro rata.`,
    none: "Nothing closed green. No payout. The whole pool rolls into the next session.",
    rules: [
      ["Eligibility", "Hold the card for that listing and ≥ 1 TICKR in the same wallet, checked at settlement."],
      ["Order", "Day gain, descending. Ties go to the lower id."],
      ["Cutoff", "Stop the moment cumulative weight reaches 100%. The one that crosses takes the remainder."],
      ["Pro rata", "If every positive gain together is under 100%, they split the whole pool by gain."],
      ["Excluded", "Flat and red closes get nothing."],
      ["Rollover", "Unminted slots, holders under 1 TICKR, and sessions with no gainers all roll into the next settlement."],
    ],
  },

  mint: {
    title: "Mint",
    lead: "One listing, one card, one wallet.",
    tiers: [
      ["#1 – #100", "0.005 ETH", "Nasdaq top 100 by market cap"],
      ["#101 – #3172", "0.001 ETH", "Everything else"],
      ["Each", "+100,000", "TICKR lands with the card"],
    ],
    route: "Mint ETH is forwarded by the contract straight to the liquidity address",
    wl: "Whitelist mints at 0 ETH",
    search: "Search ticker / company",
    filters: ["All", "Top 100", "Available", "Minted"],
    picked: "Picked",
    total: "Total",
    clear: "Clear",
    go: "Mint",
    max: "Max 100 per tx",
    phase: ["Not open", "Live", "Closed"],
    minted: "Minted",
    you: "Yours",
  },

  book: {
    title: "Order book",
    lead: "Matching is built into the contract. 3% of every fill goes to the pool. Asks die the moment a card moves.",
    cols: ["Id", "Ticker", "Price", "Seller", ""],
    buy: "Buy",
    empty: "No asks",
    mine: "My cards",
    none: "No cards in this wallet",
    price: "Price ETH",
    list: "List",
    unlist: "Cancel",
    yours: "Your ask",
  },

  vault: {
    title: "Vault",
    potEth: "ETH in pool",
    potTkn: "TICKR in pool",
    rounds: "Sessions settled",
    cols: ["Date", "Gainers in", "Paid", "Weight", "ETH", "TICKR"],
    empty: "No session settled yet",
    me: "You",
    cards: "Cards",
    bal: "TICKR balance",
    ok: "Eligible",
    no: "Not eligible",
    credit: "ETH to claim",
    claim: "Claim",
    winners: "Paid",
    connect: "Connect to see your cards and payouts",
  },

  foot: { contracts: "Contracts", chain: "Network", source: "Source" },
};

type Lang = "zh" | "en";
const Ctx = createContext<{ t: Dict; lang: Lang; setLang(l: Lang): void }>(null!);

const initial = (): Lang => {
  const saved = localStorage.getItem("lang");
  if (saved === "zh" || saved === "en") return saved;
  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
};

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, set] = useState<Lang>(initial);
  const setLang = (l: Lang) => {
    localStorage.setItem("lang", l);
    document.documentElement.lang = l === "zh" ? "zh-CN" : "en";
    set(l);
  };
  return <Ctx.Provider value={{ t: lang === "zh" ? zh : en, lang, setLang }}>{children}</Ctx.Provider>;
}

export const useT = () => useContext(Ctx);
