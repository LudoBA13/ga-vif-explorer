class SheetWriter
{
	/**
	 * Clears all content from the sheet.
	 */
	clearSheet()
	{
		this.sheet.clear();
		this.currentRow = 1;
		this.maxRows = this.sheet.getMaxRows();
	}

	/**
	 * @param {string} sheetName
	 * @param {string[]} headers
	 * @param {number} expectedRows
	 */
	constructor(sheetName, headers, expectedRows)
	{
		const ss = SpreadsheetApp.getActiveSpreadsheet();
		let sheet = ss.getSheetByName(sheetName);

		if (!sheet)
		{
			sheet = ss.insertSheet(sheetName);
		}

		this.sheet = sheet;
		this.currentRow = 2;
		this.maxRows = sheet.getMaxRows();
		this.rowExpansionChunkSize = 1000;
		this._setupHeaders(headers);
		this._setupRows(expectedRows);
	}

	/**
	 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
	 */
	getSheet()
	{
		return this.sheet;
	}

	/**
	 * @param {number} targetMaxRow
	 * @private
	 */
	_expandRows(targetMaxRow)
	{
		if (targetMaxRow <= this.maxRows)
		{
			return;
		}

		const diff = targetMaxRow - this.maxRows;
		const chunks = Math.ceil(diff / this.rowExpansionChunkSize);
		const rowsToAdd = chunks * this.rowExpansionChunkSize;

		this.sheet.insertRowsAfter(this.maxRows, rowsToAdd);
		this.maxRows += rowsToAdd;
	}

	/**
	 * @param {string[]} headers
	 * @private
	 */
	_setupHeaders(headers)
	{
		if (!headers || headers.length === 0)
		{
			return;
		}

		const currentColumns = this.sheet.getMaxColumns();
		if (headers.length > currentColumns)
		{
			this.sheet.insertColumnsAfter(currentColumns, headers.length - currentColumns);
		}
		else if (headers.length < currentColumns)
		{
			this.sheet.deleteColumns(headers.length + 1, currentColumns - headers.length);
		}

		const range = this.sheet.getRange(1, 1, 1, headers.length);
		const currentHeaders = range.getValues()[0];

		let match = true;
		for (let i = 0; i < headers.length; i++)
		{
			if (currentHeaders[i] !== headers[i])
			{
				match = false;
				break;
			}
		}

		if (!match)
		{
			range.setValues([headers])
				.setFontWeight('bold')
				.setHorizontalAlignment('center')
				.setBackground('#4a86e8')
				.setFontColor('white');

			this.sheet.setFrozenRows(1);
		}
	}

	/**
	 * @param {number} expectedRows
	 * @private
	 */
	_setupRows(expectedRows)
	{
		this._expandRows(expectedRows);
	}

	/**
	 * @param {string[][]} rows
	 */
	writeRows(rows)
	{
		if (!rows || rows.length === 0 || !rows[0] || rows[0].length === 0)
		{
			return;
		}

		const requiredMaxRow = this.currentRow + rows.length - 1;
		this._expandRows(requiredMaxRow);

		this.sheet.getRange(this.currentRow, 1, rows.length, rows[0].length).setValues(rows);
		this.currentRow += rows.length;
	}

	/**
	 * Removes all rows starting from the current writing position to the end of the sheet.
	 */
	trimUnusedRows()
	{
		if (this.maxRows < this.currentRow)
		{
			return;
		}

		const rowsToDelete = this.maxRows - this.currentRow + 1;
		if (rowsToDelete > 0)
		{
			this.sheet.deleteRows(this.currentRow, rowsToDelete);
			this.maxRows = this.currentRow - 1;
		}
	}
}
