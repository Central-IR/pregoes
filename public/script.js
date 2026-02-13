// CONFIGURAÇÃO
const PORTAL_URL = 'https://ir-comercio-portal-zcan.onrender.com';
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:10000/api'
    : `${window.location.origin}/api`;

let pregoes = [];
let editingId = null;
let currentTab = 0;
let currentInfoTab = 0;
let isOnline = false;
let sessionToken = null;
let lastDataHash = '';
let deleteId = null;
let detalhes = [];

const tabs = ['tab-geral', 'tab-orgao', 'tab-contato', 'tab-prazos', 'tab-detalhes'];
const infoTabs = ['info-tab-geral', 'info-tab-orgao', 'info-tab-contato', 'info-tab-prazos', 'info-tab-detalhes'];

console.log('🚀 Pregões iniciada');
console.log('📍 API URL:', API_URL);

function toUpperCase(value) {
    return value ? String(value).toUpperCase() : '';
}

// Converter input para maiúsculo automaticamente
function setupUpperCaseInputs() {
    const textInputs = document.querySelectorAll('input[type="text"]:not([readonly]), textarea');
    textInputs.forEach(input => {
        input.addEventListener('input', function(e) {
            const start = this.selectionStart;
            const end = this.selectionEnd;
            this.value = toUpperCase(this.value);
            this.setSelectionRange(start, end);
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    if (DEVELOPMENT_MODE) {
        console.log('⚠️ MODO DESENVOLVIMENTO ATIVADO');
        sessionToken = 'dev-mode';
        inicializarApp();
    } else {
        verificarAutenticacao();
    }
    populateMonthFilter();
});

function verificarAutenticacao() {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('sessionToken');

    if (tokenFromUrl) {
        sessionToken = tokenFromUrl;
        sessionStorage.setItem('pregoesSession', tokenFromUrl);
        window.history.replaceState({}, document.title, window.location.pathname);
    } else {
        sessionToken = sessionStorage.getItem('pregoesSession');
    }

    if (!sessionToken) {
        mostrarTelaAcessoNegado();
        return;
    }

    inicializarApp();
}

function mostrarTelaAcessoNegado(mensagem = 'NÃO AUTORIZADO') {
    document.body.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: var(--bg-primary); color: var(--text-primary); text-align: center; padding: 2rem;">
            <h1 style="font-size: 2.2rem; margin-bottom: 1rem;">${mensagem}</h1>
            <p style="color: var(--text-secondary); margin-bottom: 2rem;">Somente usuários autenticados podem acessar esta área.</p>
            <a href="${PORTAL_URL}" style="display: inline-block; background: var(--btn-register); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">Ir para o Portal</a>
        </div>
    `;
}

function inicializarApp() {
    updateDisplay();
    checkServerStatus();
    setInterval(checkServerStatus, 15000);
    startPolling();
}

async function checkServerStatus() {
    try {
        const headers = {
            'Accept': 'application/json'
        };
        
        if (sessionToken) {
            headers['X-Session-Token'] = sessionToken;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(`${API_URL}/pregoes`, {
            method: 'GET',
            headers: headers,
            mode: 'cors',
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.status === 401) {
            sessionStorage.removeItem('pregoesSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return false;
        }

        const wasOffline = !isOnline;
        isOnline = response.ok;
        
        if (wasOffline && isOnline) {
            console.log('✅ SERVIDOR ONLINE');
            await loadPregoes();
        }
        
        updateConnectionStatus();
        return isOnline;
    } catch (error) {
        console.error('❌ Erro ao verificar servidor:', error.message);
        isOnline = false;
        updateConnectionStatus();
        return false;
    }
}

function updateConnectionStatus() {
    const statusElement = document.getElementById('connectionStatus');
    if (statusElement) {
        statusElement.className = isOnline ? 'connection-status online' : 'connection-status offline';
    }
}

function startPolling() {
    loadPregoes();
    setInterval(() => {
        if (isOnline) loadPregoes();
    }, 10000);
}

async function loadPregoes() {
    if (!isOnline) return;

    try {
        const headers = {
            'Accept': 'application/json'
        };
        
        if (sessionToken) {
            headers['X-Session-Token'] = sessionToken;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(`${API_URL}/pregoes`, {
            method: 'GET',
            headers: headers,
            mode: 'cors',
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.status === 401) {
            sessionStorage.removeItem('pregoesSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }

        if (!response.ok) {
            console.error('❌ Erro ao carregar pregões:', response.status);
            return;
        }

        const data = await response.json();
        pregoes = data;
        
        // Atualizar status para OCORRIDO se a data já passou
        atualizarStatusOcorridos();
        
        const newHash = JSON.stringify(pregoes.map(p => p.id));
        if (newHash !== lastDataHash) {
            lastDataHash = newHash;
            updateDisplay();
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            console.error('❌ Timeout ao carregar pregões');
        } else {
            console.error('❌ Erro ao carregar:', error);
        }
    }
}

// Atualizar status para OCORRIDO
function atualizarStatusOcorridos() {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    pregoes.forEach(pregao => {
        if (pregao.status !== 'GANHO' && pregao.data) {
            const dataPregao = new Date(pregao.data + 'T00:00:00');
            if (dataPregao < hoje && pregao.status !== 'OCORRIDO') {
                pregao.status = 'OCORRIDO';
            }
        }
    });
}

async function syncData() {
    console.log('🔄 Iniciando sincronização...');
    
    if (!isOnline) {
        showToast('Erro ao sincronizar', 'error');
        console.log('❌ Sincronização cancelada: servidor offline');
        return;
    }

    try {
        const headers = {
            'Accept': 'application/json'
        };
        
        if (sessionToken) {
            headers['X-Session-Token'] = sessionToken;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(`${API_URL}/pregoes`, {
            method: 'GET',
            headers: headers,
            mode: 'cors',
            cache: 'no-cache',
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.status === 401) {
            sessionStorage.removeItem('pregoesSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }

        if (!response.ok) {
            throw new Error(`Erro ao sincronizar: ${response.status}`);
        }

        const data = await response.json();
        pregoes = data;
        
        atualizarStatusOcorridos();
        
        lastDataHash = JSON.stringify(pregoes.map(p => p.id));
        updateDisplay();
        
        console.log(`✅ Sincronização concluída: ${pregoes.length} pregões carregados`);
        showToast('Dados sincronizados', 'success');
    } catch (error) {
        if (error.name === 'AbortError') {
            console.error('❌ Timeout na sincronização');
            showToast('Timeout: Operação demorou muito', 'error');
        } else {
            console.error('❌ Erro na sincronização:', error.message);
            showToast('Erro ao sincronizar', 'error');
        }
    }
}

function showToast(message, type = 'success') {
    const oldMessages = document.querySelectorAll('.floating-message');
    oldMessages.forEach(msg => msg.remove());
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `floating-message ${type}`;
    messageDiv.textContent = message;
    
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
        messageDiv.style.animation = 'slideOutBottom 0.3s ease forwards';
        setTimeout(() => messageDiv.remove(), 300);
    }, 3000);
}

function updateDisplay() {
    updateStats();
    filterPregoes();
}

function updateStats() {
    const total = pregoes.length;
    const abertos = pregoes.filter(p => p.status === 'ABERTO').length;
    const ganhos = pregoes.filter(p => p.status === 'GANHO').length;
    const ocorridos = pregoes.filter(p => p.status === 'OCORRIDO').length;
    
    document.getElementById('totalPregoes').textContent = total;
    document.getElementById('totalAbertos').textContent = abertos;
    document.getElementById('totalGanhos').textContent = ganhos;
    document.getElementById('totalOcorridos').textContent = ocorridos;
}

// Popular filtro de meses
function populateMonthFilter() {
    const select = document.getElementById('filterMes');
    const months = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 
                    'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
    
    months.forEach((month, index) => {
        const option = document.createElement('option');
        option.value = index + 1;
        option.textContent = month;
        select.appendChild(option);
    });
}

function filterPregoes() {
    const search = toUpperCase(document.getElementById('search').value);
    const filterResp = document.getElementById('filterResponsavel').value;
    const filterStatus = document.getElementById('filterStatus').value;
    const filterMes = document.getElementById('filterMes').value;
    
    const filtered = pregoes.filter(pregao => {
        const matchSearch = !search || 
            toUpperCase(pregao.responsavel).includes(search) ||
            toUpperCase(pregao.numero_pregao).includes(search) ||
            toUpperCase(pregao.uasg || '').includes(search) ||
            toUpperCase(pregao.nome_orgao || '').includes(search);
            
        const matchResp = !filterResp || pregao.responsavel === filterResp;
        const matchStatus = !filterStatus || pregao.status === filterStatus;
        
        let matchMes = true;
        if (filterMes && pregao.data) {
            const dataPregao = new Date(pregao.data + 'T00:00:00');
            matchMes = (dataPregao.getMonth() + 1) == filterMes;
        }
        
        return matchSearch && matchResp && matchStatus && matchMes;
    });
    
    displayPregoes(filtered);
}

function displayPregoes(pregoesToDisplay) {
    const container = document.getElementById('pregoesContainer');
    
    if (pregoesToDisplay.length === 0) {
        container.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 2rem; color: var(--text-secondary);">Nenhum pregão encontrado</td></tr>';
        return;
    }
    
    container.innerHTML = pregoesToDisplay.map(pregao => {
        const statusClass = pregao.status === 'GANHO' ? 'success' : 
                           pregao.status === 'ABERTO' ? 'warning' :
                           pregao.status === 'OCORRIDO' ? 'danger' : 'default';
        
        const rowClass = pregao.ganho ? 'row-won' : '';
        const checked = pregao.ganho ? 'checked' : '';
        
        const dataFormatada = pregao.data ? new Date(pregao.data + 'T00:00:00').toLocaleDateString('pt-BR') : '-';
        const hora = pregao.hora || '-';
        
        return `
            <tr class="${rowClass}">
                <td style="text-align: center;">
                    <input type="checkbox" ${checked} onchange="toggleGanho('${pregao.id}', this.checked)" 
                           style="cursor: pointer; width: 18px; height: 18px;">
                </td>
                <td>${pregao.responsavel}</td>
                <td>${dataFormatada}</td>
                <td>${hora}</td>
                <td>${pregao.numero_pregao}</td>
                <td>${pregao.uasg || '-'}</td>
                <td><span class="status-badge ${statusClass}">${pregao.status}</span></td>
                <td class="actions-cell">
                    <button class="action-btn btn-view" onclick="viewPregao('${pregao.id}')" title="Visualizar">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                    </button>
                    <button class="action-btn btn-edit" onclick="editPregao('${pregao.id}')" title="Editar">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                    <button class="action-btn btn-items" onclick="openItems('${pregao.id}')" title="Itens" style="background: #8B5CF6;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="8" y1="6" x2="21" y2="6"></line>
                            <line x1="8" y1="12" x2="21" y2="12"></line>
                            <line x1="8" y1="18" x2="21" y2="18"></line>
                            <line x1="3" y1="6" x2="3.01" y2="6"></line>
                            <line x1="3" y1="12" x2="3.01" y2="12"></line>
                            <line x1="3" y1="18" x2="3.01" y2="18"></line>
                        </svg>
                    </button>
                    <button class="action-btn btn-docs" onclick="openDocs('${pregao.id}')" title="Documentos" style="background: #06B6D4;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                            <polyline points="13 2 13 9 20 9"></polyline>
                        </svg>
                    </button>
                    <button class="action-btn btn-delete" onclick="openDeleteModal('${pregao.id}')" title="Excluir">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// Toggle ganho
async function toggleGanho(id, ganho) {
    if (!isOnline) {
        showToast('Sistema offline. Não foi possível atualizar.', 'error');
        loadPregoes(); // Recarregar para reverter visualmente
        return;
    }

    try {
        const pregao = pregoes.find(p => p.id === id);
        if (!pregao) return;
        
        pregao.ganho = ganho;
        if (ganho) {
            pregao.status = 'GANHO';
        } else {
            // Se desmarcar, volta para ABERTO ou OCORRIDO
            const hoje = new Date();
            hoje.setHours(0, 0, 0, 0);
            const dataPregao = new Date(pregao.data + 'T00:00:00');
            pregao.status = dataPregao < hoje ? 'OCORRIDO' : 'ABERTO';
        }
        
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
        
        if (sessionToken) {
            headers['X-Session-Token'] = sessionToken;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch(`${API_URL}/pregoes/${id}`, {
            method: 'PUT',
            headers: headers,
            body: JSON.stringify({
                ...pregao,
                ganho: pregao.ganho,
                status: pregao.status
            }),
            mode: 'cors',
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        
        if (response.status === 401) {
            sessionStorage.removeItem('pregoesSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }

        if (!response.ok) throw new Error('Erro ao atualizar');
        
        updateDisplay();
        showToast(ganho ? 'Pregão marcado como ganho' : 'Marcação removida', 'success');
    } catch (error) {
        console.error('Erro:', error);
        if (error.name === 'AbortError') {
            showToast('Timeout: Operação demorou muito', 'error');
        } else {
            showToast('Erro ao atualizar status', 'error');
        }
        loadPregoes(); // Recarregar dados em caso de erro
    }
}

// MODAL DE FORMULÁRIO
function openFormModal() {
    editingId = null;
    document.getElementById('formTitle').textContent = 'Novo Pregão';
    document.getElementById('formModal').classList.add('show');
    resetForm();
    currentTab = 0;
    switchTab(tabs[0]);
    setupUpperCaseInputs();
}

function closeFormModal() {
    document.getElementById('formModal').classList.remove('show');
    resetForm();
}

function resetForm() {
    document.getElementById('responsavel').value = '';
    document.getElementById('dataPregao').value = '';
    document.getElementById('horaPregao').value = '';
    document.getElementById('numeroPregao').value = '';
    document.getElementById('uasg').value = '';
    document.getElementById('nomeOrgao').value = '';
    document.getElementById('municipio').value = '';
    document.getElementById('uf').value = '';
    document.getElementById('validadeProposta').value = '';
    document.getElementById('prazoEntrega').value = '';
    document.getElementById('prazoPagamento').value = '';
    document.getElementById('banco').value = '';
    
    // Reset telefones
    document.getElementById('telefonesContainer').innerHTML = `
        <div class="input-with-button">
            <input type="text" class="telefone-input" placeholder="TELEFONE">
            <button type="button" onclick="addTelefone()" class="btn-add">+</button>
        </div>
    `;
    
    // Reset emails
    document.getElementById('emailsContainer').innerHTML = `
        <div class="input-with-button">
            <input type="email" class="email-input" placeholder="E-MAIL">
            <button type="button" onclick="addEmail()" class="btn-add">+</button>
        </div>
    `;
    
    // Reset detalhes
    detalhes = [];
    document.querySelectorAll('.detalhe-item').forEach(item => {
        item.classList.remove('selected');
    });
}

// Telefones
function addTelefone() {
    const container = document.getElementById('telefonesContainer');
    const div = document.createElement('div');
    div.className = 'input-with-button';
    div.innerHTML = `
        <input type="text" class="telefone-input" placeholder="TELEFONE">
        <button type="button" onclick="removeTelefone(this)" class="btn-remove">−</button>
    `;
    container.appendChild(div);
    setupUpperCaseInputs();
}

function removeTelefone(btn) {
    btn.parentElement.remove();
}

function getTelefones() {
    const inputs = document.querySelectorAll('.telefone-input');
    return Array.from(inputs)
        .map(input => input.value.trim())
        .filter(value => value !== '');
}

// E-mails
function addEmail() {
    const container = document.getElementById('emailsContainer');
    const div = document.createElement('div');
    div.className = 'input-with-button';
    div.innerHTML = `
        <input type="email" class="email-input" placeholder="E-MAIL">
        <button type="button" onclick="removeEmail(this)" class="btn-remove">−</button>
    `;
    container.appendChild(div);
}

function removeEmail(btn) {
    btn.parentElement.remove();
}

function getEmails() {
    const inputs = document.querySelectorAll('.email-input');
    return Array.from(inputs)
        .map(input => input.value.trim().toUpperCase())
        .filter(value => value !== '');
}

// Detalhes
function toggleDetalhe(element, nome) {
    element.classList.toggle('selected');
    const index = detalhes.indexOf(nome);
    if (index > -1) {
        detalhes.splice(index, 1);
    } else {
        detalhes.push(nome);
    }
}

// Navegação de abas do formulário
function switchTab(tabId) {
    tabs.forEach((tab, index) => {
        document.getElementById(tab).classList.remove('active');
        document.querySelectorAll('.tabs-nav .tab-btn')[index].classList.remove('active');
    });
    
    document.getElementById(tabId).classList.add('active');
    const tabIndex = tabs.indexOf(tabId);
    document.querySelectorAll('.tabs-nav .tab-btn')[tabIndex].classList.add('active');
    currentTab = tabIndex;
    
    updateNavigationButtons();
}

function updateNavigationButtons() {
    const btnPrevious = document.getElementById('btnPrevious');
    const btnNext = document.getElementById('btnNext');
    const btnSave = document.getElementById('btnSave');
    
    btnPrevious.style.display = currentTab === 0 ? 'none' : 'inline-block';
    
    if (currentTab === tabs.length - 1) {
        btnNext.style.display = 'none';
        btnSave.style.display = 'inline-block';
    } else {
        btnNext.style.display = 'inline-block';
        btnSave.style.display = 'none';
    }
}

function nextTab() {
    if (currentTab < tabs.length - 1) {
        currentTab++;
        switchTab(tabs[currentTab]);
    }
}

function previousTab() {
    if (currentTab > 0) {
        currentTab--;
        switchTab(tabs[currentTab]);
    }
}

// Salvar pregão
async function salvarPregao() {
    const dataPregao = document.getElementById('dataPregao').value;
    const numeroPregao = toUpperCase(document.getElementById('numeroPregao').value);
    
    if (!dataPregao || !numeroPregao) {
        showToast('Preencha os campos obrigatórios (Data e Nº Pregão)', 'error');
        return;
    }
    
    const responsavel = document.getElementById('responsavel').value;
    
    const pregao = {
        responsavel: responsavel || null,
        data: dataPregao,
        hora: document.getElementById('horaPregao').value || null,
        numero_pregao: numeroPregao,
        uasg: toUpperCase(document.getElementById('uasg').value) || null,
        nome_orgao: toUpperCase(document.getElementById('nomeOrgao').value) || null,
        municipio: toUpperCase(document.getElementById('municipio').value) || null,
        uf: document.getElementById('uf').value || null,
        telefones: getTelefones(),
        emails: getEmails(),
        validade_proposta: toUpperCase(document.getElementById('validadeProposta').value) || null,
        prazo_entrega: toUpperCase(document.getElementById('prazoEntrega').value) || null,
        prazo_pagamento: toUpperCase(document.getElementById('prazoPagamento').value) || null,
        detalhes: detalhes,
        banco: document.getElementById('banco').value || null,
        status: 'ABERTO',
        ganho: false
    };
    
    if (!isOnline) {
        showToast('Sistema offline', 'error');
        closeFormModal();
        return;
    }
    
    try {
        const url = editingId ? `${API_URL}/pregoes/${editingId}` : `${API_URL}/pregoes`;
        const method = editingId ? 'PUT' : 'POST';

        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
        
        if (sessionToken) {
            headers['X-Session-Token'] = sessionToken;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(url, {
            method: method,
            headers: headers,
            body: JSON.stringify(pregao),
            mode: 'cors',
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.status === 401) {
            sessionStorage.removeItem('pregoesSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }

        if (!response.ok) {
            let errorMessage = 'Erro ao salvar';
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorData.message || errorMessage;
            } catch (e) {
                errorMessage = `Erro ${response.status}: ${response.statusText}`;
            }
            throw new Error(errorMessage);
        }

        showToast(editingId ? 'Pregão atualizado' : 'Pregão criado', 'success');
        closeFormModal();
        await loadPregoes();
    } catch (error) {
        console.error('Erro completo:', error);
        if (error.name === 'AbortError') {
            showToast('Timeout: Operação demorou muito', 'error');
        } else {
            showToast(`Erro: ${error.message}`, 'error');
        }
    }
}

// Editar pregão
async function editPregao(id) {
    editingId = id;
    const pregao = pregoes.find(p => p.id === id);
    if (!pregao) return;
    
    document.getElementById('formTitle').textContent = `Editar Pregão Nº ${pregao.numero_pregao}`;
    
    document.getElementById('responsavel').value = pregao.responsavel;
    document.getElementById('dataPregao').value = pregao.data;
    document.getElementById('horaPregao').value = pregao.hora || '';
    document.getElementById('numeroPregao').value = pregao.numero_pregao;
    document.getElementById('uasg').value = pregao.uasg || '';
    document.getElementById('nomeOrgao').value = pregao.nome_orgao || '';
    document.getElementById('municipio').value = pregao.municipio || '';
    document.getElementById('uf').value = pregao.uf || '';
    document.getElementById('validadeProposta').value = pregao.validade_proposta || '';
    document.getElementById('prazoEntrega').value = pregao.prazo_entrega || '';
    document.getElementById('prazoPagamento').value = pregao.prazo_pagamento || '';
    document.getElementById('banco').value = pregao.banco || '';
    
    // Carregar telefones
    const telefonesContainer = document.getElementById('telefonesContainer');
    telefonesContainer.innerHTML = '';
    if (pregao.telefones && pregao.telefones.length > 0) {
        pregao.telefones.forEach((tel, index) => {
            const div = document.createElement('div');
            div.className = 'input-with-button';
            div.innerHTML = `
                <input type="text" class="telefone-input" placeholder="TELEFONE" value="${tel}">
                <button type="button" onclick="${index === 0 ? 'addTelefone()' : 'removeTelefone(this)'}" class="btn-${index === 0 ? 'add">+' : 'remove">−'}</button>
            `;
            telefonesContainer.appendChild(div);
        });
    } else {
        telefonesContainer.innerHTML = `
            <div class="input-with-button">
                <input type="text" class="telefone-input" placeholder="TELEFONE">
                <button type="button" onclick="addTelefone()" class="btn-add">+</button>
            </div>
        `;
    }
    
    // Carregar emails
    const emailsContainer = document.getElementById('emailsContainer');
    emailsContainer.innerHTML = '';
    if (pregao.emails && pregao.emails.length > 0) {
        pregao.emails.forEach((email, index) => {
            const div = document.createElement('div');
            div.className = 'input-with-button';
            div.innerHTML = `
                <input type="email" class="email-input" placeholder="E-MAIL" value="${email}">
                <button type="button" onclick="${index === 0 ? 'addEmail()' : 'removeEmail(this)'}" class="btn-${index === 0 ? 'add">+' : 'remove">−'}</button>
            `;
            emailsContainer.appendChild(div);
        });
    } else {
        emailsContainer.innerHTML = `
            <div class="input-with-button">
                <input type="email" class="email-input" placeholder="E-MAIL">
                <button type="button" onclick="addEmail()" class="btn-add">+</button>
            </div>
        `;
    }
    
    // Carregar detalhes
    detalhes = pregao.detalhes || [];
    document.querySelectorAll('.detalhe-item').forEach(item => {
        item.classList.remove('selected');
        const nome = item.querySelector('span').textContent;
        if (detalhes.includes(nome)) {
            item.classList.add('selected');
        }
    });
    
    document.getElementById('formModal').classList.add('show');
    currentTab = 0;
    switchTab(tabs[0]);
    setupUpperCaseInputs();
}

// MODAL DE VISUALIZAÇÃO
function viewPregao(id) {
    const pregao = pregoes.find(p => p.id === id);
    if (!pregao) return;
    
    document.getElementById('modalNumero').textContent = pregao.numero_pregao;
    
    // Aba Geral
    document.getElementById('info-tab-geral').innerHTML = `
        <div class="info-section">
            <p><strong>Responsável:</strong> ${pregao.responsavel}</p>
            <p><strong>Data:</strong> ${pregao.data ? new Date(pregao.data + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}</p>
            <p><strong>Hora:</strong> ${pregao.hora || '-'}</p>
            <p><strong>Status:</strong> <span class="status-badge ${pregao.status === 'GANHO' ? 'success' : pregao.status === 'ABERTO' ? 'warning' : pregao.status === 'OCORRIDO' ? 'danger' : 'default'}">${pregao.status}</span></p>
        </div>
    `;
    
    // Aba Órgão
    document.getElementById('info-tab-orgao').innerHTML = `
        <div class="info-section">
            <p><strong>Nº Pregão:</strong> ${pregao.numero_pregao}</p>
            <p><strong>UASG:</strong> ${pregao.uasg || '-'}</p>
            <p><strong>Nome do Órgão:</strong> ${pregao.nome_orgao || '-'}</p>
            <p><strong>Município:</strong> ${pregao.municipio || '-'}</p>
            <p><strong>UF:</strong> ${pregao.uf || '-'}</p>
        </div>
    `;
    
    // Aba Contato
    const telefonesHtml = pregao.telefones && pregao.telefones.length > 0 
        ? pregao.telefones.map(t => `<p>• ${t}</p>`).join('') 
        : '<p>-</p>';
    const emailsHtml = pregao.emails && pregao.emails.length > 0 
        ? pregao.emails.map(e => `<p>• ${e}</p>`).join('') 
        : '<p>-</p>';
    
    document.getElementById('info-tab-contato').innerHTML = `
        <div class="info-section">
            <h4>Telefones</h4>
            ${telefonesHtml}
        </div>
        <div class="info-section">
            <h4>E-mails</h4>
            ${emailsHtml}
        </div>
    `;
    
    // Aba Prazos
    document.getElementById('info-tab-prazos').innerHTML = `
        <div class="info-section">
            <p><strong>Validade da Proposta:</strong> ${pregao.validade_proposta || '-'}</p>
            <p><strong>Prazo de Entrega:</strong> ${pregao.prazo_entrega || '-'}</p>
            <p><strong>Prazo de Pagamento:</strong> ${pregao.prazo_pagamento || '-'}</p>
        </div>
    `;
    
    // Aba Detalhes
    const detalhesHtml = pregao.detalhes && pregao.detalhes.length > 0 
        ? pregao.detalhes.map(d => `<p>✓ ${d}</p>`).join('') 
        : '<p>Nenhum detalhe selecionado</p>';
    
    document.getElementById('info-tab-detalhes').innerHTML = `
        <div class="info-section">
            <h4>Detalhes Selecionados</h4>
            ${detalhesHtml}
        </div>
        <div class="info-section">
            <p><strong>Banco:</strong> ${pregao.banco || '-'}</p>
            <p style="color: var(--text-secondary); font-size: 0.85rem; font-style: italic;">* Dados bancários completos serão incluídos no PDF da proposta</p>
        </div>
    `;
    
    document.getElementById('infoModal').classList.add('show');
    currentInfoTab = 0;
    switchInfoTab(infoTabs[0]);
}

function closeInfoModal() {
    document.getElementById('infoModal').classList.remove('show');
}

// Navegação de abas do modal de visualização
function switchInfoTab(tabId) {
    infoTabs.forEach((tab, index) => {
        document.getElementById(tab).classList.remove('active');
        document.querySelectorAll('#infoModal .tabs-nav .tab-btn')[index].classList.remove('active');
    });
    
    document.getElementById(tabId).classList.add('active');
    const tabIndex = infoTabs.indexOf(tabId);
    document.querySelectorAll('#infoModal .tabs-nav .tab-btn')[tabIndex].classList.add('active');
    currentInfoTab = tabIndex;
    
    updateInfoNavigationButtons();
}

function updateInfoNavigationButtons() {
    const btnPrevious = document.getElementById('btnInfoPrevious');
    const btnNext = document.getElementById('btnInfoNext');
    const btnClose = document.getElementById('btnInfoClose');
    
    btnPrevious.style.display = currentInfoTab === 0 ? 'none' : 'inline-block';
    btnNext.style.display = currentInfoTab === infoTabs.length - 1 ? 'none' : 'inline-block';
    btnClose.style.display = 'inline-block';
}

function nextInfoTab() {
    if (currentInfoTab < infoTabs.length - 1) {
        currentInfoTab++;
        switchInfoTab(infoTabs[currentInfoTab]);
    }
}

function previousInfoTab() {
    if (currentInfoTab > 0) {
        currentInfoTab--;
        switchInfoTab(infoTabs[currentInfoTab]);
    }
}

// MODAL DE DELETE
function openDeleteModal(id) {
    deleteId = id;
    document.getElementById('deleteModal').classList.add('show');
}

function closeDeleteModal() {
    deleteId = null;
    document.getElementById('deleteModal').classList.remove('show');
}

async function confirmarExclusao() {
    closeDeleteModal();

    if (!isOnline) {
        showToast('Sistema offline. Não foi possível excluir.', 'error');
        return;
    }

    try {
        const headers = {
            'Accept': 'application/json'
        };
        
        if (sessionToken) {
            headers['X-Session-Token'] = sessionToken;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(`${API_URL}/pregoes/${deleteId}`, {
            method: 'DELETE',
            headers: headers,
            mode: 'cors',
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.status === 401) {
            sessionStorage.removeItem('pregoesSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }

        if (!response.ok) throw new Error('Erro ao deletar');

        pregoes = pregoes.filter(p => p.id !== deleteId);
        lastDataHash = JSON.stringify(pregoes.map(p => p.id));
        updateDisplay();
        showToast('Pregão excluído', 'success');
    } catch (error) {
        console.error('Erro ao deletar:', error);
        if (error.name === 'AbortError') {
            showToast('Timeout: Operação demorou muito', 'error');
        } else {
            showToast('Erro ao excluir pregão', 'error');
        }
    }
}

// Funções temporárias (a serem implementadas)
function openItems(id) {
    showToast('Funcionalidade em desenvolvimento', 'error');
}

function openDocs(id) {
    showToast('Funcionalidade em desenvolvimento', 'error');
}
