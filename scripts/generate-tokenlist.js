const axios = require('axios');
const { ethers } = require('ethers');
const fs = require('fs');

const multicall = require('../abi/Multicall.json');
const erc20 = require('../abi/ERC20.json');

async function run() {
  try {
    const data = await getData();
    
    const listedFile = await fs.readFileSync('lists/listed.json');
    const listed = JSON.parse(listedFile);
    const listedMetadata = await getMetadata(listed, data.metadataOverwrite);
    const listedTokens = getTokens(data, listedMetadata);
    
    const eligibleFile = await fs.readFileSync('lists/eligible.json');
    const uiFile = await fs.readFileSync('lists/ui-not-eligible.json');
    const eligible = JSON.parse(eligibleFile);
    const ui = JSON.parse(uiFile);
    
    const vetted = {
      bsc: [...Object.keys(eligible.bsc), ...ui.bsc],
      polygon: [...Object.keys(eligible.polygon), ...ui.polygon],
    };
    const vettedMetadata = await getMetadata(vetted, data.metadataOverwrite);
    const vettedTokens = getTokens(data, vettedMetadata);
    
    await generate('listed', listedTokens);
    await generate('vetted', vettedTokens);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}

async function generate(name, tokens) {
  const nowTimestamp = Date.now();
  const dayTimestamp = nowTimestamp - (nowTimestamp % (24 * 60 * 60 * 1000));
  const date = new Date(dayTimestamp);
  const timestamp = date.toISOString();
  const list = {
    name: 'yogi',
    timestamp,
    logoURI: 'https://raw.githubusercontent.com/yogi-fi/yogi-assets/master/logos/logo512.png',
    keywords: [
      'yogi',
      name,
    ],
    version: {
      major: 1,
      minor: 0,
      patch: 0,
    },
    tokens,
  };
  const listFileName = `generated/${name}.tokenlist.json`;
  await fs.writeFileSync(listFileName, JSON.stringify(list, null, 4));
}

async function getData() {
  const metadataOverwriteFile = await fs.readFileSync('data/metadataOverwrite.json');
  const metadataOverwrite = JSON.parse(metadataOverwriteFile);
  
  return { metadataOverwrite };
}

async function getMetadata(tokens, overwrite) {
  const bsc = await getNetworkMetadata('bsc', tokens.bsc, overwrite.bsc);
  const polygon = await getNetworkMetadata('polygon', tokens.polygon, overwrite.polygon);
  
  return { bsc, polygon };
}

async function getNetworkMetadata(network, tokens, overwrite) {
  const providers = {
    bsc: new ethers.providers.JsonRpcProvider('https://bsc-dataseed.binance.org/'),
    polygon: new ethers.providers.JsonRpcProvider('https://rpc-mainnet.maticvigil.com/')
  };
  
  const multicallContract = {
    bsc: '0x88a85d5B9358DAb64D1Ca6d49A0BBF8fC621A8F8',
    polygon: '0x7B23A56572cBC04035da7852a5427066EC2C2040',
  };
  
  const provider = providers[network];
  const multicallAddress = multicallContract[network];
  
  const multi = new ethers.Contract(multicallAddress, multicall.abi, provider);
  const calls = [];
  const erc20Contract = new ethers.utils.Interface(erc20.abi);
  tokens.forEach(token => {
    calls.push([token, erc20Contract.encodeFunctionData('decimals', [])]);
    calls.push([token, erc20Contract.encodeFunctionData('symbol', [])]);
    calls.push([token, erc20Contract.encodeFunctionData('name', [])]);
  });
  const tokenMetadata = {};
  const [, response] = await multi.aggregate(calls);
  for (let i = 0; i < tokens.length; i++) {
    const address = tokens[i];
    if (address in overwrite) {
      tokenMetadata[address] = overwrite[address];
      continue;
    }
    const [decimals] = erc20Contract.decodeFunctionResult('decimals', response[3 * i]);
    const [symbol] = erc20Contract.decodeFunctionResult('symbol', response[3 * i + 1]);
    const [name] = erc20Contract.decodeFunctionResult('name', response[3 * i + 2]);
    tokenMetadata[tokens[i]] = {
      decimals,
      symbol,
      name
    };
  }
  return tokenMetadata;
}

function getTokens(data, metadata) {
  const tokens = [];

  const CHAIN_IDS = {
    bsc: 56,
    polygon: 137
  };
  
  for (const chain in metadata) {
    for (const address in metadata[chain]) {
      const chainId = CHAIN_IDS[chain];
      const token = metadata[chain][address];
      const { decimals, symbol, name } = token;
      tokens.push({
        address,
        chainId,
        name,
        symbol,
        decimals,
        logoURI: getLogoUrl(chainId, address),
      });
    }
  }

  return tokens;
}

function getLogoUrl(chainId, address) {
  if (address === 'native') {
    return `https://raw.githubusercontent.com/yogi-fi/yogi-assets/master/assets/${chainId}/native.png`;
  }
  return `https://raw.githubusercontent.com/yogi-fi/yogi-assets/master/assets/${chainId}/${address}.png`;
}

run();
