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
			convenzionatoSelezionato.setSelectedOption("");
			storeValue('orarioConvenzionatoSelezionato',{});
			storeValue('orarioPerPresidio',[]);
			storeValue('orarioPerDistretto',[]);
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
	"Gennaio_Febbraio_Marzo_Aprile_Maggio_Giugno_Luglio_Agosto_Settembre_Ottobre_Novembre_Dicembre".split(
		"_"
	),
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
		// se serve aggiornare il dataset, decommenta:
		// await getAllDistretti.run();
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
			([cod, desc]) => ({
				label: desc,
				value: cod
			})
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
					// se non è stato cambiato distretto uso il primo, altrimenti mantengo quello selezionato
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
			branca_cmb.setSelectedOption("")
			showAlert("Errore nell'inserimento:" + JSON.stringify(err), "error");
		})
	},
	getAllConvenzionatiConBranca: () => {
		let data = getAllConvenzionatiBranche.data;
		let out = [];
		for (let riga of data) {
			out.push({
				label: this.allConvenzionatiMap[riga["id_convenzionato"]].COGNOME + " " +
				this.allConvenzionatiMap[riga["id_convenzionato"]].NOME + " [" + riga["branca"] + "]",
				value: riga["id_convenzionato"].toString()
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
 *
 * @param {Object|Array} data      - Dataset da elaborare (array o oggetto indicizzato).
 * @param {String}       timeField - Campo orario da usare per il sort (default: "ingresso").
 * @param {String}       order     - "asc" | "desc" (default: "asc").
 *
 * @returns {{ sortedData: Object|Array, oreByPresidio: Object }}
 *          - sortedData:  dataset ordinato (stesso tipo dell'input)
 *          - oreByPresidio: { id_presidio: oreTotali }
 */
	sortByTime: (data, timeField = "from", order = "asc") => {
		const isArray = Array.isArray(data);
		const entries = isArray
		? data.map((obj, idx) => [idx, obj])
		: Object.entries(data);

		// Funzione per estrarre minuti da una stringa orario, gestendo casi strani
		function getMinutes(timeStr) {
			if (!timeStr || typeof timeStr !== "string") return 0;
			const [h, m] = timeStr.split(":").map(Number);
			if (isNaN(h) || isNaN(m)) return 0;
			return h * 60 + m;
		}

		// Funzione di confronto robusta
		const cmp = ([, a], [, b]) => {
			const minutesA = getMinutes(a?.[timeField]);
			const minutesB = getMinutes(b?.[timeField]);
			return order === "desc" ? minutesB - minutesA : minutesA - minutesB;
		};

		entries.sort(cmp);

		// Calcolo ore per presidio in modo sicuro
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

		const sortedData = isArray
		? entries.map(([, value]) => value)
		: Object.fromEntries(entries);

		return { sortedData, oreByPresidio };
	},
	getOrarioConvenzionatoSelezionato: async () => {
		showModal(caricamentoMdl.name);
		let out = {};
		let orePresidio = {}
		if (convenzionatoSelezionato.selectedOptionValue !== "") {
			let orarioConvenzionato = await getOrariByConvenzionato.run({convenzionato: convenzionatoSelezionato.selectedOptionValue});
			let convenzionato = this.allConvenzionatiMap[convenzionatoSelezionato.selectedOptionValue];
			for (let giorno in this.getGiorniDellaSettimana()) {
				let giornoString = this.getGiorniDellaSettimana()[giorno];
				out[giornoString] = [];
			}
			for (let orario of orarioConvenzionato) {
				let presidio = this.allPresidiMap[orario['id_presidio']];
				out[this.getGiorniDellaSettimana()[orario['giorno_settimana']]].push({
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
				console.log("ORE")
				console.log(res.oreByPresidio)
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
				id_presidio:presidio,
				ore: orePresidio[presidio]
			})
		}
		for (let riga of outPresidio) {
			const presidioInt = parseInt(riga.id_presidio);
			if (!outDistretto.hasOwnProperty(this.allPresidiMap[presidioInt].distretto))
				outDistretto[this.allPresidiMap[presidioInt].distretto] = {
					distretto: this.distrettiMap.byUnique[ this.allPresidiMap[presidioInt].distretto].descrizione,
					ore:0
				};
			outDistretto[this.allPresidiMap[presidioInt].distretto].ore += riga.ore;
		}
		storeValue('orarioConvenzionatoSelezionato',out);
		storeValue('orarioPerPresidio',outPresidio);
		storeValue('orarioPerDistretto', Object.values(outDistretto));
		closeModal(caricamentoMdl.name);
	},
	calcolaTotaleOre: (data = appsmith.store.orarioPerDistretto) => {
		return Array.isArray(data) ? data.reduce((tot, item) => tot + (item["ore"] || 0), 0) : 0;
	}

};