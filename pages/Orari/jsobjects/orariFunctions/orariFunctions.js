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
		for (let id of ids)
			out.push(this.distrettiMap.byId[parseInt(id)].unique);
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

	getMesiMap: function () {
		return this.getMesi().map((m, i) => ({ mese: m, value: i + 1 }));
	},

	getMeseItaliano: function (mese) {
		return this.getMesi()[mese - 1];
	},

	async getConvenzionatiMap() {
		this.allConvenzionatiMap = {};
		await getAllConvenzionati.run();
		getAllConvenzionati.data.forEach(c => {
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
		const ids = distrettiString.split(separator);
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
		})
	},

	getAllConvenzionatiList: async () => {
		this.allConvenzionatiList = await this.getAllConvenzionatiConBranca();
	},

	getAllConvenzionatiConBranca: async () => {
		let data = await getAllConvenzionatiBranche.run();
		let out = [];
		this.allConvenzionatiPerBrancaMap = {};
		for (let riga of data) {
			if (!this.allConvenzionatiPerBrancaMap.hasOwnProperty(riga.id))
				this.allConvenzionatiPerBrancaMap[riga.id] = riga;
			out.push({
				label: this.allConvenzionatiMap[riga["id_convenzionato"]].COGNOME + " " +
				this.allConvenzionatiMap[riga["id_convenzionato"]].NOME + " [" + riga["branca"] + "]",
				value: riga["id"].toString()
			})
		}
		return out;
	},

	mostraFormNuovoConvenzionato: () => {
		convenzionato_cmb.setSelectedOption("");
		branca_cmb.setSelectedOption("");
		showModal(nuovoConvBrancaMdl.name);
	},

	getAllPresidiMap: async () => {
		let data = await getAllPresidi.data;
		let out = {};
		for (let riga of data)
			out[riga['id']] = riga
		this.allPresidiMap = out;
	},

	/**
	 * Ordina per orario e calcola le ore svolte per ogni presidio.
	 */
	sortByTime: (data, timeField = "from", order = "asc") => {
		const isArray = Array.isArray(data);
		const entries = isArray ? data.map((obj, idx) => [idx, obj]) : Object.entries(data);

		function getMinutes(timeStr) {
			if (!timeStr || typeof timeStr !== "string") return 0;
			const [h, m] = timeStr.split(":").map(Number);
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
		if (convenzionatoSelezionato.selectedOptionValue !== "") {
			let orarioConvenzionato = await getOrariByConvenzionato.run({ convenzionato: convenzionatoSelezionato.selectedOptionValue });
			let out = await this.getOrarioConvenzionato(convenzionatoSelezionato.selectedOptionValue, orarioConvenzionato);
			storeValue('orarioConvenzionatoSelezionato', out.orario);
			storeValue('orarioPerPresidio', out.perPresidio);
			storeValue('orarioPerDistretto', Object.values(out.perDistretto));
			closeModal(caricamentoMdl.name);
		}
	},

	getAllOrariConvenzionati: async () => {
		let orariConvenzionato = await getAllOrariConvenzionati.run();
		let allConvenzionati = {};
		for (let orario of orariConvenzionato) {
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

	getOrarioConvenzionato: async (id, orarioConvenzionato) => {
		let out = {};
		let orePresidio = {};
		let convenzionato = null;
		if (orarioConvenzionato) {
			convenzionato = this.allConvenzionatiMap[this.allConvenzionatiPerBrancaMap[id].id_convenzionato];
			convenzionato.branca = this.allConvenzionatiPerBrancaMap[id].branca;
			for (let giorno in this.getGiorniDellaSettimana()) {
				let giornoString = this.getGiorniDellaSettimana()[giorno];
				out[giornoString] = [];
			}
			for (let orario of orarioConvenzionato) {
				let presidio = this.allPresidiMap[orario['id_presidio']];
				out[this.getGiorniDellaSettimana()[orario['giorno_settimana']]].push({
					rowIndex: orario.rowIndex,
					from: orario['ingresso'],
					to: orario['uscita'],
					location: presidio['presidio'],
					id_presidio: orario['id_presidio'],
					disctrict: this.distrettiMap.byUnique[presidio['distretto']].descrizione
				})
			}
			for (let giorno in this.getGiorniDellaSettimana()) {
				const res = this.sortByTime(out[this.getGiorniDellaSettimana()[giorno]], 'from');
				out[this.getGiorniDellaSettimana()[giorno]] = res.sortedData;
				for (let idPres in res.oreByPresidio) {
					if (!orePresidio.hasOwnProperty(idPres))
						orePresidio[idPres] = 0;
					orePresidio[idPres] += res.oreByPresidio[idPres];
				}
			}
		}

		let outPresidio = [];
		let outDistretto = {};
		for (let presidio in orePresidio) {
			outPresidio.push({
				presidio: this.allPresidiMap[presidio].presidio,
				id_presidio: presidio,
				ore: orePresidio[presidio]
			})
		}
		for (let riga of outPresidio) {
			const presidioInt = parseInt(riga.id_presidio);
			if (!outDistretto.hasOwnProperty(this.allPresidiMap[presidioInt].distretto))
				outDistretto[this.allPresidiMap[presidioInt].distretto] = {
					distretto: this.distrettiMap.byUnique[this.allPresidiMap[presidioInt].distretto].descrizione,
					ore: 0
				};
			outDistretto[this.allPresidiMap[presidioInt].distretto].ore += riga.ore;
		}
		return { convenzionato: convenzionato, orario: out, perDistretto: outDistretto, perPresidio: outPresidio }
	},

	calcolaTotaleOre: (data = appsmith.store.orarioPerDistretto) => {
		return Array.isArray(data) ? data.reduce((tot, item) => tot + (item["ore"] || 0), 0) : 0;
	},

	modificaOrario: async (rowIndex = 2) => {
		let orario = await getOrarioByRowIndex.run({ rowIndex });
		if (orario.length > 0) {
			orario = orario[0];
			orario.convenzionato = this.allConvenzionatiMap[orario.id_convenzionato];
			storeValue('orarioDaModificare', orario);
			showModal(modificaOrarioModal.name);
		}
	},

	onOrarioChange: async (tag, time) => {
		console.log(tag + " " + time);

		let orarioDaModificare = appsmith.store.orarioDaModificare || {};

		// Salviamo i valori precedenti per eventuale ripristino
		const prevIngresso = orarioDaModificare.ingresso;
		const prevUscita = orarioDaModificare.uscita;

		// Aggiorniamo in base al campo modificato
		if (tag === "inizio") {
			orarioDaModificare.ingresso = time;
		} else {
			orarioDaModificare.uscita = time;
		}

		// Controllo validità orari
		if (orarioDaModificare.ingresso && orarioDaModificare.uscita) {
			if (!this.verificaOrariSingoliOk()) {
				showAlert("⚠️ L'orario di ingresso non può essere successivo all'orario di uscita!", "warning");
				// Ripristino valore precedente
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

	// Giorni standard (riuso della tua funzione, ma comodo averli qui)
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
	dayCellText(orarioGiorno = []) {
		if (!Array.isArray(orarioGiorno) || orarioGiorno.length === 0) return "";
		return orarioGiorno
			.map(s => {
			const range = `${this.padTime(s.from)}–${this.padTime(s.to)}`;
			const loc = s?.location ? ` (${s.location})` : "";
			return `${range}${loc}`;
		})
			.join("\n"); // va su più righe nella cella
	},

	buildRow(entry) {
		const c = entry?.convenzionato || {};
		const orario = entry?.orario || {};
		const specialista = `${this.fmtCognomeNome(c)}${c?.branca ? `\nCI: ${c.CI} • ${c.branca}` : `\nCI: ${c.CI || ""}`}`.trim();
		const dayCells = this.DAYS().map(d => this.dayCellText(orario[d]));
		return [specialista, ...dayCells];
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






	/**
	 * Genera il PDF (Data URL) con jsPDF + AutoTable
	 * @param {Array} dati - array come quello restituito da getAllOrariConvenzionati()
	 * @param {String} raggruppaPer - "branca" | "specialista"
	 */
	pdfOrari({ dati = [], raggruppaPer = "branca" } = {}) {
		const doc = jspdf.jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

		// Titolo
		doc.setFontSize(16);
		doc.setTextColor(40);
		doc.text("Orari degli Specialisti", 148.5, 12, { align: "center" });

		// Sottotitolo
		doc.setFontSize(11);
		doc.setTextColor(90);
		doc.text(
			`Modalità: ${raggruppaPer === "branca" ? "Raggruppato per Branca (A–Z)" : "Elenco per Specialista (A–Z)"}  •  Generato il ${moment().format("DD/MM/YYYY HH:mm")}`,
			148.5, 19, { align: "center" }
		);

		const body = this.buildTableBody({ dati, raggruppaPer });

		// colonne: Specialista + 6 giorni
		const columnStyles = {
			0: { cellWidth: 70 }, // Specialista
			1: { cellWidth: 32 },
			2: { cellWidth: 32 },
			3: { cellWidth: 32 },
			4: { cellWidth: 32 },
			5: { cellWidth: 32 },
			6: { cellWidth: 32 }
		};

		const at = this.ensureAutoTableOrFail(doc);
if (!at) {
  // fallback: restituisco comunque un PDF minimale con il titolo, così non si rompe la UI
  return doc.output("dataurlstring");
}

at(doc, {
  body,
  startY: 26,
  theme: "grid",
  styles: {
    fontSize: 9,
    cellPadding: 2,
    overflow: "linebreak",
    valign: "top"
  },
  columnStyles,
  headStyles: { fillColor: [240, 240, 240] },
  didDrawPage: function (data) {
    const pageCount = doc.internal.getNumberOfPages();
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(
      `Pagina ${data.pageNumber} di ${pageCount}`,
      doc.internal.pageSize.getWidth() - 20,
      doc.internal.pageSize.getHeight() - 8,
      { align: "right" }
    );
  }
});


		return doc.output("dataurlstring"); // "data:application/pdf;..."
	},

	/**
	 * Anteprima su iframe "orarioIframe"
	 * mode: "url" | "srcDoc"
	 */
	previewOrari({ dati = [], raggruppaPer = "branca", mode = "url" } = {}) {
		const dataUrl = this.pdfOrari({ dati, raggruppaPer });

		if (mode === "url") {
			// 1) se l'iframe espone setURL (Appsmith)
			if (typeof orarioIframe?.setURL === "function") {
				orarioIframe.setURL(dataUrl);
			} else {
				// Fallback via store/binding
				storeValue("orariPdfUrl", dataUrl);
				showAlert("Anteprima pronta: lega la proprietà URL dell'iframe a {{ appsmith.store.orariPdfUrl }}", "info");
			}
		} else {
			// mode === "srcDoc": mostriamo direttamente un <embed> del PDF in srcdoc
			const html = `
<!doctype html>
<html><head><meta charset="utf-8" />
<style>
  html,body { margin:0; padding:0; height:100%; }
  .wrap { height:100%; width:100%; display:flex; }
  embed { flex:1; height:100%; width:100%; border:0; }
</style>
</head>
<body>
  <div class="wrap"><embed type="application/pdf" src="${dataUrl}"/></div>
</body></html>`;
			// 1) se l'iframe espone setSrcDoc (Appsmith)
			if (typeof orarioIframe?.setSrcDoc === "function") {
				orarioIframe.setSrcDoc(html);
			} else {
				// Fallback via store/binding
				storeValue("orariPdfSrcDoc", html);
				showAlert("Anteprima pronta: lega la proprietà SrcDoc dell'iframe a {{ appsmith.store.orariPdfSrcDoc }}", "info");
			}
		}
	},

	/**
	 * Helper: carica tutto dal DB e apre anteprima
	 * Esempio pulsante:
	 *  {{ utils.previewOrariAll({ raggruppaPer: "branca", mode: "url" }) }}
	 */
	async previewOrariAll({ raggruppaPer = "branca", mode = "url" } = {}) {
		showModal(caricamentoMdl.name);
		try {
			const dati = await this.getAllOrariConvenzionati(); // -> [{ convenzionato, orario, ... }, ...]
			this.previewOrari({ dati, raggruppaPer, mode });
		} catch (e) {
			console.error(e);
			showAlert("Errore nella generazione dell'anteprima PDF", "error");
		} finally {
			closeModal(caricamentoMdl.name);
		}
	},
	
	// Rileva la funzione AutoTable indipendentemente da come è stata caricata la libreria
getAutoTableInvoker(doc) {
  try {
    // Caso 1: plugin ha patchato jsPDF -> doc.autoTable(...)
    if (doc && typeof doc.autoTable === "function") {
      return (d, opts) => d.autoTable(opts);
    }
    // Caso 2: funzione globale window.jspdf_autotable(doc, opts)
    if (typeof window !== "undefined" && typeof window.jspdf_autotable === "function") {
      return (d, opts) => window.jspdf_autotable(d, opts);
    }
    // Caso 3: variabile globale jspdf_autotable(doc, opts)
    if (typeof jspdf_autotable === "function") {
      return (d, opts) => jspdf_autotable(d, opts);
    }
    // Caso 4: export default (es. bundler) -> jspdf_autotable.default(doc, opts)
    if (typeof jspdf_autotable !== "undefined" && typeof jspdf_autotable.default === "function") {
      return (d, opts) => jspdf_autotable.default(d, opts);
    }
  } catch (e) {
    // silenzioso: se non è definito il simbolo, prosegui
  }
  return null; // non trovato
},

ensureAutoTableOrFail(doc) {
  const at = this.getAutoTableInvoker(doc);
  if (!at) {
    showAlert("⚠️ jsPDF-AutoTable non caricato. Aggiungi le librerie 'jspdf' e 'jspdf-autotable' nelle App Libraries e ricarica.", "error");
  }
  return at;
},

	buildTableBody: function ({ dati = [], raggruppaPer = "branca" } = {}) {
		const DAYS = this.DAYS(); // es. ["Lunedì","Martedì","Mercoledì","Giovedì","Venerdì","Sabato"]
		const body = [];

		// Intestazione tabella che riutilizziamo
		const headRow = [{ content: "Specialista", styles: { fontStyle: "bold" } }]
		.concat(DAYS.map(d => ({ content: d, styles: { fontStyle: "bold" } })));

		// Normalizzo l'array dati per sicurezza
		const input = Array.isArray(dati) ? dati : [];

		if (raggruppaPer === "branca") {
			// Costruisco la mappa branca -> entries senza usare ||= (compatibilità Appsmith)
			const map = {};
			for (let i = 0; i < input.length; i++) {
				const e = input[i] || {};
				const bRaw = (e.convenzionato && e.convenzionato.branca) ? String(e.convenzionato.branca) : "—";
				const b = bRaw.toUpperCase();
				if (!map[b]) map[b] = [];
				map[b].push(e);
			}

			const branche = Object.keys(map).sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" }));

			for (let i = 0; i < branche.length; i++) {
				const b = branche[i];

				// Riga di sezione con colSpan uguale al numero di colonne (1 + DAYS.length)
				body.push([{
					content: `BRANCA: ${b}`,
					colSpan: 1 + DAYS.length,
					styles: { halign: "center", fillColor: [230, 230, 230], fontStyle: "bold" }
				}]);

				// Header ripetuto all'interno del body (ok per AutoTable)
				body.push(headRow);

				// Righe dei dati per quella branca
				const rows = this.sortBySpecialista(map[b]).map(e => this.buildRow(e));
				for (let r = 0; r < rows.length; r++) body.push(rows[r]);
			}
		} else {
			// Elenco unico per specialista
			body.push(headRow);
			const rows = this.sortBySpecialista(input).map(e => this.buildRow(e));
			for (let r = 0; r < rows.length; r++) body.push(rows[r]);
		}

		return body;
	},
	mostraAnteprimaOrario: () => {
		this.previewOrariAll({ raggruppaPer: "specialista", mode: "srcDoc" });
		showModal(stampaOrarioModal.name);
	}
};
