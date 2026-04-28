class VifParser
{
	static get IGNORED_ARTICLES()
	{
		return {
			5010010: true, // Articles de collecte gardés
			6010070: true  // Materiel autre
		};
	}

	static get SPECIAL_FAMILY()
	{
		return {
			119000:  2, // Pain/Viennoiserie non lotis
			4210001: 2, // Plat cuisiné végét. ambiant => Frais
			4210011: 2, // Plat cuisiné viande ambiant => Frais
			4710001: 2  // Oeufs ambiants => Frais
		};
	}

	static get colIdx()
	{
		return {
			DATE:    0,
			BL:      1,
			ARTICLE: 3,
			LIBELLE: 4,
			LOT:     5,
			POIDS:   7
		};
	}

	constructor(planningMap = {})
	{
		this.planningMap = planningMap;
		this.blRows = [['Code VIF', 'Date', 'Planning Tick', 'BL', 'Type BL', 'Type Passage', 'Total Kg Brut']];
		this.itemRows = [['BL', 'Article', 'Kg Brut', 'Libellé']];
	}

	getBlRows()
	{
		return this.blRows;
	}

	getItemRows()
	{
		return this.itemRows;
	}

	static parseBL(input, planningMap = {})
	{
		const m = input.match(/^\s*Rappel de la s.*?\nClient : \t\d{5}[^\n]+\n([^\n]+)\n[0-9]{2}\/[0-9]{2}\/[0-9]{2}\t/s);
		if (!m)
		{
			throw new Error('Cannot recognize file format');
		}

		const p = m[1].split("\t");
		if (p[VifParser.colIdx.DATE]      !== 'Date livr.'
			|| !p[VifParser.colIdx.BL]?.match(/^n.*BL/)
			|| p[VifParser.colIdx.ARTICLE] !== 'Article'
			|| !p[VifParser.colIdx.LIBELLE]?.startsWith('Libell')
			|| p[VifParser.colIdx.LOT]     !== 'Lot'
			|| p[VifParser.colIdx.POIDS]   !== 'Kg Brut')
		{
			throw new Error('Cannot match column headers');
		}

		const obj = new this(planningMap);
		for (const custData of input.matchAll(/Client : \t.*?\n\r?\n/gs))
		{
			obj.parseCustomerData(custData[0]);
		}

		return obj;
	}

	parseCustomerData(custData)
	{
		const lines = custData.split(/\r?\n/)[Symbol.iterator]();

		// Extract the "Code VIF" value from the first line
		const currentVif = +lines.next().value.match(/\d+/)[0];

		// Consume the next line of headers
		lines.next();

		let currentBl, currentBlId, currentDate, currentTick;
		for (const line of lines)
		{
			const cols = line.split("\t");
			if (cols.length < 2)
			{
				break;
			}
			if (cols[VifParser.colIdx.ARTICLE] === '')
			{
				continue;
			}
			if (cols[VifParser.colIdx.DATE] !== '')
			{
				const rawDate = cols[0];
				const [d, m, y] = rawDate.split('/');
				currentDate = VifParser._getSheetsSerial(+y + 2000, m, d);
				currentTick = this.planningMap[rawDate] || 0;
			}
			if (cols[VifParser.colIdx.BL] !== '')
			{
				if (currentBl)
				{
					this.blRows.push(this.serializeBl(currentBl));
				}
				currentBlId = +cols[VifParser.colIdx.BL];
				currentBl = this.createBl(currentVif, currentDate, currentBlId, currentTick);
			}

			const articleId = +cols[VifParser.colIdx.ARTICLE];
			if (VifParser.IGNORED_ARTICLES[articleId])
			{
				continue;
			}

			const weight = +(cols[VifParser.colIdx.POIDS].replace(',', '.'));
			currentBl.weight += weight;
			this.itemRows.push([
				currentBlId,
				articleId,
				weight,
				cols[VifParser.colIdx.LIBELLE]
			]);
			VifParser._updateBlStats(currentBl, cols);
		}

		if (currentBl)
		{
			this.blRows.push(this.serializeBl(currentBl));
		}
	}

	static _updateBlStats(bl, cols)
	{
		const articleId = +cols[VifParser.colIdx.ARTICLE];
		const family = VifParser.SPECIAL_FAMILY[articleId] || (Math.floor(articleId / 10000) % 10);

		if (family === 1)
		{
			++bl.pSec;
			if (articleId >= 910000 && articleId <= 919999)
			{
				++bl.cntLait;
			}
		}
		else if (family === 2)
		{
			++bl.pFrais;
			if (articleId >= 4520000 && articleId <= 4529999)
			{
				++bl.cntFl;
			}
		}
		else if (family === 3)
		{
			++bl.pSurgel;
		}

		const src = articleId % 10;
		if (src === 9)
		{
			++bl.cntFSE;
		}
		else if (src === 3)
		{
			++bl.cntCNES;
		}

		if (cols[VifParser.colIdx.LOT].startsWith('proxidon'))
		{
			++bl.cntProxidon;
		}
	}

	createBl(vif, date, id, tick)
	{
		return {
			vif:         vif,
			date:        date,
			tick:        tick,
			id:          id,
			weight:      0,
			pSec:        0,
			pFrais:      0,
			pSurgel:     0,
			cntFl:       0,
			cntLait:     0,
			cntCNES:     0,
			cntFSE:      0,
			cntProxidon: 0
		};
	}

	serializeBl(bl)
	{
		return [
			bl.vif,
			bl.date,
			bl.tick,
			bl.id,
			VifParser._determineBLType(bl),
			VifParser._determinePassageType(bl),
			bl.weight
		];
	}

	static _determineBLType(bl)
	{
		if (bl.cntProxidon > 0)
		{
			return 'Proxidon';
		}
		if (bl.pSurgel > 0)
		{
			return 'Surgelé';
		}
		if (bl.pFrais > 0)
		{
			return 'Frais';
		}
		if (bl.pSec > 0)
		{
			return (bl.pSec - bl.cntLait <= 3) ? 'Complément' : 'Sec';
		}
		return '';
	}

	static _determinePassageType(bl)
	{
		if (bl.cntProxidon > 0)
		{
			return '??';
		}
		if (bl.pSurgel > 0)
		{
			return 'Su';
		}
		if (bl.pFrais > 0)
		{
			return 'Fr';
		}
		if (bl.pSec > 0)
		{
			return 'Se';
		}
		return '??';
	}

	/**
	 * Converts year, month, day to a Google Sheets serial number.
	 * @param {number} y - Year (e.g., 2026)
	 * @param {number} m - Month (1-12)
	 * @param {number} d - Day (1-31)
	 * @return {number} Serial number compatible with Sheets
	 */
	static _getSheetsSerial(y, m, d)
	{
		// Constants for performance
		const SHEETS_EPOCH_MS = -2209161600000; // UTC for 1899-12-30
		const MS_PER_DAY = 86400000;

		// Date.UTC is highly optimized in V8 and avoids local DST shifts
		return (Date.UTC(y, m - 1, d) - SHEETS_EPOCH_MS) / MS_PER_DAY;
	}
}