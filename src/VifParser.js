class VifParser
{
	static get BL_TYPES()
	{
		return ['Sec', 'Frais', 'Surgelé', 'F&L', 'Proxidon', 'Complément'];
	}

	static get IGNORED_ARTICLES()
	{
		return [
			'5010010', // Articles de collecte gardés
			'6010070'  // Materiel autre
		];
	}

	static get SPECIAL_FAMILY_CHAR()
	{
		return {
			'4210011': '2', // Plat cuisiné viande ambiant => Frais
			'4710001': '2'  // Oeufs ambiants => Frais
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

	blRows   = [];
	itemRows = [];

	static parseBL(input)
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

		const obj = new this;
		for (const custData of input.matchAll(/Client : \t.*?\n\n/gs))
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

		let currentBl, currentBlId, currentDate;
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
				const [d, m, y] = cols[0].split('/');
				currentDate = [+y + 2000, +m - 1, +d];
			}
			if (cols[VifParser.colIdx.BL] !== '')
			{
				if (currentBl)
				{
					this.blRows.push(currentBl);
				}
				currentBlId = +cols[1];
				currentBl = [currentVif, ...currentDate, currentBlId, 0];
			}
			const weight = +(cols[VifParser.colIdx.POIDS].replace(',', '.'));
			currentBl[5] += weight;
			this.itemRows.push([
				currentBlId,
				+cols[VifParser.colIdx.ARTICLE],
				weight,
				cols[VifParser.colIdx.LIBELLE]
			]);
		}
		this.blRows.push(currentBl);

		console.log(this.blRows);
		console.log(this.itemRows);
	}

	/**
	 * Determines the 'Type BL' based on statistics.
	 * @param {Object} stats - The statistics for a single 'n° BL'.
	 * @return {string} The determined type.
	 * @private
	 */
	static _determineBLType(stats)
	{
		if (stats['Produits Proxidon'] > 0)
		{
			return 'Proxidon';
		}
		if (stats['Produits Surgelé'] > 0)
		{
			return 'Surgelé';
		}
		if (stats['Produits Frais'] > 0)
		{
			return (stats['Produits Frais'] === stats['Produits F&L']) ? 'F&L' : 'Frais';
		}
		if (stats['Produits Sec'] > 0)
		{
			return (stats['Produits Sec'] - stats['Lait ambiant'] <= 3) ? 'Complément' : 'Sec';
		}
		return '';
	}
}


VifParser.parseBL(
`

Rappel de la sélection
Date livr. :	01/01/2026 -> 18/04/2026	Filtre si Kg Net :	Egal à 0
Partenaire :	0000000000 -> 9999999988	Filtre si Kg Brut :	Egal à 0
Etat du BL :	A facturer,Facturé		
 	 	 	 



Client : 	01130004 -		Fondation St Jean de Dieu
Date livr.	n° BL	n° Cde	Article	Libellé	Lot	Kg Net	Kg Brut	P	COL
06/01/26	104622	97347	0110041	Patisserie/Viennoiserie	13253330259	22,950	27,000		
			0210031	Biscuits sucrés	13253330193	25,650	27,000		
			0610001	Chocolat/Barres chocolatées	13253330010	6,580	7,000		
			0610001	Chocolat/Barres chocolatées	13253340029	1,880	2,000		
			1010001	Farine/Maizena	13253330191	20,000	20,000		
			1110001	Pâtes ambiant	13253340083	17,000	17,000		
			1110001	Pâtes ambiant	13253350006	77,000	77,000		
			1110001	Pâtes ambiant	13253350019	206,000	206,000		
			1110051	Riz long/rond	13253330086	86,400	90,000		
			1310001	Potages/Soupes ambiants	13253320130	42,300	45,000		
			1410021	Mayo/Ketchup/Moutarde/Sauces	13253350061	71,100	90,000		
			1710001	Huile	13253330159	65,960	68,000		
			1910001	Sucre en morceaux	13253330175	45,000	45,000		
			2010001	Confitures/Miel/Pâte à tartin.	13253350064	21,760	32,000		
			2810011	Sodas/Jus de fruits ambiants	13253560003	87,300	90,000		
			4510001	Cons. légumes ambiant	13253330137	170,100	202,500		
			4510001	Cons. légumes ambiant	13253360020	56,700	67,500		
			4810001	Cons. viande/charcuterie amb	13253360022	15,300	17,000		
			4810001	Cons. viande/charcuterie amb	13253560004	45,900	51,000		
			6010010	Pdts Hygiène Famille		68,000	68,000		
						1152,880	1249,000	0	0
	104669	97548	4630349	Cuisses poulet surg 425 FSE24	13251010027	51,000	51,660	30	5
			4630549	Steak haché Lot 428 FSE24	13250070006	25,000	25,250	250	5
			4930149	Filet poiss surg Lot427 FSE24	13251550005	54,000	54,900	90	5
						130,000	131,810	370	15
	104682	97554	4210011	Plat cuisiné viande ambiant	13260060004	48,060	54,000		
			4210011	Plat cuisiné viande ambiant	13260060006	59,630	67,000		
			4320001	Pdts laitiers lotis réfrigérés	13260060002	85,560	92,000		
			4320001	Pdts laitiers lotis réfrigérés	13260060005	16,740	18,000		
			4320001	Pdts laitiers lotis réfrigérés	13260060014	81,840	88,000		
						291,830	319,000	0	0
	104685	97557	4520000	Légumes frais non lotis		223,200	240,000		
						223,200	240,000	0	0
09/01/26	104826	97638	4520000	Légumes frais non lotis		711,450	765,000		
						711,450	765,000	0	0
12/01/26	104919	97659	0910051	Lait ambiant	13253330168	34,000	34,000		6
			0910051	Lait ambiant	13253340030	66,000	66,000		11
			0910259	Lait UHT GJ 500 FSE25	13252620004	600,000	600,000	600	100
						700,000	700,000	600	117
13/01/26	104985	97733	4210011	Plat cuisiné viande ambiant	13260130008	35,600	40,000		
			4320001	Pdts laitiers lotis réfrigérés	13260090049	27,900	30,000		
			4320001	Pdts laitiers lotis réfrigérés	13260130015	51,150	55,000		
			4320001	Pdts laitiers lotis réfrigérés	13260130016	48,360	52,000		
			4520000	Légumes frais non lotis		104,160	112,000		
						267,170	289,000	0	0
15/01/26	105046	97784	4320001	Pdts laitiers lotis réfrigérés	13260090049	111,600	120,000		
			4520000	Légumes frais non lotis		269,700	290,000		
						381,300	410,000	0	0
16/01/26	105100	97798	1210031	Légumes secs à cuire	13260130003	214,370	221,000		
						214,370	221,000	0	0
	105119	97810	4520000	Légumes frais non lotis		177,630	191,000		
						177,630	191,000	0	0


`);
