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
    verificarAutenticacao();
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
                <td><strong>${pregao.responsavel || '-'}</strong></td>
                <td>${dataFormatada}</td>
                <td>${hora}</td>
                <td><strong>${pregao.numero_pregao}</strong></td>
                <td>${pregao.uasg || '-'}</td>
                <td><span class="status-badge ${statusClass}">${pregao.status}</span></td>
                <td class="actions-cell">
                    <button class="action-btn btn-view" onclick="viewPregao('${pregao.id}')" title="Visualizar">Ver</button>
                    <button class="action-btn btn-edit" onclick="editPregao('${pregao.id}')" title="Editar">Editar</button>
                    <button class="action-btn btn-items" onclick="openItems('${pregao.id}')" title="Itens">Itens</button>
                    <button class="action-btn btn-docs" onclick="openDocs('${pregao.id}')" title="Documentos">Documentos</button>
                    <button class="action-btn btn-delete" onclick="openDeleteModal('${pregao.id}')" title="Excluir">Excluir</button>
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
    const btnCancel = document.getElementById('btnCancel');
    const btnSave = document.getElementById('btnSave');
    
    // Anterior: visível apenas se não for a primeira aba
    btnPrevious.style.display = currentTab === 0 ? 'none' : 'inline-block';
    
    // Cancelar: sempre visível
    btnCancel.style.display = 'inline-block';
    
    if (currentTab === tabs.length - 1) {
        // Última aba: esconder Próximo, mostrar Salvar
        btnNext.style.display = 'none';
        btnSave.style.display = 'inline-block';
    } else {
        // Outras abas: mostrar Próximo, esconder Salvar
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

// Abrir tela de itens
function openItems(id) {
    currentPregaoId = id;
    carregarItens(id);
    mostrarTelaItens();
}

function openDocs(id) {
    showToast('Funcionalidade em desenvolvimento', 'error');
}

// ============================================
// GESTÃO DE ITENS DO PREGÃO
// ============================================

let currentPregaoId = null;
let itens = [];
let editingItemIndex = null;
let selectedItens = new Set();
let currentItemsView = 'proposta';
let marcasItens = new Set();

function mostrarTelaItens() {
    // Esconder tela principal
    document.querySelector('.container').style.display = 'none';
    
    // Criar ou mostrar tela de itens
    let telaItens = document.getElementById('telaItens');
    if (!telaItens) {
        telaItens = criarTelaItens();
        document.body.querySelector('.app-content').appendChild(telaItens);
    }
    telaItens.style.display = 'block';
    
    // Atualizar informações do pregão
    const pregao = pregoes.find(p => p.id === currentPregaoId);
    if (pregao) {
        document.getElementById('pregaoInfoItens').textContent = 
            `${pregao.numero_pregao}${pregao.uasg ? ' - ' + pregao.uasg : ''}`;
    }
}

function voltarPregoes() {
    document.getElementById('telaItens').style.display = 'none';
    document.querySelector('.container').style.display = 'block';
    currentPregaoId = null;
    itens = [];
}

function criarTelaItens() {
    const div = document.createElement('div');
    div.id = 'telaItens';
    div.className = 'container';
    div.innerHTML = `
        <div class="header">
            <div class="header-left">
                <div>
                    <h1>Itens do Pregão</h1>
                    <p class="pregao-info" id="pregaoInfoItens">Carregando...</p>
                </div>
            </div>
            <div style="display: flex; gap: 0.75rem;">
                <button onclick="voltarPregoes()" class="btn-back">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M19 12H5M12 19l-7-7 7-7"/>
                    </svg>
                    Voltar
                </button>
                <button onclick="syncItens()" class="btn-sync">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="23 4 23 10 17 10"></polyline>
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                    </svg>
                </button>
            </div>
        </div>

        <div class="filter-actions-bar">
            <div class="search-bar-wrapper">
                <div class="search-bar">
                    <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"></circle>
                        <path d="m21 21-4.35-4.35"></path>
                    </svg>
                    <input type="text" id="searchItens" placeholder="Pesquisar itens" oninput="filterItens()">
                </div>
            </div>
            
            <div class="filter-marca">
                <label>Marca:</label>
                <select id="filterMarcaItens" onchange="filterItens()">
                    <option value="">TODAS</option>
                </select>
            </div>

            <div class="actions-buttons">
                <button onclick="gerarPDFsProposta()" class="btn-pdf">Gerar PDFs</button>
                <button onclick="adicionarItem()" class="btn-add-item">+ Item</button>
                <button onclick="adicionarIntervalo()" class="btn-add-interval">+ Intervalo</button>
                <button onclick="excluirItensSelecionados()" class="btn-delete-selected">Excluir</button>
            </div>
        </div>

        <div class="card table-card">
            <div style="overflow-x: auto;">
                <table>
                    <thead>
                        <tr>
                            <th style="width: 40px; text-align: center;">
                                <input type="checkbox" id="selectAllItens" onchange="toggleSelectAllItens()" 
                                       style="cursor: pointer; width: 18px; height: 18px;">
                            </th>
                            <th style="width: 60px;">Item</th>
                            <th style="min-width: 300px;">Descrição</th>
                            <th style="width: 80px;">QTD</th>
                            <th style="width: 80px;">UN</th>
                            <th style="width: 120px;">Marca</th>
                            <th style="width: 120px;">Modelo</th>
                            <th style="width: 120px;">Est. Unt</th>
                            <th style="width: 120px;">Est. Total</th>
                            <th style="width: 120px;">Custo Unt</th>
                            <th style="width: 120px;">Custo Total</th>
                            <th style="width: 120px;">Venda Unt</th>
                            <th style="width: 120px;">Venda Total</th>
                        </tr>
                    </thead>
                    <tbody id="itensContainer"></tbody>
                </table>
            </div>
        </div>
    `;
    return div;
}

async function carregarItens(pregaoId) {
    if (!isOnline) return;
    
    try {
        const headers = { 'Accept': 'application/json' };
        if (sessionToken) headers['X-Session-Token'] = sessionToken;

        const response = await fetch(`${API_URL}/pregoes/${pregaoId}/itens`, {
            method: 'GET',
            headers: headers
        });

        if (response.status === 401) {
            sessionStorage.removeItem('pregoesSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }

        if (response.ok) {
            itens = await response.json();
            atualizarMarcasItens();
            renderItens();
        }
    } catch (error) {
        console.error('Erro ao carregar itens:', error);
    }
}

function atualizarMarcasItens() {
    marcasItens.clear();
    itens.forEach(item => {
        if (item.marca) marcasItens.add(item.marca);
    });
    
    const select = document.getElementById('filterMarcaItens');
    if (select) {
        select.innerHTML = '<option value="">TODAS</option>' + 
            Array.from(marcasItens).sort().map(m => `<option value="${m}">${m}</option>`).join('');
    }
}

function filterItens() {
    const search = document.getElementById('searchItens')?.value.toLowerCase() || '';
    const marca = document.getElementById('filterMarcaItens')?.value || '';
    
    const filtered = itens.filter(item => {
        const matchSearch = !search || 
            item.descricao.toLowerCase().includes(search) ||
            (item.marca && item.marca.toLowerCase().includes(search)) ||
            item.numero.toString().includes(search);
        const matchMarca = !marca || item.marca === marca;
        return matchSearch && matchMarca;
    });
    
    renderItens(filtered);
}

function renderItens(itensToRender = itens) {
    const container = document.getElementById('itensContainer');
    if (!container) return;
    
    if (itensToRender.length === 0) {
        container.innerHTML = '<tr><td colspan="13" style="text-align: center; padding: 2rem;">Nenhum item cadastrado</td></tr>';
        return;
    }
    
    container.innerHTML = itensToRender.map((item, index) => {
        const checked = selectedItens.has(item.id) ? 'checked' : '';
        const rowClass = item.ganho ? 'item-ganho' : '';
        
        return `
            <tr class="${rowClass}" ondblclick="editarItem('${item.id}')">
                <td style="text-align: center;">
                    <input type="checkbox" ${checked} onchange="toggleItemSelection('${item.id}')" 
                           style="cursor: pointer; width: 18px; height: 18px;">
                </td>
                <td><strong>${item.numero}</strong></td>
                <td class="descricao-cell">${item.descricao}</td>
                <td>${item.qtd}</td>
                <td>${item.unidade}</td>
                <td>${item.marca || '-'}</td>
                <td>${item.modelo || '-'}</td>
                <td>R$ ${(item.estimado_unt || 0).toFixed(2)}</td>
                <td>R$ ${(item.estimado_total || 0).toFixed(2)}</td>
                <td>R$ ${(item.custo_unt || 0).toFixed(2)}</td>
                <td>R$ ${(item.custo_total || 0).toFixed(2)}</td>
                <td>R$ ${(item.venda_unt || 0).toFixed(2)}</td>
                <td>R$ ${(item.venda_total || 0).toFixed(2)}</td>
            </tr>
        `;
    }).join('');
}

function toggleItemSelection(id) {
    if (selectedItens.has(id)) {
        selectedItens.delete(id);
    } else {
        selectedItens.add(id);
    }
    renderItens();
}

function toggleSelectAllItens() {
    const checkbox = document.getElementById('selectAllItens');
    if (checkbox.checked) {
        itens.forEach(item => selectedItens.add(item.id));
    } else {
        selectedItens.clear();
    }
    renderItens();
}

function adicionarItem() {
    const numero = itens.length > 0 ? Math.max(...itens.map(i => i.numero)) + 1 : 1;
    
    const novoItem = {
        id: 'temp-' + Date.now(),
        pregao_id: currentPregaoId,
        numero: numero,
        descricao: '',
        qtd: 1,
        unidade: 'UN',
        marca: '',
        modelo: '',
        estimado_unt: 0,
        estimado_total: 0,
        custo_unt: 0,
        custo_total: 0,
        porcentagem: 10,
        venda_unt: 0,
        venda_total: 0,
        ganho: false
    };
    
    itens.push(novoItem);
    renderItens();
    editarItem(novoItem.id);
}

function adicionarIntervalo() {
    const intervalo = prompt('Digite o intervalo (ex: 1-5, 10, 15-20):');
    if (!intervalo) return;
    
    const numeros = [];
    const partes = intervalo.split(',').map(p => p.trim());
    
    for (const parte of partes) {
        if (parte.includes('-')) {
            const [inicio, fim] = parte.split('-').map(n => parseInt(n.trim()));
            if (isNaN(inicio) || isNaN(fim) || inicio > fim) {
                showToast('Intervalo inválido', 'error');
                return;
            }
            for (let i = inicio; i <= fim; i++) {
                numeros.push(i);
            }
        } else {
            const num = parseInt(parte);
            if (isNaN(num)) {
                showToast('Número inválido', 'error');
                return;
            }
            numeros.push(num);
        }
    }
    
    // Verificar duplicatas
    const numerosExistentes = new Set(itens.map(i => i.numero));
    const duplicatas = numeros.filter(n => numerosExistentes.has(n));
    if (duplicatas.length > 0) {
        if (!confirm(`Os itens ${duplicatas.join(', ')} já existem. Deseja adicionar mesmo assim?`)) {
            return;
        }
    }
    
    numeros.forEach(numero => {
        const novoItem = {
            id: 'temp-' + Date.now() + '-' + numero,
            pregao_id: currentPregaoId,
            numero: numero,
            descricao: '',
            qtd: 1,
            unidade: 'UN',
            marca: '',
            modelo: '',
            estimado_unt: 0,
            estimado_total: 0,
            custo_unt: 0,
            custo_total: 0,
            porcentagem: 10,
            venda_unt: 0,
            venda_total: 0,
            ganho: false
        };
        itens.push(novoItem);
    });
    
    itens.sort((a, b) => a.numero - b.numero);
    renderItens();
    showToast(`${numeros.length} itens adicionados`, 'success');
}

async function excluirItensSelecionados() {
    if (selectedItens.size === 0) {
        showToast('Selecione itens para excluir', 'error');
        return;
    }
    
    if (!confirm(`Deseja excluir ${selectedItens.size} item(ns)?`)) return;
    
    try {
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
        if (sessionToken) headers['X-Session-Token'] = sessionToken;
        
        const idsParaExcluir = Array.from(selectedItens).filter(id => !id.startsWith('temp-'));
        
        if (idsParaExcluir.length > 0) {
            const response = await fetch(`${API_URL}/pregoes/${currentPregaoId}/itens/delete-multiple`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ ids: idsParaExcluir })
            });
            
            if (!response.ok) throw new Error('Erro ao excluir');
        }
        
        itens = itens.filter(item => !selectedItens.has(item.id));
        selectedItens.clear();
        renderItens();
        showToast('Itens excluídos', 'success');
    } catch (error) {
        console.error('Erro:', error);
        showToast('Erro ao excluir itens', 'error');
    }
}

function editarItem(id) {
    const item = itens.find(i => i.id === id);
    if (!item) return;
    
    editingItemIndex = itens.indexOf(item);
    mostrarModalItem(item);
}

function mostrarModalItem(item) {
    let modal = document.getElementById('modalItem');
    if (!modal) {
        modal = criarModalItem();
        document.body.appendChild(modal);
    }
    
    document.getElementById('itemDescricao').value = item.descricao;
    document.getElementById('itemQtd').value = item.qtd;
    document.getElementById('itemUnidade').value = item.unidade;
    document.getElementById('itemMarca').value = item.marca || '';
    document.getElementById('itemModelo').value = item.modelo || '';
    document.getElementById('itemEstimadoUnt').value = item.estimado_unt || 0;
    document.getElementById('itemEstimadoTotal').value = item.estimado_total || 0;
    document.getElementById('itemCustoUnt').value = item.custo_unt || 0;
    document.getElementById('itemCustoTotal').value = item.custo_total || 0;
    document.getElementById('itemPorcentagem').value = item.porcentagem || 10;
    document.getElementById('itemVendaUnt').value = item.venda_unt || 0;
    document.getElementById('itemVendaTotal').value = item.venda_total || 0;
    
    document.getElementById('modalItemTitle').textContent = `Item ${item.numero}`;
    
    // Atualizar botões de navegação
    document.getElementById('btnPrevItem').style.display = editingItemIndex > 0 ? 'inline-block' : 'none';
    document.getElementById('btnNextItem').style.display = editingItemIndex < itens.length - 1 ? 'inline-block' : 'none';
    
    modal.classList.add('show');
    
    // Adicionar event listeners para cálculos automáticos
    configurarCalculosAutomaticos();
}

function criarModalItem() {
    const modal = document.createElement('div');
    modal.id = 'modalItem';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content large">
            <div class="modal-header">
                <h3 class="modal-title" id="modalItemTitle">Editar Item</h3>
                <button class="close-modal" onclick="fecharModalItem()">✕</button>
            </div>
            
            <div class="form-grid">
                <div class="form-group" style="grid-column: 1 / -1;">
                    <label>Descrição *</label>
                    <textarea id="itemDescricao" rows="3" required></textarea>
                </div>
                <div class="form-group">
                    <label>QTD *</label>
                    <input type="number" id="itemQtd" min="1" required>
                </div>
                <div class="form-group">
                    <label>Unidade *</label>
                    <input type="text" id="itemUnidade" required>
                </div>
                <div class="form-group">
                    <label>Marca</label>
                    <input type="text" id="itemMarca">
                </div>
                <div class="form-group">
                    <label>Modelo</label>
                    <input type="text" id="itemModelo">
                </div>
                <div class="form-group">
                    <label>Estimado Unt</label>
                    <input type="number" id="itemEstimadoUnt" step="0.01" min="0">
                </div>
                <div class="form-group">
                    <label>Estimado Total</label>
                    <input type="number" id="itemEstimadoTotal" step="0.01" min="0">
                </div>
                <div class="form-group">
                    <label>Custo Unt</label>
                    <input type="number" id="itemCustoUnt" step="0.01" min="0">
                </div>
                <div class="form-group">
                    <label>Custo Total</label>
                    <input type="number" id="itemCustoTotal" step="0.01" min="0">
                </div>
                <div class="form-group">
                    <label>Porcentagem</label>
                    <select id="itemPorcentagem">
                        ${[0,5,10,15,20,25,30,50,100,150,200].map(p => 
                            `<option value="${p}">${p}%</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Venda Unt</label>
                    <input type="number" id="itemVendaUnt" step="0.01" min="0">
                </div>
                <div class="form-group">
                    <label>Venda Total</label>
                    <input type="number" id="itemVendaTotal" step="0.01" min="0">
                </div>
            </div>

            <div class="modal-actions">
                <button type="button" onclick="navegarItemAnterior()" class="secondary" id="btnPrevItem">← Anterior</button>
                <button type="button" onclick="navegarProximoItem()" class="secondary" id="btnNextItem">Próximo →</button>
                <button type="button" onclick="salvarItemAtual()" class="success">Salvar</button>
                <button type="button" onclick="fecharModalItem()" class="danger">Cancelar</button>
            </div>
        </div>
    `;
    return modal;
}

function configurarCalculosAutomaticos() {
    const qtd = document.getElementById('itemQtd');
    const estimadoUnt = document.getElementById('itemEstimadoUnt');
    const estimadoTotal = document.getElementById('itemEstimadoTotal');
    const custoUnt = document.getElementById('itemCustoUnt');
    const custoTotal = document.getElementById('itemCustoTotal');
    const porcentagem = document.getElementById('itemPorcentagem');
    const vendaUnt = document.getElementById('itemVendaUnt');
    const vendaTotal = document.getElementById('itemVendaTotal');
    
    // Estimado Total = QTD x Estimado Unt
    [qtd, estimadoUnt].forEach(el => {
        el.addEventListener('input', () => {
            estimadoTotal.value = (parseFloat(qtd.value || 0) * parseFloat(estimadoUnt.value || 0)).toFixed(2);
        });
    });
    
    // Custo Total = QTD x Custo Unt
    [qtd, custoUnt].forEach(el => {
        el.addEventListener('input', () => {
            custoTotal.value = (parseFloat(qtd.value || 0) * parseFloat(custoUnt.value || 0)).toFixed(2);
            calcularVendaUnt();
        });
    });
    
    // Venda Unt = Custo Unt x (1 + Porcentagem/100)
    [custoUnt, porcentagem].forEach(el => {
        el.addEventListener('input', calcularVendaUnt);
    });
    
    function calcularVendaUnt() {
        const custo = parseFloat(custoUnt.value || 0);
        const perc = parseFloat(porcentagem.value || 0);
        const venda = custo * (1 + perc / 100);
        vendaUnt.value = venda.toFixed(2);
        vendaTotal.value = (venda * parseFloat(qtd.value || 0)).toFixed(2);
    }
    
    // Venda Total = QTD x Venda Unt
    [qtd, vendaUnt].forEach(el => {
        el.addEventListener('input', () => {
            vendaTotal.value = (parseFloat(qtd.value || 0) * parseFloat(vendaUnt.value || 0)).toFixed(2);
        });
    });
}

function navegarItemAnterior() {
    if (editingItemIndex > 0) {
        salvarItemAtual(false);
        editingItemIndex--;
        mostrarModalItem(itens[editingItemIndex]);
    }
}

function navegarProximoItem() {
    if (editingItemIndex < itens.length - 1) {
        salvarItemAtual(false);
        editingItemIndex++;
        mostrarModalItem(itens[editingItemIndex]);
    }
}

async function salvarItemAtual(fechar = true) {
    const item = itens[editingItemIndex];
    
    item.descricao = toUpperCase(document.getElementById('itemDescricao').value);
    item.qtd = parseInt(document.getElementById('itemQtd').value);
    item.unidade = toUpperCase(document.getElementById('itemUnidade').value);
    item.marca = toUpperCase(document.getElementById('itemMarca').value);
    item.modelo = toUpperCase(document.getElementById('itemModelo').value);
    item.estimado_unt = parseFloat(document.getElementById('itemEstimadoUnt').value || 0);
    item.estimado_total = parseFloat(document.getElementById('itemEstimadoTotal').value || 0);
    item.custo_unt = parseFloat(document.getElementById('itemCustoUnt').value || 0);
    item.custo_total = parseFloat(document.getElementById('itemCustoTotal').value || 0);
    item.porcentagem = parseInt(document.getElementById('itemPorcentagem').value || 10);
    item.venda_unt = parseFloat(document.getElementById('itemVendaUnt').value || 0);
    item.venda_total = parseFloat(document.getElementById('itemVendaTotal').value || 0);
    
    try {
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
        if (sessionToken) headers['X-Session-Token'] = sessionToken;
        
        const isNew = item.id.startsWith('temp-');
        const url = isNew 
            ? `${API_URL}/pregoes/${currentPregaoId}/itens`
            : `${API_URL}/pregoes/${currentPregaoId}/itens/${item.id}`;
        const method = isNew ? 'POST' : 'PUT';
        
        const response = await fetch(url, {
            method: method,
            headers: headers,
            body: JSON.stringify(item)
        });
        
        if (response.ok) {
            const savedItem = await response.json();
            itens[editingItemIndex] = savedItem;
            atualizarMarcasItens();
            renderItens();
            if (fechar) {
                showToast('Item salvo', 'success');
                fecharModalItem();
            }
        }
    } catch (error) {
        console.error('Erro:', error);
        showToast('Erro ao salvar item', 'error');
    }
}

function fecharModalItem() {
    document.getElementById('modalItem').classList.remove('show');
    editingItemIndex = null;
}

function syncItens() {
    carregarItens(currentPregaoId);
    showToast('Itens sincronizados', 'success');
}

async function gerarPDFsProposta() {
    if (!currentPregaoId) {
        showToast('Erro: Pregão não identificado', 'error');
        return;
    }
    
    const pregao = pregoes.find(p => p.id === currentPregaoId);
    if (!pregao) {
        showToast('Erro: Pregão não encontrado', 'error');
        return;
    }
    
    // Verificar se há itens selecionados
    if (selectedItens.size === 0) {
        showToast('Selecione ao menos um item para gerar a proposta', 'error');
        return;
    }
    
    if (typeof window.jspdf === 'undefined') {
        let attempts = 0;
        const maxAttempts = 5;
        const checkInterval = setInterval(() => {
            attempts++;
            if (typeof window.jspdf !== 'undefined') {
                clearInterval(checkInterval);
                gerarPDFPropostaInterno(pregao);
            } else if (attempts >= maxAttempts) {
                clearInterval(checkInterval);
                showToast('Erro: Biblioteca PDF não carregou. Recarregue a página (F5).', 'error');
            }
        }, 500);
        return;
    }
    
    gerarPDFPropostaInterno(pregao);
}

async function gerarPDFPropostaInterno(pregao) {
    // Buscar dados bancários do backend (protegidos)
    let dadosBancarios = null;
    try {
        const headers = { 'Accept': 'application/json' };
        if (sessionToken) headers['X-Session-Token'] = sessionToken;
        
        const response = await fetch(`${API_URL}/pregoes/${currentPregaoId}/dados-bancarios`, {
            method: 'GET',
            headers: headers
        });
        
        if (response.ok) {
            const data = await response.json();
            dadosBancarios = data.dados_bancarios;
        }
    } catch (error) {
        console.error('Erro ao buscar dados bancários:', error);
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    let y = 3;
    const margin = 15;
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const lineHeight = 5;
    const maxWidth = pageWidth - (2 * margin);
    
    function addTextWithWrap(text, x, yStart, maxW, lineH = 5) {
        const lines = doc.splitTextToSize(text, maxW);
        lines.forEach((line, index) => {
            if (yStart + (index * lineH) > pageHeight - 30) {
                yStart = addPageWithHeader();
            }
            doc.text(line, x, yStart + (index * lineH));
        });
        return yStart + (lines.length * lineH);
    }
    
    const logoHeader = new Image();
    logoHeader.crossOrigin = 'anonymous';
    logoHeader.src = 'I.R.-COMERCIO-E-MATERIAIS-ELETRICOS-LTDA-PDF.png';
    
    logoHeader.onload = function() {
        try {
            const logoWidth = 40;
            const logoHeight = (logoHeader.height / logoHeader.width) * logoWidth;
            const logoX = 5;
            const logoY = y;
            
            doc.setGState(new doc.GState({ opacity: 0.3 }));
            doc.addImage(logoHeader, 'PNG', logoX, logoY, logoWidth, logoHeight);
            doc.setGState(new doc.GState({ opacity: 1.0 }));
            
            const fontSize = logoHeight * 0.5;
            doc.setFontSize(fontSize);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(150, 150, 150);
            const textX = logoX + logoWidth + 1.2;
            
            const lineSpacing = fontSize * 0.5;
            const textY1 = logoY + fontSize * 0.85;
            doc.text('I.R COMÉRCIO E', textX, textY1);
            
            const textY2 = textY1 + lineSpacing;
            doc.text('MATERIAIS ELÉTRICOS LTDA', textX, textY2);
            
            doc.setTextColor(0, 0, 0);
            y = logoY + logoHeight + 8;
            
            continuarGeracaoPDFProposta(doc, pregao, dadosBancarios, y, margin, pageWidth, pageHeight, lineHeight, maxWidth, addTextWithWrap);
            
        } catch (e) {
            console.log('Erro ao adicionar logo:', e);
            y = 25;
            continuarGeracaoPDFProposta(doc, pregao, dadosBancarios, y, margin, pageWidth, pageHeight, lineHeight, maxWidth, addTextWithWrap);
        }
    };
    
    logoHeader.onerror = function() {
        console.log('Erro ao carregar logo, gerando PDF sem ela');
        y = 25;
        continuarGeracaoPDFProposta(doc, pregao, dadosBancarios, y, margin, pageWidth, pageHeight, lineHeight, maxWidth, addTextWithWrap);
    };
}

function continuarGeracaoPDFProposta(doc, pregao, dadosBancarios, y, margin, pageWidth, pageHeight, lineHeight, maxWidth, addTextWithWrap) {
    const logoHeaderImg = new Image();
    logoHeaderImg.crossOrigin = 'anonymous';
    logoHeaderImg.src = 'I.R.-COMERCIO-E-MATERIAIS-ELETRICOS-LTDA-PDF.png';
    
    logoHeaderImg.onload = function() {
        gerarPDFPropostaComCabecalho();
    };
    
    logoHeaderImg.onerror = function() {
        console.log('Erro ao carregar logo do cabeçalho');
        gerarPDFPropostaComCabecalho();
    };
    
    function gerarPDFPropostaComCabecalho() {
        const logoCarregada = logoHeaderImg.complete && logoHeaderImg.naturalHeight !== 0;
        
        function adicionarCabecalho() {
            if (!logoCarregada) {
                return 20;
            }
            
            const headerY = 3;
            const logoWidth = 40;
            const logoHeight = (logoHeaderImg.height / logoHeaderImg.width) * logoWidth;
            const logoX = 5;
            
            doc.setGState(new doc.GState({ opacity: 0.3 }));
            doc.addImage(logoHeaderImg, 'PNG', logoX, headerY, logoWidth, logoHeight);
            doc.setGState(new doc.GState({ opacity: 1.0 }));
            
            const fontSize = logoHeight * 0.5;
            doc.setFontSize(fontSize);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(150, 150, 150);
            const textX = logoX + logoWidth + 1.2;
            
            const lineSpacing = fontSize * 0.5;
            const textY1 = headerY + fontSize * 0.85;
            doc.text('I.R COMÉRCIO E', textX, textY1);
            
            const textY2 = textY1 + lineSpacing;
            doc.text('MATERIAIS ELÉTRICOS LTDA', textX, textY2);
            
            doc.setTextColor(0, 0, 0);
            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            doc.setDrawColor(0, 0, 0);
            doc.setLineWidth(0.2);
            
            return headerY + logoHeight + 8;
        }
        
        function addPageWithHeader() {
            doc.addPage();
            const newY = adicionarCabecalho();
            return newY;
        }
        
        addTextWithWrap = function(text, x, yStart, maxW, lineH = 5) {
            const lines = doc.splitTextToSize(text, maxW);
            lines.forEach((line, index) => {
                if (yStart + (index * lineH) > pageHeight - 30) {
                    yStart = addPageWithHeader();
                }
                doc.text(line, x, yStart + (index * lineH));
            });
            return yStart + (lines.length * lineH);
        };
        
        // Título
        doc.setFontSize(18);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text('PROPOSTA', pageWidth / 2, y, { align: 'center' });
        
        y += 8;
        doc.setFontSize(14);
        doc.text(`${pregao.numero_pregao}${pregao.uasg ? ' - ' + pregao.uasg : ''}`, pageWidth / 2, y, { align: 'center' });
        
        y += 12;
        
        // Dados para Faturamento
        doc.setFontSize(11);
        doc.setTextColor(0, 0, 0);
        doc.setFont(undefined, 'bold');
        doc.text('DADOS PARA FATURAMENTO', margin, y);
        
        y += lineHeight + 1;
        doc.setFont(undefined, 'bold');
        doc.text('I.R. COMÉRCIO E MATERIAIS ELÉTRICOS LTDA', margin, y);
        
        y += lineHeight + 1;
        doc.setFont(undefined, 'normal');
        doc.text('CNPJ: 33.149.502/0001-38  |  IE: 083.780.74-2', margin, y);
        
        y += lineHeight + 1;
        doc.text('RUA TADORNA Nº 472, SALA 2', margin, y);
        
        y += lineHeight + 1;
        doc.text('NOVO HORIZONTE - SERRA/ES  |  CEP: 29.163-318', margin, y);
        
        y += lineHeight + 1;
        doc.text('TELEFAX: (27) 3209-4291  |  E-MAIL: COMERCIAL.IRCOMERCIO@GMAIL.COM', margin, y);
        
        y += 10;
        
        // Destinatário
        doc.setFont(undefined, 'bold');
        doc.text('DESTINATÁRIO', margin, y);
        
        y += lineHeight + 1;
        doc.setFont(undefined, 'normal');
        doc.text('AO: ', margin, y);
        const aoWidth = doc.getTextWidth('AO: ');
        doc.setFont(undefined, 'bold');
        doc.text(toUpperCase(pregao.nome_orgao || 'ÓRGÃO'), margin + aoWidth, y);
        
        y += lineHeight + 1;
        doc.setFont(undefined, 'normal');
        doc.text('COMISSÃO PERMANENTE DE LICITAÇÃO', margin, y);
        
        y += lineHeight + 1;
        doc.text(`PREGÃO ELETRÔNICO ${pregao.numero_pregao}${pregao.uasg ? ' - UASG: ' + pregao.uasg : ''}`, margin, y);
        
        y += 10;
        
        if (y > pageHeight - 50) {
            y = addPageWithHeader();
        }
        
        // Tabela de Itens
        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.text('ITENS DA PROPOSTA', margin, y);
        
        y += 6;
        
        const tableWidth = pageWidth - (2 * margin);
        const colWidths = {
            item: tableWidth * 0.06,
            descricao: tableWidth * 0.38,
            qtd: tableWidth * 0.08,
            unid: tableWidth * 0.08,
            marca: tableWidth * 0.14,
            modelo: tableWidth * 0.14,
            total: tableWidth * 0.12
        };
        
        const itemRowHeight = 10;
        
        // Cabeçalho da tabela
        doc.setFillColor(108, 117, 125);
        doc.setDrawColor(180, 180, 180);
        doc.rect(margin, y, tableWidth, itemRowHeight, 'FD');
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        doc.setFont(undefined, 'bold');
        
        let xPos = margin;
        
        doc.line(xPos, y, xPos, y + itemRowHeight);
        doc.text('ITEM', xPos + (colWidths.item / 2), y + 6.5, { align: 'center' });
        xPos += colWidths.item;
        doc.line(xPos, y, xPos, y + itemRowHeight);
        
        doc.text('DESCRIÇÃO', xPos + (colWidths.descricao / 2), y + 6.5, { align: 'center' });
        xPos += colWidths.descricao;
        doc.line(xPos, y, xPos, y + itemRowHeight);
        
        doc.text('QTD', xPos + (colWidths.qtd / 2), y + 6.5, { align: 'center' });
        xPos += colWidths.qtd;
        doc.line(xPos, y, xPos, y + itemRowHeight);
        
        doc.text('UN', xPos + (colWidths.unid / 2), y + 6.5, { align: 'center' });
        xPos += colWidths.unid;
        doc.line(xPos, y, xPos, y + itemRowHeight);
        
        doc.text('MARCA', xPos + (colWidths.marca / 2), y + 6.5, { align: 'center' });
        xPos += colWidths.marca;
        doc.line(xPos, y, xPos, y + itemRowHeight);
        
        doc.text('MODELO', xPos + (colWidths.modelo / 2), y + 6.5, { align: 'center' });
        xPos += colWidths.modelo;
        doc.line(xPos, y, xPos, y + itemRowHeight);
        
        doc.text('VALOR TOTAL', xPos + (colWidths.total / 2), y + 6.5, { align: 'center' });
        xPos += colWidths.total;
        doc.line(xPos, y, xPos, y + itemRowHeight);
        
        y += itemRowHeight;
        
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(8);
        doc.setFont(undefined, 'normal');
        
        // Itens selecionados
        const itensSelecionados = itens.filter(item => selectedItens.has(item.id));
        
        itensSelecionados.forEach((item, index) => {
            const descricaoUpper = toUpperCase(item.descricao);
            const maxWidthDesc = colWidths.descricao - 6;
            const descLines = doc.splitTextToSize(descricaoUpper, maxWidthDesc);
            const lineCount = descLines.length;
            const necessaryHeight = Math.max(itemRowHeight, lineCount * 4 + 4);
            
            if (y + necessaryHeight > pageHeight - 30) {
                y = addPageWithHeader();
            }
            
            doc.setDrawColor(180, 180, 180);
            doc.rect(margin, y, tableWidth, necessaryHeight);
            
            xPos = margin;
            
            doc.line(xPos, y, xPos, y + necessaryHeight);
            doc.text(String(item.numero), xPos + (colWidths.item / 2), y + (necessaryHeight / 2) + 1.5, { align: 'center' });
            xPos += colWidths.item;
            doc.line(xPos, y, xPos, y + necessaryHeight);
            
            let yText = y + 4;
            descLines.forEach(line => {
                doc.text(line, xPos + 3, yText);
                yText += 4;
            });
            xPos += colWidths.descricao;
            doc.line(xPos, y, xPos, y + necessaryHeight);
            
            doc.text(String(item.qtd), xPos + (colWidths.qtd / 2), y + (necessaryHeight / 2) + 1.5, { align: 'center' });
            xPos += colWidths.qtd;
            doc.line(xPos, y, xPos, y + necessaryHeight);
            
            doc.text(item.unidade, xPos + (colWidths.unid / 2), y + (necessaryHeight / 2) + 1.5, { align: 'center' });
            xPos += colWidths.unid;
            doc.line(xPos, y, xPos, y + necessaryHeight);
            
            doc.text(item.marca || '-', xPos + (colWidths.marca / 2), y + (necessaryHeight / 2) + 1.5, { align: 'center' });
            xPos += colWidths.marca;
            doc.line(xPos, y, xPos, y + necessaryHeight);
            
            doc.text(item.modelo || '-', xPos + (colWidths.modelo / 2), y + (necessaryHeight / 2) + 1.5, { align: 'center' });
            xPos += colWidths.modelo;
            doc.line(xPos, y, xPos, y + necessaryHeight);
            
            doc.text(`R$ ${item.venda_total.toFixed(2)}`, xPos + (colWidths.total / 2), y + (necessaryHeight / 2) + 1.5, { align: 'center' });
            xPos += colWidths.total;
            doc.line(xPos, y, xPos, y + necessaryHeight);
            
            y += necessaryHeight;
        });
        
        y += 8;
        
        if (y > pageHeight - 60) {
            y = addPageWithHeader();
        }
        
        // Condições
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.text('VALIDADE DA PROPOSTA: ', margin, y);
        const validadeWidth = doc.getTextWidth('VALIDADE DA PROPOSTA: ');
        doc.setFont(undefined, 'normal');
        doc.text(pregao.validade_proposta || 'NÃO INFORMADA', margin + validadeWidth, y);
        
        y += lineHeight + 1;
        doc.setFont(undefined, 'bold');
        doc.text('PRAZO DE ENTREGA: ', margin, y);
        const entregaWidth = doc.getTextWidth('PRAZO DE ENTREGA: ');
        doc.setFont(undefined, 'normal');
        const entregaText = pregao.prazo_entrega || 'NÃO INFORMADO';
        const entregaLines = doc.splitTextToSize(entregaText, maxWidth - entregaWidth);
        doc.text(entregaLines[0], margin + entregaWidth, y);
        y += lineHeight;
        if (entregaLines.length > 1) {
            for (let i = 1; i < entregaLines.length; i++) {
                doc.text(entregaLines[i], margin, y);
                y += lineHeight;
            }
        }
        
        y += 1;
        doc.setFont(undefined, 'bold');
        doc.text('FORMA DE PAGAMENTO: ', margin, y);
        const pagamentoWidth = doc.getTextWidth('FORMA DE PAGAMENTO: ');
        doc.setFont(undefined, 'normal');
        const pagamentoText = pregao.prazo_pagamento || 'NÃO INFORMADO';
        const pagamentoLines = doc.splitTextToSize(pagamentoText, maxWidth - pagamentoWidth);
        doc.text(pagamentoLines[0], margin + pagamentoWidth, y);
        y += lineHeight;
        if (pagamentoLines.length > 1) {
            for (let i = 1; i < pagamentoLines.length; i++) {
                doc.text(pagamentoLines[i], margin, y);
                y += lineHeight;
            }
        }
        
        // Dados Bancários
        if (dadosBancarios) {
            y += 2;
            doc.setFont(undefined, 'bold');
            doc.text('DADOS BANCÁRIOS: ', margin, y);
            const bancoWidth = doc.getTextWidth('DADOS BANCÁRIOS: ');
            doc.setFont(undefined, 'normal');
            doc.text(dadosBancarios, margin + bancoWidth, y);
            y += lineHeight;
        }
        
        y += 6;
        
        if (y > pageHeight - 60) {
            y = addPageWithHeader();
        }
        
        // Declarações
        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        const declaracao = 'Declaramos que nos preços cotados estão incluídas todas as despesas tais como frete (CIF), impostos, taxas, seguros, tributos e demais encargos de qualquer natureza incidentes sobre o objeto do Pregão. Declaramos que somos Optantes pelo Simples Nacional. Declaramos que o objeto fornecido não é remanufaturado ou recondicionado.';
        
        y = addTextWithWrap(declaracao, margin, y, maxWidth, 4);
        
        y += 12;
        
        if (y > pageHeight - 40) {
            y = addPageWithHeader();
        }
        
        // Data atual
        const dataAtual = new Date();
        const dia = dataAtual.getDate();
        const meses = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 
                       'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
        const mes = meses[dataAtual.getMonth()];
        const ano = dataAtual.getFullYear();
        
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text(`SERRA/ES, ${dia} DE ${mes} DE ${ano}`, pageWidth / 2, y, { align: 'center' });
        
        y += 5;
        
        // Carregar e adicionar imagem da assinatura
        const assinatura = new Image();
        assinatura.crossOrigin = 'anonymous';
        assinatura.src = 'assinatura.png';
        
        assinatura.onload = function() {
            try {
                const imgWidth = 50;
                const imgHeight = (assinatura.height / assinatura.width) * imgWidth;
                
                doc.addImage(assinatura, 'PNG', (pageWidth / 2) - (imgWidth / 2), y + 2, imgWidth, imgHeight);
                
                let yFinal = y + imgHeight + 5;
                
                yFinal += 5;
                doc.setFontSize(10);
                doc.setFont(undefined, 'bold');
                doc.text('ROSEMEIRE BICALHO DE LIMA GRAVINO', pageWidth / 2, yFinal, { align: 'center' });
                
                yFinal += 5;
                doc.setFontSize(9);
                doc.setFont(undefined, 'normal');
                doc.text('MG-10.078.568 / CPF: 045.160.616-78', pageWidth / 2, yFinal, { align: 'center' });
                
                yFinal += 5;
                doc.text('DIRETORA', pageWidth / 2, yFinal, { align: 'center' });
                
                // Salvar PDF
                const nomeArquivo = `PROPOSTA-${pregao.numero_pregao}${pregao.uasg ? '-' + pregao.uasg : ''}.pdf`;
                doc.save(nomeArquivo);
                
                showToast('PDF gerado com sucesso!', 'success');
                
            } catch (e) {
                console.log('Erro ao adicionar assinatura:', e);
                gerarPDFSemAssinatura();
            }
        };
        
        assinatura.onerror = function() {
            console.log('Erro ao carregar assinatura, gerando PDF sem ela');
            gerarPDFSemAssinatura();
        };
        
        function gerarPDFSemAssinatura() {
            // Linha de assinatura manual
            doc.line(pageWidth / 2 - 40, y, pageWidth / 2 + 40, y);
            
            y += 5;
            doc.setFont(undefined, 'bold');
            doc.text('ROSEMEIRE BICALHO DE LIMA GRAVINO', pageWidth / 2, y, { align: 'center' });
            
            y += 5;
            doc.setFont(undefined, 'normal');
            doc.text('MG-10.078.568 / CPF: 045.160.616-78', pageWidth / 2, y, { align: 'center' });
            
            y += 5;
            doc.setFont(undefined, 'bold');
            doc.text('DIRETORA', pageWidth / 2, y, { align: 'center' });
            
            // Salvar PDF
            const nomeArquivo = `PROPOSTA-${pregao.numero_pregao}${pregao.uasg ? '-' + pregao.uasg : ''}.pdf`;
            doc.save(nomeArquivo);
            
            showToast('PDF gerado (sem assinatura)', 'success');
        }
    }
}
