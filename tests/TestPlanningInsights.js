// Test script for PlanningInsights
// To run: node TestPlanningInsights.js

const PlanningInsights = require('../src/PlanningInsights.js');

function test(name, history, expected, threshold)
{
	const result = PlanningInsights.getPattern(history, threshold);
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

const history1 = ['1Lu', '1Lu', '1Lu', '1Ma'];
// Total 4. 75% = 3. 3x '1Lu' = 75%. Should return ['1Lu']
test('Single dominant day (noise tolerance)', history1, ['1Lu']);

const history2 = ['1Lu', '1Lu', '3Lu', '3Lu', '2Je'];
// Total 5. 75% = 3.75.
// 1Lu: 2, 3Lu: 2, 2Je: 1.
// Top 2 (1Lu, 3Lu) give 4/5 = 80%.
// Should return ['1Lu', '3Lu']
test('Multiple significant days', history2, ['1Lu', '3Lu']);

const history3 = ['1Lu', '2Ma', '3Me', '4Je', '1Ve'];
// Total 5. 75% = 3.75.
// Each has frequency 1 (20%).
// Sorted: all equal. It will pick top 4.
// Sorting in return should order them correctly.
test('Diverse data (picks top until 75%)', history3, ['1Lu', '2Ma', '3Me', '4Je']);

const history4 = ['1Ma', '1Lu', '1Ma', '1Lu'];
// Total 4. 75% = 3.
// 1Ma: 2, 1Lu: 2.
// Together 100%.
// Sorting order should be Lu, Ma.
test('Sorted output by day order', history4, ['1Lu', '1Ma']);

const history5 = ['4Lu', '1Lu', '4Lu', '1Lu'];
// Sorted by week.
test('Sorted output by week order', history5, ['1Lu', '4Lu']);

const history6 = ['1Lu', '1Lu', '1Ma', '1Ma', '1Me'];
// Total 5. 
// 1Lu: 2, 1Ma: 2, 1Me: 1.
// 0.4 coverage: 1Lu covers 40%.
test('Configurable threshold (0.4)', history6, ['1Lu'], 0.4);
// 0.8 coverage: 1Lu + 1Ma cover 80%.
test('Configurable threshold (0.8)', history6, ['1Lu', '1Ma'], 0.8);
// 0.9 coverage: 1Lu + 1Ma + 1Me cover 100%.
test('Configurable threshold (0.9)', history6, ['1Lu', '1Ma', '1Me'], 0.9);
