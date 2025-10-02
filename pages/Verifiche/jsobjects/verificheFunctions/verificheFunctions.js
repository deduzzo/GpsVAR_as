export default {
  current: "corrente",
  selected: null,

  // Soglia percentuale (default 30%)
  sogliaPerc: 30,

  // Dati per Tabella1
  differenzeData: [],
	currData:null,
	precData: null,

  // Mappa CI -> record convenzionato (serve per recuperare CF)
  allConvenzionatiDataMap: {},

  lastPeriodo: getLastPeriodo.data[0].anno + "_" + getLastPeriodo.data[0].mese,

  // Inizializza la mappa dei convenzionati (da chiamare una volta prima dei confronti)
  initConvenzionati: () => {
    this.allConvenzionatiDataMap = this.getAllConvenzionatiMap(getAllConvenzionatiData.data || []);
  },

  getAllConvenzionatiMap: (data) => {
    const out = {};
    for (let riga of data) {
      // presupponendo che esistano le colonne CI e CODICE_FISCALE nel dataset
      if (riga?.CI) {
        out[riga.CI] = riga;
      }
    }
    return out;
  },

  getDataAndCalcolaDifferenze: async () => {
    // assicuro la mappa CF/CI pronta
    if (!this.allConvenzionatiDataMap || Object.keys(this.allConvenzionatiDataMap).length === 0) {
      this.initConvenzionati();
    }

    this.curData = this.generateMapOfMonthData(
      await getAllData.run({ tabName: this.current })
    );
    this.precData = this.generateMapOfMonthData(
      await getAllData.run({
        tabName: anno_rif.selectedOptionValue + "_" + mese_rif.selectedOptionValue,
      })
    );

    // Popola differenzeData (Tabella1) includendo anomalie di doppie posizioni
    this.calcolaDifferenze(
      this.curData.mapByKey,
      this.precData.mapByKey,
      this.curData.cfToKeys,
      this.precData.cfToKeys
    );
  },

  /**
   * Confronta current vs past e genera righe differenze + anomalie posizioni multiple per CF.
   * Colonne Tabella1: anagrafica, descrizione, importo_corrente, importo_precedente, delta, delta_perc
   */
  calcolaDifferenze: (currentData, pastData, currentCfToKeys, pastCfToKeys) => {
  const out = [];
  const v = (x) => (typeof x === "number" && isFinite(x) ? x : 0);

  // ----- A) Anomalie posizioni multiple nello stesso mese -----
  // Adatta al nuovo formato: cfToKeys[CF] = { "CI_RAPPORTO": null, ... }
  const buildAnomalie = (cfToKeys, dataMap, labelMese) => {
    for (const [cf, keyMap] of Object.entries(cfToKeys || {})) {
      const keys = Object.keys(keyMap || {});
      if (keys.length > 1) {
        // Recupero un record di riferimento (il primo) per anagrafica
        const ref = dataMap[keys[0]];
        const dati = ref?.dati || {};
        const ci = dati.ci ?? "";
        const cognome = dati.cognome ?? "";
        const nome = dati.nome ?? "";
        const rapporto = dati.rapporto ?? "";
        const anagrafica = `${ci} – ${cf} – ${cognome} ${nome} (${rapporto})`;

        // Somma degli importi delle posizioni coinvolte (contesto utile)
        const importoTotaleMese = keys.reduce((acc, k) => acc + v(dataMap[k]?.totale), 0);

        out.push({
          anagrafica,
          descrizione: `Anomalia (${labelMese}): più posizioni pagate nello stesso mese per la stessa persona → ${keys.join(", ")}`,
          importo_corrente: labelMese === "mese corrente" ? importoTotaleMese : 0,
          importo_precedente: labelMese === "mese precedente" ? importoTotaleMese : 0,
          delta: null,
          delta_perc: null,
        });
      }
    }
  };

  // Corrente e (se vuoi) precedente
  buildAnomalie(currentCfToKeys, currentData, "mese corrente");
  // buildAnomalie(pastCfToKeys, pastData, "mese precedente"); // scommenta se vuoi anche per il mese precedente

  // ----- B) Differenze pagamenti tra i due mesi -----
  const allKeys = new Set([
    ...Object.keys(currentData || {}),
    ...Object.keys(pastData || {}),
  ]);

  for (const key of allKeys) {
    const cur = currentData[key];
    const prev = pastData[key];

    // Dati anagrafici (da quello disponibile)
    const dati = (cur?.dati) || (prev?.dati) || {};
    const ci = dati.ci ?? "";

    // Recupero CF (se disponibile) dalla mappa convenzionati
    const cf = this.allConvenzionatiDataMap?.[ci]?.CODICE_FISCALE ?? "N/D";

    const cognome = dati.cognome ?? "";
    const nome = dati.nome ?? "";
    const rapporto = dati.rapporto ?? "";
    const anagrafica = `${ci} – ${cf} – ${cognome} ${nome} (${rapporto})`;

    const curTot = v(cur?.totale);
    const prevTot = v(prev?.totale);

    // Non pagato ora ma pagato prima
    if (!cur && prev) {
      out.push({
        anagrafica,
        descrizione: "Pagato il mese scorso e NON questo",
        importo_corrente: 0,
        importo_precedente: prevTot,
        delta: -prevTot,
        delta_perc: -100,
      });
      continue;
    }

    // Pagato ora ma non prima
    if (cur && !prev) {
      out.push({
        anagrafica,
        descrizione: "Pagato questo mese e NON il mese scorso",
        importo_corrente: curTot,
        importo_precedente: 0,
        delta: curTot,
        delta_perc: 100,
      });
      continue;
    }

    // Pagato in entrambi i mesi → verifica scostamento percentuale
    if (cur && prev) {
      let deltaPerc;
      if (prevTot === 0 && curTot === 0) {
        deltaPerc = 0;
      } else if (prevTot === 0 && curTot !== 0) {
        deltaPerc = 100;
      } else {
        deltaPerc = ((curTot - prevTot) / Math.abs(prevTot)) * 100;
      }

      if (Math.abs(deltaPerc) >= this.sogliaPerc) {
        const verso =
          deltaPerc > 0
            ? `superiore del ${deltaPerc.toFixed(2)}% rispetto al mese scorso`
            : `inferiore del ${Math.abs(deltaPerc).toFixed(2)}% rispetto al mese scorso`;

        out.push({
          anagrafica,
          descrizione: `Stipendio ${verso}`,
          importo_corrente: curTot,
          importo_precedente: prevTot,
          delta: curTot - prevTot,
          delta_perc: Number(deltaPerc.toFixed(2)),
        });
      }
    }
  }

  // Ordina: prima anomalie (delta_perc null), poi differenze per |delta_perc|
  out.sort((a, b) => {
    const aIsAnom = a.delta_perc == null ? 0 : 1;
    const bIsAnom = b.delta_perc == null ? 0 : 1;
    if (aIsAnom !== bIsAnom) return aIsAnom - bIsAnom;
    return Math.abs(b.delta_perc || 0) - Math.abs(a.delta_perc || 0);
  });

  this.differenzeData = out;
},


  // Converte "19600" -> 196.00 come numero
  convertToDobule: (str) => {
    const s = (str ?? "").toString();
    const parteIntera = s.slice(0, -2) || "0";
    const parteDecimale = s.slice(-2).padStart(2, "0");
    return parseFloat(`${parteIntera}.${parteDecimale}`);
  },

  /**
   * Crea:
   * - mapByKey: { "CI_RAPPORTO": { dati, totale, ... } }
   * - cfToKeys: { "CF": ["CI_RAPPORTO", ...] } per identificare multi-posizioni
   */
  generateMapOfMonthData: (data) => {
    const mapByKey = {};
    const cfToKeys = {};

    for (let riga of (data || [])) {
      const key = riga.CI + "_" + riga.RAPPORTO;
      const variabileKey = riga.VOCE + "_" + riga.SUB_OK.replaceAll("_", "");

      if (!mapByKey.hasOwnProperty(key)) {
        mapByKey[key] = {
          dati: {
            ci: riga.CI,
            cognome: riga.COGNOME,
            nome: riga.NOME,
            rapporto: riga.RAPPORTO,
          },
          totale: 0.0,
          perVariabile: {},
          allRighe: [],
        };
      }

      mapByKey[key].totale += this.convertToDobule(riga.IMPORTO.toString());
      mapByKey[key].allRighe.push(riga);

      if (!mapByKey[key].perVariabile.hasOwnProperty(variabileKey)) {
        mapByKey[key].perVariabile[variabileKey] = { totale: 0.0, count: 0 };
      }
      mapByKey[key].perVariabile[variabileKey].totale += this.convertToDobule(
        riga.IMPORTO.toString()
      );
      mapByKey[key].perVariabile[variabileKey].count += 1;

			const keys = Object.keys(mapByKey);
      for (let riga of keys) { 
				const ci = riga.split("_")[0]; 
				const cf = this.allConvenzionatiDataMap?.[ci]?.CODICE_FISCALE; 
				if (cf) { 
					if (!cfToKeys.hasOwnProperty(cf)) 
						cfToKeys[cf] = {};
					cfToKeys[cf][riga] = null; 
				} 
			}
    }
    return { mapByKey, cfToKeys };
  },
};
