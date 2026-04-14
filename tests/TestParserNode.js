const fs = require('fs');
const path = require('path');

// Load VifParser.js content and extract the class
const parserCode = fs.readFileSync(path.join(__dirname, '../src/VifParser.js'), 'utf8');
const VifParser = new Function(parserCode + "; return VifParser;")();

const testFilePath = path.join(__dirname, 'BLs.txt');

if (!fs.existsSync(testFilePath))
{
	console.error('Error: BLs.txt not found in the root directory.');
	process.exit(1);
}

try
{
	// Read using latin1 as an approximation of windows-1252 (cp1252)
	const input = fs.readFileSync(testFilePath, 'latin1');
	
	console.log('--- Testing VifParser with Node.js ---');
	const parser = VifParser.parseBL(input);

	console.log('\n--- BL Rows ---');
	console.table(parser.getBlRows());

	console.log('\n--- Item Rows ---');
	console.table(parser.getItemRows());

	console.log('\nSuccess!');
}
catch (err)
{
	console.error('\nParsing Failed:');
	console.error(err.message);
	if (err.stack)
	{
		console.error(err.stack);
	}
	process.exit(1);
}
