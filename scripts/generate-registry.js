const axios = require('axios');
const { ethers } = require('ethers');

const fs = require('fs');

const multicall = require('../abi/Multicall.json');
const erc20 = require('../abi/ERC20.json');

const DEFAULT_PRECISION = 3;

const DEFAULT_LISTED = {
  bsc: {
    bnb: {
      address: 'native',
      name: 'BNB',
      symbol: 'BNB',
      decimals: 18,
      precision: 3,
      hasIcon: true,
      logoUrl: getLogoUrl(56, null, 'native'),
    },
  },

  polygon: {
    matic: {
      address: 'native',
      name: 'MATIC',
      symbol: 'MATIC',
      decimals: 18,
      precision: 3,
      hasIcon: true,
      logoUrl: getLogoUrl(137, null, 'native'),
    },
  }
}

const CHAIN_IDS = {
  bsc: 56,
  polygon: 137
};

async function run() {
  try {
    const lists = await getLists();
    const data = await getData();
    verifyInputs(lists);
    const tokens = mergeTokenLists(lists);
    const metadata = await getMetadata(tokens, data.metadataOverwrite);
    await generate(lists, data, metadata);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}

async function generate(lists, data, metadata) {
  await generateNetwork('bsc', lists, data, metadata);
  await generateNetwork('polygon', lists, data, metadata);
}

async function generateNetwork(network, lists, data, metadata) { 
  const untrusted = lists.untrusted[network];
  const listedTokens = DEFAULT_LISTED[network];
  for (const address of lists.listed[network]) {
    listedTokens[address] = {
      address,
      name: metadata[network][address].name,
      symbol: metadata[network][address].symbol,
      decimals: metadata[network][address].decimals,
      precision: data.precision[network][address] || DEFAULT_PRECISION,
      hasIcon: true,
      logoUrl: getLogoUrl(CHAIN_IDS[network], address),
    };
  }
  const uiTokens = {};
  for (const address of Object.keys(lists.eligible[network])) {
    const color = getColor(address, data);
    uiTokens[address] = {
      address,
      id: data.coingecko[network][address] || '',
      name: metadata[network][address].name,
      symbol: metadata[network][address].symbol,
      decimals: metadata[network][address].decimals,
      precision: data.precision[network][address] || DEFAULT_PRECISION,
      color: data.color[network][address] || color,
      hasIcon: true,
      logoUrl: getLogoUrl(CHAIN_IDS[network], address),
    };
  }
  for (const address of lists.ui[network]) {
    const color = getColor(address, data);
    uiTokens[address] = {
      address,
      id: data.coingecko[network][address] || '',
      name: metadata[network][address].name,
      symbol: metadata[network][address].symbol,
      decimals: metadata[network][address].decimals,
      precision: data.precision[network][address] || DEFAULT_PRECISION,
      color: data.color[network][address] || color,
      hasIcon: true,
      logoUrl: getLogoUrl(CHAIN_IDS[network], address),
    };
  }
  const dexData = {
    tokens: listedTokens,
    untrusted,
  };
  const pmData = {
    tokens: uiTokens,
    untrusted,
  };
  const dexFileName = `generated/dex/registry.${network}.json`;
  await fs.writeFileSync(dexFileName, JSON.stringify(dexData, null, 4));
  const pmFileName = `generated/pm/registry.${network}.json`;
  await fs.writeFileSync(pmFileName, JSON.stringify(pmData, null, 2));
}

async function getLists() {
  const eligibleFile = await fs.readFileSync('lists/eligible.json');
  const eligible = JSON.parse(eligibleFile);
  const listedFile = await fs.readFileSync('lists/listed.json');
  const listed = JSON.parse(listedFile);
  const uiFile = await fs.readFileSync('lists/ui-not-eligible.json');
  const ui = JSON.parse(uiFile);
  const untrustedFile = await fs.readFileSync('lists/untrusted.json');
  const untrusted = JSON.parse(untrustedFile);
  return {
    eligible,
    listed,
    ui,
    untrusted,
  };
}

async function getData() {
  const coingeckoFile = await fs.readFileSync('data/coingecko.json');
  const coingecko = JSON.parse(coingeckoFile);
  const colorFile = await fs.readFileSync('data/color.json');
  const color = JSON.parse(colorFile);
  const metadataOverwriteFile = await fs.readFileSync('data/metadataOverwrite.json');
  const metadataOverwrite = JSON.parse(metadataOverwriteFile);
  const precisionFile = await fs.readFileSync('data/precision.json');
  const precision = JSON.parse(precisionFile);
  
  return {
    coingecko,
    color,
    precision,
    metadataOverwrite
  };
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
    bsc: '0x7B23A56572cBC04035da7852a5427066EC2C2040',
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

function getColor(address, data) {
  let sum = 0;
  for (const char of address) {
    if (char === 'x') {
      continue;
    }
    const charValue = parseInt(char, 16);
    sum += charValue;
  }
  const colorList = data.color.list;
  return colorList[sum % colorList.length];
}

function getLogoUrl(chainId, address) {
  if (address === 'native') {
    return `https://raw.githubusercontent.com/yogi-fi/yogi-assets/master/assets/${chainId}/native.png`;
  }
  return `https://raw.githubusercontent.com/yogi-fi/yogi-assets/master/assets/${chainId}/${address}.png`;
}

function mergeTokenLists(lists) {
  const bsc = [];
  const polygon = [];
  
  for (const datasetName in lists) {
    if (datasetName === 'untrusted') {
      continue;
    }
    
    const dataset = lists[datasetName];
    
    let dataset_bsc = [];
    if (dataset.bsc instanceof Array) {
      dataset_bsc = dataset.bsc;
    } else {
      dataset_bsc = Object.keys(dataset.bsc);
    }

    let dataset_polygon = [];
    if (dataset.polygon instanceof Array) {
      dataset_polygon = dataset.polygon;
    } else {
      dataset_polygon = Object.keys(dataset.polygon);
    }
    
    for (const token of dataset_bsc) {
      bsc.push(token);
    }

    for (const token of dataset_polygon) {
      polygon.push(token);
    }
  }
  
  return { bsc, polygon };
}

function verifyInputs(lists) {
  verifyNetworkInputs(lists, 'bsc');
  verifyNetworkInputs(lists, 'polygon');
}

function verifyNetworkInputs(lists, network) {
  // Check that addresses are checksummed
  verifyAddressesChecksummed(Object.keys(lists.eligible[network]));
  verifyAddressesChecksummed(lists.listed[network]);
  verifyAddressesChecksummed(lists.ui[network]);
  verifyAddressesChecksummed(lists.untrusted[network]);
  // Check that lists don't have duplicates
  verifyNoDuplicates(Object.keys(lists.eligible[network]), lists.ui[network]);
  verifyNoDuplicates(lists.ui[network], lists.untrusted[network]);
  verifyNoDuplicates(lists.listed[network], lists.untrusted[network]);
}

function verifyAddressesChecksummed(tokens) {
  for (const address of tokens) {
    const checksummedAddress = ethers.utils.getAddress(address);
    if (address !== checksummedAddress) {
      const error = `Address not checksummed: ${address} (should be ${checksummedAddress})`;
      throw error;
    }
  }
}

function verifyNoDuplicates(listA, listB) {
  for (const address of listA) {
    if (listB.includes(address)) {
      console.warn(`Duplicate address: ${address}`);
    }
  }
}

run();
