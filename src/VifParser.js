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

	blRows   = [['Code VIF', 'Date', 'BL', 'Type BL', 'Type Passage', 'Total Kg Brut', 'Produits Sec', 'Produits Frais', 'Produits Surgelé', 'Nb F&L', 'Nb Lait Ambiant', 'Nb CNES', 'Nb FSE+', 'Nb Proxidon']];
	itemRows = [['BL', 'Article', 'Kg Brut', 'Libellé']];

	getBlRows()
	{
		return this.blRows;
	}

	getItemRows()
	{
		return this.itemRows;
	}

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
					this.blRows.push(this.serializeBl(currentBl));
				}
				currentBlId = +cols[VifParser.colIdx.BL];
				currentBl = this.createBl(currentVif, currentDate, currentBlId);
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

		const src = articleId % 9;
		if (src === 9)
		{
			++bl.cntFSE;
		}
		else if (src === 3)
		{
			++bl.cntCNES;
		}

		if (cols[VifParser.colIdx.LIBELLE].startsWith('proxidon'))
		{
			++bl.cntProxidon;
		}
	}

	createBl(vif, date, id)
	{
		return {
			vif:         vif,
			date:        date,
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
			bl.id,
			VifParser._determineBLType(bl),
			VifParser._determinePassageType(bl),
			bl.weight,
			bl.pSec,
			bl.pFrais,
			bl.pSurgel,
			bl.cntFl,
			bl.cntLait,
			bl.cntCNES,
			bl.cntFSE,
			bl.cntProxidon
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
}


const parser=VifParser.parseBL(
`


Rappel de la s�lection
Date livr. :	01/01/2025 -> 31/12/2025	Filtre si Kg Net :	Egal � 0
Partenaire :	0000000000 -> 9999999999	Filtre si Kg Brut :	Egal � 0
Etat du BL :	A facturer,Factur�		
 	 	 	 



Client : 	01130004 -		Fondation St Jean de Dieu
Date livr.	n� BL	n� Cde	Article	Libell�	Lot	Kg Net	Kg Brut	P	COL
06/01/25	91891	 	4320001	Pdts laitiers lotis r�frig�r�s	proxidon05	299,460	322,000		
						299,460	322,000	0	0
	91892	 	4320001	Pdts laitiers lotis r�frig�r�s	proxidon05	465,000	500,000		
						465,000	500,000	0	0
07/01/25	91626	89574	0210031	Biscuits sucr�s	13243300044	9,500	10,000		
			0410001	Poudre petit d�jeuner	13243320053	11,570	13,000		
			0610001	Chocolat/Barres chocolat�es	13243280080	4,700	5,000		
			1010001	Farine/Maizena	13243280207	12,000	12,000		
			1110001	P�tes ambiant	13243300089	25,000	25,000		
			1110001	P�tes ambiant	13243300094	125,000	125,000		
			1110051	Riz long/rond	13243290071	48,000	50,000		
			1710001	Huile	13243630005	41,225	42,500		
			1910249	Sucre poudre SFRC 104 FSE24	13241830004	24,000	24,816	24	3
			2810011	Sodas/Jus de fruits ambiants	13243260001	47,530	49,000		
			2810011	Sodas/Jus de fruits ambiants	13243620006	25,220	26,000		
			4510001	Cons. l�gumes ambiant	13243280250	126,000	150,000		
			4910001	Cons. poisson/crustac�s	13243270119	38,500	50,000		
			6010010	Pdts Hygi�ne Famille		38,000	38,000		
						576,245	620,316	24	3
	91790	89734	0910051	Lait ambiant	13241690020	1050,000	1050,000		175
			1730139	Beurre doux surg326 RUMI FSE23	13241200026	10,000	10,120	40	1
			4320149	Emmental 426 GUILLOT FSE24	13243380010	30,000	30,480	120	3
			4630001	Viande surgel�e	13240680004	14,400	16,000		
			4630639	Steak hach� Lot 331 FSE23	13242050028	15,000	15,150	150	3
			4630738	Poulet Fermier LR MMPT 23	13243170060	27,000	27,210	15	3
			4930001	Poisson/crustac� surgel�	13242960008	19,210	22,600		
			4930149	Filet poiss surg Lot427 FSE24	13242840003	32,400	32,940	54	3
						1198,010	1204,500	379	188
08/01/25	91866	89771	0119000	Pain/Viennoiserie non lotis		10,800	12,000		
			4210011	Plat cuisin� viande ambiant	13250090017	16,020	18,000		
			4210011	Plat cuisin� viande ambiant	13250090018	59,630	67,000		
			4210011	Plat cuisin� viande ambiant	13250090019	16,020	18,000		
			4320001	Pdts laitiers lotis r�frig�r�s	13250090013	19,530	21,000		
			4320001	Pdts laitiers lotis r�frig�r�s	13250090015	23,250	25,000		
			4520138	F&L Axe 1 MMPT23		213,900	230,000		
			4620001	Viande r�frig�r�e	13250090014	15,000	15,000		
			4620001	Viande r�frig�r�e	13250090016	120,000	120,000		
						494,150	526,000	0	0
09/01/25	91959	 	2810011	Sodas/Jus de fruits ambiants	proxidon08	485,000	500,000		
						485,000	500,000	0	0
	91960	 	2810011	Sodas/Jus de fruits ambiants	proxidon08	210,230	216,732		
						210,230	216,732	0	0
	91961	 	2810011	Sodas/Jus de fruits ambiants	proxidon08	485,000	500,000		
						485,000	500,000	0	0
	91962	 	2810011	Sodas/Jus de fruits ambiants	proxidon08	485,000	500,000		
						485,000	500,000	0	0
	91963	 	2810011	Sodas/Jus de fruits ambiants	proxidon08	485,000	500,000		
						485,000	500,000	0	0
	91964	 	2810011	Sodas/Jus de fruits ambiants	proxidon08	485,000	500,000		
						485,000	500,000	0	0
	91965	 	2810011	Sodas/Jus de fruits ambiants	proxidon08	485,000	500,000		
						485,000	500,000	0	0
	91966	 	2810011	Sodas/Jus de fruits ambiants	proxidon08	485,000	500,000		
						485,000	500,000	0	0
13/01/25	92075	89894	4210011	Plat cuisin� viande ambiant	13250130014	16,020	18,000		
			4320001	Pdts laitiers lotis r�frig�r�s	13250130013	39,060	42,000		
			4520148	F&L Axe 1 MMPT24		239,010	257,000		
			4620001	Viande r�frig�r�e	13250130015	21,000	21,000		
						315,090	338,000	0	0
15/01/25	92108	89954	0119000	Pain/Viennoiserie non lotis		8,100	9,000		
			4210011	Plat cuisin� viande ambiant	13250150014	80,100	90,000		
			4210011	Plat cuisin� viande ambiant	13250150015	16,020	18,000		
			4210011	Plat cuisin� viande ambiant	13250150016	30,260	34,000		
			4220031	Plat cuisin� viande r�frig�r�	84250080326	14,040	18,000		
			4320001	Pdts laitiers lotis r�frig�r�s	13250150001	49,290	53,000		
			4320021	Fromages	13243440004	13,950	15,000		
			4520148	F&L Axe 1 MMPT24		259,470	279,000		
			4710001	Oeufs ambiants	13250150013	5,460	6,000		
						476,690	522,000	0	0
21/01/25	92250	89863	0110041	Patisserie/Viennoiserie	13243280277	8,500	10,000		
			0210031	Biscuits sucr�s	13243280075	9,500	10,000		
			0410001	Poudre petit d�jeuner	13243300036	11,570	13,000		
			0410339	C�r�ales 311 BRUGGEN FSE23	13241690003	22,500	26,700	60	5
			0610001	Chocolat/Barres chocolat�es	13243270137	7,520	8,000		
			0910149	Lait UHT GJ 103 FSE24	13242910030	300,000	300,000	300	50
			1010001	Farine/Maizena	13243280072	5,000	5,000		
			1110001	P�tes ambiant	13243290074	122,000	122,000		
			1110001	P�tes ambiant	13243300062	28,000	28,000		
			1110051	Riz long/rond	13243280049	48,000	50,000		
			1310001	Potages/Soupes ambiants	13243300040	23,500	25,000		
			1410021	Mayo/Ketchup/Moutarde/Sauces	13243290077	19,750	25,000		
			1710001	Huile	13243270097	36,860	38,000		
			2810011	Sodas/Jus de fruits ambiants	13250020011	72,750	75,000		
			4510001	Cons. l�gumes ambiant	13243270129	102,480	122,000		
			4510001	Cons. l�gumes ambiant	13243270140	23,520	28,000		
			4810001	Cons. viande/charcuterie amb	13243290011	34,200	38,000		
			4910001	Cons. poisson/crustac�s	13240860009	19,250	25,000		
			6010010	Pdts Hygi�ne Famille		38,000	38,000		
						932,900	986,700	360	55
	92315	90073	1730139	Beurre doux surg326 RUMI FSE23	13241200026	30,000	30,360	120	3
			4320149	Emmental 426 GUILLOT FSE24	13243380009	30,000	30,480	120	3
			4410001	Cons. fruit/Compote amb.	83241650048	35,600	40,000		
			4530001	L�gumes surgel�s	2A243530001	28,260	31,400		
			4630001	Viande surgel�e	13240680004	22,050	24,500		
			4630549	Steak hach� Lot 428 FSE24	13242770004	15,000	15,150	150	3
			4930001	Poisson/crustac� surgel�	13242960010	19,210	22,600		
			4930039	Filet poiss surg Lot330 FSE23	13241900009	32,400	32,940	54	3
						212,520	227,430	444	12
	92379	90089	4210011	Plat cuisin� viande ambiant	13250220002	37,380	42,000		
			4210011	Plat cuisin� viande ambiant	13250220003	42,720	48,000		
			4320001	Pdts laitiers lotis r�frig�r�s	13250220011	46,500	50,000		
			4320001	Pdts laitiers lotis r�frig�r�s	13250220012	34,410	37,000		
			4520148	F&L Axe 1 MMPT24		225,990	243,000		
			4620001	Viande r�frig�r�e	13250220013	30,000	30,000		
			4620001	Viande r�frig�r�e	13250220014	35,000	35,000		
						452,000	485,000	0	0
22/01/25	92394	90112	4230031	Plat cuisin� viande surgel�	84230890074	21,250	25,000		
			4630738	Poulet Fermier LR MMPT 23	13243170062	27,000	27,210	15	3
			4930001	Poisson/crustac� surgel�	13242960010	9,605	11,300		
						57,855	63,510	15	3
	92402	90126	4210011	Plat cuisin� viande ambiant	13250220027	35,600	40,000		
			4710001	Oeufs ambiants	13250220028	22,750	25,000		
						58,350	65,000	0	0
24/01/25	92471	90162	4520000	L�gumes frais non lotis		453,840	488,000		
						453,840	488,000	0	0
28/01/25	92645	90235	0119000	Pain/Viennoiserie non lotis		33,300	37,000		
			4520148	F&L Axe 1 MMPT24		195,300	210,000		
			4620001	Viande r�frig�r�e	13250280005	23,000	23,000		
			4620001	Viande r�frig�r�e	13250280006	47,500	47,500		
			4710001	Oeufs ambiants	13250280008	9,100	10,000		
			4920001	Poisson r�frig�r�	13250280007	13,860	18,000		
						322,060	345,500	0	0
	92693	90247	4210011	Plat cuisin� viande ambiant	13250290009	31,150	35,000		
			4320001	Pdts laitiers lotis r�frig�r�s	13250290003	55,800	60,000		
			4320001	Pdts laitiers lotis r�frig�r�s	13250290004	41,850	45,000		
			4320021	Fromages	13243440004	31,620	34,000		
			4520148	F&L Axe 1 MMPT24		207,390	223,000		
			4620001	Viande r�frig�r�e	13250290013	105,000	105,000		
						472,810	502,000	0	0
29/01/25	92652	90277	4410001	Cons. fruit/Compote amb.	13250240002	68,530	77,000		
						68,530	77,000	0	0
03/02/25	92876	90384	4520000	L�gumes frais non lotis		190,650	205,000		
						190,650	205,000	0	0
04/02/25	92718	90295	0110041	Patisserie/Viennoiserie	13243300155	8,500	10,000		
			0210031	Biscuits sucr�s	13243280012	18,050	19,000		
			0210031	Biscuits sucr�s	13243280025	0,950	1,000		
			0410001	Poudre petit d�jeuner	13250020013	4,450	5,000		
			0610001	Chocolat/Barres chocolat�es	13250140004	2,820	3,000		
			0610001	Chocolat/Barres chocolat�es	30/06/2025	32,900	35,000		
			1110001	P�tes ambiant	13243280284	50,000	50,000		
			1110051	Riz long/rond	13243270036	48,000	50,000		
			1111339	Graine Cous JYCO LOT306 FSE23	13242340003	45,000	46,350	90	5
			1210239	Pois Chiches 312 JYCO FSE23	13240530005	62,400	78,000	156	13
			1310001	Potages/Soupes ambiants	13243280260	18,800	20,000		
			1410021	Mayo/Ketchup/Moutarde/Sauces	13243280154	15,800	20,000		
			1710001	Huile	21230810002	36,860	38,000		
			2810011	Sodas/Jus de fruits ambiants	13250140006	121,250	125,000		
			4510001	Cons. l�gumes ambiant	13243280161	42,000	50,000		
			4510001	Cons. l�gumes ambiant	13240650002	37,800	45,000		
			4510929	PpoiscarttDAUCY Lot101 UE22	13230480002	124,800	151,320	156	13
			4810001	Cons. viande/charcuterie amb	13243280211	18,000	20,000		
			6010010	Pdts Hygi�ne Famille		50,000	50,000		
						738,380	816,670	402	31
	92915	90421	0910149	Lait UHT GJ 103 FSE24	13243040040	750,000	750,000	750	125
			1730139	Beurre doux surg326 RUMI FSE23	13233560013	30,000	30,360	120	3
			4530001	L�gumes surgel�s	2A243530001	18,720	20,800		
			4630001	Viande surgel�e	13240680004	4,500	5,000		
			4630549	Steak hach� Lot 428 FSE24	13242770005	15,000	15,150	150	3
			4630738	Poulet Fermier LR MMPT 23	13242190003	27,000	27,210	15	3
			4930001	Poisson/crustac� surgel�	13242960011	19,125	22,500		
			4930039	Filet poiss surg Lot330 FSE23	13241900009	32,400	32,940	54	3
						896,745	903,960	1089	137
05/02/25	92946	90440	4210011	Plat cuisin� viande ambiant	13250360010	72,980	82,000		
			4210011	Plat cuisin� viande ambiant	13250360011	70,310	79,000		
			4320001	Pdts laitiers lotis r�frig�r�s	13250360013	32,550	35,000		
			4620001	Viande r�frig�r�e	13250360012	70,000	70,000		
						245,840	266,000	0	0
06/02/25	92974	90463	4520148	F&L Axe 1 MMPT24		675,180	726,000		
						675,180	726,000	0	0
10/02/25	93320	 	2810011	Sodas/Jus de fruits ambiants	proxidon08	96,511	99,496		
						96,511	99,496	0	0
	93321	 	2810011	Sodas/Jus de fruits ambiants	proxidon08	485,000	500,000		
						485,000	500,000	0	0
	93322	 	2810011	Sodas/Jus de fruits ambiants	proxidon08	485,000	500,000		
						485,000	500,000	0	0
	93323	 	2810011	Sodas/Jus de fruits ambiants	proxidon08	485,000	500,000		
						485,000	500,000	0	0
	93324	 	2810011	Sodas/Jus de fruits ambiants	proxidon08	485,000	500,000		
						485,000	500,000	0	0
11/02/25	93203	90593	1210031	L�gumes secs � cuire	13250410005	36,860	38,000		
						36,860	38,000	0	0
	93221	90605	4210011	Plat cuisin� viande ambiant	13250420007	11,570	13,000		
			4320001	Pdts laitiers lotis r�frig�r�s	13250420005	41,850	45,000		
			4320001	Pdts laitiers lotis r�frig�r�s	13250420023	23,250	25,000		
			4620001	Viande r�frig�r�e	13250420015	90,000	90,000		
			4710001	Oeufs ambiants	13250130001	10,010	11,000		
			4920001	Poisson r�frig�r�	13250420022	12,320	16,000		
			4920001	Poisson r�frig�r�	13250420024	13,860	18,000		
						202,860	218,000	0	0
	93223	90604	4520000	L�gumes frais non lotis		288,300	310,000		
						288,300	310,000	0	0
	93232	90613	4520000	L�gumes frais non lotis		346,890	373,000		
						346,890	373,000	0	0
12/02/25	93264	90649	4520148	F&L Axe 1 MMPT24		206,460	222,000		
						206,460	222,000	0	0
14/02/25	93392	90724	4520148	F&L Axe 1 MMPT24		474,300	510,000		
						474,300	510,000	0	0
18/02/25	93365	90662	0110041	Patisserie/Viennoiserie	13250150060	3,400	4,000		
			0210031	Biscuits sucr�s	13243290016	19,000	20,000		
			0410001	Poudre petit d�jeuner	13243550025	3,560	4,000		
			0610001	Chocolat/Barres chocolat�es	13250310004	35,720	38,000		
			0910149	Lait UHT GJ 103 FSE24	13243110002	240,000	240,000	240	40
			1110001	P�tes ambiant	13243270152	20,000	20,000		
			1110051	Riz long/rond	13243280269	19,200	20,000		
			1310001	Potages/Soupes ambiants	13243290022	18,800	20,000		
			1410021	Mayo/Ketchup/Moutarde/Sauces	13243280292	19,750	25,000		
			1710001	Huile	13241170008	36,860	38,000		
			2810011	Sodas/Jus de fruits ambiants	13250410006	24,250	25,000		
			4510001	Cons. l�gumes ambiant	13243270098	126,000	150,000		
			4510001	Cons. l�gumes ambiant	13240650002	37,800	45,000		
			6010010	Pdts Hygi�ne Famille		50,000	50,000		
						654,340	699,000	240	40
	93551	90796	1730139	Beurre doux surg326 RUMI FSE23	13241200026	30,000	30,360	120	3
			4630549	Steak hach� Lot 428 FSE24	13242770006	15,000	15,150	150	3
			4930149	Filet poiss surg Lot427 FSE24	13243450031	32,400	32,940	54	3
						77,400	78,450	324	9
24/02/25	93699	90864	4210001	Plat cuisin� v�g�t. ambiant	13250550026	22,250	25,000		
			4210011	Plat cuisin� viande ambiant	13250550022	35,600	40,000		
			4210011	Plat cuisin� viande ambiant	13250550024	8,455	9,500		
			4210011	Plat cuisin� viande ambiant	13250550039	5,340	6,000		
			4210011	Plat cuisin� viande ambiant	13250550050	24,920	28,000		
			4320001	Pdts laitiers lotis r�frig�r�s	13250550028	4,650	5,000		
			4320001	Pdts laitiers lotis r�frig�r�s	13250550035	26,040	28,000		
			4320001	Pdts laitiers lotis r�frig�r�s	13250550051	63,240	68,000		
			4520148	F&L Axe 1 MMPT24		526,380	566,000		
			4620001	Viande r�frig�r�e	13250550036	36,000	36,000		
			4620001	Viande r�frig�r�e	13250550048	82,000	82,000		
						834,875	893,500	0	0
25/02/25	93856	90959	4210011	Plat cuisin� viande ambiant	13250560015	33,820	38,000		
			4320001	Pdts laitiers lotis r�frig�r�s	13250560013	36,270	39,000		
			4320001	Pdts laitiers lotis r�frig�r�s	13250560014	18,600	20,000		
			4520148	F&L Axe 1 MMPT24		384,090	413,000		
						472,780	510,000	0	0
	93888	90994	0119000	Pain/Viennoiserie non lotis		15,300	17,000		
			4210011	Plat cuisin� viande ambiant	13250560051	49,840	56,000		
			4210011	Plat cuisin� viande ambiant	13250560055	33,820	38,000		
			4320001	Pdts laitiers lotis r�frig�r�s	13250560052	123,690	133,000		
			4320001	Pdts laitiers lotis r�frig�r�s	13250560054	88,350	95,000		
			4520148	F&L Axe 1 MMPT24		236,220	254,000		
			4620001	Viande r�frig�r�e	13250560053	22,000	22,000		
						569,220	615,000	0	0
27/02/25	93930	91055	4520148	F&L Axe 1 MMPT24		372,930	401,000		
						372,930	401,000	0	0
03/03/25	94058	91142	4520148	F&L Axe 1 MMPT24		312,480	336,000		
						312,480	336,000	0	0
04/03/25	94010	91003	0410549	Choco poud 403 GUILLOT FSE24	13243370010	6,000	6,600	12	1
			0610001	Chocolat/Barres chocolat�es	13250480006	1,410	1,500		
			0610001	Chocolat/Barres chocolat�es	13250570001	0,940	1,000		
			0610001	Chocolat/Barres chocolat�es	13250570009	68,150	72,500		
			1010439	Pur�e Pomm Poir 315 JYCO FSE23	13233560006	62,400	69,420	156	13
			1010449	Pur�e PdT floc. JYCO 416 FSE24	13243030020	35,000	40,320	70	5
			1110001	P�tes ambiant	13243290057	50,000	50,000		
			1110051	Riz long/rond	13240880009	48,000	50,000		
			1410021	Mayo/Ketchup/Moutarde/Sauces	13243540010	15,800	20,000		
			1710001	Huile	13241170008	72,750	75,000		
			2810011	Sodas/Jus de fruits ambiants	13243410005	225,525	232,500		
			2810011	Sodas/Jus de fruits ambiants	13250450010	16,975	17,500		
			4510001	Cons. l�gumes ambiant	13223130006	8,400	10,000		
			4510839	HaricotsvDISCHAMP Lot100FSE23	13241970013	144,000	163,800	180	15
			6010010	Pdts Hygi�ne Famille		50,000	50,000		
						805,350	860,140	418	34
	94093	91176	1730149	Beurre doux surg424 RUMI FSE24	13243450058	30,000	30,360	120	3
			4320021	Fromages	83250570066	6,975	7,500		
			4320149	Emmental 426 GUILLOT FSE24	13250500014	30,000	30,480	120	3
			4630001	Viande surgel�e	13250560031	11,610	12,900		
			4630549	Steak hach� Lot 428 FSE24	13242770007	15,000	15,150	150	3
			4930149	Filet poiss surg Lot427 FSE24	13243450034	32,400	32,940	54	3
						125,985	129,330	444	12
	94098	91192	4520148	F&L Axe 1 MMPT24		372,930	401,000		
						372,930	401,000	0	0
	94103	91187	4210011	Plat cuisin� viande ambiant	13250630010	29,370	33,000		
			4210011	Plat cuisin� viande ambiant	13250630015	23,140	26,000		
			4320001	Pdts laitiers lotis r�frig�r�s	13250570005	33,480	36,000		
			4320001	Pdts laitiers lotis r�frig�r�s	13250630020	53,940	58,000		
			4520148	F&L Axe 1 MMPT24		283,650	305,000		
			4620001	Viande r�frig�r�e	13250630019	42,000	42,000		
			4620001	Viande r�frig�r�e	13250630021	65,000	65,000		
			4620001	Viande r�frig�r�e	13250630022	35,000	35,000		
						565,580	600,000	0	0
06/03/25	94192	91258	4520148	F&L Axe 1 MMPT24		404,550	435,000		
						404,550	435,000	0	0
	94305	 	4320001	Pdts laitiers lotis r�frig�r�s	proxidon05	189,720	204,000		
						189,720	204,000	0	0
	94306	 	4320001	Pdts laitiers lotis r�frig�r�s	proxidon05	465,000	500,000		
						465,000	500,000	0	0
	94307	 	4320001	Pdts laitiers lotis r�frig�r�s	proxidon05	231,570	249,000		
						231,570	249,000	0	0
12/03/25	94443	91388	4210011	Plat cuisin� viande ambiant	13250710006	47,170	53,000		
			4210011	Plat cuisin� viande ambiant	13250710007	51,620	58,000		
			4210011	Plat cuisin� viande ambiant	13250710008	38,270	43,000		
						137,060	154,000	0	0
14/03/25	94515	91451	4520148	F&L Axe 1 MMPT24		623,100	670,000		
						623,100	670,000	0	0
18/03/25	94537	91421	0610001	Chocolat/Barres chocolat�es	13250280021	71,440	76,000		
			1010449	Pur�e PdT floc. JYCO 416 FSE24	13250130003	35,000	40,320	70	5
			1110001	P�tes ambiant	13243280088	100,000	100,000		
			1110051	Riz long/rond	13240880008	72,000	75,000		
			1210439	Flageolets DAUCY  Lot102 FSE23	13233390011	72,000	87,300	180	15
			1410021	Mayo/Ketchup/Moutarde/Sauces	13250200002	16,195	20,500		
			1710001	Huile	13241170008	72,750	75,000		
			2810011	Sodas/Jus de fruits ambiants	13250640006	171,205	176,500		
			2810011	Sodas/Jus de fruits ambiants	13250700003	71,295	73,500		
			4510839	HaricotsvDISCHAMP Lot100FSE23	13241970013	144,000	163,800	180	15
			4511139	PpoiscarD'AUCY Lot101FSE23	13232820007	144,000	174,600	180	15
			6010010	Pdts Hygi�ne Famille		19,000	19,000		
						988,885	1081,520	610	50
	94702	91544	1730149	Beurre doux surg424 RUMI FSE24	13250410026	30,000	30,360	120	3
			4320021	Fromages	83250570066	6,975	7,500		
			4320021	Fromages	13250650001	3,720	4,000		
			4630001	Viande surgel�e	13250560032	11,610	12,900		
			4630549	Steak hach� Lot 428 FSE24	13242770008	15,000	15,150	150	3
			4930001	Poisson/crustac� surgel�	13250240009	16,371	19,260		
			4930149	Filet poiss surg Lot427 FSE24	13243450038	32,400	32,940	54	3
						116,076	122,110	324	9
19/03/25	94765	91597	0119000	Pain/Viennoiserie non lotis		18,000	20,000		
			4210011	Plat cuisin� viande ambiant	13250770014	83,660	94,000		
			4520148	F&L Axe 1 MMPT24		216,690	233,000		
			4620001	Viande r�frig�r�e	13250770024	80,000	80,000		
			4710001	Oeufs ambiants	13250770025	10,920	12,000		
						409,270	439,000	0	0
	94767	91609	4520148	F&L Axe 1 MMPT24		314,340	338,000		
						314,340	338,000	0	0
	94779	91590	4520148	F&L Axe 1 MMPT24		93,000	100,000		
						93,000	100,000	0	0
24/03/25	94976	91706	4210001	Plat cuisin� v�g�t. ambiant	13250830011	22,250	25,000		
			4520148	F&L Axe 1 MMPT24		455,700	490,000		
			4620001	Viande r�frig�r�e	13250830012	46,000	46,000		
			4620001	Viande r�frig�r�e	13250830013	116,000	116,000		
						639,950	677,000	0	0
25/03/25	95028	91725	1110031	Couscous/Semoule/Autre f�cul.	13250570004	50,000	50,000		
						50,000	50,000	0	0
	95050	91728	0119000	Pain/Viennoiserie non lotis		25,200	28,000		
			4210011	Plat cuisin� viande ambiant	13250840027	18,690	21,000		
			4210011	Plat cuisin� viande ambiant	13250840028	57,850	65,000		
			4320001	Pdts laitiers lotis r�frig�r�s	13250840034	35,340	38,000		
			4520148	F&L Axe 1 MMPT24		355,260	382,000		
			4620001	Viande r�frig�r�e	13250840037	45,000	45,000		
			4620001	Viande r�frig�r�e	13250840038	39,000	39,000		
						576,340	618,000	0	0
	95187	 	2810011	Sodas/Jus de fruits ambiants	proxidon08	485,000	500,000		
						485,000	500,000	0	0
	95188	 	2810011	Sodas/Jus de fruits ambiants	proxidon08	485,000	500,000		
						485,000	500,000	0	0
	95189	 	2810011	Sodas/Jus de fruits ambiants	proxidon08	485,000	500,000		
						485,000	500,000	0	0
	95190	 	2810011	Sodas/Jus de fruits ambiants	proxidon08	200,464	206,664		
						200,464	206,664	0	0
27/03/25	95092	91793	4210011	Plat cuisin� viande ambiant	13250850012	37,380	42,000		
			4210011	Plat cuisin� viande ambiant	13250850013	49,840	56,000		
			4210011	Plat cuisin� viande ambiant	13250850014	16,020	18,000		
			4520148	F&L Axe 1 MMPT24		427,800	460,000		
			4620001	Viande r�frig�r�e	13250850015	99,000	99,000		
						630,040	675,000	0	0
28/03/25	95179	91851	4520148	F&L Axe 1 MMPT24		352,470	379,000		
						352,470	379,000	0	0
01/04/25	95109	91714	0210021	M�lange ap�ro/Graines	13250830007	19,400	20,000		
			0410249	C�r�ales choco JYCO 401 FSE24	13250620013	13,500	16,092	36	3
			0410449	Choco poud 403 SFRC FSE24	13250550065	30,000	30,660	60	5
			0610001	Chocolat/Barres chocolat�es	13250840009	70,500	75,000		
			0910149	Lait UHT GJ 103 FSE24	13250770001	150,000	150,000	150	25
			1010249	Farine type 55 405 JYCO FSE24	13243030035	50,000	50,500	50	5
			1010439	Pur�e Pomm Poir 315 JYCO FSE23	13241160021	62,400	69,420	156	13
			1010449	Pur�e PdT floc. JYCO 416 FSE24	13250560043	21,000	24,192	42	3
			1110001	P�tes ambiant	13241270009	250,000	250,000		
			1110051	Riz long/rond	13240880007	72,000	75,000		
			1111239	Graine Cous SFRC LOT306 FSE23	13242210011	30,000	31,560	60	5
			1210439	Flageolets DAUCY  Lot102 FSE23	13233390011	120,000	145,500	300	25
			1710001	Huile	13250550025	51,410	53,000		
			2010149	Confitur abrico SFRC 404 FSE24	13250620006	21,900	31,200	60	5
			4410239	P�ches sirop 309 JYCO FSE23	13241620016	39,840	44,160	48	8
			4510939	HaricotvertD'AUCY L100FSE23	13240960002	124,800	151,320	156	13
			4511139	PpoiscarD'AUCY Lot101FSE23	13232820007	240,000	291,000	300	25
			4910129	Maquereaux tomate 238 UE22	13232000024	63,360	70,560	360	15
			4910649	Thon naturel JEALSA 420 FSE24	13243370016	44,400	53,280	240	5
			6010010	Pdts Hygi�ne Famille		25,000	25,000		
						1499,510	1657,444	2018	155
	95335	91947	4520000	L�gumes frais non lotis		93,000	100,000		
						93,000	100,000	0	0
02/04/25	95342	91951	1210031	L�gumes secs � cuire	13250920004	31,525	32,500		
						31,525	32,500	0	0
	95352	91958	0910149	Lait UHT GJ 103 FSE24	13250770001	150,000	150,000	150	25
						150,000	150,000	150	25
	95354	91976	1730149	Beurre doux surg424 RUMI FSE24	13243450060	30,000	30,360	120	3
			4320021	Fromages	13250650002	4,650	5,000		
			4320149	Emmental 426 GUILLOT FSE24	13250500015	30,000	30,480	120	3
			4630549	Steak hach� Lot 428 FSE24	13242770011	15,000	15,150	150	3
			4930001	Poisson/crustac� surgel�	13250240009	16,371	19,260		
			4930118	Poisson surg SubvlotsInfr21bis	13240610034	25,000	27,500	100	10
						121,021	127,750	490	19
	95580	91967	4320001	Pdts laitiers lotis r�frig�r�s	13250850011	48,360	52,000		
			4520148	F&L Axe 1 MMPT24		270,630	291,000		
						318,990	343,000	0	0
04/04/25	95442	92035	4520148	F&L Axe 1 MMPT24		544,050	585,000		
						544,050	585,000	0	0
	95528	92043	4210001	Plat cuisin� v�g�t. ambiant	13250970008	58,740	66,000		
			4320001	Pdts laitiers lotis r�frig�r�s	13250970003	91,140	98,000		
			4320001	Pdts laitiers lotis r�frig�r�s	13250970004	13,950	15,000		
			4320001	Pdts laitiers lotis r�frig�r�s	13250970010	53,010	57,000		
			4620001	Viande r�frig�r�e	13250970009	32,000	32,000		
			4710001	Oeufs ambiants	13250900004	5,460	6,000		
						254,300	274,000	0	0
08/04/25	95614	92166	4520148	F&L Axe 1 MMPT24		183,210	197,000		
						183,210	197,000	0	0
	95618	92138	4210011	Plat cuisin� viande ambiant	13250980031	53,400	60,000		
			4210011	Plat cuisin� viande ambiant	13250980038	24,920	28,000		
			4320001	Pdts laitiers lotis r�frig�r�s	13250980037	29,760	32,000		
			4620001	Viande r�frig�r�e	13250980035	8,000	8,000		
			4620001	Viande r�frig�r�e	13250980036	48,000	48,000		
						164,080	176,000	0	0
09/04/25	95663	92188	4520148	F&L Axe 1 MMPT24		344,100	370,000		
						344,100	370,000	0	0
10/04/25	95704	92223	4520148	F&L Axe 1 MMPT24		353,400	380,000		
						353,400	380,000	0	0
	95838	 	4320001	Pdts laitiers lotis r�frig�r�s	proxidon05	272,490	293,000		
						272,490	293,000	0	0
	95839	 	4320001	Pdts laitiers lotis r�frig�r�s	proxidon05	465,000	500,000		
						465,000	500,000	0	0
14/04/25	95863	92276	4520048	Fruits et L�gumes Frais MMPT24		74,400	80,000		
						74,400	80,000	0	0
	95866	92281	4210001	Plat cuisin� v�g�t. ambiant	13251040017	15,130	17,000		
			4320001	Pdts laitiers lotis r�frig�r�s	13251040018	85,560	92,000		
			4620001	Viande r�frig�r�e	13251040019	42,000	42,000		
			4620001	Viande r�frig�r�e	13251040020	10,000	10,000		
			4620001	Viande r�frig�r�e	13251040021	43,000	43,000		
			4920001	Poisson r�frig�r�	13251040022	23,100	30,000		
						218,790	234,000	0	0
15/04/25	95654	92168	0410249	C�r�ales choco JYCO 401 FSE24	13250620013	13,500	16,092	36	3
			0410449	Choco poud 403 SFRC FSE24	13250550065	30,000	30,660	60	5
			0910149	Lait UHT GJ 103 FSE24	13250850008	300,000	300,000	300	50
			1010249	Farine type 55 405 JYCO FSE24	13243030037	50,000	50,500	50	5
			1010449	Pur�e PdT floc. JYCO 416 FSE24	13250560043	21,000	24,192	42	3
			1010539	Pur�e Pomm Poir315 DISCH FSE23	13242320004	62,400	69,420	156	13
			1110001	P�tes ambiant	13241270009	250,000	250,000		
			1110051	Riz long/rond	13240880007	72,000	75,000		
			1210439	Flageolets DAUCY  Lot102 FSE23	13233390011	57,600	69,840	144	12
			1710001	Huile	13250550025	40,740	42,000		
			2010149	Confitur abrico SFRC 404 FSE24	13250620006	21,900	31,200	60	5
			4510849	Haricots verts D'AUCY FSE24	13243110025	67,200	81,480	84	7
			4510849	Haricots verts D'AUCY FSE24	13243110027	57,600	69,840	72	6
			4511039	Ppoiscar DISCHAMP Lot101FSE23	13241910010	240,000	277,500	300	25
			4910129	Maquereaux tomate 238 UE22	13232000024	63,360	70,560	360	15
			4910649	Thon naturel JEALSA 420 FSE24	13243370019	44,400	53,280	240	5
			6010010	Pdts Hygi�ne Famille		25,000	25,000		
						1416,700	1536,564	1904	154
	95920	92298	1730149	Beurre doux surg424 RUMI FSE24	13250410026	30,000	30,360	120	3
			4320149	Emmental 426 GUILLOT FSE24	13250500014	30,000	30,480	120	3
			4630549	Steak hach� Lot 428 FSE24	13242770010	15,000	15,150	150	3
			4910019	Thon Listao naturel LOT28 UE21	13212380001	10,752	19,200	96	4
			4930118	Poisson surg SubvlotsInfr21bis	13240610034	25,000	27,500	100	10
						110,752	122,690	586	23


TOTAL GENERAL 
						Kg Net	Kg Brut	P	COL
						3613904,195	3876644,689	2208684	216405
`);
console.log(parser.getItemRows());console.log(parser.getBlRows());