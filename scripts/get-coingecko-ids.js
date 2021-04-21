const axios = require('axios');

const fs = require('fs');

const coingeckoClient = axios.create({
	baseURL: 'https://api.coingecko.com/api/v3',
});

async function run() {
	try {
		const lists = await getLists();
		const data = await getData();
		const tokens = mergeTokenLists(lists);
		const ids = await getMissingIds(tokens, data.coingecko);
	} catch(e) {
		console.error(e);
		process.exit(1);
	}
}

async function getMissingIds(tokens, coingecko) {
	const bsc = await getMissingNetworkIds(tokens.bsc, coingecko.bsc);

	return {
		bsc,
	};
}

async function getMissingNetworkIds(tokens, coingecko) {
	return;
	
	// FIXME: uncomment this once coingecko adds support for BSC.
	// https://www.coingecko.com/api/documentations/v3#/contract/get_coins__id__contract__contract_address_
	//
	// for (const token of tokens) {
	// 	const coingeckoId = coingecko[token];
	//	
	// 	if (!coingeckoId) { continue; }
	// 		let tokenInfo
	// 		try {
	// 			// FIXME: replace ethereum with bsc identifier once/if cg adds support
	// 			tokenInfo = await coingeckoClient.get(`coins/ethereum/contract/${token}`);
	// 			console.log(token, coingeckoId, tokenInfo.data.id);
	// 		} catch(e) {
	// 			console.warn(`Coingecko ID not found for token: ${token}`);
	// 			continue;
	// 		}
	// 	}
	// }
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

	const trustwalletListUrl
		= 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/allowlist.json';
	const trustwalletListResponse = await axios.get(trustwalletListUrl);
	const trustwalletList = trustwalletListResponse.data;

	return {
		coingecko,
		color,
		precision,
		metadataOverwrite,
		trustwalletList,
	};
}

function mergeTokenLists(lists) {
	const bsc = [];

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

		for (const token of dataset_bsc) {
			bsc.push(token);
		}
	}

	return {
		bsc,
	};
}

run();
