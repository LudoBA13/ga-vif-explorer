class VifImporter
{
	static show()
	{
		const template = HtmlService.createTemplateFromFile('UI.VifImporter');
		template.vifParserSource = VifParser.toString();
		const html = template.evaluate()
			.setWidth(600)
			.setHeight(250);
		SpreadsheetApp.getUi().showModalDialog(html, 'Importer bons de livraisons VIF');
	}

	/**
	 * Processes the parsed VIF data and writes it to the spreadsheet.
	 * @param {any[][]} blRows
	 * @param {any[][]} itemRows
	 */
	static importData(blRows, itemRows)
	{
		const blHeaders = blRows.shift();
		const itemHeaders = itemRows.shift();

		const blWriter = new SheetWriter('VIF_BL', blHeaders, blRows.length + 1);
		blWriter.clearSheet();
		blWriter.writeRows(blRows);
		blWriter.trimUnusedRows();

		const itemWriter = new SheetWriter('VIF_BL_Items', itemHeaders, itemRows.length + 1);
		itemWriter.clearSheet();
		itemWriter.writeRows(itemRows);
		itemWriter.trimUnusedRows();

		return `Importation réussie : ${blRows.length} BLs et ${itemRows.length} articles importés.`;
	}
}

/**
 * Server-side wrapper for VifImporter.importData.
 */
function importVifData(blRows, itemRows)
{
	return VifImporter.importData(blRows, itemRows);
}

/**
 * Pre-computes the planning ticks for a list of date strings (DD/MM/YY).
 * @param {string[]} datesArray
 * @returns {Object<string, number>} Map of date string to tick value.
 */
function getPlanningTicks(datesArray)
{
	const map = {};
	for (const dateStr of datesArray)
	{
		const [d, m, y] = dateStr.split('/');
		const date = new Date(2000 + (+y), m - 1, d, 12, 0, 0); // Use mid-day
		try
		{
			map[dateStr] = dateToTick(date);
		}
		catch (e)
		{
			console.error('Failed to compute tick for date:', dateStr, e);
		}
	}
	return map;
}

/**
 * Creates the menu when the spreadsheet is opened.
 */
function onOpen()
{
	SpreadsheetApp.getUi().createMenu('VIF')
		.addItem('Importer BLs', 'showVifImporter')
		.addItem('Exporter Insights', 'runInsightsExport')
		.addToUi();
}

/**
 * Wrapper for the menu action.
 */
function showVifImporter()
{
	VifImporter.show();
}

/**
 * Wrapper for the export insights menu action.
 */
function runInsightsExport()
{
	InsightsExporter.run();
}
