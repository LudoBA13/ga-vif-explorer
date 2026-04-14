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

		const blWriter = new SheetWriter('NEW_BL', blHeaders, blRows.length + 1);
		blWriter.writeRows(blRows);
		blWriter.trimUnusedRows();

		const itemWriter = new SheetWriter('NEW_BL_Items', itemHeaders, itemRows.length + 1);
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
 * Creates the menu when the spreadsheet is opened.
 */
function onOpen()
{
	SpreadsheetApp.getUi().createMenu('VIF')
		.addItem('Importer BLs', 'showVifImporter')
		.addToUi();
}

/**
 * Wrapper for the menu action.
 */
function showVifImporter()
{
	VifImporter.show();
}
