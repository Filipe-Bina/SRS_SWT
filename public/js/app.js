// ==========================================================================
// CONFIGURAÇÃO E INICIALIZAÇÃO DO ECOSSISTEMA FIREBASE
// ==========================================================================
const firebaseConfig = {
    apiKey: "AIzaSyD2jO72oONY398UqG1x300p-AaEE2RTDZw",
    authDomain: "srs-swt.firebaseapp.com",
    projectId: "srs-swt",
    storageBucket: "srs-swt.firebasestorage.app",
    messagingSenderId: "2901732246",
    appId: "1:2901732246:web:da1abc0e90ffe7fd5fd4e5"
};

// Inicializa o Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore(app);
const auth = firebase.auth(app);
const storage = firebase.storage(app);

// Estado Global da Sessão Ativa
let currentUserData = null;
let activeServiceListener = null;

// ==========================================================================
// CARGA INICIAL DA WHITELIST (BASE CORPORATIVA PRÉ-CADASTRADA)
// ==========================================================================
const tecnicosWhitelist = [
    { sap: "80734938", re: "35188", name: "ANDERSON CAMARGO DINIZ LUCIANO", celular: "12 99744-7398", cargo: "TÉCNICO MULTSKILL", rg: "42905952", cpf: "345.788.098-03", role: "tecnico" },
    { sap: "80152255", re: "32818", name: "ANDERSON WILLIAN CAMER", celular: "12 99737-5816", cargo: "TÉCNICO FIBRA", rg: "28628342-6", cpf: "290.789.288-67", role: "tecnico" },
    { sap: "80734458", re: "618284", name: "ERKION JOSELITO FERREIRA", celular: "12 99208-3318", cargo: "TÉCNICO MULTSKILL", rg: "25715740-4", cpf: "302.298.218-63", role: "tecnico" },
    { sap: "80843048", re: "35756", name: "JONATHAS DE PAULA FREITAS", celular: "12 99721-2926", cargo: "TÉCNICO MULTSKILL", rg: "49336447-x", cpf: "408.013.638-29", role: "tecnico" },
    { sap: "80678161", re: "35780", name: "JORGE DE OLIVEIRA JUNIOR", celular: "12 99707-1848", cargo: "TÉCNICO FIBRA", rg: "44547722", cpf: "37842104816", role: "tecnico" },
    { sap: "80734463", re: "612449", name: "KLEITON SILVA DOS SANTOS", celular: "11 97372-5390", cargo: "TÉCNICO FIBRA", rg: "50117301-8", cpf: "38972082880", role: "tecnico" },
    { sap: "80810084", re: "35664", name: "CLAYTON WILLIAM MARCONDES", celular: "12 99737-2133", cargo: "TÉCNICO MULTSKILL", rg: "386161179-3", cpf: "41321145896", role: "tecnico" },
    { sap: "80734458", re: "35186", name: "MATHEUS DE OLIVEIRA CAMPANTE", celular: "12 99600-2214", cargo: "TÉCNICO FIBRA", rg: "42331073-2", cpf: "43229432843", role: "tecnico" }
];

// Função Master executada apenas uma vez para semear o admin inicial e a lista de técnicos no Firestore
async function seedSystemInitialData() {
    // Cadastro do Usuário Master Administrativo Pré-definido
    const adminMaster = {
        name: "Filipe de Souza Santos",
        re: "35383",
        cpf: "350364238-28",
        email: "filipe.santos.ability@gmail.com",
        role: "admin",
        area: "São José dos Campos"
    };
    
    await db.collection("users_whitelist").doc("admin_master").set(adminMaster);

    // Semear técnicos oficiais na lista de liberação
    for (const tec of tecnicosWhitelist) {
        await db.collection("users_whitelist").doc(`tec_${tec.re}`).set(tec);
    }
    console.log("Banco de dados corporativo semeado e pronto para o primeiro acesso.");
}

// Chame essa função uma única vez no console se precisar resetar a whitelist do Firestore
// seedSystemInitialData();

// ==========================================================================
// CONTROLE DE ACESSOS, SEGURANÇA E REGISTRO (RBAC)
// ==========================================================================

// Processa o fluxo de Primeiro Acesso com senha Alfanumérica rígida de 8 dígitos
async function handleFirstAccess(identifier, password) {
    // Validação estrita da estrutura alfanumérica de 8 caracteres
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
        alert("Segurança Negada! A senha precisa ter pelo menos 8 dígitos e conter letras e números.");
        return;
    }

    try {
        // Busca o colaborador na Whitelist por RE ou por Email
        let whitelistSnapshot = await db.collection("users_whitelist").where("re", "==", identifier.trim()).get();
        if (whitelistSnapshot.empty) {
            whitelistSnapshot = await db.collection("users_whitelist").where("email", "==", identifier.trim()).get();
        }

        if (whitelistSnapshot.empty) {
            alert("Acesso Negado! Este RE ou Email não está pré-cadastrado na base do sistema.");
            return;
        }

        const baseUserData = whitelistSnapshot.docs[0].data();

        // Registra o usuário oficialmente no Firebase Authentication
        const userCredential = await auth.createUserWithEmailAndPassword(baseUserData.email, password);

        // Salva as configurações de perfil ativo com as áreas padrão
        await db.collection("users").doc(userCredential.user.uid).set({
            name: baseUserData.name,
            re: baseUserData.re,
            cpf: baseUserData.cpf,
            email: baseUserData.email,
            role: baseUserData.role, // admin, supervisor, mesaria, tecnico
            cargo: baseUserData.cargo || "Administração",
            area: baseUserData.area || "São José dos Campos", // Padrão inicial editável
            routeActive: false
        });

        alert("Cadastro de primeiro acesso validado e liberado com sucesso!");
        showScreen("login-screen");

    } catch (error) {
        console.error("Erro no primeiro acesso:", error);
        alert("Falha ao registrar: " + error.message);
    }
}

// Observador de Estado de Autenticação
auth.onAuthStateChanged(async (user) => {
    if (user) {
        const userDoc = await db.collection("users").doc(user.uid).get();
        if (userDoc.exists) {
            currentUserData = userDoc.data();
            currentUserData.uid = user.uid;
            applySecurityMatrix(currentUserData.role);
        }
    } else {
        currentUserData = null;
        showScreen("login-screen");
    }
});

// Redireciona de acordo com o nível hierárquico e restringe telas
function applySecurityMatrix(role) {
    if (role === "admin" || role === "supervisor" || role === "mesaria") {
        showScreen("admin-dashboard");
        initAdminView();
    } else if (role === "tecnico") {
        showScreen("tecnico-dashboard");
        initTecnicoView();
    }
}

// ==========================================================================
// INTERFACE DA MESÁRIA / GESTÃO E TIMELINE DE 24 HORAS
// ==========================================================================
function initAdminView() {
    // Restrição Master: Apenas o Admin e Supervisor enxergam a aba de controle de perfis
    const userMgmtTab = document.getElementById("master-mgmt-tab");
    if (userMgmtTab) {
        userMgmtTab.style.display = (currentUserData.role === "admin" || currentUserData.role === "supervisor") ? "block" : "none";
    }

    render24hTimelineGrid();
    syncLivePanels();
}

// Desenha a grade visual contínua de 24 horas no Admin
function render24hTimelineGrid() {
    const hoursHeader = document.getElementById("timeline-hours-header");
    if (!hoursHeader) return;

    hoursHeader.innerHTML = '<div class="timeline-label-col">Operadores (Área)</div>';
    for (let i = 0; i < 24; i++) {
        const hourLabel = String(i).padStart(2, '0') + ':00';
        hoursHeader.innerHTML += `<div class="timeline-hour-slot">${hourLabel}</div>`;
    }
}

// Escuta em tempo real os técnicos de acordo com as 3 Áreas de Atuação
function syncLivePanels() {
    db.collection("users").where("role", "==", "tecnico")
        .onSnapshot(snapshot => {
            const container = document.getElementById("timeline-rows-container");
            if (!container) return;
            container.innerHTML = "";

            snapshot.forEach(doc => {
                const tec = doc.data();
                // Regra de Cores do Ícone: Azul se Rota Ativada, Cinza se Desativada
                const iconStatusColor = tec.routeActive ? "#0572ce" : "#a1a09f";

                container.innerHTML += `
                    <div class="timeline-row" data-tec-uid="${doc.id}" data-tec-area="${tec.area}">
                        <div class="timeline-label-col" style="border-left: 6px solid ${iconStatusColor}">
                            <strong>${tec.name.split(" ")[0]} (${tec.re})</strong>
                            <span class="area-tag">${tec.area}</span>
                        </div>
                        <div class="timeline-drag-zone" id="zone-${doc.id}" ondragover="allowDrop(event)" ondrop="drop(event)">
                            </div>
                    </div>
                `;
            });
            syncLiveServices();
        });
}

// Posiciona os Cards de serviços respeitando a trava de Drag-and-Drop
function syncLiveServices() {
    db.collection("services").onSnapshot(snapshot => {
        // Limpa todas as zonas de arrastar
        document.querySelectorAll(".timeline-drag-zone").forEach(z => z.innerHTML = "");

        snapshot.forEach(doc => {
            const srv = doc.data();
            const srvId = doc.id;

            if (srv.tecnicoId) {
                const zone = document.getElementById(`zone-${srv.tecnicoId}`);
                if (zone) {
                    // Trava de movimentação: Se iniciado ou finalizado, impede de arrastar (false)
                    const isDraggable = (srv.status !== "Iniciado" && srv.status !== "Finalizado");
                    
                    zone.innerHTML += `
                        <div class="service-ticketstatus-${srv.status.toLowerCase().replace(" ", "-")}"
                             draggable="${isDraggable}"
                             ondragstart="drag(event)"
                             id="${srvId}">
                            <div>TK: ${srv.ticket || 'Sem RE'}</div>
                            <small>${srv.status}</small>
                        </div>
                    `;
                }
            }
        });
    });
}

function allowDrop(ev) { ev.preventDefault(); }
function drag(ev) { ev.dataTransfer.setData("text", ev.target.id); }

async function drop(ev) {
    ev.preventDefault();
    const serviceId = ev.dataTransfer.getData("text");
    const targetRow = ev.target.closest(".timeline-row");

    if (targetRow) {
        const targetTecnicoId = targetRow.getAttribute("data-tec-uid");

        const srvDoc = await db.collection("services").doc(serviceId).get();
        if (srvDoc.exists) {
            const srv = srvDoc.data();
            // Aplica a trava rígida no banco durante o Drop
            if (srv.status === "Iniciado" || srv.status === "Finalizado") {
                alert("Bloqueio de Segurança! Serviços com status Iniciado ou Finalizado não podem mudar de rota.");
                return;
            }

            // Atribui o novo técnico, redefine status e aciona o som de rota no celular dele
            await db.collection("services").doc(serviceId).update({
                tecnicoId: targetTecnicoId,
                status: "Pendente",
                notified: false
            });
            
            // Sincroniza de volta com a planilha o técnico que recebeu o ticket
            updateGoogleSheetsRow(srv.ticket, { tecnicoAtribuido: targetTecnicoId });
        }
    }
}

// ==========================================================================
// RELATÓRIOS EM TEMPO REAL E DISPAROS SONOROS (TÉCNICO / POP-UP)
// ==========================================================================
function initTecnicoView() {
    if (activeServiceListener) activeServiceListener();

    // Monitoramento estrito da rota do técnico logado
    activeServiceListener = db.collection("services")
        .where("tecnicoId", "==", currentUserData.uid)
        .onSnapshot(snapshot => {
            snapshot.forEach(doc => {
                const srv = doc.data();
                // Regra: Se cair serviço novo na rota dele, dispara som instantâneo e Alerta Pop-up
                if (!srv.notified && srv.status === "Pendente") {
                    playNotificationChime();
                    alert(`🚨 ATENÇÃO: Novo serviço inserido na sua rota de trabalho! Ticket Sigtim: ${srv.ticket}`);
                    db.collection("services").doc(doc.id).update({ notified: true });
                }
                renderTecnicoActionInterface(doc.id, srv);
            });
        });
}

// Trava inteligente do Switch de Rota do Técnico
async function handleTechnicalRouteSwitch(isTurnedOn) {
    if (!isTurnedOn) {
        const srvCheck = await db.collection("services")
            .where("tecnicoId", "==", currentUserData.uid).get();
        
        let carriesActiveLoad = false;
        srvCheck.forEach(doc => {
            const currentStatus = doc.data().status;
            if (["Pendente", "Em Rota", "Iniciado", "Aguardando Liberação"].includes(currentStatus)) {
                carriesActiveLoad = true;
            }
        });

        if (carriesActiveLoad) {
            alert("Impossível desativar rota! Você possui serviços vinculados ou em andamento na sua grade diária.");
            document.getElementById("technical-route-toggle").checked = true;
            return;
        }
    }

    // Altera no Firestore mudando a cor do ícone no mapa/timeline da mesária
    await db.collection("users").doc(currentUserData.uid).update({ routeActive: isTurnedOn });
}

// Disparador de áudio nativo sem carregar arquivos pesados mp3
function playNotificationChime() {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = "sine";
    osc.frequency.setValueAtTime(659.25, audioCtx.currentTime); // Nota Mi (E5) Alerta de alta frequência
    gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.35);
}

// Placeholder para envio automático retroativo ao Google Planilhas
function updateGoogleSheetsRow(ticketId, dataObject) {
    console.log(`[Google Sheets API Sync] Sincronizando Ticket ${ticketId}:`, dataObject);
    // Aqui injetamos o fetch da Google Apps Script URL do seu drive para bater nas células em segundo plano.
}

function showScreen(id) {
    document.querySelectorAll(".app-screen").forEach(s => s.classList.add("hidden"));
    document.getElementById(id).classList.remove("hidden");
}