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
	distrettoCambiato: false,
	secret: "UxZ>69'[Tu<6",
	distrettiMap: { byUnique: {}, byId: {} },
	periodo: null,
	variabiliInserite: [],
	allVariabiliMap: {},
	allConvenzionatiMap: {},
	filteredConvenzionatiMap: {},
	filtraPerNomeUtente: true,
	periodoSolaLettura:false,
	forzaAbilitazionePeriodo: false,
	rowToRemove: null,
	_verifyIntervalId: null, // <- ID del setInterval

	/* =======================
	   LOAD INIZIALE
	======================= */
	async initLoad() {
		showModal(caricamentoMdl.name);
		this.firstLoadingOk = false;
		try {
			convenzionatoSelezionato.setSelectedOption("");
			variabileSelezionata.setSelectedOption("");
			importoVariabile.setValue("");
			altriDati.setValue("");
			note_txt.setValue("");
			this.rowToRemove = null;
			await this.getDistrettiMap();          // 1
			await this.verifyTokenExpires();       // 2
			await this.getCategorieConvenzionatiDaAbilitazioni(); // 2bis
			await this.getPeriodo();               // 3
			await this.getVariabiliDistretto();    // 4
			await this.getConvenzionatiMap();      // 5
			await getDatiVarDistrettoPeriodo.run(); // 6
			
			// Avvio del controllo periodico del token ogni 5 minuti (es. 300 secondi)
			this.startVerifyTokenInterval(60 * 5);
		} catch (err) {
			console.error("Errore in initLoad:", err);
			showAlert("Si è verificato un errore nel caricamento iniziale", "error");
		} finally {

			closeModal(caricamentoMdl.name);
			this.firstLoadingOk = true;
		}
	},
	
	
	/* =======================
	   FUNZIONE CONTROLLO TOKEN PERIODICO
	======================= */
	startVerifyTokenInterval(secondi = 300) {
		// Se esiste già un timer lo resetto
		if (this._verifyIntervalId) clearInterval(this._verifyIntervalId);

		this._verifyIntervalId = setInterval(() => {
			const { expired } = this.verifyTokenExpires();
			if (expired) {
				clearInterval(this._verifyIntervalId);
				this._verifyIntervalId = null;
			}
		}, secondi * 1000);
	},

	stopVerifyTokenInterval() {
		if (this._verifyIntervalId) {
			clearInterval(this._verifyIntervalId);
			this._verifyIntervalId = null;
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
	getLast10YearsMap: (currentYear = moment().year()) => {
		let years = [];
		for (let i = 0; i < 10; i++) {
			const year = currentYear - i;
			years.push({ anno: year.toString(), value: year });
		}
		return years;
	},

	aggiornaFiltroTabella: () => {
		this.filtraPerNomeUtente = soloUtenteCorrente.isSwitchedOn;
		getDatiVarDistrettoPeriodo.run();
	},
	getRapportoFromId: (id) => {
		try {
		return this.allConvenzionatiMap[id.id_conv].RAPPORTO }
		catch (ex) {return "-"}
	},

	getConvenzionatoDescFromId: id => {
		try {
		const conv = this.allConvenzionatiMap[id];
		return `(${conv.CI}) ${conv.COGNOME} ${conv.NOME} - ${conv.DATA_NAS} - [${conv.RAPPORTO}]`;
		} catch (ex) {
			return id;
		}
	},

	dataCompetenzaCongrua: () => {
		const dataPeriodo = moment({ year: this.periodo.anno, month: this.periodo.mese, day: 1 });
		const dataCompetenza = moment({
			year: annoCompetenza.selectedOptionValue,
			month: meseCompetenza.selectedOptionValue,
			day: 1
		});
		return dataCompetenza.isSameOrBefore(dataPeriodo);
	},

	getMesi: () =>
	"Gennaio_Febbraio_Marzo_Aprile_Maggio_Giugno_Luglio_Agosto_Settembre_Ottobre_Novembre_Dicembre".split(
		"_"
	),

	getMesiMap: function () {
		return this.getMesi().map((m, i) => ({ mese: m, value: i + 1 }));
	},

	getMeseItaliano: function (mese) {
		return this.getMesi()[mese - 1];
	},

	/* =======================
	   LOAD DATI DISTRETTO
	======================= */
	async getVariabiliDistretto() {
		this.allVariabiliMap = {};
		await getVariabiliDistretto.run();
		await getAllVariabili.run();
		getAllVariabili.data.forEach(v => {
			this.allVariabiliMap[v["#"]] = v;
		});
	},
	
	async getCategorieConvenzionatiDaAbilitazioni () {
		let categorie = [];
		await getCategoriaSpecAbilitazioni.run();
		for (let cat of getCategoriaSpecAbilitazioni.data)
			categorie.push(cat["categoria_variabile"])
		this.userData.categorieVariabiliAbilitate = categorie;
	},

	async getConvenzionatiMap() {
		this.allConvenzionatiMap = {};
		this.filteredConvenzionatiMap = {};
		await getAllConvenzionatiFiltered.run();
		await getAllConvenzionati.run();
		getAllConvenzionatiFiltered.data.forEach(c => {
			this.filteredConvenzionatiMap[c["CI"]] = c;
		});
		getAllConvenzionati.data.forEach(c => {
			this.allConvenzionatiMap[c["CI"]] = c;
		});
	},

	async getPeriodo() {
		// se serve aggiornare il dataset, decommenta:
		if (!this.forzaAbilitazionePeriodo) {
			await getPeriodo.run();
			const periodo = getPeriodo.data;
			if (periodo.length === 1)
				this.periodo =  periodo[0];
			else {
				const periodoVis = getLastPeriodoVisualizzazione.data;
				if (periodoVis.length === 1) {
					this.periodo = periodoVis[0];
					this.periodoSolaLettura = true;
				}
			}
		}
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

	async cambiaDistrettoSelezionato() {
		this.userData.codDistretto = distrettoSelezionatoCmb.selectedOptionValue.toString();
		this.userData.distretto =
			this.distrettiMap.byId[parseInt(distrettoSelezionatoCmb.selectedOptionValue)].unique;
		this.userData.distrettoTxt =
			this.distrettiMap.byId[this.userData.codDistretto].descrizione;
		this.distrettoCambiato = true;
		closeModal(modalCambioDistretto.name);
		await this.initLoad();
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
					abilitazioni: decoded.data.abilitazioni_dipententi.split(','),
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
	   CSV & PDF
	======================= */

	generaCSVGPS: async () => {
		await getAllVarDistrettiPeriodoCSV.run();
		let allData = await getAllVarDistrettiPeriodoCSV.data;
		let out = [];
		const mensilita = ["GEN","FEB", "MAR", "APR", "MAG", "GIU", "LUG", "AGO", "SET", "OTT", "NOV", "DIC"];
		const riferimentoStipendio = moment({
			year: homeFunctions.periodo.anno,
			month: homeFunctions.periodo.mese -1,
			day: 1
		}).add(1, 'month');
		for (let riga of allData) {
			const voceSplitted = riga["voce"].split("$");
			const periodoSplitted = riga["periodo"].split("_");
			const competenzaSplitted = riga["competenza"].split("_");
			const riferimentoVariabile = moment({
				year: parseInt(competenzaSplitted[0]),
				month: parseInt(competenzaSplitted[1]) -1,
				day: 1
			}).endOf('month').format("DD/MM/YYYY");
			const valoreVariabileRow = this.getValoreCalcolato(riga)['double'].toString().replace(".",",");
			out.push({
				"INPUT": "LVARIDE",
				"RIFERIMENTO": riferimentoVariabile,
				"CI": riga["id_conv"],
				"ANNO": riferimentoStipendio.year(),
				"MESE": parseInt(riferimentoStipendio.month()) +1,
				"MENSILITA": mensilita[riferimentoStipendio.month()],
				"VOCE": voceSplitted[0].replace("#",""),
				"SUB": voceSplitted[1],
				"ARR": "",
				"QTA": this.allVariabiliMap[riga['voce']]['IMPORTO'] === "" ? valoreVariabileRow : "",
				"IMP": this.allVariabiliMap[riga['voce']]['IMPORTO'] === "SI" ? valoreVariabileRow : "",
				"SEDE_DEL": "",
				"ANNO_DEL": "",
				"NUMERO_DEL": "",
				"DELIBERA": ""
			})
		}
		console.log(out);
		return out;
	},

	generaCSVDistretti: () => {
		const data = getDatiVarDistrettoPeriodo.data;
		let outData = [];
		for (let riga of data) {
			outData.push({
				"Periodo": riga.periodo,
				"Competenza": riga.competenza,
				"Variabile": this.allVariabiliMap[riga.voce].DESCRIZIONE,
				"Convenzionato": this.allConvenzionatiMap[riga.id_conv].COGNOME + " " + this.allConvenzionatiMap[riga.id_conv].NOME,
				"Rapporto": this.allConvenzionatiMap[riga.id_conv].RAPPORTO,
				"Valore": this.getValoreCalcolato(riga)['double'],
				"Utente": riga.utente,
				"Distretto": this.distrettiMap.byUnique[riga.distretto].descrizione
			});
		}
		return outData;
	},

	generaCSV: async (cosa = "reportGPS") => {
		let mockData = null;
		let fileName = null;
		let postfix = this.periodo.anno + "_" + this.periodo.mese + "_al_" + moment().format("YYYY-MM-DD_HH_MM");
		switch (cosa) {
			case "reportGPS":
				mockData = await this.generaCSVGPS();
				fileName = "export_variabili_";
				break;
			case "reportDistretto":
				mockData = this.generaCSVDistretti();
				fileName = "export_variabili_distretto_" + this.userData.distretto + "_";
				break;
		}
		return {
			data: papaparse.unparse(mockData, { header: true, delimiter: ";", newline: "\r\n" }),
			fileName: fileName + postfix 
		}
	},

	scaricaCSV: async (cosa) => {
		let out = await this.generaCSV(cosa);
		download(out.data, out.fileName +".csv", "text/csv");
	},

	getValoreCalcolato(row) {
		try {
			let valore = parseFloat((parseInt(row['valore']) / 100).toFixed(2));
			let altriValori = 
					(row['altri_valori'] && row['altri_valori'] !== "") ? 		(parseFloat((parseInt(row['altri_valori']) / 100).toFixed(2))) : null;
			let out = valore;

			if (altriValori && this.allVariabiliMap[row['voce']].MOLTIPLICA === "SI") {
				if (altriValori === null)
					out = valore
				else
					out  = valore * altriValori;
			}
			out = out.toFixed(2).replace(".",",");
			if (out.endsWith(",00"))
				out = out.substr(0,out.length -3);

			return {
				toString: (this.allVariabiliMap[row['voce']].IMPORTO === "SI" ? "€" : "") + " " + out + ((altriValori || this.allVariabiliMap[row['voce']].ALTRI_DATI !== "") ? ( " (" + this.allVariabiliMap[row['voce']].ALTRI_DATI + ": " + (altriValori ?? "N.D.") + ")" + (row['note'] && row['note'] !== "" ? (" - " + row['note']) : "" )  ) : "") ,
				double: parseFloat(out.replace(",",".")),
				note: (this.allVariabiliMap[row['voce']].ALTRI_DATI && this.allVariabiliMap[row['voce']].ALTRI_DATI !== "") ? (" (" +this.allVariabiliMap[row['voce']].ALTRI_DATI + ": " + altriValori.toString() + ")"  )  : ""
			}
		} catch (err) {
			return {
				toString: "err: " + err.toString(),
				double: 0,
				note:"Errore"
			}
		}
	},

	competenzaToString(comp = "2025_04") {
		const [anno, mese] = comp.split("_");
		return `${this.getMeseItaliano(parseInt(mese))} ${anno}`;
	},

	/*
	 *  reportDistrettoPDF
	 *  Genera un PDF riepilogativo delle variabili di distretto.
	 *  Il report è ora suddiviso per RAPPORTO → CONVENZIONATO,
	 *  mantenendo la stessa impaginazione per i singoli record.
	 */
	reportDistrettoPDF() {
		/* --------------------------------------------------------
	   1. Preparazione dati
	   -------------------------------------------------------- */
		const dati = getDatiVarDistrettoPeriodo.data;

		// Aggiungo il campo "rapporto" a ogni riga prelevandolo dalla mappa dei convenzionati
		for (const riga of dati) {
			const conv = this.allConvenzionatiMap[riga.id_conv];
			riga.rapporto = conv ? conv.RAPPORTO : "";
		}

		/* --------------------------------------------------------
	   2. Creazione del documento
	   -------------------------------------------------------- */
		const doc = jspdf.jsPDF();

		/* LOGO */
		const logoWidth  = 40;
		const logoHeight = (logoWidth * 100) / 185; // altezza in proporzione
		doc.addImage(resources.logoAsp, "PNG", 210 - logoWidth - 10, 10, logoWidth, logoHeight);

		/* TITOLI */
		doc.setFontSize(18);
		doc.text("Riepilogo variabili distretto", 80, 22, null, null, "center");
		doc.text(this.userData.distrettoTxt,            80, 30, null, null, "center");

		doc.setFontSize(9);
		doc.setTextColor(100);
		doc.text(`Generato il ${moment().format("DD/MM/YYYY HH:mm")}`, 80, 35, null, null, "center");

		/* --------------------------------------------------------
	   3. Raggruppamento dati per RAPPORTO e sottoraggruppamento
	      per CONVENZIONATO
	   -------------------------------------------------------- */
		const groupedByRapporto = dati.reduce((acc, el) => {
			if (!acc[el.rapporto]) acc[el.rapporto] = [];
			acc[el.rapporto].push(el);
			return acc;
		}, {});

		const finalData = [];

		// Ciclo sui rapporti in ordine alfabetico
		Object.keys(groupedByRapporto)
			.sort()
			.forEach(rapporto => {

			/* --- Titolo sezione RAPPORTO -------------------- */
			finalData.push([
				{
					content : `Rapporto: ${rapporto}`,
					colSpan : 6,
					styles  : {
						halign    : "left",
						fillColor : [180, 200, 255],
						fontStyle : "bold",
						fontSize  : 11
					}
				}
			]);

			/* --- Sottoraggruppamento per convenzionato ------- */
			const byConv = groupedByRapporto[rapporto].reduce((acc, el) => {
				if (!acc[el.id_conv]) acc[el.id_conv] = [];
				acc[el.id_conv].push(el);
				return acc;
			}, {});

			Object.keys(byConv)
				.sort((a, b) => a - b)   // ordinamento numerico degli id_conv
				.forEach(id_conv => {

				/* Header convenzionato */
				finalData.push([
					{
						content : this.getConvenzionatoDescFromId(id_conv),
						colSpan : 6,
						styles  : {
							halign    : "left",
							fillColor : [220, 220, 220],
							fontStyle : "bold"
						}
					}
				]);

				/* Intestazione colonne (una sola volta per convenzionato) */
				finalData.push([
					{ content: "Rapporto",    styles: { fontSize: 7, fontStyle: "bold" } },
					{ content: "Voce",        styles: { fontSize: 7, fontStyle: "bold" } },
					{ content: "Competenza",  styles: { fontSize: 7, fontStyle: "bold" } },
					{ content: "Valore",      styles: { fontSize: 7, fontStyle: "bold" } },
					{ content: "Utente",      styles: { fontSize: 7, fontStyle: "bold" } },
					{ content: "Note",      styles: { fontSize: 7, fontStyle: "bold" } },
				]);

				/* Righe di dettaglio */
				byConv[id_conv].forEach(item => {
					finalData.push([
						item.rapporto,
						this.allVariabiliMap[item.voce].DESCRIZIONE,
						this.competenzaToString(item.competenza),
						this.getValoreCalcolato(item)["toString"],
						item.utente,
						this.getValoreCalcolato(item)["note"] + (item.note !== "" ? (" - " + item.note) : "") 
					]);
				});
			});
		});

		/* --------------------------------------------------------
	   4. Tabella e numerazione pagine
	   -------------------------------------------------------- */
		jspdf_autotable.autoTable(doc, {
			body      : finalData,
			startY    : 45,
			theme     : "grid",
			styles    : { fontSize: 9 },
			headStyles: { fillColor: [0, 0, 128] },
			didDrawPage: data => {
				const pageCount = doc.internal.getNumberOfPages();
				doc.setFontSize(10);
				doc.text(`Pagina ${data.pageNumber} di ${pageCount}`, 200 - 30, 290);
			}
		});

		/* --------------------------------------------------------
	   5. Firma
	   -------------------------------------------------------- */
/* --------------------------------------------------------
   5. Firme
   -------------------------------------------------------- */
const pageWidth = doc.internal.pageSize.width;
const pageHeight = doc.internal.pageSize.height;

// Coordinate verticali
const firmaY = pageHeight - 30;
const firmaY2 = firmaY + 18;

// Prima riga: due firme, sinistra e destra
doc.setFontSize(12);
doc.text("Responsabile del Procedimento", 20, firmaY);
doc.text("Dirigente Medico", pageWidth - 80, firmaY);

// Linee per le firme
doc.line(20, firmaY + 8, 20 + 60, firmaY + 8); // sinistra
doc.line(pageWidth - 80, firmaY + 8, pageWidth - 20, firmaY + 8); // destra

// Seconda riga: una firma a destra
doc.text("Direttore del Distretto", pageWidth - 80, firmaY2);
doc.line(pageWidth - 80, firmaY2 + 8, pageWidth - 20, firmaY2 + 8); // destra, sotto

		/* --------------------------------------------------------
	   6. Salvataggio / restituzione
	   -------------------------------------------------------- */
		const timestamp = moment().format("YYYY-MM-DD_HH-mm");
		const filename  = `report-${timestamp}.pdf`;

		//  Se vuoi forzare il download: doc.save(filename);
		//  In Appsmith di solito si restituisce il dataURL:
		let dataURL = doc.output("dataurlstring");
		//  dataURL += "&filename=" + encodeURIComponent(filename); // eventuale append

		return dataURL;
	},

	/* =======================
	   CRUD VARIABILI
	======================= */

	doSoftRemove : async () => {
	if (this.rowToRemove) {
		await deleteFromRowIndex.run();
		await getDatiVarDistrettoPeriodo.run();
		closeModal(modal_conferma_rimozione.name);
		showAlert("Riga eliminata, elenco aggiornato.", "info");
			this.rowToRemove = null;
		}
		else 
			showAlert("Errore nell'eliminazione della riga", "error");
},
	async removeRow(row) {
		this.rowToRemove = row;
		showModal(modal_conferma_rimozione.name);
	},


	async aggiungiVariabile() {
		if (
			!variabileSelezionata.selectedOptionValue ||
			!convenzionatoSelezionato.selectedOptionValue ||
			!importoVariabile.text ||
			parseFloat(importoVariabile.text) === 0.0
		) {
			showAlert("Selezionare il convenzionato, il tipo di variabile e l'importo");
			return;
		}

		aggiungiVariabile.setDisabled(true);

		await getVarVocePeriodoConv.run();
		if (getVarVocePeriodoConv.data.length !== 0 && this.allVariabiliMap[ variabileSelezionata.selectedOptionValue].SI_RIPETE !== "SI") {
			showAlert(
				"ERRORE! Esiste già lo stesso tipo di variabile per il convenzionato selezionato.",
				"error"
			);
			statusTxt.setText("");
			aggiungiVariabile.setDisabled(
				!convenzionatoSelezionato.selectedOptionValue ||
				!variabileSelezionata.selectedOptionValue ||
				!importoVariabile.text
			);
			return;
		}

		statusTxt.setText("Caricamento in corso... attendere");
		await aggiungiDatiVariabile.run();
		await getDatiVarDistrettoPeriodo.run();

		/* reset form */
		[convenzionatoSelezionato, variabileSelezionata].forEach(cmb => cmb.setSelectedOption(""));
		[importoVariabile, altriDati,note_txt].forEach(inp => inp.setValue(""));
		meseCompetenza.setSelectedOption(this.periodo.mese);
		annoCompetenza.setSelectedOption(this.periodo.anno);

		statusTxt.setText("");
		showAlert("Variabile inserita correttamente", "info");
	},
	impostaPeriodoAdmin : () => {
		if (forza_override_periodo.isSwitchedOn) {
			imposta_periodo_btn.setDisabled(true);
			getPeriodoFromAnnoMese.run().then(() => {
				if (getPeriodoFromAnnoMese.data.length=== 1) {
					this.periodo = getPeriodoFromAnnoMese.data[0];
					this.forzaAbilitazionePeriodo = abilita_inserimento_chk.isChecked;
					imposta_periodo_btn.setDisabled(false);
					this.initLoad();
					showAlert("Nuovo periodo selezionato, aggiornamento portale in corso", "info")
				}
				else {
					showAlert("Nessun periodo esistente con l'anno e il mese selezionato", "error");
					imposta_periodo_btn.setDisabled(false);
				}
			})
		}
		else {
			this.forzaAbilitazionePeriodo = false;
			imposta_periodo_btn.setDisabled(false);
			this.initLoad();
		}
	},
	caricaInfoConv : () => {
				storeValue("infoConvSelezionato", "");
					icon_info_conv.setVisibility(false);
		if (convenzionatoSelezionato.selectedOptionValue) { getInfoConvByCf.run({cf:this.allConvenzionatiMap[convenzionatoSelezionato.selectedOptionValue].CODICE_FISCALE }).then((res) => {
			if (getInfoConvByCf.data.length === 1) {
				icon_info_conv.setVisibility(true);
				storeValue("infoConvSelezionato","Indirizzo residenza da sistema TS:<br /><b> " + getInfoConvByCf.data[0].indirizzoResidenza + "</b>");
			}
			});
		}
	}
};