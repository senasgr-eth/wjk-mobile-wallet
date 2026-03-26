/**
 * Wojakcoin (WJK) network parameters
 * From wojakcore chainparams.cpp
 */

export const WOJAKCOIN = {
  ticker: "WJK",
  name: "Wojakcoin",
  decimals: 8,
  unitsPerCoin: 100_000_000,
  mainnet: {
    pubKeyHash: 0x49,
    scriptHash: 0x05,
    wif: 0xc9,
    bech32: null,
    rpcPort: 20760,
    p2pPort: 20759,
    txVersion: 1,
    addressTypes: ["legacy"],
  },
  apiProxyUrl: "https://wojakcoin.cash/wallet",
  electrsUrl: "https://api.wojakcoin.cash",
  explorerUrl: "https://explorer.wojakcoin.cash",
};
