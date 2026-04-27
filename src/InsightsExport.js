class InsightsExporter
{
	static get CELL_VIF() { return 'C2'; }
	static get CELL_OUTPUT() { return 'B5'; }

	/**
	 * Exports insights based on ACStructures values.
	 */
	static run()
	{
		const ss = SpreadsheetApp.getActiveSpreadsheet();
		const acStructuresSheet = ss.getSheetByName('ACStructures');
		const insightsSheet = ss.getSheetByName('Insights');

		if (!acStructuresSheet || !insightsSheet)
		{
			throw new Error('Required sheets not found.');
		}

		const names = acStructuresSheet.getRange('B2:B').getValues();
		const vifs = acStructuresSheet.getRange('W2:W').getValues();
		const timestamp = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), '_yyyyMMdd_HHmmss');
		const targetSs = SpreadsheetApp.create('InsightsExport' + timestamp);

		const templateSheet = this.createTemplateSheet(targetSs, insightsSheet);

		for (let i = 0; i < names.length; i++)
		{
			const name = names[i][0];
			const vif = vifs[i][0];

			if (!name)
			{
				continue;
			}

			if (typeof vif === 'number' && vif < 100000)
			{
				continue;
			}

			insightsSheet.getRange(this.CELL_VIF).setValue(name);
			SpreadsheetApp.flush();

			const observations = insightsSheet.getRange(this.CELL_OUTPUT).getValue();
			if (String(observations).includes('\u26a0'))
			{
				this.exportToNewSheet(templateSheet, insightsSheet, name);
			}
		}

		targetSs.deleteSheet(templateSheet);
	}

	/**
	 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} targetSs
	 * @param {GoogleAppsScript.Spreadsheet.Sheet} sourceSheet
	 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
	 */
	static createTemplateSheet(targetSs, sourceSheet)
	{
		const initialSheet = targetSs.getSheets()[0];
		const templateSheet = sourceSheet.copyTo(targetSs);
		templateSheet.setName('template');
		templateSheet.clearContents(); // Clear values/formulas but preserve formatting
		templateSheet.getRange(this.CELL_VIF).setDataValidation(null); // Explicitly remove from C2

		targetSs.deleteSheet(initialSheet);

		return templateSheet;
	}

	/**
	 * @param {GoogleAppsScript.Spreadsheet.Sheet} templateSheet
	 * @param {GoogleAppsScript.Spreadsheet.Sheet} sourceSheet
	 * @param {string|number} name
	 */
	static exportToNewSheet(templateSheet, sourceSheet, name)
	{
		const newSheet = templateSheet.copyTo(templateSheet.getParent());
		newSheet.setName(String(name));

		const sourceRange = sourceSheet.getDataRange();
		const targetRange = newSheet.getRange(1, 1, sourceRange.getNumRows(), sourceRange.getNumColumns());

		targetRange.setValues(sourceRange.getValues());
		targetRange.setNumberFormats(sourceRange.getNumberFormats());
		targetRange.setBackgrounds(sourceRange.getBackgrounds());
		targetRange.setFontColors(sourceRange.getFontColors());
		targetRange.setFontFamilies(sourceRange.getFontFamilies());
		targetRange.setFontSizes(sourceRange.getFontSizes());
		targetRange.setFontWeights(sourceRange.getFontWeights());
		targetRange.setHorizontalAlignments(sourceRange.getHorizontalAlignments());
		targetRange.setVerticalAlignments(sourceRange.getVerticalAlignments());
	}
}

/**
 * Global entry point to run the insights export from the GAS editor.
 */
function triggerInsightsExport()
{
	InsightsExporter.run();
}
