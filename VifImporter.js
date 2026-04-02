class VifImporter
{
	static show()
	{
		const html = HtmlService.createTemplateFromFile('UI.VifImporter')
			.evaluate()
			.setWidth(600)
			.setHeight(250);
		SpreadsheetApp.getUi().showModalDialog(html, 'Importer bons de livraisons VIF');
	}
}

/**
 * Creates the menu when the spreadsheet is opened.
 */
function onOpen()
{
	SpreadsheetApp.getUi().createMenu('VIF')
		.addItem('Importer BLs', 'showVifImporter')
		.addItem('Recalculer stats', 'refreshBLStats')
		.addToUi();
}

/**
 * Wrapper for the menu action.
 */
function showVifImporter()
{
	VifImporter.show();
}
