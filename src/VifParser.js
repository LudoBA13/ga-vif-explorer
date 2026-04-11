class VifParser
{
	static _timeZone = null;

	/**
	 * Gets the spreadsheet timezone, cached for the duration of the execution.
	 * @return {string} The timezone string.
	 * @private
	 */
	static _getTimeZone()
	{
		if (!VifParser._timeZone)
		{
			VifParser._timeZone = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
		}
		return VifParser._timeZone;
	}

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

	static get IGNORED_ARTICLES()
	{
		return [
			'5010010', // Articles de collecte gardés
			'6010070'  // Materiel autre
		];
	}

	static get SPECIAL_FAMILY_CHAR()
	{
		return {
			'4210011': '2', // Plat cuisiné viande ambiant => Frais
			'4710001': '2'  // Oeufs ambiants => Frais
		};
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
			const row = new Array(weeklyHeaders.length);
			for (let j = 0; j < weeklyHeaders.length; j++)
			{
				row[j] = entry[weeklyHeaders[j]];
			}
			resultRows.push(row);
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
		let currentWeek = '';

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

			if (dateVal && dateVal !== currentState.date)
			{
				currentState.date = dateVal;
				currentWeek = VifParser._getISOWeek(dateVal);
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
					currentWeek
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

		const ignoredArticles = VifParser.IGNORED_ARTICLES;
		const specialFamilyChar = VifParser.SPECIAL_FAMILY_CHAR;

		let dateCache = {
			str: '',
			obj: null,
			month: '',
			week: '',
			planning: ''
		};

		for (let i = 1; i < data.length; i++) // Skip headers
		{
			const row = data[i];
			const bl = row[2];
			const dateStr = String(row[1] || '');
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

				if (dateStr !== dateCache.str)
				{
					const dateObj = VifParser._getDate(dateStr);
					dateCache = {
						str: dateStr,
						obj: dateObj,
						month: VifParser._getMonthNum(dateStr),
						week: VifParser._getISOWeek(dateStr),
						planning: (typeof dateToPlanning === 'function' && dateObj) ? dateToPlanning(dateObj) : ''
					};
				}

				currentBL = bl;
				stats = {
					'Code VIF': row[0],
					'Date': dateStr,
					'Month': dateCache.month,
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
					'Week': row[11] || dateCache.week,
					'Planning Code': dateCache.planning
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
	 * Generates formatted statistics rows with hyperlinks.
	 * @param {string[][]} data - The source BL data.
	 * @param {number|string} gid - The GID of the source sheet.
	 * @return {string[][]} The formatted statistics rows.
	 */
	static generateStatsRows(data, gid)
	{
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
					return `=HYPERLINK("#gid=${gid}&range=${colLetter}${stat._row}"; "${stat[h]}")`;
				}
				return stat[h];
			}));
		}
		return statsRows;
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

		let week = parseInt(Utilities.formatDate(date, VifParser._getTimeZone(), 'w'), 10);
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

	static _lastDateStr = '';
	static _lastDateObj = null;

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

		if (dateVal instanceof Date)
		{
			return dateVal;
		}

		const dateStr = String(dateVal);
		if (dateStr === VifParser._lastDateStr)
		{
			return VifParser._lastDateObj;
		}

		let date;
		const parts = dateStr.split('/');
		if (parts.length === 3)
		{
			// Assume DD/MM/YYYY
			date = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
		}
		else
		{
			date = new Date(dateVal);
		}

		const result = (isNaN(date.getTime())) ? null : date;
		VifParser._lastDateStr = dateStr;
		VifParser._lastDateObj = result;
		return result;
	}

	/**
	 * Handles sheet creation/selection and data injection.
	 * Supports both 2D arrays and Iterators (Generators).
	 * @param {string} sheetName - The name of the target sheet.
	 * @param {string[][]|Iterator} data - The data to write.
	 * @param {Object} options - Options for writing.
	 * @param {boolean} [options.activate=false] - Whether to activate the sheet after writing.
	 * @param {number} [options.expectedRows] - Optional hint for the number of rows (useful for Iterators).
	 * @param {number} [options.expectedCols] - Optional hint for the number of columns.
	 */
	static writeToSheet(sheetName, data, options = {})
	{
		const activate = options.activate || false;
		const ss = SpreadsheetApp.getActiveSpreadsheet();
		let sheet = ss.getSheetByName(sheetName);

		if (!sheet)
		{
			sheet = ss.insertSheet(sheetName);
		}

		const isIterator = (typeof data.next === 'function');
		let currentData = null;
		let numRows = 0;
		let numCols = 0;

		if (!isIterator)
		{
			currentData = data;
			numRows = currentData.length;
			numCols = numRows > 0 ? currentData[0].length : 0;
		}
		else
		{
			numRows = options.expectedRows || 0;
			numCols = options.expectedCols || 0;
		}

		// Check Columns (if we have a hint or data)
		if (numCols > 0)
		{
			const currentMaxCols = sheet.getMaxColumns();
			if (numCols > currentMaxCols)
			{
				throw new Error(`Le dataset contient ${numCols} colonnes, mais la feuille '${sheetName}' n'en a que ${currentMaxCols}. Veuillez agrandir la feuille manuellement.`);
			}
		}

		// Sync Rows (if we have a hint or data)
		if (numRows > 0)
		{
			const currentMaxRows = sheet.getMaxRows();
			if (numRows > currentMaxRows)
			{
				sheet.insertRowsAfter(currentMaxRows, numRows - currentMaxRows);
			}
			else if (currentMaxRows > numRows + 1000)
			{
				sheet.deleteRows(numRows + 1, currentMaxRows - numRows);
			}
		}

		// Fast clear of previous content
		sheet.clearContents();

		const CHUNK_SIZE = 5000;
		if (!isIterator)
		{
			for (let i = 0; i < numRows; i += CHUNK_SIZE)
			{
				const chunk = currentData.slice(i, i + CHUNK_SIZE);
				sheet.getRange(i + 1, 1, chunk.length, numCols).setValues(chunk);
			}
		}
		else
		{
			let rowIndex = 1;
			let chunk = [];
			let actualCols = numCols;

			let next = data.next();
			while (!next.done)
			{
				chunk.push(next.value);
				if (actualCols === 0 && next.value)
				{
					actualCols = next.value.length;
					const currentMaxCols = sheet.getMaxColumns();
					if (actualCols > currentMaxCols)
					{
						throw new Error(`Le dataset contient ${actualCols} colonnes, mais la feuille '${sheetName}' n'en a que ${currentMaxCols}. Veuillez agrandir la feuille manuellement.`);
					}
				}

				if (chunk.length >= CHUNK_SIZE)
				{
					// Check if we need more rows
					const maxRows = sheet.getMaxRows();
					if (rowIndex + chunk.length - 1 > maxRows)
					{
						sheet.insertRowsAfter(maxRows, CHUNK_SIZE);
					}
					sheet.getRange(rowIndex, 1, chunk.length, actualCols).setValues(chunk);
					rowIndex += chunk.length;
					chunk = [];
				}
				next = data.next();
			}

			if (chunk.length > 0)
			{
				const maxRows = sheet.getMaxRows();
				if (rowIndex + chunk.length - 1 > maxRows)
				{
					sheet.insertRowsAfter(maxRows, chunk.length);
				}
				sheet.getRange(rowIndex, 1, chunk.length, actualCols).setValues(chunk);
				rowIndex += chunk.length;
			}

			// Clean up excess rows if we didn't know the exact count
			const finalMaxRows = sheet.getMaxRows();
			const finalRows = rowIndex - 1;
			if (finalMaxRows > finalRows + 1000)
			{
				sheet.deleteRows(finalRows + 1, finalMaxRows - finalRows);
			}
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

		const statsRows = VifParser.generateStatsRows(data, gid);
		VifParser.writeToSheet('VIF_BL_Stats', statsRows, { activate: true });

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

		// Stream raw BL data to 'VIF_BL'
		const blEntries = VifParser._parseBLEntries(content);
		VifParser.writeToSheet('VIF_BL', blEntries);

		const blSheet = ss.getSheetByName('VIF_BL');
		const gid = blSheet.getSheetId();

		// Now that it's in the sheet, read it back for stats
		// (This is safer than trying to branch the generator which is complex in JS)
		const parsedData = blSheet.getDataRange().getValues();

		// Import BL statistics
		const statsRows = VifParser.generateStatsRows(parsedData, gid);
		VifParser.writeToSheet('VIF_BL_Stats', statsRows, { activate: true });

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
			VifParser.writeToSheet('VIF_BL_Stats_Weekly', weeklyStats, { activate: true });

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
