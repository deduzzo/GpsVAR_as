export default {
  current: "corrente",
  selected: null,

  // Soglia percentuale (default 60%)
  sogliaPerc: 60,

  // Dati per Tabella1
  differenzeData: [],
  currData: null,
  precData: null,

  // Mappa CI -> record convenzionato (serve per recuperare CF)
  allConvenzionatiDataMap: {},

  lastPeriodo:
    (getLastPeriodo?.data?.[0]?.anno ?? "") + "_" + (getLastPeriodo?.data?.[0]?.mese ?? ""),

  // ==========================
  // Inizializza mappa convenzionati
  // ==========================
  initConvenzionati: () => {
    const raw = getAllConvenzionatiData?.data ?? [];
    this.allConvenzionatiDataMap = this.getAllConvenzionatiMap(raw);
  },

  getAllConvenzionatiMap: (data) => {
    const out = {};
    const rows = Array.isArray(data) ? data : [];
    for (const riga of rows) {
      const ci = riga?.CI ?? riga?.ci ?? null;
      if (ci) out[ci] = riga;
    }
    return out;
  },

  // ==========================
  // Pipeline caricamento + calcolo differenze (robusta)
  // ==========================
  getDataAndCalcolaDifferenze: async () => {
    // Assicuro la mappa CF/CI pronta
    if (!this.allConvenzionatiDataMap || Object.keys(this.allConvenzionatiDataMap).length === 0) {
      this.initConvenzionati();
    }

    // Carico i dataset in modo tollerante
    let currRaw = [];
    let prevRaw = [];
    try {
      currRaw = (await getAllData.run({ tabName: this.current })) ?? [];
    } catch (e) {
      currRaw = [];
    }
    try {
      const tabPrev =
        (anno_rif?.selectedOptionValue ?? "") + "_" + (mese_rif?.selectedOptionValue ?? "");
      prevRaw = (await getAllData.run({ tabName: tabPrev })) ?? [];
    } catch (e) {
      prevRaw = [];
    }

    // Genero mappe (mai null: sempre oggetti vuoti se manca tutto)
    this.currData = this.generateMapOfMonthData(currRaw);
    this.precData = this.generateMapOfMonthData(prevRaw);

    // Popola differenzeData (Tabella1) includendo anomalie di doppie posizioni
    this.calcolaDifferenze(
      this.currData?.mapByKey ?? {},
      this.precData?.mapByKey ?? {},
      this.currData?.cfToKeys ?? {},
      this.precData?.cfToKeys ?? {}
    );
  },

  /**
   * Confronta current vs past e genera righe differenze + anomalie posizioni multiple per CF.
   * Colonne Tabella1: anagrafica, descrizione, importo_corrente, importo_precedente, delta, delta_perc
   */
  calcolaDifferenze: (currentData, pastData, currentCfToKeys, pastCfToKeys) => {
    const out = [];
    const safeNum = (x, def = 0) =>
      typeof x === "number" && isFinite(x) ? x : (typeof x === "string" ? Number(x) : def) || def;

    // ----- A) Anomalie posizioni multiple nello stesso mese -----
    const buildAnomalie = (cfToKeys, dataMap, labelMese) => {
      const cfEntries = Object.entries(cfToKeys || {});
      for (const [cf, keyMap] of cfEntries) {
        const keys = Object.keys(keyMap || {});
        if (keys.length > 1) {
          const ref = dataMap?.[keys[0]] ?? {};
          const dati = ref?.dati ?? {};
          const ci = dati?.ci ?? "";
          const cognome = dati?.cognome ?? "";
          const nome = dati?.nome ?? "";
          const rapporto = dati?.rapporto ?? "";
          const anagrafica = `${ci} – ${cf || "N/D"} – ${cognome} ${nome} (${rapporto})`;

          const importoTotaleMese = keys.reduce(
            (acc, k) => acc + safeNum(dataMap?.[k]?.totale, 0),
            0
          );

          out.push({
            anagrafica,
            rapporto,
            descrizione: `Anomalia (${labelMese}): più posizioni pagate nello stesso mese per la stessa persona → ${keys.join(", ")}`,
            importo_corrente: labelMese === "mese corrente" ? importoTotaleMese : 0,
            importo_precedente: labelMese === "mese precedente" ? importoTotaleMese : 0,
            delta: null,
            delta_perc: null,
          });
        }
      }
    };

    // Corrente (puoi sbloccare anche il precedente se serve)
    buildAnomalie(currentCfToKeys, currentData, "mese corrente");
    // buildAnomalie(pastCfToKeys, pastData, "mese precedente");

    // ----- B) Differenze pagamenti tra i due mesi -----
    const allKeys = new Set([
      ...Object.keys(currentData || {}),
      ...Object.keys(pastData || {}),
    ]);

    for (const key of allKeys) {
      const cur = currentData?.[key] ?? null;
      const prev = pastData?.[key] ?? null;

      const dati = (cur?.dati ?? prev?.dati) ?? {};
      const ci = dati?.ci ?? "";
      const cf =
        this.allConvenzionatiDataMap?.[ci]?.CODICE_FISCALE ??
        this.allConvenzionatiDataMap?.[ci]?.codice_fiscale ??
        "N/D";

      const cognome = dati?.cognome ?? "";
      const nome = dati?.nome ?? "";
      const rapporto = dati?.rapporto ?? "";

      const anagrafica = `${ci} – ${cf} – ${cognome} ${nome} (${rapporto})`;

      const curTot = safeNum(cur?.totale, 0);
      const prevTot = safeNum(prev?.totale, 0);

      // Non pagato ora ma pagato prima
      if (!cur && prev) {
        out.push({
          anagrafica,
          rapporto,
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
          rapporto,
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
          deltaPerc = ((curTot - prevTot) / Math.abs(prevTot || 1)) * 100;
        }

        if (Math.abs(deltaPerc) >= this.sogliaPerc) {
          const verso =
            deltaPerc > 0
              ? `superiore del ${deltaPerc.toFixed(2)}% rispetto al mese scorso`
              : `inferiore del ${Math.abs(deltaPerc).toFixed(2)}% rispetto al mese scorso`;

          out.push({
            anagrafica,
            rapporto,
            descrizione: `Stipendio ${verso}`,
            importo_corrente: curTot,
            importo_precedente: prevTot,
            delta: curTot - prevTot,
            delta_perc: Number(deltaPerc.toFixed(2)),
          });
        }

        // === Altri controlli robusti ===
        const variabiliKeys = Object.keys(cur?.perVariabile ?? {});
        const hasPlusIC = variabiliKeys.some((k) => k?.startsWith?.("GM.PLUS_IC"));
        // L'originale cercava "IND.COORD_*": rendo più tollerante
        const hasIndCoord =
          variabiliKeys.some((k) => /^IND\.COORD/i.test(k ?? "")) ||
          variabiliKeys.some((k) => k?.startsWith?.("IND.COORD_"));

        if (hasPlusIC !== hasIndCoord && (rapporto === "GMET" || rapporto === "GMES")) {
          let msg = "Anomalia variabili: ";
          if (!hasPlusIC) msg += "manca GM.PLUS_IC_*";
          else if (!hasIndCoord) msg += "manca IND.COORD_*";

          out.push({
            anagrafica,
            rapporto,
            descrizione: msg,
            importo_corrente: curTot,
            importo_precedente: prevTot,
            delta: curTot - prevTot,
            delta_perc: deltaPerc != null ? Number(deltaPerc.toFixed(2)) : null,
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

  // ==========================
  // Utils numerici robusti
  // ==========================

  // Converte in modo "tollerante":
  // - "19600" -> 196.00 (cent in stringa)
  // - "196.00" / "196,00" -> 196.00
  // - numeri -> usati come sono (se sembrano già decimali)
// Converte "19600" -> 196.00 come numero 
 convertToDouble: (str) => { 
  const s = (str ?? "").toString(); 
  const parteIntera = s.slice(0, -2) || "0"; 
  const parteDecimale = s.slice(-2).padStart(2, "0"); 
  return parseFloat(parteIntera + "." +parteDecimale); 
},

  /**
   * Crea:
   * - mapByKey: { "CI_RAPPORTO": { dati, totale, perVariabile, allRighe } }
   * - cfToKeys: { "CF": { "CI_RAPPORTO": null, ... } } per identificare multi-posizioni
   */
  generateMapOfMonthData: (data) => {
    const mapByKey = {};
    const cfToKeys = {};

    const rows = Array.isArray(data) ? data : [];
    for (const riga of rows) {
      // Campi tolleranti ai nomi/assenza
      const ci = riga?.CI ?? riga?.ci ?? "";
      const rapporto = riga?.RAPPORTO ?? riga?.rapporto ?? "";
      if (!ci || !rapporto) continue; // senza questi non posso costruire la chiave

      const key = `${ci}_${rapporto}`;

      const voce = (riga?.VOCE ?? riga?.voce ?? "").toString().trim();
      const subOkRaw = (riga?.SUB_OK ?? riga?.SUBOK ?? "").toString().replaceAll("_", "");
      const variabileKey =
        `${voce}_${subOkRaw}`.replace(/^_+|_+$/g, "") || (voce || "VAR_SCONOSCIUTA");

      if (!mapByKey[key]) {
        mapByKey[key] = {
          dati: {
            ci,
            cognome: riga?.COGNOME ?? riga?.cognome ?? "",
            nome: riga?.NOME ?? riga?.nome ?? "",
            rapporto,
          },
          totale: 0.0,
          perVariabile: {},
          allRighe: [],
        };
      }

      const importoNum = this.convertToDouble(riga?.IMPORTO ?? riga?.importo ?? 0);
      mapByKey[key].totale += importoNum;
      mapByKey[key].allRighe.push(riga);

      if (!mapByKey[key].perVariabile[variabileKey]) {
        mapByKey[key].perVariabile[variabileKey] = { totale: 0.0, count: 0 };
      }
      mapByKey[key].perVariabile[variabileKey].totale += importoNum;
      mapByKey[key].perVariabile[variabileKey].count += 1;

      // Aggiornamento cfToKeys (solo per il CI corrente)
      const cf =
        this.allConvenzionatiDataMap?.[ci]?.CODICE_FISCALE ??
        this.allConvenzionatiDataMap?.[ci]?.codice_fiscale ??
        null;
      if (cf) {
        if (!cfToKeys[cf]) cfToKeys[cf] = {};
        cfToKeys[cf][key] = null;
      }
    }

    return { mapByKey, cfToKeys };
  },
};
