class InsightsExporter
{
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

		const acValues = acStructuresSheet.getRange('B2:B').getValues();
		const wValues = acStructuresSheet.getRange('W2:W').getValues();
		const targetSs = SpreadsheetApp.create('InsightsExport');

		for (let i = 0; i < acValues.length; i++)
		{
			const acValue = acValues[i][0];
			const wValue = wValues[i][0];

			if (!acValue || (typeof wValue === 'number' && wValue < 100000))
			{
				continue;
			}

			insightsSheet.getRange('C2').setValue(acValue);
			SpreadsheetApp.flush();

			const observations = insightsSheet.getRange('B5').getValue();
			if (String(observations).includes('\u26a0'))
			{
				this.exportToNewSheet(targetSs, insightsSheet, acValue);
			}
		}
	}

	/**
	 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} targetSs
	 * @param {GoogleAppsScript.Spreadsheet.Sheet} sourceSheet
	 * @param {string|number} name
	 */
	static exportToNewSheet(targetSs, sourceSheet, name)
	{
		const newSheetName = String(name);
		const targetSheet = targetSs.insertSheet(newSheetName);

		const sourceRange = sourceSheet.getDataRange();
		const targetRange = targetSheet.getRange(1, 1, sourceRange.getNumRows(), sourceRange.getNumColumns());

		targetRange.setValues(sourceRange.getValues());
		targetRange.setNumberFormats(sourceRange.getNumberFormats());
		targetRange.setBackgrounds(sourceRange.getBackgrounds());
		targetRange.setFontColors(sourceRange.getFontColors());
		targetRange.setFontFamilies(sourceRange.getFontFamilies());
		targetRange.setFontSizes(sourceRange.getFontSizes());
		targetRange.setFontWeights(sourceRange.getFontWeights());
		targetRange.setHorizontalAlignments(sourceRange.getHorizontalAlignments());
		targetRange.setVerticalAlignments(sourceRange.getVerticalAlignments());

		// Adjust column widths
		for (let i = 1; i <= sourceRange.getNumColumns(); i++)
		{
			targetSheet.setColumnWidth(i, sourceSheet.getColumnWidth(i));
		}
	}
}
