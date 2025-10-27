export default {
	/* =======================
	   VARIABILI DI STATO
	======================= */
	livelli: {
		"100": "SuperAdmin",
		"1": "Utente",
		"2": "Admin Distretto",
		"3": "Amministratore"
	},
	firstLoadingOk: false,
	userData: null,
	secret: "UxZ>69'[Tu<6",
	distrettiMap: { byUnique: {}, byId: {} },
	allConvenzionatiMap: {},
	allPresidiMap: {},
	allConvenzionatiList: null,
	allConvenzionatiPerBrancaMap: null,
	distrettoCambiato: false,

	/* =======================
	   LOAD INIZIALE
	======================= */
	async initLoad() {
		showModal(caricamentoMdl.name);
		this.firstLoadingOk = false;
		try {
			await this.getDistrettiMap();
			await this.verifyTokenExpires();
			await this.getConvenzionatiMap();
			await this.getAllPresidiMap();
			await this.getAllConvenzionatiList();
			convenzionatoSelezionato.setSelectedOption("");
			storeValue('orarioConvenzionatoSelezionato', {});
			storeValue('orarioPerPresidio', []);
			storeValue('orarioPerDistretto', []);
			storeValue('pdfDataUrl', null);
		} catch (err) {
			console.error("Errore in initLoad:", err);
			showAlert("Si è verificato un errore nel caricamento iniziale", "error");
		} finally {
			closeModal(caricamentoMdl.name);
			this.firstLoadingOk = true;
		}
	},

	/* =======================
	   AUTENTICAZIONE / LOGOUT
	======================= */
	doLogout: (msg = "Logout effettuato", type = "info") => {
		storeValue("token", null);
		storeValue("message", { msg, type });
		navigateTo("GpsVar Login");
	},

	getUniqueDistrettiFromId: (ids) => {
		let out = [];
		for (let id of ids) out.push(this.distrettiMap.byId[parseInt(id)].unique);
		return out;
	},

	/* =======================
	   FUNZIONI DI SUPPORTO
	======================= */
	getConvenzionatoDescFromId: id => {
		const conv = this.allConvenzionatiMap[id];
		return `(${conv.CI}) ${conv.COGNOME} ${conv.NOME} - [${conv.RAPPORTO}]`;
	},

	getMesi: () =>
		"Gennaio_Febbraio_Marzo_Aprile_Maggio_Giugno_Luglio_Agosto_Settembre_Ottobre_Novembre_Dicembre".split("_"),
	getGiorniDellaSettimana: () => "Lunedì_Martedì_Mercoledì_Giovedì_Venerdì_Sabato".split("_"),

	getMesiMap() { return this.getMesi().map((m, i) => ({ mese: m, value: i + 1 })); },
	getMeseItaliano(mese) { return this.getMesi()[mese - 1]; },

	async getConvenzionatiMap() {
		this.allConvenzionatiMap = {};
		await getAllConvenzionati.run();
		(getAllConvenzionati.data || []).forEach(c => {
			this.allConvenzionatiMap[c["CI"]] = c;
		});
	},

	async getDistrettiMap() {
		const distretti = getAllDistretti.data || [];
		distretti.forEach(d => {
			this.distrettiMap.byUnique[d.unique] = d;
			this.distrettiMap.byId[d.old_code] = d;
		});
	},

	/* =======================
	   DISTRETTI UTENTE
	======================= */
	getDistrettiFromIds(distrettiString, separator = ",") {
		const ids = (distrettiString || "").split(separator);
		return ids.reduce((acc, id) => {
			const d = this.distrettiMap.byUnique[id];
			if (d) acc[d.old_code] = d.descrizione;
			return acc;
		}, {});
	},

	getDistrettiPossibiliMap() {
		return Object.entries(this.getDistrettiFromIds(this.userData.distrettoRaw)).map(
			([cod, desc]) => ({ label: desc, value: cod })
		);
	},

	/* =======================
	   TOKEN / SICUREZZA
	======================= */
	verifyTokenExpires() {
		let expired = false;

		if (appsmith.store.token) {
			try {
				const decoded = jsonwebtoken.verify(appsmith.store.token, this.secret);

				const distretti = this.getDistrettiFromIds(decoded.data.id_distretto);
				this.userData = {
					username: decoded.data.user,
					livelloText: this.livelli[decoded.data.livello.toString()],
					livello: decoded.data.livello,
					mail: decoded.data.mail,
					distrettoRaw: decoded.data.id_distretto,
					codDistretto: this.distrettoCambiato
						? this.userData.codDistretto
						: parseInt(Object.keys(distretti)[0]),
					distretto: this.distrettoCambiato
						? this.userData.distretto
						: this.distrettiMap.byId[Object.keys(distretti)[0]].unique,
					distrettoTxt: this.distrettoCambiato
						? this.userData.distrettoTxt
						: distretti[Object.keys(distretti)[0]]
				};

				const newToken = this.createToken({ data: decoded.data });
				storeValue("token", newToken);
			} catch (err) {
				console.error("Token non valido o scaduto:", err);
				expired = true;
			}
		} else expired = true;

		if (expired) {
			this.doLogout("Sessione scaduta, effettua di nuovo il login", "warning");
		}
		return { expired };
	},

	createToken: user => jsonwebtoken.sign(user, this.secret, { expiresIn: 60 * 60 }),

	/* =======================
	   CONVENZIONATI ORARI
	======================= */
	aggiungiNuovoConvenzionatoBranca: () => {
		aggiungiConvBranca_btn.setDisabled(true);
		showModal(caricamentoMdl.name);
		aggiungiConvenzionatoBranca.run().then(() => {
			showAlert("Convenzionato inserito correttamente", "info");
			convenzionato_cmb.setSelectedOption("");
			branca_cmb.setSelectedOption("");
			getAllConvenzionatiBranche.run().then(() => {
				closeModal(caricamentoMdl.name);
			});
		}).catch((err) => {
			closeModal(caricamentoMdl.name);
			convenzionato_cmb.setSelectedOption("");
			branca_cmb.setSelectedOption("");
			showAlert("Errore nell'inserimento:" + JSON.stringify(err), "error");
		});
	},

	getAllConvenzionatiList: async () => {
		this.allConvenzionatiList = await this.getAllConvenzionatiConBranca();
		convenzionato
	},

	getAllConvenzionatiConBranca: async () => {
		let data = await getAllConvenzionatiBranche.data;
		let out = [];
		this.allConvenzionatiPerBrancaMap = {};
		for (let riga of (data || [])) {
			if (!this.allConvenzionatiPerBrancaMap.hasOwnProperty(riga.id))
				this.allConvenzionatiPerBrancaMap[riga.id] = riga;
			const conv = this.allConvenzionatiMap[riga["id_convenzionato"]] || {};
			out.push({
				label: (conv.COGNOME || "") + " " + (conv.NOME || "") + " [" + (riga["branca"] || "") + "]",
				value: String(riga["id"])
			});
		}
		return out;
	},

	mostraFormNuovoConvenzionato: () => {
		convenzionato_cmb.setSelectedOption("");
		branca_cmb.setSelectedOption("");
		showModal(nuovoConvBrancaMdl.name);
	},

	getAllPresidiMap: async () => {
		const data = getAllPresidi.data || [];
		let out = {};
		for (let riga of data) out[riga['id']] = riga;
		this.allPresidiMap = out;
	},

	sortByTime: (data, timeField = "from", order = "asc") => {
		const isArray = Array.isArray(data);
		const entries = isArray ? data.map((obj, idx) => [idx, obj]) : Object.entries(data);

		function getMinutes(timeStr) {
			if (!timeStr || typeof timeStr !== "string") return 0;
			const [hRaw, mRaw] = timeStr.split(":");
			const h = Number(hRaw);
			const m = Number(mRaw);
			if (isNaN(h) || isNaN(m)) return 0;
			return h * 60 + m;
		}

		const cmp = ([, a], [, b]) => {
			const minutesA = getMinutes(a?.[timeField]);
			const minutesB = getMinutes(b?.[timeField]);
			return order === "desc" ? minutesB - minutesA : minutesA - minutesB;
		};

		entries.sort(cmp);

		const oreByPresidio = {};
		for (const [, row] of entries) {
			if (!row) continue;
			const ingresso = getMinutes(row.from);
			const uscita = getMinutes(row.to);
			if (isNaN(ingresso) || isNaN(uscita) || ingresso >= uscita) continue;
			const ore = (uscita - ingresso) / 60;
			const id = row.id_presidio;
			if (id === undefined) continue;
			oreByPresidio[id] = (oreByPresidio[id] || 0) + ore;
		}

		const sortedData = isArray ? entries.map(([, value]) => value) : Object.fromEntries(entries);
		return { sortedData, oreByPresidio };
	},

	getOrarioConvenzionatoSelezionato: async () => {
		showModal(caricamentoMdl.name);
		try {
			if (convenzionatoSelezionato.selectedOptionValue !== "") {
				let orarioConvenzionato = await getOrariByConvenzionato.run({ convenzionato: convenzionatoSelezionato.selectedOptionValue });
				let out = await this.getOrarioConvenzionato(convenzionatoSelezionato.selectedOptionValue, orarioConvenzionato);

				storeValue('orarioConvenzionatoSelezionato', out.orario);
				storeValue('orarioPerPresidio', out.perPresidio);
				storeValue('orarioPerDistretto', Object.values(out.perDistretto));
			} else {
				storeValue('orarioConvenzionatoSelezionato', {});
				storeValue('orarioPerPresidio', []);
				storeValue('orarioPerDistretto', []);
			}
		} finally {
			closeModal(caricamentoMdl.name);
		}
	},

	getOrarioConvenzionato: async (id, orarioConvenzionato) => {
		let out = {};
		let orePresidio = {};
		let convenzionato = null;

		if (orarioConvenzionato) {
			convenzionato = this.allConvenzionatiMap[this.allConvenzionatiPerBrancaMap[id].id_convenzionato];
			convenzionato.branca = this.allConvenzionatiPerBrancaMap[id].branca;

			// Inizializza array per ciascun giorno
			for (let giorno of this.getGiorniDellaSettimana()) out[giorno] = [];

			// Inserisce righe orario
			for (let orario of orarioConvenzionato) {
				const presidio = this.allPresidiMap[orario['id_presidio']] || {};
				out[this.getGiorniDellaSettimana()[orario['giorno_settimana']]]
					.push({
						rowIndex: orario.rowIndex,
						from: orario['ingresso'],
						to: orario['uscita'],
						location: presidio['presidio'],
						id_presidio: orario['id_presidio'],
						disctrict: this.distrettiMap.byUnique?.[presidio['distretto']]?.descrizione
					});
			}

			// Ordina per orario e calcola ore per presidio
			for (let giorno of this.getGiorniDellaSettimana()) {
				const res = this.sortByTime(out[giorno], 'from');
				out[giorno] = res.sortedData;
				for (let idPres in res.oreByPresidio) {
					if (!orePresidio.hasOwnProperty(idPres)) orePresidio[idPres] = 0;
					orePresidio[idPres] += res.oreByPresidio[idPres];
				}
			}
		}

		// Output aggregati
		let outPresidio = [];
		let outDistretto = {};
		for (let presidio in orePresidio) {
			outPresidio.push({
				presidio: (this.allPresidiMap[presidio] || {}).presidio,
				id_presidio: presidio,
				ore: orePresidio[presidio]
			});
		}
		for (let riga of outPresidio) {
			const presidioInt = parseInt(riga.id_presidio);
			const distUnique = this.allPresidiMap[presidioInt]?.distretto;
			if (!outDistretto.hasOwnProperty(distUnique)) {
				outDistretto[distUnique] = {
					distretto: this.distrettiMap.byUnique?.[distUnique]?.descrizione,
					ore: 0
				};
			}
			outDistretto[distUnique].ore += riga.ore;
		}

		return { convenzionato: convenzionato, orario: out, perDistretto: outDistretto, perPresidio: outPresidio };
	},

	getAllOrariConvenzionatiFromDb: async () => {
		let orariConvenzionato = await getAllOrariConvenzionati.run();
		let allConvenzionati = {};
		for (let orario of (orariConvenzionato || [])) {
			if (!allConvenzionati.hasOwnProperty(orario.id_convenzionato))
				allConvenzionati[orario.id_convenzionato] = [];
			allConvenzionati[orario.id_convenzionato].push(orario);
		}
		let allOrariOk = {};
		for (let ids of Object.keys(allConvenzionati)) {
			allOrariOk[ids] = await this.getOrarioConvenzionato(ids, allConvenzionati[ids]);
		}
		return Object.values(allOrariOk);
	},

	calcolaTotaleOre: (data = appsmith.store.orarioPerDistretto) => {
		return Array.isArray(data) ? data.reduce((tot, item) => tot + (item["ore"] || 0), 0) : 0;
	},

	modificaOrario: async (rowIndex = 2) => {
		let orario = await getOrarioByRowIndex.run({ rowIndex });
		if (Array.isArray(orario) && orario.length > 0) {
			orario = orario[0];
			orario.convenzionato = this.allConvenzionatiMap[orario.id_convenzionato];
			storeValue('orarioDaModificare', orario);
			showModal(modificaOrarioModal.name);
		}
	},

	onOrarioChange: async (tag, time) => {
		let orarioDaModificare = appsmith.store.orarioDaModificare || {};

		// Salvataggio precedenti
		const prevIngresso = orarioDaModificare.ingresso;
		const prevUscita = orarioDaModificare.uscita;

		// Update campo
		if (tag === "inizio") orarioDaModificare.ingresso = time;
		else orarioDaModificare.uscita = time;

		// Validazione
		if (orarioDaModificare.ingresso && orarioDaModificare.uscita) {
			if (!this.verificaOrariSingoliOk()) {
				showAlert("⚠️ L'orario di ingresso non può essere successivo all'orario di uscita!", "warning");
				if (tag === "inizio") orarioDaModificare.ingresso = prevIngresso;
				else orarioDaModificare.uscita = prevUscita;
			}
		}
		await storeValue("orarioDaModificare", orarioDaModificare);
	},

	verificaOrariSingoliOk: () => {
		if (appsmith.store.orarioDaModificare?.ingresso && appsmith.store.orarioDaModificare?.uscita) {
			const tInizio = new Date(`1970-01-01T${appsmith.store.orarioDaModificare.ingresso}:00`);
			const tFine = new Date(`1970-01-01T${appsmith.store.orarioDaModificare.uscita}:00`);
			return (tInizio < tFine);
		}
		return false;
	},

	// Giorni standard
	DAYS() { return this.getGiorniDellaSettimana(); },

	padTime(s) {
		const [h, m] = String(s || "").split(":");
		if (!h) return s || "";
		return `${String(h).padStart(2, "0")}:${(m ?? "00").padStart(2, "0")}`;
	},

	fmtCognomeNome(c) {
		return `${(c?.COGNOME || "").trim()} ${(c?.NOME || "").trim()}`
			.replace(/\s+/g, " ")
			.toUpperCase();
	},

// --- helper: blocchi orari per una cella giorno (time + location)
dayCellBlocks(orarioGiorno = []) {
  if (!Array.isArray(orarioGiorno) || orarioGiorno.length === 0) return [];
  return orarioGiorno.map(s => ({
    time: `${this.padTime(s.from)}–${this.padTime(s.to)}`,
    loc:  s?.location || ""
  }));
},

// --- helper: format ore (es. 38 -> "38 h", 9.5 -> "9.5 h")
fmtHours(n) {
  if (n == null || isNaN(n)) return "0 h";
  return (Math.round(n * 10) / 10).toString().replace(".", ",") + " h";
},

// === RIGA: Specialista + 6 colonne (una per giorno) ===
// Per le colonne giorno passiamo un oggetto { kind:'slots', slots:[{time,loc},...] }
// che poi disegniamo noi in didDrawCell come "card" colorate.

// --- riga tabella: specialista + 6 colonne giorno
buildRow(entry) {
  const c = entry?.convenzionato || {};
  const orario = entry?.orario || {};

  // Statistiche
  const totOre = (entry?.perDistretto)
    ? Object.values(entry.perDistretto).reduce((acc, d) => acc + (d?.ore || 0), 0)
    : 0;

  const presList = Array.isArray(entry?.perPresidio) && entry.perPresidio.length
    ? entry.perPresidio.map(p => `• ${p.presidio}: ${this.fmtHours(p.ore)}`).join("\n")
    : "• —";

  const distList = entry?.perDistretto && Object.keys(entry.perDistretto).length
    ? Object.values(entry.perDistretto).map(d => `• ${d.distretto}: ${this.fmtHours(d.ore)}`).join("\n")
    : "• —";

  // Nome dello specialista (senza CI)
  const nome = this.fmtCognomeNome(c);
  const branca = c?.branca ? c.branca : "";

  // Uso lo stesso approccio dell'header con content e styles
  const specialistaCell = {
    kind: "specialista",
    nome: nome,
    branca: branca,
    totOre: this.fmtHours(totOre),
    presidi: presList,
    distretti: distList,
    content: "", // verrà disegnato manualmente
    styles: {
      fontSize: 7.5,
      halign: "left",
      valign: "top",
      cellPadding: 2
    }
  };

  const dayCells = this.DAYS().map(d => ({
    kind: "slots",
    slots: this.dayCellBlocks(orario[d])
  }));

  return [specialistaCell, ...dayCells];
},

	sortBySpecialista(arr = []) {
		return [...arr].sort((a, b) =>
			this.fmtCognomeNome(a.convenzionato).localeCompare(
				this.fmtCognomeNome(b.convenzionato),
				"it",
				{ sensitivity: "base" }
			)
		);
	},

	/* =======================
	   PDF
	======================= */

	// === BODY: crea le righe con eventuali sezioni per BRANCA ===
buildTableBody({ dati = [], raggruppaPer = "branca" } = {}) {
  const DAYS = this.DAYS();
  const body = [];

  const headRow = [{ content: "Specialista", styles: { fontStyle: "bold", halign: "left" } }]
    .concat(DAYS.map(d => ({ content: d, styles: { fontStyle: "bold", halign: "center" } })));

  const input = Array.isArray(dati) ? dati : [];

  if (raggruppaPer === "branca") {
    const map = {};
    for (const e of input) {
      const bRaw = (e?.convenzionato?.branca) ? String(e.convenzionato.branca) : "—";
      const b = bRaw.toUpperCase();
      if (!map[b]) map[b] = [];
      map[b].push(e);
    }

    const branche = Object.keys(map).sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" }));
    for (const b of branche) {
      body.push([{
        content: `BRANCA: ${b}`,
        colSpan: 1 + DAYS.length,
        styles: { halign: "center", fillColor: [230, 236, 255], textColor: 30, fontStyle: "bold" }
      }]);

      body.push(headRow);
      const rows = this.sortBySpecialista(map[b]).map(e => this.buildRow(e));
      for (const r of rows) body.push(r);
    }
  } else {
    body.push(headRow);
    const rows = this.sortBySpecialista(input).map(e => this.buildRow(e));
    for (const r of rows) body.push(r);
  }

  return body;
},


	// === PDF: genera tabella con carte colorate per ogni orario ===
pdfOrari({ dati = [], raggruppaPer = "branca" } = {}) {
  const doc = jspdf.jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  // Titoli
  doc.setFontSize(16); doc.setTextColor(40);
  doc.text("Orari degli Specialisti", 148.5, 12, null, null, "center");
  doc.setFontSize(11); doc.setTextColor(90);
  const modeTxt = (raggruppaPer === "branca") ? "Raggruppato per Branca (A–Z)" : "Elenco per Specialista (A–Z)";
  doc.text(`Modalità: ${modeTxt}  •  Generato il ${moment().format("DD/MM/YYYY HH:mm")}`, 148.5, 19, null, null, "center");

  const body = this.buildTableBody({ dati, raggruppaPer });

  const columnStyles = {
    0: { cellWidth: 65, halign: "center", valign: "top" }, // PRIMA COLONNA centrata
    1: { cellWidth: 35.3, halign: "center", valign: "top" },
    2: { cellWidth: 35.3, halign: "center", valign: "top" },
    3: { cellWidth: 35.3, halign: "center", valign: "top" },
    4: { cellWidth: 35.3, halign: "center", valign: "top" },
    5: { cellWidth: 35.3, halign: "center", valign: "top" },
    6: { cellWidth: 35.3, halign: "center", valign: "top" }
  };

  const slotColors = [
    { fill: [236, 248, 255], stroke: [180, 210, 255] },
    { fill: [243, 236, 255], stroke: [205, 190, 245] },
    { fill: [236, 255, 245], stroke: [180, 230, 200] },
    { fill: [255, 246, 235], stroke: [240, 205, 160] }
  ];

  // stima altezza esatta per i box di una cella giorno
  function measureSlotsHeight({ doc, cellWidth, slots }) {
    if (!slots || slots.length === 0) return 0;
    const innerW = Math.max(10, cellWidth - 1);
    let total = 0;
    const gap = 1.2; // solo tra box, non dopo l'ultimo
    for (let idx = 0; idx < slots.length; idx++) {
      const s = slots[idx];
      const timeH = 4.2;
      const locLines = doc.splitTextToSize(s.loc || "", innerW);
      const locH = Math.max(3.2 * locLines.length, 3.2);
      const pad = 2.2; // padding interno box (top+bottom)
      total += (pad + timeH + 1 + locH + pad);
      if (idx < slots.length - 1) total += gap;
    }
    return total * 0.65; // riduzione del 20% dell'altezza totale
  }

  jspdf_autotable.autoTable(doc, {
    body,
    startY: 26,
    theme: "grid",
    styles: {
      fontSize: 9,
      cellPadding: 0.5,       // padding default per col 0; per i giorni lo annulliamo sotto
      valign: "top",
      overflow: "linebreak",
      lineColor: [220, 220, 220],
      lineWidth: 0.05,
      textColor: 20
    },
    headStyles: { fillColor: [230, 236, 255], textColor: 20, fontStyle: "bold", halign: "center" },
    bodyStyles: { textColor: 20 },
    columnStyles,
    margin: { left: 10, right: 10 },

    // Imposto minCellHeight preciso e tolgo padding verticale nelle colonne giorno
    didParseCell(data) {
      const { column, cell, doc } = data;

      if (column.index >= 1 && column.index <= 6 && cell?.raw && typeof cell.raw === "object" && cell.raw.kind === "slots") {
        const slots = Array.isArray(cell.raw.slots) ? cell.raw.slots : [];
        cell.text = [""]; // non lasciare testo "fantasma"

        // NIENTE padding: così il box occupa tutta la cella
        cell.styles.cellPadding = { top: 0, right: 0, bottom: 0, left: 0 };

        const needH = measureSlotsHeight({
          doc,
          cellWidth: cell.width,
          slots
        });
        cell.styles.minCellHeight = Math.max(cell.styles.minCellHeight || 0, needH);
      }
    },

    // Disegno dei card all'interno della cella, occupando tutta l'altezza
    didDrawCell(data) {
      const { doc, cell, column } = data;

      // Gestione colonna specialista (0)
      if (column.index === 0 && cell?.raw && typeof cell.raw === "object" && cell.raw.kind === "specialista") {
        const { nome, branca, totOre, presidi, distretti } = cell.raw;
        const x = cell.x + 2;
        let y = cell.y + 3;

        // Nome in grassetto e più grande
        doc.setFontSize(8.5);
        doc.setFont(undefined, "bold");
        doc.setTextColor(20);
        doc.text(nome || "", x, y);
        y += 3.5;

        // Branca in corsivo
        if (branca) {
          doc.setFontSize(7);
          doc.setFont(undefined, "italic");
          doc.setTextColor(60);
          doc.text(branca, x, y);
          y += 3;
        }

        // Totale ore
        y += 1;
        doc.setFontSize(7);
        doc.setFont(undefined, "bold");
        doc.setTextColor(40);
        doc.text(`Tot: ${totOre}`, x, y);
        y += 3.5;

        // Presidi
        doc.setFont(undefined, "bold");
        doc.text("Presidi:", x, y);
        y += 2.8;
        doc.setFont(undefined, "normal");
        doc.setFontSize(6.5);
        doc.setTextColor(50);
        const presidiLines = (presidi || "").split("\n");
        for (const line of presidiLines) {
          doc.text(line, x, y);
          y += 2.5;
        }

        // Distretti
        y += 0.5;
        doc.setFontSize(7);
        doc.setFont(undefined, "bold");
        doc.setTextColor(40);
        doc.text("Distretti:", x, y);
        y += 2.8;
        doc.setFont(undefined, "normal");
        doc.setFontSize(6.5);
        doc.setTextColor(50);
        const distrettiLines = (distretti || "").split("\n");
        for (const line of distrettiLines) {
          doc.text(line, x, y);
          y += 2.5;
        }

        // Reset font
        doc.setFont(undefined, "normal");
        return;
      }

      // Gestione colonne giorni (1-6)
      if (!(column.index >= 1 && column.index <= 6)) return;
      if (!cell?.raw || typeof cell.raw !== "object" || cell.raw.kind !== "slots") return;

      const slots = Array.isArray(cell.raw.slots) ? cell.raw.slots : [];
      if (slots.length === 0) return;

      // Estendo leggermente oltre i bordi della cella per eliminare spazi bianchi
      const overlap = 0.3;                   // sovrapposizione per coprire margini/bordi
      const x = cell.x - overlap;            // estendo a sinistra
      const y = cell.y;                      // nessun margine superiore
      const w = cell.width + (overlap * 2); // estendo sia a sinistra che a destra
      const h = cell.height;                 // tutta la cella in altezza

      const innerW = Math.max(10, w - 1);
      const gap = 1.2;

      // prepara metriche per ogni box
      const boxes = slots.map(s => {
        const timeH = 4.2;
        const locLines = doc.splitTextToSize(s.loc || "", innerW);
        const locH = Math.max(3.2 * locLines.length, 3.2);
        const pad = 2.2;
        const boxH = pad + timeH + 1 + locH + pad;
        return { ...s, locLines, boxH, pad, timeH };
      });

      // calcola la Y di partenza in modo che il blocco complessivo sia ancorato in alto (niente spazio extra in fondo)
      let top = y;
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        const palette = slotColors[i % slotColors.length];

        doc.setFillColor(...palette.fill);
        doc.setDrawColor(...palette.stroke);
        try {
          doc.roundedRect(x, top, w, b.boxH, 1.5, 1.5, "FD");
        } catch (_) {
          doc.rect(x, top, w, b.boxH, "FD");
        }

        const cx = x + w / 2;
        // orario
        doc.setTextColor(15);
        doc.setFontSize(9);
        doc.text(b.time || "", cx, top + b.pad + b.timeH / 2 + 0.2, { align: "center", baseline: "middle" });

        // presidio (multiline)
        doc.setTextColor(70);
        doc.setFontSize(7.5);
        const locBlockTop = top + b.pad + b.timeH + 1;
        for (let li = 0; li < b.locLines.length; li++) {
          const ly = locBlockTop + 3.2 * li + 1.4;
          doc.text(b.locLines[li], cx, ly, { align: "center", baseline: "middle" });
        }

        // gap solo tra i box, non dopo l'ultimo
        top += b.boxH + (i < boxes.length - 1 ? gap : 0);
      }
    }
  });

  return doc.output("dataurlstring");
},

	/**
	 * Carica i dati e genera il PDF salvandolo nello store
	 */
	async generaPdfOrari(raggruppaPer = "specialista") {
		showModal(caricamentoMdl.name);
		try {
			const dati = await this.getAllOrariConvenzionatiFromDb();
			if (!Array.isArray(dati) || dati.length === 0) {
				showAlert("Nessun orario trovato per la stampa.", "warning");
				await storeValue('pdfDataUrl', "");
				return;
			}
			const dataUrl = this.pdfOrari({ dati, raggruppaPer });
			await storeValue('pdfDataUrl', dataUrl);
		} catch (e) {
			console.error("Errore generazione PDF:", e);
			showAlert("Errore nella generazione del PDF: " + (e?.message || e), "error");
			await storeValue('pdfDataUrl', "");
		} finally {
			closeModal(caricamentoMdl.name);
		}
	},

	/* =======================
	   GETTER URL PDF
	======================= */
	getPdfUrl() {
		return appsmith.store.pdfDataUrl || "";
	},

	/* =======================
	   ANTEPRIMA
	======================= */
	mostraAnteprimaOrario: async () => {
		await this.generaPdfOrari(raggruppaPerBrancaChk.isChecked ?"branca": "specialista");
		showModal(stampaOrarioModal.name);
	}
};
