/**
 * Performance benchmarking for VifParser.
 * Run this from the GAS editor to see timing logs.
 */
function benchmarkVifParser()
{
	const NUM_BLS = 1000;
	const ARTICLES_PER_BL = 10;
	const dummyContent = generateDummyVifContent(NUM_BLS, ARTICLES_PER_BL);

	console.log(`--- Starting Benchmark: ${NUM_BLS} BLs, ${NUM_BLS * ARTICLES_PER_BL} articles ---`);

	// 1. Benchmark Raw Parsing (Generator consumption)
	let start = new Date().getTime();
	const parsedData = VifParser.parseBL(dummyContent);
	let end = new Date().getTime();
	console.log(`parseBL time: ${end - start}ms (${parsedData.length} lines)`);

	// 2. Benchmark Statistics Generation
	start = new Date().getTime();
	const statsRows = [];
	const gid = 123456; // Dummy GID
	const result = VifParser.generateStatsRows(parsedData, gid);
	end = new Date().getTime();
	console.log(`generateStatsRows time: ${end - start}ms (${result.length} BLs)`);

	// 3. Benchmark Weekly Aggregation
	start = new Date().getTime();
	const weeklyStats = VifParser.aggregateWeeklyStats(result);
	end = new Date().getTime();
	console.log(`aggregateWeeklyStats time: ${end - start}ms (${weeklyStats.length} weeks)`);

	console.log('--- Benchmark Completed ---');
}

/**
 * Generates a dummy VIF-formatted string for testing.
 */
function generateDummyVifContent(numBLs, articlesPerBL)
{
	const lines = [];
	const baseDate = new Date(2026, 0, 1);

	for (let i = 0; i < numBLs; i++)
	{
		const blDate = new Date(baseDate);
		blDate.setDate(baseDate.getDate() + Math.floor(i / 10)); // Change date every 10 BLs
		const dateStr = Utilities.formatDate(blDate, 'GMT', 'dd/MM/yyyy');
		const blNum = 100000 + i;
		const customerID = 5000 + (i % 10);

		lines.push(`Client : ${customerID}\tSomething Else`);
		lines.push('Date livr.\tBL\tCde\tArticle\tLibellé\tLot\tKg Net\tKg Brut\tP\tCOL');

		for (let j = 0; j < articlesPerBL; j++)
		{
			const articleID = 100000 + (j % 5); // Some repeats
			const kg = (10.5 + j).toFixed(2);
			// Format: Date	BL	Cde	Article	Libellé	Lot	Kg Net	Kg Brut	P	COL
			lines.push(`${dateStr}\t${blNum}\tCDE${blNum}\t${articleID}\tArticle ${articleID}\tLOT${i}\t${kg}\t${kg}\t1\t1`);
		}
	}

	return lines.join('\n');
}
