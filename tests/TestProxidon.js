const fs = require('fs');
const path = require('path');

// Load VifParser.js content and extract the class
const parserCode = fs.readFileSync(path.join(__dirname, '../src/VifParser.js'), 'utf8');
const VifParser = new Function(parserCode + "; return VifParser;")();

// Mock VIF input with a Proxidon item in the LOT column and FSE/CNES items
const mockInput = `Rappel de la s
Client : \t12345 Test Client
Date livr.\tn° BL\tUnité\tArticle\tLibellé\tLot\tKg Net\tKg Brut
01/01/26\t99999\tCT\t100009\tnormal item 1\tproxidon123\t10\t10,00
\t\tCT\t200003\tnormal item 2\tNORMAL_LOT\t5\t5,00
\t\tCT\t300009\tnormal item 3\tproxidon456\t2\t2,00

`;

const mockPlanningMap = {
	'01/01/26': 260111
};

try
{
	console.log('--- Running Proxidon/FSE/CNES Calculation Test ---');
	const parser = VifParser.parseBL(mockInput, mockPlanningMap);
	const blRows = parser.getBlRows();

	// Index 0 is header, index 1 is our mock BL
	const blRow = blRows[1];
	const planningTick = blRow[2]; // Planning Tick is at index 2
	const cntProxidon = blRow[14]; // Nb Proxidon is at index 14
	const cntFSE = blRow[13]; // Nb FSE+ is at index 13
	const cntCNES = blRow[12]; // Nb CNES is at index 12

	console.log('BL Row:', blRow);
	console.log('Detected Planning Tick:', planningTick);
	console.log('Detected Proxidon Count:', cntProxidon);
	console.log('Detected FSE Count:', cntFSE);
	console.log('Detected CNES Count:', cntCNES);

	let allPassed = true;

	if (planningTick === 260111)
	{
		console.log('\x1b[32mSUCCESS: Correctly assigned Planning Tick.\x1b[0m');
	}
	else
	{
		console.error(`\x1b[31mFAILURE: Expected Planning Tick 260111, but found ${planningTick}.\x1b[0m`);
		allPassed = false;
	}

	if (cntProxidon === 2)
	{
		console.log('\x1b[32mSUCCESS: Correctly detected 2 Proxidon items.\x1b[0m');
	}
	else
	{
		console.error(`\x1b[31mFAILURE: Expected 2 Proxidon items, but found ${cntProxidon}.\x1b[0m`);
		allPassed = false;
	}

	if (cntFSE === 2)
	{
		console.log('\x1b[32mSUCCESS: Correctly detected 2 FSE+ items.\x1b[0m');
	}
	else
	{
		console.error(`\x1b[31mFAILURE: Expected 2 FSE+ items, but found ${cntFSE}.\x1b[0m`);
		allPassed = false;
	}

	if (cntCNES === 1)
	{
		console.log('\x1b[32mSUCCESS: Correctly detected 1 CNES item.\x1b[0m');
	}
	else
	{
		console.error(`\x1b[31mFAILURE: Expected 1 CNES item, but found ${cntCNES}.\x1b[0m`);
		allPassed = false;
	}

	if (!allPassed)
	{
		process.exit(1);
	}
}
catch (err)
{
	console.error('\x1b[31mTest Failed with Error:\x1b[0m');
	console.error(err.message);
	process.exit(1);
}
