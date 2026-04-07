class PlanningInsights
{
	/**
	 * Identifies the delivery pattern from a history of day-week strings.
	 * A pattern is defined as the minimal set of day-week pairs that account
	 * for at least 75% of the entries in the history.
	 *
	 * @param {string[]} history - List of strings matching /^[1234](Lu|Ma|Me|Je|Ve)$/
	 * @returns {string[]} A list of pattern components matching /^[1234](Lu|Ma|Me|Je|Ve)$/
	 */
	static getPattern(history)
	{
		if (!history || history.length === 0)
		{
			return [];
		}

		const frequencies = {};
		const total = history.length;

		// 1. Count frequencies
		for (const entry of history)
		{
			frequencies[entry] = (frequencies[entry] || 0) + 1;
		}

		// 2. Sort by frequency descending
		const sortedPairs = Object.entries(frequencies)
			.sort((a, b) => b[1] - a[1]);

		// 3. Select top candidates covering at least 75% of the data
		const pattern = [];
		let cumulativeCount = 0;
		const threshold = total * 0.75;

		for (const [code, count] of sortedPairs)
		{
			pattern.push(code);
			cumulativeCount += count;

			if (cumulativeCount >= threshold)
			{
				break;
			}
		}

		// 4. Final sort for consistent output (by week number, then by day order)
		const dayOrder = ['Lu', 'Ma', 'Me', 'Je', 'Ve'];
		return pattern.sort((a, b) =>
		{
			const weekA = parseInt(a[0]);
			const weekB = parseInt(b[0]);
			if (weekA !== weekB)
			{
				return weekA - weekB;
			}
			const dayA = a.substring(1);
			const dayB = b.substring(1);
			return dayOrder.indexOf(dayA) - dayOrder.indexOf(dayB);
		});
	}
}

if (typeof module !== 'undefined')
{
	module.exports = PlanningInsights;
}
