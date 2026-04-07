/**
 * Identifies the delivery pattern from a history of day-week strings.
 * 
 * @param {string[][]} range - The range of cells containing day-week codes (e.g., '1Lu', '2Ma').
 * @param {number} threshold - Data coverage requirement (default: 0.75).
 * @returns {string} Comma-separated list of identified pattern components.
 * @customfunction
 */
function COMPUTE_PLANNING(range, threshold = 0.75)
{
	if (!range)
	{
		return '';
	}

	// Flatten range (handles single cells, rows, or columns) and filter empty values
	const history = (Array.isArray(range) ? range.flat() : [range])
		.filter(cell => cell && cell.toString().trim() !== '')
		.map(cell => cell.toString().trim());

	if (history.length === 0)
	{
		return '';
	}

	const pattern = PlanningInsights.getPattern(history, threshold);
	return pattern.join(', ');
}
