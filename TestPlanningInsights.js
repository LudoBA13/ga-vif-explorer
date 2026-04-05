// Test script for PlanningInsights
// To run: node TestPlanningInsights.js

const PlanningInsights = require('./PlanningInsights.js');

function test(name, history, expected)
{
	const result = PlanningInsights.getPattern(history);
	const success = JSON.stringify(result) === JSON.stringify(expected);
	console.log(`${success ? '✅' : '❌'} ${name}`);
	if (!success)
	{
		console.log(`  Expected: ${JSON.stringify(expected)}`);
		console.log(`  Actual:   ${JSON.stringify(result)}`);
	}
}

// Mocking module.exports for local testing if needed
// Or just copy-pasting the class here if I don't want to modify PlanningInsights.js
// Actually, since it's Apps Script, it doesn't use module.exports.
// I'll wrap the class in a try-catch or just redefine it here for the test.

const history1 = ['lundi-1', 'lundi-1', 'lundi-1', 'mardi-1'];
// Total 4. 75% = 3. 3x '1Lu' = 75%. Should return ['1Lu']
test('Single dominant day (noise tolerance)', history1, ['1Lu']);

const history2 = ['lundi-1', 'lundi-1', 'lundi-3', 'lundi-3', 'jeudi-2'];
// Total 5. 75% = 3.75.
// 1Lu: 2, 3Lu: 2, 2Je: 1.
// Top 2 (1Lu, 3Lu) give 4/5 = 80%.
// Should return ['1Lu', '3Lu']
test('Multiple significant days', history2, ['1Lu', '3Lu']);

const history3 = ['lundi-1', 'mardi-2', 'mercredi-3', 'jeudi-4', 'vendredi-1'];
// Total 5. 75% = 3.75.
// Each has frequency 1 (20%).
// Sorted: all equal. It will pick top 4.
// Sorting in return should order them correctly.
test('Diverse data (picks top until 75%)', history3, ['1Lu', '2Ma', '3Me', '4Je']);

const history4 = ['mardi-1', 'lundi-1', 'mardi-1', 'lundi-1'];
// Total 4. 75% = 3.
// 1Ma: 2, 1Lu: 2.
// Together 100%.
// Sorting order should be Lu, Ma.
test('Sorted output by day order', history4, ['1Lu', '1Ma']);

const history5 = ['lundi-4', 'lundi-1', 'lundi-4', 'lundi-1'];
// Sorted by week.
test('Sorted output by week order', history5, ['1Lu', '4Lu']);
