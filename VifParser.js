class VifParser
{
	static STATS_HEADERS = [
		'Code VIF', 'Date', 'n° BL', 'Type BL', 'Kg Net',
		'Produits Sec', 'Produits Frais', 'Produits Surgelé',
		'Produits F&L', 'Produits FSE', 'Produits CNES',
		'Produits Proxidon', 'Lait ambiant'
	];

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
			'Libellé', 'Lot', 'Kg Net', 'Kg Brut', 'P', 'COL'
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
					cols[9]?.trim() || ''
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
					'Lait ambiant': 0
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
	 * Handles sheet creation/selection and data injection.
	 * @param {string} sheetName - The name of the target sheet.
	 * @param {string[][]} data - The 2D array of data to write.
	 */
	static writeToSheet(sheetName, data)
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
		else if (cols < currentMaxCols)
		{
			sheet.deleteColumns(cols + 1, currentMaxCols - cols);
		}

		// Sync Rows
		const currentMaxRows = sheet.getMaxRows();
		if (rows > currentMaxRows)
		{
			sheet.insertRowsAfter(currentMaxRows, rows - currentMaxRows);
		}
		else if (rows < currentMaxRows)
		{
			sheet.deleteRows(rows + 1, currentMaxRows - rows);
		}

		const CHUNK_SIZE = 5000;
		for (let i = 0; i < rows; i += CHUNK_SIZE)
		{
			const chunk = data.slice(i, i + CHUNK_SIZE);
			sheet.getRange(i + 1, 1, chunk.length, cols).setValues(chunk);
		}

		sheet.activate();
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

		for (const stat of VifParser.parseBLStats(data))
		{
			statsRows.push(headers.map(h => {
				if (h === 'n° BL')
				{
					// Create a hyperlink to the specific row in VIF_BL sheet
					return `=HYPERLINK("#gid=${gid}&range=C${stat._row}"; "${stat[h]}")`;
				}
				return stat[h];
			}));
		}

		VifParser.writeToSheet('VIF_BL_Stats', statsRows);

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

		for (const stat of VifParser.parseBLStats(parsedData))
		{
			statsRows.push(headers.map(h => {
				if (h === 'n° BL')
				{
					return `=HYPERLINK("#gid=${gid}&range=C${stat._row}"; "${stat[h]}")`;
				}
				return stat[h];
			}));
		}
		VifParser.writeToSheet('VIF_BL_Stats', statsRows);

		return 'Importation réussie : ' + (parsedData.length - 1) + ' lignes traitées.';
	}
	catch (e)
	{
		return 'Erreur : ' + e.toString();
	}
}
