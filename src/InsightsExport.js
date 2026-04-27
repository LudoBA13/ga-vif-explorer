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

		// Use default sheet as template
		const templateSheet = targetSs.getSheets()[0];
		templateSheet.setName('template');
		const lastRow = insightsSheet.getLastRow();
		const lastColumn = insightsSheet.getLastColumn();

		if (templateSheet.getMaxRows() > lastRow)
		{
			templateSheet.deleteRows(lastRow + 1, templateSheet.getMaxRows() - lastRow);
		}
		if (templateSheet.getMaxColumns() > lastColumn)
		{
			templateSheet.deleteColumns(lastColumn + 1, templateSheet.getMaxColumns() - lastColumn);
		}

		for (let i = 1; i <= lastColumn; i++)
		{
			templateSheet.setColumnWidth(i, insightsSheet.getColumnWidth(i));
		}

		for (let i = 1; i <= lastRow; i++)
		{
			templateSheet.setRowHeight(i, insightsSheet.getRowHeight(i));
		}

		// Copy merged ranges
		try
		{
			const mergedRanges = insightsSheet.getDataRange().getMergedRanges();
			for (const range of mergedRanges)
			{
				templateSheet.getRange(range.getRow(), range.getColumn(), range.getNumRows(), range.getNumColumns()).merge();
			}
		}
		catch (e)
		{
			console.warn('Could not copy merged ranges:', e);
		}

		// Copy borders
		const sourceRange = insightsSheet.getDataRange();
		const targetRange = templateSheet.getRange(1, 1, lastRow, lastColumn);
		targetRange.setBorders(
			sourceRange.getTopBorder(),
			sourceRange.getLeftBorder(),
			sourceRange.getBottomBorder(),
			sourceRange.getRightBorder(),
			sourceRange.getVerticalBorder(),
			sourceRange.getHorizontalBorder()
		);

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
				this.exportToNewSheet(templateSheet, insightsSheet, acValue);
				break;
			}
		}

		targetSs.deleteSheet(templateSheet);
		
		// Remove default sheet if it still exists
		const defaultSheet = targetSs.getSheets()[0];
		if (defaultSheet)
		{
			targetSs.deleteSheet(defaultSheet);
		}
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
