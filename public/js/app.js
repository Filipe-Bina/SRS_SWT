// ==========================================================================
// CONFIGURAÇÃO E INICIALIZAÇÃO DO ECOSSISTEMA FIREBASE
// ==========================================================================
const firebaseConfig = {
    apiKey: "AIzaSyD2jO72oONY398UqGlx3OOp-AaEE2RTDZw",
  authDomain: "srs-swt.firebaseapp.com",
  projectId: "srs-swt",
  storageBucket: "srs-swt.firebasestorage.app",
  messagingSenderId: "29017322496",
  appId: "1:29017322496:web:da1abc0e90ffe7fd5fd4e5"
};

const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore(app);
const auth = firebase.auth(app);

// Storage só é inicializado se o SDK estiver carregado na página
const storage = (typeof firebase.storage !== 'undefined') ? firebase.storage(app) : null;

let currentUserData = null;
let activeServiceListener = null;

// ==========================================================================
// [CORRIGIDO] FUNÇÃO DE LOGIN — conecta o form ao Firebase Auth
// ==========================================================================
async function handleLogin(identifier, password) {
    const btnLogin = document.getElementById('btn-login');
    const errEl   = document.getElementById('login-error');
    if (errEl) errEl.textContent = '';
    if (btnLogin) btnLogin.disabled = true;

    try {
        // Aceita RE ou e-mail: se não contiver @, busca o e-mail na whitelist
        let email = identifier.trim();

        if (!email.includes('@')) {
            // Busca pelo RE
            const snap = await db.collection('users_whitelist')
                .where('re', '==', email).limit(1).get();

            if (snap.empty) {
                throw new Error('RE não encontrado na base corporativa.');
            }
            email = snap.docs[0].data().email;
        }

        await auth.signInWithEmailAndPassword(email, password);
        // onAuthStateChanged cuida do redirecionamento

    } catch (err) {
        const msg = err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found'
            ? 'Credenciais inválidas. Verifique e tente novamente.'
            : err.message;
        if (errEl) errEl.textContent = msg;
        if (btnLogin) btnLogin.disabled = false;
    }
}

// ==========================================================================
// WHITELIST — seed inicial (executar uma vez no console)
// ==========================================================================
const tecnicosWhitelist = [
    { sap: "80734938", re: "35188", name: "ANDERSON CAMARGO DINIZ LUCIANO", celular: "12 99744-7398", cargo: "TÉCNICO MULTSKILL", rg: "42905952", cpf: "345.788.098-03", role: "tecnico" },
    { sap: "80152255", re: "32818", name: "ANDERSON WILLIAN CAMER",          celular: "12 99737-5816", cargo: "TÉCNICO FIBRA",     rg: "28628342-6",  cpf: "290.789.288-67", role: "tecnico" },
    { sap: "80734458", re: "618284",name: "ERKION JOSELITO FERREIRA",        celular: "12 99208-3318", cargo: "TÉCNICO MULTSKILL", rg: "25715740-4",  cpf: "302.298.218-63", role: "tecnico" },
    { sap: "80843048", re: "35756", name: "JONATHAS DE PAULA FREITAS",       celular: "12 99721-2926", cargo: "TÉCNICO MULTSKILL", rg: "49336447-x",  cpf: "408.013.638-29", role: "tecnico" },
    { sap: "80678161", re: "35780", name: "JORGE DE OLIVEIRA JUNIOR",        celular: "12 99707-1848", cargo: "TÉCNICO FIBRA",     rg: "44547722",    cpf: "37842104816",    role: "tecnico" },
    { sap: "80734463", re: "612449",name: "KLEITON SILVA DOS SANTOS",        celular: "11 97372-5390", cargo: "TÉCNICO FIBRA",     rg: "50117301-8",  cpf: "38972082880",    role: "tecnico" },
    { sap: "80810084", re: "35664", name: "CLAYTON WILLIAM MARCONDES",       celular: "12 99737-2133", cargo: "TÉCNICO MULTSKILL", rg: "386161179-3", cpf: "41321145896",    role: "tecnico" },
    { sap: "80734458", re: "35186", name: "MATHEUS DE OLIVEIRA CAMPANTE",    celular: "12 99600-2214", cargo: "TÉCNICO FIBRA",     rg: "42331073-2",  cpf: "43229432843",    role: "tecnico" }
];

async function seedSystemInitialData() {
    const adminMaster = {
        name: "Filipe de Souza Santos",
        re: "35383",
        cpf: "350364238-28",
        email: "filipe.santos.ability@gmail.com",
        role: "admin",
        area: "São José dos Campos"
    };
    await db.collection("users_whitelist").doc("admin_master").set(adminMaster);
    for (const tec of tecnicosWhitelist) {
        await db.collection("users_whitelist").doc(`tec_${tec.re}`).set(tec);
    }
    console.log("Seed concluído.");
}
// Descomente para executar: seedSystemInitialData();

// ==========================================================================
// PRIMEIRO ACESSO — cria conta no Firebase Auth
// ==========================================================================
async function handleFirstAccess(identifier, password) {
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
        alert("A senha precisa ter pelo menos 8 dígitos com letras e números.");
        return;
    }
    try {
        let snap = await db.collection("users_whitelist").where("re", "==", identifier.trim()).get();
        if (snap.empty) {
            snap = await db.collection("users_whitelist").where("email", "==", identifier.trim()).get();
        }
        if (snap.empty) {
            alert("RE ou e-mail não encontrado na whitelist corporativa.");
            return;
        }

        const base = snap.docs[0].data();
        const cred = await auth.createUserWithEmailAndPassword(base.email, password);

        await db.collection("users").doc(cred.user.uid).set({
            name: base.name,
            re: base.re,
            cpf: base.cpf,
            email: base.email,
            role: base.role,
            cargo: base.cargo || "Administração",
            area: base.area || "São José dos Campos",
            routeActive: false
        });

        alert("Conta ativada com sucesso! Faça login.");
        showScreen("login-screen");

    } catch (err) {
        if (err.code === 'auth/email-already-in-use') {
            alert("Conta já ativada. Use a tela de login.");
            showScreen("login-screen");
        } else {
            alert("Erro: " + err.message);
        }
    }
}

// ==========================================================================
// OBSERVADOR DE AUTENTICAÇÃO
// ==========================================================================
auth.onAuthStateChanged(async (user) => {
    if (user) {
        const doc = await db.collection("users").doc(user.uid).get();
        if (doc.exists) {
            currentUserData = doc.data();
            currentUserData.uid = user.uid;
            applySecurityMatrix(currentUserData.role);
        } else {
            // Usuário autenticado mas sem perfil — força logout
            await auth.signOut();
        }
    } else {
        currentUserData = null;
        showScreen("login-screen");
    }
});

function applySecurityMatrix(role) {
    if (["admin", "supervisor", "mesaria"].includes(role)) {
        showScreen("admin-dashboard");
        initAdminView();
    } else if (role === "tecnico") {
        // tecnico.html é uma página separada
        if (!document.getElementById("tecnico-dashboard")) {
            window.location.href = "tecnico.html";
        } else {
            showScreen("tecnico-dashboard");
            initTecnicoView();
        }
    }
}

// ==========================================================================
// ADMIN — TIMELINE
// ==========================================================================
function initAdminView() {
    const badge = document.getElementById("user-role-badge");
    if (badge) badge.textContent = currentUserData.name + " · " + currentUserData.role;

    const mgmtTab = document.getElementById("master-mgmt-tab");
    if (mgmtTab) {
        mgmtTab.style.display = ["admin", "supervisor"].includes(currentUserData.role) ? "block" : "none";
    }

    render24hTimelineGrid();
    syncLivePanels();
}

function render24hTimelineGrid() {
    const header = document.getElementById("timeline-hours-header");
    if (!header) return;
    header.innerHTML = '<div class="timeline-label-col">Operadores (Área)</div>';
    for (let i = 0; i < 24; i++) {
        header.innerHTML += `<div class="timeline-hour-slot">${String(i).padStart(2,'0')}:00</div>`;
    }
}

function syncLivePanels() {
    db.collection("users").where("role", "==", "tecnico")
        .onSnapshot(snapshot => {
            const container = document.getElementById("timeline-rows-container");
            if (!container) return;
            container.innerHTML = "";

            snapshot.forEach(doc => {
                const tec = doc.data();
                const cor = tec.routeActive ? "#0572ce" : "#a1a09f";
                container.innerHTML += `
                    <div class="timeline-row" data-tec-uid="${doc.id}" data-tec-area="${tec.area || ''}">
                        <div class="timeline-label-col" style="border-left:6px solid ${cor}">
                            <strong>${tec.name ? tec.name.split(" ")[0] : '?'} (${tec.re})</strong>
                            <span class="area-tag">${tec.area || ''}</span>
                        </div>
                        <div class="timeline-drag-zone" id="zone-${doc.id}"
                             ondragover="allowDrop(event)" ondrop="drop(event)">
                        </div>
                    </div>`;
            });
            syncLiveServices();
        });
}

function syncLiveServices() {
    db.collection("services").onSnapshot(snapshot => {
        document.querySelectorAll(".timeline-drag-zone").forEach(z => z.innerHTML = "");

        snapshot.forEach(doc => {
            const srv = doc.data();
            if (!srv.tecnicoId) return;

            const zone = document.getElementById(`zone-${srv.tecnicoId}`);
            if (!zone) return;

            const bloqueado = ["Em Atendimento", "Finalizado"].includes(srv.status);
            const corStatus = {
                "Pendente":       "#f59e0b",
                "Em Deslocamento":"#0572ce",
                "Em Atendimento": "#6ba741",
                "Finalizado":     "#6b7280"
            }[srv.status] || "#a1a09f";

            zone.innerHTML += `
                <div class="service-card"
                     draggable="${!bloqueado}"
                     ondragstart="drag(event)"
                     id="${doc.id}"
                     style="border-left:4px solid ${corStatus};background:#fff;border-radius:6px;
                            padding:6px 10px;margin:4px;font-size:12px;cursor:${bloqueado?'default':'grab'};
                            box-shadow:0 1px 3px rgba(0,0,0,.12);min-width:120px;">
                    <div style="font-weight:700">TK: ${srv.ticket || doc.id}</div>
                    <small style="color:${corStatus}">${srv.status}</small>
                    ${srv.area ? `<div style="font-size:11px;color:#888">${srv.area}</div>` : ''}
                </div>`;
        });
    });
}

function allowDrop(ev) { ev.preventDefault(); }
function drag(ev) { ev.dataTransfer.setData("text", ev.target.id); }

async function drop(ev) {
    ev.preventDefault();
    const serviceId = ev.dataTransfer.getData("text");
    const row = ev.target.closest(".timeline-row");
    if (!row) return;

    const targetTecId = row.getAttribute("data-tec-uid");
    const srvDoc = await db.collection("services").doc(serviceId).get();
    if (!srvDoc.exists) return;

    const srv = srvDoc.data();
    if (["Em Atendimento", "Finalizado"].includes(srv.status)) {
        alert("Serviço bloqueado — já iniciado ou finalizado.");
        return;
    }

    await db.collection("services").doc(serviceId).update({
        tecnicoId: targetTecId,
        status: "Pendente",
        notified: false
    });
}

// ==========================================================================
// TÉCNICO — interface mobile
// ==========================================================================
function initTecnicoView() {
    const nameEl = document.getElementById("tec-name-display");
    if (nameEl && currentUserData) {
        nameEl.textContent = currentUserData.name || "Técnico";
    }

    if (activeServiceListener) activeServiceListener();

    activeServiceListener = db.collection("services")
        .where("tecnicoId", "==", currentUserData.uid)
        .onSnapshot(snapshot => {
            const container = document.getElementById("tecnico-services-container");
            if (!container) return;
            container.innerHTML = "";

            if (snapshot.empty) {
                container.innerHTML = `
                    <div style="text-align:center;padding:40px;color:#888">
                        <div style="font-size:48px">📋</div>
                        <p style="margin-top:12px">Nenhum serviço na sua rota.</p>
                    </div>`;
                return;
            }

            snapshot.forEach(doc => {
                const srv = doc.data();
                if (!srv.notified && srv.status === "Pendente") {
                    playNotificationChime();
                    setTimeout(() => alert(`🚨 Novo serviço! Ticket: ${srv.ticket}`), 300);
                    db.collection("services").doc(doc.id).update({ notified: true });
                }
                renderTecnicoActionInterface(doc.id, srv, container);
            });
        });
}

// ==========================================================================
// [IMPLEMENTADO] renderTecnicoActionInterface — estava ausente, causava crash
// ==========================================================================
function renderTecnicoActionInterface(serviceId, srv, container) {
    // Mapa de quais botões ficam habilitados por status
    const fluxo = {
        "Pendente":        { deslocamento: true,  iniciar: false, atualizar: false, teste: false, baixa: false, finalizar: false },
        "Em Deslocamento": { deslocamento: false, iniciar: true,  atualizar: true,  teste: true,  baixa: false, finalizar: false },
        "Em Atendimento":  { deslocamento: false, iniciar: false, atualizar: true,  teste: true,  baixa: true,  finalizar: false },
        "Aguardando":      { deslocamento: false, iniciar: false, atualizar: true,  teste: true,  baixa: true,  finalizar: false },
        "Finalizado":      { deslocamento: false, iniciar: false, atualizar: false, teste: false, baixa: false, finalizar: false }
    };
    const estado = fluxo[srv.status] || fluxo["Pendente"];

    const corStatus = {
        "Pendente":        "#f59e0b",
        "Em Deslocamento": "#0572ce",
        "Em Atendimento":  "#6ba741",
        "Aguardando":      "#ef6c00",
        "Finalizado":      "#6b7280"
    }[srv.status] || "#a1a09f";

    const card = document.createElement("div");
    card.className = "tec-service-card";
    card.style.cssText = "margin:16px;border-radius:8px;border:1px solid #e0e0e0;overflow:hidden";
    card.innerHTML = `
        <div style="background:${corStatus};padding:14px 16px;color:#fff">
            <div style="display:flex;justify-content:space-between;align-items:center">
                <div>
                    <strong style="font-size:16px">Ticket: ${srv.ticket || serviceId}</strong>
                    <div style="font-size:12px;opacity:.85">LP: ${srv.lp || '—'} · ${srv.area || '—'}</div>
                </div>
                <span style="background:rgba(255,255,255,.2);padding:4px 10px;border-radius:20px;font-size:12px;font-weight:600">
                    ${srv.status}
                </span>
            </div>
            ${srv.endereco ? `<div style="font-size:12px;margin-top:6px;opacity:.85">📍 ${srv.endereco}</div>` : ''}
            ${srv.repetido && srv.repetido !== 'Não' ? `<div style="font-size:11px;margin-top:4px;background:rgba(0,0,0,.2);padding:2px 8px;border-radius:10px;display:inline-block">🔁 Repetida: ${srv.repetido}</div>` : ''}
        </div>

        <div class="tec-actions-grid" style="padding:16px;gap:10px">
            <button class="btn-action btn-geo" ${!estado.deslocamento ? 'disabled' : ''}
                onclick="atualizarStatus('${serviceId}', 'Em Deslocamento')">
                🚚 Dar Deslocamento
            </button>

            <button class="btn-action btn-start" ${!estado.iniciar ? 'disabled' : ''}
                onclick="iniciarServico('${serviceId}')">
                ⚡ Iniciar Serviço
            </button>

            <button class="btn-action" ${!estado.atualizar ? 'disabled' : ''}
                onclick="enviarAtualizacao('${serviceId}')">
                💬 Atualização
            </button>

            <button class="btn-action btn-alert" ${!estado.teste ? 'disabled' : ''}
                onclick="solicitarTeste('${serviceId}')">
                ⚠️ Solicitar Teste
            </button>

            <button class="btn-action" ${!estado.baixa ? 'disabled' : ''}
                onclick="adicionarBaixa('${serviceId}')">
                📥 Adicionar Baixa
            </button>

            <button class="btn-action btn-finish" style="grid-column:span 2"
                ${!estado.finalizar || !srv.textoBaixa ? 'disabled' : ''}
                onclick="finalizarServico('${serviceId}')">
                🏁 Finalizar Serviço
            </button>
        </div>
    `;

    container.appendChild(card);
}

// ==========================================================================
// AÇÕES DO TÉCNICO
// ==========================================================================
async function atualizarStatus(serviceId, novoStatus) {
    const updates = { status: novoStatus };
    if (novoStatus === "Em Deslocamento") {
        updates.tempoDeslocamento = new Date().toLocaleTimeString('pt-BR');
    }
    await db.collection("services").doc(serviceId).update(updates);
}

async function iniciarServico(serviceId) {
    // Tenta abrir câmera se o SDK de storage estiver disponível
    if (storage) {
        const ok = confirm("Tire uma foto da fachada antes de iniciar. Abrir câmera?");
        if (ok) {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "image/*";
            input.capture = "environment";
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (file) {
                    await uploadFotoEvidencia(serviceId, file, "inicio");
                }
                await atualizarStatus(serviceId, "Em Atendimento");
                await db.collection("services").doc(serviceId).update({
                    horaChegada: new Date().toLocaleTimeString('pt-BR')
                });
            };
            input.click();
            return;
        }
    }
    await atualizarStatus(serviceId, "Em Atendimento");
    await db.collection("services").doc(serviceId).update({
        horaChegada: new Date().toLocaleTimeString('pt-BR')
    });
}

async function uploadFotoEvidencia(serviceId, file, tipo) {
    if (!storage) return null;
    const ref = storage.ref(`evidencias/${serviceId}/${tipo}_${Date.now()}.jpg`);
    await ref.put(file);
    const url = await ref.getDownloadURL();
    await db.collection("services").doc(serviceId).update({
        [`foto_${tipo}`]: url
    });
    return url;
}

async function enviarAtualizacao(serviceId) {
    const texto = prompt("Digite a atualização:");
    if (!texto) return;
    await db.collection("services").doc(serviceId).update({
        ultimaAtualizacao: texto,
        horaUltimaAtualizacao: new Date().toLocaleTimeString('pt-BR')
    });
}

async function solicitarTeste(serviceId) {
    const confirmado = confirm("Solicitar teste à mesária agora?");
    if (!confirmado) return;
    await db.collection("services").doc(serviceId).update({
        status: "Aguardando",
        solicitouTeste: true,
        horaSolicitacaoTeste: new Date().toLocaleTimeString('pt-BR')
    });
    playNotificationChime();
}

async function adicionarBaixa(serviceId) {
    const texto = prompt("Descreva a solução aplicada (texto de baixa):");
    if (!texto) return;

    if (storage) {
        const fotoOk = confirm("Adicionar foto de evidência da baixa?");
        if (fotoOk) {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "image/*";
            input.capture = "environment";
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (file) await uploadFotoEvidencia(serviceId, file, "baixa");
                await db.collection("services").doc(serviceId).update({
                    textoBaixa: texto,
                    horaBaixa: new Date().toLocaleTimeString('pt-BR'),
                    status: "Em Atendimento"
                });
            };
            input.click();
            return;
        }
    }

    await db.collection("services").doc(serviceId).update({
        textoBaixa: texto,
        horaBaixa: new Date().toLocaleTimeString('pt-BR')
    });
    // Habilita o botão Finalizar — o onSnapshot vai re-renderizar
}

async function finalizarServico(serviceId) {
    const confirmado = confirm("Confirmar finalização deste serviço?");
    if (!confirmado) return;
    await db.collection("services").doc(serviceId).update({
        status: "Finalizado",
        horaFinalizacao: new Date().toLocaleTimeString('pt-BR')
    });
    playNotificationChime();
}

// ==========================================================================
// SWITCH DE ROTA DO TÉCNICO
// ==========================================================================
async function handleTechnicalRouteSwitch(isTurnedOn) {
    if (!isTurnedOn) {
        const snap = await db.collection("services")
            .where("tecnicoId", "==", currentUserData.uid).get();
        let ativo = false;
        snap.forEach(doc => {
            if (["Pendente","Em Deslocamento","Em Atendimento","Aguardando"].includes(doc.data().status)) {
                ativo = true;
            }
        });
        if (ativo) {
            alert("Impossível desativar — você tem serviços em aberto.");
            document.getElementById("technical-route-toggle").checked = true;
            return;
        }
    }
    await db.collection("users").doc(currentUserData.uid).update({ routeActive: isTurnedOn });
}

// ==========================================================================
// UTILITÁRIOS
// ==========================================================================
function playNotificationChime() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(659.25, ctx.currentTime);
        gain.gain.setValueAtTime(0.5, ctx.currentTime);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.35);
    } catch(e) {}
}

function showScreen(id) {
    document.querySelectorAll(".app-screen").forEach(s => s.classList.add("hidden"));
    const el = document.getElementById(id);
    if (el) el.classList.remove("hidden");
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
    const tab = document.getElementById('tab-' + tabId);
    if (tab) tab.classList.remove('hidden');
    if (event && event.target) event.target.classList.add('active');
}
