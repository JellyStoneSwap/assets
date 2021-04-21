const axios = require('axios');
const { ethers } = require('ethers');
const fs = require('fs');

const multicall = require('../abi/Multicall.json');
const erc20 = require('../abi/ERC20.json');

const rpcProviderUrl = process.env.RPC_PROVIDER_URL || 'https://bsc-dataseed.binance.org/';

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

	const localAssetDirFiles = await fs.readdirSync('assets');
	const localAssets = localAssetDirFiles
		.filter(assetFile => assetFile !== 'index.json')
		.map(assetFile => assetFile.split('.png')[0]);

	const trustwalletListUrl
		= 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/allowlist.json';
	const trustwalletListResponse = await axios.get(trustwalletListUrl);
	const trustwalletList = trustwalletListResponse.data;

	const assets = {
		local: localAssets,
		trustwallet: trustwalletList,
	}

	return {
		metadataOverwrite,
		assets,
	};
}

async function getMetadata(tokens, overwrite) {
	const bsc = await getNetworkMetadata('bsc', tokens.bsc, overwrite.bsc);

	return {
		bsc,
	};
}

async function getNetworkMetadata(network, tokens, overwrite) {
	const providers = {
		bsc: new ethers.providers.JsonRpcProvider(rpcProviderUrl),
	};

	const multicallContract = {
		bsc: '0x7B23A56572cBC04035da7852a5427066EC2C2040',
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
	for (const address in metadata.bsc) {
		const chainId = 56;
		const token = metadata.bsc[address];
		const { decimals, symbol, name } = token;
		tokens.push({
			address,
			chainId,
			name,
			symbol,
			decimals,
			logoURI: getLogoURI(data.assets, address),
		});
	}
	return tokens;
}

function getLogoURI(assets, address) {
	address = getMainnetAddress(address);
	if (address === 'ether') {
		return 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/info/logo.png'
	}
	if (assets.local.includes(address.toLowerCase())) {
		return `https://raw.githubusercontent.com/yogi-fi/yogi-assets/master/assets/${address.toLowerCase()}.png`
	}
	if (assets.trustwallet.includes(address)) {
		return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/assets/${address}/logo.png`;
	}
	return undefined;
}

function getMainnetAddress(address) {
	// FIXME: not needed
	const map = {};
	return map[address] || address;
}

run();
