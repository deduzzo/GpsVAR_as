export default {

	defaultTab: 'Sign In',
	secret: "UxZ>69'[Tu<6",
	scope: "gpsvar",
	loginScopiRichiesti: "asp5-anagrafica cambio-medico",
	loginAmbitoRichiesto: "api",
	dominio: "asp.messina.it",

	init: () => {
		if (appsmith.store.message && appsmith.store.message !== null) {
			showAlert(appsmith.store.message.msg, appsmith.store.message.type);
			storeValue("message", null);
		}
	},
	setDefaultTab: (newTab) => {
		this.defaultTab = newTab;
	},

	showAlertIfExist: () => {
		if (appsmith.URL.queryParams.msg)
			showAlert(appsmith.URL.queryParams.msg,"info");
	},

	generatePasswordHash: async () => {
		return dcodeIO.bcrypt.hashSync(inp_password.text, 10);
	},
	
	showPasswordHash: async () => {
		console.log(await this.generatePasswordHash());
	},

	verifyHash: (password, hash) => {
		return dcodeIO.bcrypt.compareSync(password, hash)
	},

	createToken: (user) => {
		return jsonwebtoken.sign(user, this.secret, {expiresIn: 60 * 60});
	},
	
	signInNew: async () => {
		try {
		let out = await getToken.run();
		storeValue("authToken",getToken.data.data.token);
		}
		catch (ex) {
			showAlert(getToken.data.err.msg, "error");
		}
	},

	signIn: async (userNonNecessarioNelDominio = false) => {
		showAlert("login in corso..","info");
		let internal = null;
		let user = (await getUserFromIdAndDomain.run());
		let error = "";
		let loginOk = false;
		const username = inp_username.text.toLowerCase().replace("@asp.messina.it","");

		if (user.length > 0) {
			user = user[0];
		} else {
			user = null;
		}

		if (sw_dominio.isSwitchedOn) {
			try {
				// Prova ad eseguire la query loginInternal
				internal = await loginInternal.run({username: username, password: inp_password.text});
				if (!internal || internal.success === false) {
					error = 'Utente o password non validi nel dominio';
				}
				else if (user || userNonNecessarioNelDominio)
					loginOk = true;
			} catch (ex) {
				error = 'Autenticazione di dominio non disponibile al momento, eseguire l\'accesso come utente esterno';
			}
		}
		else
		{
			if (user && this.verifyHash(inp_password.text, user?.password_hash)) {
				loginOk = true;
			}
			else 
				error = 'Combinazione email/password non valida';
		}
		if (loginOk) {
			await updateLastLogin.run({rowIndex: user.rowIndex});
			storeValue("token",this.createToken({data: user}));
			navigateTo("Home");
		}
		else
			showAlert(error, "error");
	},

	verifyToken: (token) => {
		try {
			const decoded = jsonwebtoken.verify(token, this.secret);
			return { valid: true, decoded };
		} catch (err) {
			return { valid: false, error: err.message };
		}
	},
}