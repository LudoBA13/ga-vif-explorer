class VifParser
{
	static get STATS_HEADERS()
	{
		return [
			'Code VIF', 'Date', 'Month', 'n° BL', 'Type BL', 'Kg Net',
			'Produits Sec', 'Produits Frais', 'Produits Surgelé',
			'Produits F&L', 'Produits FSE', 'Produits CNES',
			'Produits Proxidon', 'Lait ambiant', 'Week'
		];
	}

	static get BL_TYPES()
	{
		return ['Sec', 'Frais', 'Surgelé', 'F&L', 'Proxidon', 'Complément'];
	}

	/**
	 * Aggregates statistics into weekly summaries.
	 * @param {string[][]} statsData - The 2D array of 'VIF_BL_Stats' data (with headers).
	 * @return {string[][]} The aggregated weekly statistics with headers.
	 */
	static aggregateWeeklyStats(statsData)
	{
		if (!statsData || statsData.length <= 1)
		{
			return [];
		}

		const headers = statsData[0];
		const codeVifIdx = headers.indexOf('Code VIF');
		const weekIdx = headers.indexOf('Week');
		const dateIdx = headers.indexOf('Date');
		const monthIdx = headers.indexOf('Month');
		const typeBlIdx = headers.indexOf('Type BL');
		const kgNetIdx = headers.indexOf('Kg Net');

		if (codeVifIdx === -1 || weekIdx === -1 || typeBlIdx === -1 || kgNetIdx === -1 || dateIdx === -1)
		{
			throw new Error("Missing required columns in 'VIF_BL_Stats'.");
		}

		const weeklyStatsMap = new Map();
		const blTypes = VifParser.BL_TYPES;

		for (let i = 1; i < statsData.length; i++)
		{
			const row = statsData[i];
			const codeVif = row[codeVifIdx];
			const week = row[weekIdx];
			const date = row[dateIdx];
			const month = monthIdx !== -1 ? row[monthIdx] : VifParser._getMonthNum(date);
			const typeBl = row[typeBlIdx];
			const kgNetRaw = row[kgNetIdx];
			const kgNet = typeof kgNetRaw === 'number' ? kgNetRaw : parseFloat(String(kgNetRaw || '0').replace(',', '.')) || 0;

			const key = `${codeVif}_${week}`;
			if (!weeklyStatsMap.has(key))
			{
				const entry = {
					'Code VIF': codeVif,
					'Week': week,
					'Month': month,
					'Total Kg Net': 0
				};
				blTypes.forEach(t => {
					entry[t] = 0;
				});
				weeklyStatsMap.set(key, entry);
			}

			const entry = weeklyStatsMap.get(key);
			entry['Total Kg Net'] += kgNet;
			if (blTypes.includes(typeBl))
			{
				entry[typeBl] += kgNet;
			}
		}

		const weeklyHeaders = ['Code VIF', 'Week', 'Month', ...blTypes, 'Total Kg Net'];
		const resultRows = [weeklyHeaders];

		const sortedEntries = Array.from(weeklyStatsMap.values()).sort((a, b) => {
			const vifA = String(a['Code VIF']);
			const vifB = String(b['Code VIF']);
			if (vifA !== vifB)
			{
				return vifA.localeCompare(vifB);
			}
			return a['Week'] - b['Week'];
		});

		for (const entry of sortedEntries)
		{
			resultRows.push(weeklyHeaders.map(h => {
				return entry[h];
			}));
		}

		return resultRows;
	}

	/**
	 * Parses the raw text content from VIF export into a 1NF 2D array.
	 * @param {string} content - The raw string content of the file.
	 * @return {string[][]} A 2D array representing the parsed data with headers.
	 */
	static parseBL(content)
	{
		const result = [];
		for (const entry of VifParser._parseBLEntries(content))
		{
			result.push(entry);
		}
		return result;
	}

	/**
	 * Private generator to yield entries from the raw VIF content.
	 * @param {string} content - The raw string content of the file.
	 * @yields {string[]} A single row of the 2D array.
	 * @private
	 */
	static * _parseBLEntries(content)
	{
		const clientRegex = /Client\s*:\s*(\d+)/;
		const articleRegex = /^\d+$/;

		let currentState = {
			customerID: '',
			date: '',
			bl: '',
			cde: ''
		};

		yield [
			'Code VIF', 'Date', 'n° BL', 'n° Cde', 'Article',
			'Libellé', 'Lot', 'Kg Net', 'Kg Brut', 'P', 'COL', 'Week'
		];

		let start = 0;
		const contentLength = content.length;

		while (start < contentLength)
		{
			let end = content.indexOf('\n', start);
			if (end === -1)
			{
				end = contentLength;
			}

			let line = content.substring(start, end);
			if (line.endsWith('\r'))
			{
				line = line.substring(0, line.length - 1);
			}
			start = end + 1;

			if (line.length === 0 || line.trim().length === 0)
			{
				continue;
			}

			if (line.indexOf('Client :') !== -1)
			{
				const clientMatch = line.match(clientRegex);
				if (clientMatch)
				{
					currentState.customerID = clientMatch[1];
				}
				continue;
			}

			// Quick check: data lines MUST have tabs.
			const tabIdx = line.indexOf('\t');
			if (tabIdx === -1)
			{
				continue;
			}

			// Skip header/summary lines early
			if (line.indexOf('Date livr.') !== -1 || line.indexOf('Rappel de la sélection') !== -1)
			{
				continue;
			}

			const cols = line.split('\t');
			const dateVal = cols[0]?.trim();
			const blVal = cols[1]?.trim();
			const articleVal = cols[3]?.trim();

			if (dateVal)
			{
				currentState.date = dateVal;
			}
			if (blVal)
			{
				currentState.bl = blVal;
				currentState.cde = cols[2]?.trim() || '';
			}

			if (articleVal && articleRegex.test(articleVal))
			{
				yield [
					currentState.customerID,
					currentState.date,
					currentState.bl,
					currentState.cde,
					articleVal,
					cols[4]?.trim() || '',
					cols[5]?.trim() || '',
					cols[6]?.trim() || '',
					cols[7]?.trim() || '',
					cols[8]?.trim() || '',
					cols[9]?.trim() || '',
					VifParser._getISOWeek(currentState.date)
				];
			}
		}
	}

	/**
	 * Computes statistics grouped by 'n° BL' from the parsed 2D data.
	 * @param {string[][]} data - The 2D array of parsed BL data (with headers).
	 * @yields {Object} Statistics for a single 'n° BL'.
	 */
	static * parseBLStats(data)
	{
		let currentBL = null;
		let stats = null;

		const ignoredArticles = [
			// Articles de collecte gardés
			'5010010',
			// Materiel autre
			'6010070'
		];

		const specialFamilyChar = {
			// Plat cuisiné viande ambiant => Frais
			'4210011' : '2',
			// Oeufs ambiants => Frais
			'4710001' : '2'
		};

		for (let i = 1; i < data.length; i++) // Skip headers
		{
			const row = data[i];
			const bl = row[2];
			const article = row[4];
			const articleStr = String(article);

			if (ignoredArticles.includes(articleStr))
			{
				continue;
			}

			if (bl !== currentBL)
			{
				if (stats)
				{
					stats['Type BL'] = VifParser._determineBLType(stats);
					yield stats;
				}
				currentBL = bl;
				stats = {
					'Code VIF': row[0],
					'Date': row[1],
					'Month': VifParser._getMonthNum(row[1]),
					'n° BL': bl,
					'_row': i + 1, // Store the sheet row index (internal use)
					'_articles': new Set(), // Track processed articles for this BL
					'Type BL': '',
					'Kg Net': 0,
					'Produits Sec': 0,
					'Produits Frais': 0,
					'Produits Surgelé': 0,
					'Produits F&L': 0,
					'Produits FSE': 0,
					'Produits CNES': 0,
					'Produits Proxidon': 0,
					'Lait ambiant': 0,
					'Week': row[11] || VifParser._getISOWeek(row[1])
				};
			}

			const kgNetVal = row[7];
			const kgNet = typeof kgNetVal === 'number' ? kgNetVal : parseFloat(String(kgNetVal || '0').replace(',', '.')) || 0;
			stats['Kg Net'] += kgNet;

			const lot = row[6];
			if (lot && String(lot).toLowerCase().startsWith('proxidon'))
			{
				++stats['Produits Proxidon'];
			}

			// Skip frequency counters if this article was already counted for the current BL
			if (stats._articles.has(articleStr))
			{
				continue;
			}
			stats._articles.add(articleStr);

			const len = articleStr.length;
			const familyChar = specialFamilyChar[articleStr] || ((len < 5) ? '' : articleStr.charAt(len - 5));

			if (familyChar === '1')
			{
				++stats['Produits Sec'];

				if (/^91....$/.test(articleStr))
				{
					++stats['Lait ambiant'];
				}
			}
			else if (familyChar === '2')
			{
				++stats['Produits Frais'];

				if (articleStr.startsWith('452'))
				{
					++stats['Produits F&L'];
				}
			}
			else if (familyChar === '3')
			{
				++stats['Produits Surgelé'];
			}

			if (articleStr.endsWith('9'))
			{
				++stats['Produits FSE'];
			}
			else if (articleStr.endsWith('3'))
			{
				++stats['Produits CNES'];
			}
		}

		if (stats)
		{
			stats['Type BL'] = VifParser._determineBLType(stats);
			yield stats;
		}
	}

	/**
	 * Determines the 'Type BL' based on statistics.
	 * @param {Object} stats - The statistics for a single 'n° BL'.
	 * @return {string} The determined type.
	 * @private
	 */
	static _determineBLType(stats)
	{
		if (stats['Produits Proxidon'] > 0)
		{
			return 'Proxidon';
		}
		if (stats['Produits Surgelé'] > 0)
		{
			return 'Surgelé';
		}
		if (stats['Produits Frais'] > 0)
		{
			return (stats['Produits Frais'] === stats['Produits F&L']) ? 'F&L' : 'Frais';
		}
		if (stats['Produits Sec'] > 0)
		{
			return (stats['Produits Sec'] - stats['Lait ambiant'] <= 3) ? 'Complément' : 'Sec';
		}
		return '';
	}

	/**
	 * Returns the week number for a given date, adjusted to avoid year-overlap.
	 * If a date in January has a week >= 52, it returns 1.
	 * If a date in December has a week == 1, it returns 52.
	 * @param {Date|string} dateVal - The date object or string (DD/MM/YYYY).
	 * @return {number|string} The adjusted week number.
	 * @private
	 */
	static _getISOWeek(dateVal)
	{
		const date = VifParser._getDate(dateVal);
		if (!date)
		{
			return '';
		}

		let week = parseInt(Utilities.formatDate(date, SpreadsheetApp.getActive().getSpreadsheetTimeZone(), 'w'), 10);
		const month = date.getMonth(); // 0 = January, 11 = December

		if (month === 0 && week >= 52)
		{
			week = 1;
		}
		else if (month === 11 && week === 1)
		{
			week = 52;
		}

		return week;
	}

	/**
	 * Returns the month number (1-12) for a given date.
	 * @param {Date|string} dateVal - The date object or string (DD/MM/YYYY).
	 * @return {number|string} The month number or empty string.
	 * @private
	 */
	static _getMonthNum(dateVal)
	{
		const date = VifParser._getDate(dateVal);
		return date ? date.getMonth() + 1 : '';
	}

	/**
	 * Normalizes a date value into a Date object.
	 * @param {Date|string} dateVal - The date object or string (DD/MM/YYYY).
	 * @return {Date|null} The Date object or null if invalid.
	 * @private
	 */
	static _getDate(dateVal)
	{
		if (!dateVal)
		{
			return null;
		}

		let date;
		if (dateVal instanceof Date)
		{
			date = dateVal;
		}
		else
		{
			const parts = String(dateVal).split('/');
			if (parts.length === 3)
			{
				// Assume DD/MM/YYYY
				date = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
			}
			else
			{
				date = new Date(dateVal);
			}
		}

		return (isNaN(date.getTime())) ? null : date;
	}

	/**
	 * Handles sheet creation/selection and data injection.
	 * @param {string} sheetName - The name of the target sheet.
	 * @param {string[][]} data - The 2D array of data to write.
	 * @param {boolean} [activate=false] - Whether to activate the sheet after writing.
	 */
	static writeToSheet(sheetName, data, activate = false)
	{
		const ss = SpreadsheetApp.getActiveSpreadsheet();
		let sheet = ss.getSheetByName(sheetName);

		if (!sheet)
		{
			sheet = ss.insertSheet(sheetName);
		}

		const rows = data.length;
		const cols = data[0].length;

		// Sync Columns
		const currentMaxCols = sheet.getMaxColumns();
		if (cols > currentMaxCols)
		{
			sheet.insertColumnsAfter(currentMaxCols, cols - currentMaxCols);
		}

		// Sync Rows
		const currentMaxRows = sheet.getMaxRows();
		if (rows > currentMaxRows)
		{
			sheet.insertRowsAfter(currentMaxRows, rows - currentMaxRows);
		}
		else if (currentMaxRows > rows + 1000)
		{
			// Only delete rows if the excess is significant to avoid slow operations
			sheet.deleteRows(rows + 1, currentMaxRows - rows);
		}

		// Fast clear of previous content
		sheet.clearContents();

		const CHUNK_SIZE = 5000;
		for (let i = 0; i < rows; i += CHUNK_SIZE)
		{
			const chunk = data.slice(i, i + CHUNK_SIZE);
			sheet.getRange(i + 1, 1, chunk.length, cols).setValues(chunk);
		}

		if (activate)
		{
			sheet.activate();
		}
	}
}

/**
 * Refreshes the 'VIF_BL_Stats' sheet based on the data in 'VIF_BL'.
 */
function refreshBLStats()
{
	try
	{
		const ss = SpreadsheetApp.getActiveSpreadsheet();
		const blSheet = ss.getSheetByName('VIF_BL');

		if (!blSheet)
		{
			throw new Error("La feuille 'VIF_BL' est introuvable.");
		}

		const gid = blSheet.getSheetId();
		const data = blSheet.getDataRange().getValues();
		if (data.length <= 1)
		{
			throw new Error("La feuille 'VIF_BL' est vide.");
		}

		const statsRows = [];
		const headers = VifParser.STATS_HEADERS;
		statsRows.push(headers);

		const blColIdx = data[0].indexOf('n° BL');
		const colLetter = blColIdx !== -1 ? String.fromCharCode(65 + blColIdx) : 'C';

		for (const stat of VifParser.parseBLStats(data))
		{
			statsRows.push(headers.map(h => {
				if (h === 'n° BL')
				{
					// Create a hyperlink to the specific row in VIF_BL sheet
					return `=HYPERLINK("#gid=${gid}&range=${colLetter}${stat._row}"; "${stat[h]}")`;
				}
				return stat[h];
			}));
		}

		VifParser.writeToSheet('VIF_BL_Stats', statsRows, true);

		const ui = SpreadsheetApp.getUi();
		ui.alert('Succès', 'Les statistiques BL ont été rafraîchies.', ui.ButtonSet.OK);
	}
	catch (e)
	{
		const ui = SpreadsheetApp.getUi();
		ui.alert('Erreur', e.toString(), ui.ButtonSet.OK);
	}
}

/**
* Updated server-side trigger for the upload UI
*/
function processUpload(fileObj)
{
	try
	{
		const ss = SpreadsheetApp.getActiveSpreadsheet();
		const blob = Utilities.newBlob(Utilities.base64Decode(fileObj.data), fileObj.mimeType);
		const content = blob.getDataAsString('ISO-8859-1');

		// Import detailed BL data
		const parsedData = VifParser.parseBL(content);
		VifParser.writeToSheet('VIF_BL', parsedData);

		const blSheet = ss.getSheetByName('VIF_BL');
		const gid = blSheet.getSheetId();

		// Import BL statistics
		const statsRows = [];
		const headers = VifParser.STATS_HEADERS;
		statsRows.push(headers);

		const blColIdx = parsedData[0].indexOf('n° BL');
		const colLetter = blColIdx !== -1 ? String.fromCharCode(65 + blColIdx) : 'C';

		for (const stat of VifParser.parseBLStats(parsedData))
		{
			statsRows.push(headers.map(h => {
				if (h === 'n° BL')
				{
					return `=HYPERLINK("#gid=${gid}&range=${colLetter}${stat._row}"; "${stat[h]}")`;
				}
				return stat[h];
			}));
		}
		VifParser.writeToSheet('VIF_BL_Stats', statsRows, true);

		return 'Importation réussie : ' + (parsedData.length - 1) + ' lignes traitées.';
	}
	catch (e)
	{
		return 'Erreur : ' + e.toString();
	}
}

/**
 * Refreshes the 'VIF_BL_Stats_Weekly' sheet by aggregating 'VIF_BL_Stats' data.
 */
function refreshWeeklyStats()
{
	try
	{
		const ss = SpreadsheetApp.getActiveSpreadsheet();
		const statsSheet = ss.getSheetByName('VIF_BL_Stats');

		if (!statsSheet)
		{
			throw new Error("La feuille 'VIF_BL_Stats' est introuvable.");
		}

		const statsData = statsSheet.getDataRange().getValues();
		const weeklyStats = VifParser.aggregateWeeklyStats(statsData);

		if (weeklyStats.length > 0)
		{
			VifParser.writeToSheet('VIF_BL_Stats_Weekly', weeklyStats, true);

			const ui = SpreadsheetApp.getUi();
			ui.alert('Succès', 'Les statistiques hebdomadaires ont été rafraîchies.', ui.ButtonSet.OK);
		}
	}
	catch (e)
	{
		const ui = SpreadsheetApp.getUi();
		ui.alert('Erreur', e.toString(), ui.ButtonSet.OK);
	}
}
