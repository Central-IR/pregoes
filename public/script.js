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
                           pregao.status === 'OCORRIDO' ? 'danger' :
                           pregao.status === 'SUSPENSO' ? 'suspended' : 'default';
        
        const rowClass = pregao.ganho ? 'row-won' : '';
        const checked = pregao.ganho ? 'checked' : '';
        
        const dataFormatada = pregao.data ? new Date(pregao.data + 'T00:00:00').toLocaleDateString('pt-BR') : '-';
        const hora = pregao.hora || '-';
        
        return `
            <tr class="${rowClass}">
                <td style="text-align: center; padding: 8px;">
                    <div class="checkbox-wrapper">
                        <input 
                            type="checkbox" 
                            id="check-${pregao.id}"
                            ${checked}
                            onchange="toggleGanho('${pregao.id}', this.checked)"
                            class="styled-checkbox"
                        >
                        <label for="check-${pregao.id}" class="checkbox-label-styled"></label>
                    </div>
                </td>
                <td><strong>${pregao.responsavel || '-'}</strong></td>
                <td>${dataFormatada}</td>
                <td>${hora}</td>
                <td><strong>${pregao.numero_pregao}</strong></td>
                <td>${pregao.uasg || '-'}</td>
                <td><span class="status-badge status-badge-${statusClass}">${pregao.status}</span></td>
                <td class="actions-cell">
                    <button class="action-btn view" onclick="viewPregao('${pregao.id}')" title="Visualizar">Ver</button>
                    <button class="action-btn edit" onclick="editPregao('${pregao.id}')" title="Editar">Editar</button>
                    <button class="action-btn btn-items" onclick="openItems('${pregao.id}')" title="${pregao.disputa_por === 'GRUPO' ? 'Grupos' : 'Itens'}">${pregao.disputa_por === 'GRUPO' ? 'Grupos' : 'Itens'}</button>
                    <button class="action-btn delete" onclick="openDeleteModal('${pregao.id}')" title="Excluir">Excluir</button>
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
    const dpEl = document.getElementById('disputaPor');
    if (dpEl) dpEl.value = 'ITEM';
    
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
        disputa_por: (document.getElementById('disputaPor')?.value || 'ITEM'),
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
    const dpEl2 = document.getElementById('disputaPor');
    if (dpEl2) dpEl2.value = pregao.disputa_por || 'ITEM';
    
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
            <p><strong>Disputa por:</strong> ${pregao.disputa_por || 'ITEM'}</p>
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
            <h4 style="color: #111; font-weight: 700;">Telefones</h4>
            ${telefonesHtml}
        </div>
        <div class="info-section">
            <h4 style="color: #111; font-weight: 700;">E-mails</h4>
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
            <h4 style="color: #111; font-weight: 700;">Detalhes Selecionados</h4>
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

        // Primeiro excluir os itens do pregão
        try {
            await fetch(`${API_URL}/pregoes/${deleteId}/itens/delete-all`, {
                method: 'DELETE',
                headers: headers,
                mode: 'cors'
            });
        } catch(e) {
            // Se não houver rota delete-all, continua mesmo assim (ON DELETE CASCADE no DB)
        }

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
async function openItems(id) {
    currentPregaoId = id;
    const pregao = pregoes.find(p => p.id === id);
    const disputa = pregao?.disputa_por || 'ITEM';
    
    if (disputa === 'GRUPO') {
        mostrarTelaGrupos();
    } else {
        mostrarTelaItens();
        await carregarItens(id);
    }
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
    document.querySelector('.container').style.display = 'none';
    let telaItens = document.getElementById('telaItens');
    if (!telaItens) {
        telaItens = criarTelaItens();
        document.body.querySelector('.app-content').appendChild(telaItens);
    }
    telaItens.style.display = 'block';
    const pregao = pregoes.find(p => p.id === currentPregaoId);
    if (pregao) {
        const tituloEl = document.getElementById('tituloItens');
        if (tituloEl) {
            const uasgPart = pregao.uasg ? ` — UASG ${pregao.uasg}` : '';
            tituloEl.textContent = `Pregão ${pregao.numero_pregao}${uasgPart}`;
        }
    }
}

function voltarPregoes() {
    document.getElementById('telaItens').style.display = 'none';
    document.querySelector('.container').style.display = 'block';
    currentPregaoId = null;
    itens = [];
}

// ============================================
// GESTÃO DE GRUPOS DO PREGÃO (Disputa por Grupo)
// ============================================

// ============================================================
// ESTADO DOS GRUPOS
// ============================================================
let grupos = [];  // [{tipo, numero, itens:[]}]
let editandoGrupoIdx = null;
let editandoGrupoItemIdx = null;

// ============================================================
// TELA DE GRUPOS
// ============================================================
function mostrarTelaGrupos() {
    document.querySelector('.container').style.display = 'none';
    let telaGrupos = document.getElementById('telaGrupos');
    if (!telaGrupos) {
        telaGrupos = criarTelaGrupos();
        document.body.querySelector('.app-content').appendChild(telaGrupos);
    }
    telaGrupos.style.display = 'block';
    const pregao = pregoes.find(p => p.id === currentPregaoId);
    if (pregao) {
        const el = document.getElementById('tituloGrupos');
        if (el) el.textContent = `Pregão ${pregao.numero_pregao}${pregao.uasg ? ' — UASG ' + pregao.uasg : ''}`;
    }
    carregarGrupos();
}

function voltarPregoesDeGrupos() {
    const tela = document.getElementById('telaGrupos');
    if (tela) tela.style.display = 'none';
    document.querySelector('.container').style.display = 'block';
    currentPregaoId = null;
    itens = [];
    grupos = [];
}

function criarTelaGrupos() {
    const div = document.createElement('div');
    div.id = 'telaGrupos';
    div.className = 'container';
    div.innerHTML = `
        <div class="header">
            <div class="header-left">
                <div>
                    <h1>Grupos do Pregão</h1>
                    <p id="tituloGrupos" style="color:var(--text-secondary);font-size:0.8rem;font-weight:400;margin-top:2px;"></p>
                </div>
            </div>
            <div style="display:flex;gap:0.75rem;align-items:center;">
                <button onclick="abrirModalNovoGrupo()" style="background:#22C55E;color:white;border:none;padding:0.65rem 1.25rem;border-radius:8px;cursor:pointer;font-size:0.9rem;font-weight:600;">+ Grupo</button>
                <button onclick="abrirModalIntervaloGrupos()" style="background:#6B7280;color:white;border:none;padding:0.65rem 1.25rem;border-radius:8px;cursor:pointer;font-size:0.9rem;font-weight:600;">+ Intervalo</button>
                <button onclick="abrirModalExcluirGrupo()" style="background:#EF4444;color:white;border:none;padding:0.65rem 1.25rem;border-radius:8px;cursor:pointer;font-size:0.9rem;font-weight:600;">Excluir</button>
            </div>
        </div>

        <div class="search-bar-wrapper">
            <div class="search-bar">
                <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path>
                </svg>
                <input type="text" id="searchGrupos" placeholder="Pesquisar grupos" oninput="renderGrupos()">
                <div class="search-bar-filters">
                    <div class="filter-dropdown-inline">
                        <select id="filterGrupoGrupos" onchange="onChangeFilterGrupo()">
                            <option value="">Grupo</option>
                        </select>
                        <svg class="dropdown-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </div>
                    <div class="filter-dropdown-inline">
                        <select id="filterMarcaGrupos" onchange="renderGrupos()">
                            <option value="">Marca</option>
                        </select>
                        <svg class="dropdown-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </div>
                </div>
                <button onclick="perguntarAssinaturaPDFGrupos()" style="background:transparent;border:none;color:var(--text-secondary);cursor:pointer;padding:0.5rem;display:flex;align-items:center;" title="Gerar Proposta PDF">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline>
                    </svg>
                </button>
                <button onclick="abrirModalDeclaracoesGrupos()" style="background:transparent;border:none;color:var(--text-secondary);cursor:pointer;padding:0.5rem;display:flex;align-items:center;" title="Declarações">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/>
                        <path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>
                    </svg>
                </button>
                <button onclick="syncGrupos()" style="background:transparent;border:none;color:var(--text-secondary);cursor:pointer;padding:0.5rem;display:flex;align-items:center;" title="Sincronizar">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                        <path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                        <path d="M8 16H3v5"/>
                    </svg>
                </button>
                <button onclick="voltarPregoesDeGrupos()" style="background:transparent;border:none;color:var(--text-secondary);cursor:pointer;padding:0.5rem;display:flex;align-items:center;" title="Voltar">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line>
                    </svg>
                </button>
            </div>
        </div>

        <div id="gruposWrapper" style="margin-top:0.5rem;">
            <div style="text-align:center;padding:3rem;color:var(--text-secondary);">Nenhum grupo cadastrado</div>
        </div>

        <!-- Modal Novo Grupo -->
        <div class="modal-overlay" id="modalNovoGrupo">
            <div class="modal-content" style="max-width:500px;">
                <div class="modal-header">
                    <h3 class="modal-title">Novo Grupo / Lote</h3>
                    <button class="close-modal" onclick="fecharModalNovoGrupo()">✕</button>
                </div>
                <div style="padding:0.5rem 0 0.25rem;">
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem;">
                        <div class="form-group" style="margin:0;">
                            <label style="font-size:0.85rem;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:0.4rem;">Tipo</label>
                            <select id="novoGrupoTipo" style="width:100%;padding:0.65rem;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-secondary);color:var(--text-primary);font-size:0.9rem;">
                                <option value="GRUPO">Grupo</option>
                                <option value="LOTE">Lote</option>
                            </select>
                        </div>
                        <div class="form-group" style="margin:0;">
                            <label style="font-size:0.85rem;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:0.4rem;">Número</label>
                            <input type="number" id="novoGrupoNumero" min="1" style="width:100%;padding:0.65rem;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-secondary);color:var(--text-primary);font-size:0.9rem;box-sizing:border-box;">
                        </div>
                    </div>
                    <div class="form-group" style="margin-bottom:0.5rem;">
                        <label style="font-size:0.85rem;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:0.4rem;">Itens do grupo (ex: 1-5, 10)</label>
                        <input type="text" id="novoGrupoItens" placeholder="Ex: 1-5, 10, 15-20" style="width:100%;padding:0.65rem;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-secondary);color:var(--text-primary);font-size:0.9rem;box-sizing:border-box;">
                        <p style="color:var(--text-secondary);font-size:0.8rem;margin-top:0.35rem;">Os itens serão criados na ordem indicada e poderão ser preenchidos no modal de edição.</p>
                    </div>
                </div>
                <div class="modal-actions">
                    <button class="danger" onclick="fecharModalNovoGrupo()">Cancelar</button>
                    <button class="success" onclick="confirmarNovoGrupo()">Criar Grupo</button>
                </div>
            </div>
        </div>

        <!-- Modal Excluir Grupo -->
        <div class="modal-overlay" id="modalExcluirGrupo">
            <div class="modal-content modal-delete" style="min-width:380px;">
                <button class="close-modal" onclick="fecharModalExcluirGrupo()">✕</button>
                <div class="modal-message-delete" style="font-size:1rem;padding:1rem 0 0.75rem;">EXCLUIR GRUPO / LOTE</div>
                <div class="form-group" style="margin-bottom:1rem;text-align:left;">
                    <label style="font-size:0.85rem;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:0.4rem;">Selecione o grupo a excluir</label>
                    <select id="excluirGrupoSelect" style="width:100%;padding:0.65rem;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-secondary);color:var(--text-primary);font-size:0.9rem;">
                        <option value="">Selecione...</option>
                    </select>
                </div>
                <div class="modal-actions modal-actions-no-border">
                    <button class="secondary" onclick="fecharModalExcluirGrupo()">Cancelar</button>
                    <button class="danger" onclick="confirmarExcluirGrupo()">Excluir</button>
                </div>
            </div>
        </div>

        <!-- Modal Assinatura PDF Grupos -->
        <div class="modal-overlay" id="modalAssinaturaGrupos">
            <div class="modal-content modal-delete">
                <button class="close-modal" onclick="document.getElementById('modalAssinaturaGrupos').classList.remove('show')">✕</button>
                <div class="modal-message-delete">Deseja gerar a proposta com assinatura padrão?</div>
                <div class="modal-actions modal-actions-no-border">
                    <button class="danger" onclick="gerarPDFGruposComAssinatura(false)">Não</button>
                    <button class="success" onclick="gerarPDFGruposComAssinatura(true)">Sim</button>
                </div>
            </div>
        </div>

        <!-- Modal + Intervalo de Grupos -->
        <div class="modal-overlay" id="modalIntervaloGrupos">
            <div class="modal-content" style="max-width:520px;">
                <div class="modal-header">
                    <h3 class="modal-title">Adicionar Grupos em Intervalo</h3>
                    <button class="close-modal" onclick="fecharModalIntervaloGrupos()">✕</button>
                </div>
                <div style="padding:0.5rem 0 0.25rem;">
                    <p style="color:var(--text-secondary);font-size:0.85rem;margin-bottom:1rem;">
                        Crie múltiplos grupos de uma vez. Ex: Tipo "GRUPO", grupos 1 a 3, cada um com itens 1-5.
                    </p>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem;">
                        <div class="form-group" style="margin:0;">
                            <label style="font-size:0.85rem;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:0.4rem;">Tipo</label>
                            <select id="intervGrupoTipo" style="width:100%;padding:0.65rem;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-secondary);color:var(--text-primary);font-size:0.9rem;">
                                <option value="GRUPO">Grupo</option>
                                <option value="LOTE">Lote</option>
                            </select>
                        </div>
                        <div class="form-group" style="margin:0;">
                            <label style="font-size:0.85rem;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:0.4rem;">Números dos grupos (ex: 1-3, 5)</label>
                            <input type="text" id="intervGrupoNumeros" placeholder="Ex: 1-3, 5" style="width:100%;padding:0.65rem;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-secondary);color:var(--text-primary);font-size:0.9rem;box-sizing:border-box;">
                        </div>
                    </div>
                    <div class="form-group" style="margin-bottom:0.5rem;">
                        <label style="font-size:0.85rem;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:0.4rem;">Itens de cada grupo (ex: 1-5, 10)</label>
                        <input type="text" id="intervGrupoItens" placeholder="Ex: 1-5, 10" style="width:100%;padding:0.65rem;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-secondary);color:var(--text-primary);font-size:0.9rem;box-sizing:border-box;">
                        <p style="color:var(--text-secondary);font-size:0.8rem;margin-top:0.35rem;">Cada grupo criado terá os mesmos itens indicados.</p>
                    </div>
                </div>
                <div class="modal-actions">
                    <button class="danger" onclick="fecharModalIntervaloGrupos()">Cancelar</button>
                    <button class="success" onclick="confirmarIntervaloGrupos()">Criar Grupos</button>
                </div>
            </div>
        </div>
    `;
    return div;
}

// ============================================================
// CRUD GRUPOS
// ============================================================
async function carregarGrupos() {
    await carregarItens(currentPregaoId);
    reconstruirGruposDeItens();
    atualizarSelectsGrupos();
    renderGrupos();
}

function reconstruirGruposDeItens() {
    const mapa = new Map();
    itens.forEach(item => {
        if (!item.grupo_tipo || item.grupo_numero == null) return;
        const key = item.grupo_tipo + '-' + item.grupo_numero;
        if (!mapa.has(key)) mapa.set(key, { tipo: item.grupo_tipo, numero: parseInt(item.grupo_numero), itens: [] });
        mapa.get(key).itens.push(item);
    });
    grupos = Array.from(mapa.values()).sort((a, b) => a.numero - b.numero);
    grupos.forEach(g => g.itens.sort((a, b) => (a.numero || 0) - (b.numero || 0)));
}

function atualizarSelectsGrupos() {
    const gSel = document.getElementById('filterGrupoGrupos');
    if (!gSel) return;
    const cur = gSel.value;
    gSel.innerHTML = '<option value="">Grupo</option>' +
        grupos.map(g => `<option value="${g.tipo}-${g.numero}">${g.tipo} ${g.numero}</option>`).join('');
    gSel.value = cur;
    onChangeFilterGrupo();
}

function onChangeFilterGrupo() {
    const gKey = document.getElementById('filterGrupoGrupos')?.value || '';
    const mSel = document.getElementById('filterMarcaGrupos');
    if (!mSel) return;
    const marcas = new Set();
    if (gKey) {
        const g = grupoByKey(gKey);
        (g?.itens || []).forEach(i => { if (i.marca) marcas.add(i.marca); });
    }
    mSel.innerHTML = '<option value="">Marca</option>' +
        Array.from(marcas).sort().map(m => `<option value="${m}">${m}</option>`).join('');
    renderGrupos();
}

function grupoByKey(key) {
    const [tipo, num] = key.split('-');
    return grupos.find(g => g.tipo === tipo && String(g.numero) === num);
}

function renderGrupos() {
    const wrapper = document.getElementById('gruposWrapper');
    if (!wrapper) return;
    const search = (document.getElementById('searchGrupos')?.value || '').toLowerCase();
    const gKey = document.getElementById('filterGrupoGrupos')?.value || '';
    const marcaFiltro = gKey ? (document.getElementById('filterMarcaGrupos')?.value || '') : '';
    const fmtUnt = v => 'R$ ' + (v || 0).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:6});
    const fmtTot = v => 'R$ ' + (v || 0).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
    let gruposRender = gKey ? [grupoByKey(gKey)].filter(Boolean) : grupos;

    if (gruposRender.length === 0) {
        wrapper.innerHTML = '<div style="text-align:center;padding:3rem;color:var(--text-secondary);">Nenhum grupo cadastrado</div>';
        return;
    }

    // Cada grupo é uma tabela separada
    wrapper.innerHTML = gruposRender.map(grupo => {
        let its = grupo.itens;
        if (marcaFiltro) its = its.filter(i => i.marca === marcaFiltro);
        if (search) its = its.filter(i =>
            (i.descricao || '').toLowerCase().includes(search) ||
            (i.marca || '').toLowerCase().includes(search) ||
            String(i.numero).includes(search)
        );
        const lbl = grupo.tipo + ' ' + grupo.numero;

        const itemRows = its.map(item => {
            const vm = (item.venda_unt || 0) > (item.estimado_unt || 0) && (item.estimado_unt || 0) > 0;
            const rs = vm ? 'background:rgba(239,68,68,0.07);' : '';
            const cbId = 'grp-' + item.id;
            const ck = item.ganho ? 'checked' : '';
            return `<tr style="${rs}" ondblclick="editarItemGrupoById('${item.id}')" oncontextmenu="showItemContextMenu(event,'${item.id}')">
                <td style="text-align:center;padding:8px;">
                    <div class="checkbox-wrapper">
                        <input type="checkbox" id="${cbId}" ${ck}
                               onchange="${vm ? '' : `toggleItemGanho('${item.id}',this.checked)`}"
                               onclick="${vm ? 'event.preventDefault();event.stopPropagation()' : 'event.stopPropagation()'}"
                               class="styled-checkbox${vm?' cb-venda-alta':''}">
                        <label for="${cbId}" class="checkbox-label-styled${vm?' cb-label-venda-alta':''}">${vm?'✕':''}</label>
                    </div>
                </td>
                <td><strong>${item.numero}</strong></td>
                <td class="descricao-cell">${item.descricao || '-'}</td>
                <td>${item.qtd || 1}</td>
                <td>${item.unidade || 'UN'}</td>
                <td>${item.marca || '-'}</td>
                <td>${item.modelo || '-'}</td>
                <td>${fmtTot(item.estimado_total)}</td>
                <td>${fmtTot(item.custo_total)}</td>
                <td>${fmtUnt(item.venda_unt)}</td>
                <td>${fmtTot(item.venda_total)}</td>
            </tr>`;
        }).join('');

        // Totais do grupo
        const totCompra = its.reduce((s,i) => s + (i.estimado_total || 0), 0);
        const totCusto  = its.reduce((s,i) => s + (i.custo_total || 0), 0);
        const totVenda  = its.reduce((s,i) => s + (i.venda_total || 0), 0);
        const totalRow = `<tr style="background:var(--bg-secondary);font-weight:700;border-top:2px solid var(--border-color);">
            <td colspan="7" style="text-align:right;padding:8px 12px;font-size:0.82rem;color:var(--text-secondary);">TOTAL ${lbl}</td>
            <td style="padding:8px 6px;font-size:0.82rem;">${fmtTot(totCompra)}</td>
            <td style="padding:8px 6px;font-size:0.82rem;">${fmtTot(totCusto)}</td>
            <td style="padding:8px 6px;font-size:0.82rem;"></td>
            <td style="padding:8px 6px;font-size:0.82rem;">${fmtTot(totVenda)}</td>
        </tr>`;

        return `<div class="card table-card" style="margin-bottom:1.25rem;">
            <div style="padding:10px 14px 6px;border-bottom:2px solid var(--border-color);display:flex;align-items:center;gap:0.75rem;">
                <span style="font-weight:700;font-size:0.95rem;">${lbl}</span>
                <span style="font-size:0.8rem;color:var(--text-secondary);">${grupo.itens.length} item(s)</span>
            </div>
            <div style="overflow-x:auto;">
                <table>
                    <thead><tr>
                        <th style="width:40px;text-align:center;"><span style="font-size:1.1rem;">✓</span></th>
                        <th style="width:55px;">ITEM</th>
                        <th style="min-width:220px;">DESCRIÇÃO</th>
                        <th style="width:55px;">QTD</th>
                        <th style="width:50px;">UN</th>
                        <th style="width:90px;">MARCA</th>
                        <th style="width:90px;">MODELO</th>
                        <th style="width:105px;">COMPRA TOTAL</th>
                        <th style="width:100px;">CUSTO TOTAL</th>
                        <th style="width:100px;">VENDA UNT</th>
                        <th style="width:105px;">VENDA TOTAL</th>
                    </tr></thead>
                    <tbody>${itemRows}${totalRow}</tbody>
                </table>
            </div>
        </div>`;
    }).join('');
}

// ============================================================
// MODAL NOVO GRUPO
// ============================================================
function abrirModalNovoGrupo() {
    const maxN = grupos.reduce((m, g) => Math.max(m, g.numero), 0);
    document.getElementById('novoGrupoNumero').value = maxN + 1;
    document.getElementById('novoGrupoItens').value = '';
    document.getElementById('novoGrupoTipo').value = 'GRUPO';
    document.getElementById('modalNovoGrupo').classList.add('show');
}

function fecharModalNovoGrupo() {
    document.getElementById('modalNovoGrupo').classList.remove('show');
}

async function confirmarNovoGrupo() {
    const tipo = document.getElementById('novoGrupoTipo').value;
    const numero = parseInt(document.getElementById('novoGrupoNumero').value);
    const itensStr = document.getElementById('novoGrupoItens').value.trim();
    if (!numero || !itensStr) { showToast('Preencha número e itens do grupo', 'error'); return; }
    const numeros = parsearIntervalo(itensStr);
    if (!numeros || numeros.length === 0) return;
    fecharModalNovoGrupo();
    const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    if (sessionToken) headers['X-Session-Token'] = sessionToken;
    for (const numItem of numeros) {
        const jaExiste = itens.find(i => i.grupo_tipo === tipo && i.grupo_numero === numero && i.numero === numItem);
        if (jaExiste) continue;
        const novo = {
            pregao_id: currentPregaoId,
            numero: numItem, descricao: '', qtd: 1, unidade: 'UN',
            marca: '', modelo: '',
            estimado_unt: 0, estimado_total: 0, custo_unt: 0, custo_total: 0,
            porcentagem: 149, venda_unt: 0, venda_total: 0, ganho: false,
            grupo_tipo: tipo, grupo_numero: numero
        };
        try {
            const r = await fetch(`${API_URL}/pregoes/${currentPregaoId}/itens`, { method:'POST', headers, body:JSON.stringify(novo) });
            if (r.ok) itens.push(await r.json());
        } catch(e) { console.error(e); }
    }
    // Abrir modal de edição do primeiro item do grupo criado
    reconstruirGruposDeItens();
    atualizarSelectsGrupos();
    renderGrupos();
    const grupoNovo = grupos.find(g => g.tipo === tipo && g.numero === numero);
    if (grupoNovo && grupoNovo.itens.length > 0) {
        showToast(`${tipo} ${numero} criado. Preencha os itens.`, 'success');
        abrirEdicaoGrupoItem(grupoNovo, 0);
    }
}

// Abre o modal de item no contexto do grupo, com navegação Grupo/Lote N - Item N
function abrirEdicaoGrupoItem(grupo, idxItem) {
    editandoGrupoIdx = grupos.indexOf(grupo);
    editandoGrupoItemIdx = idxItem;
    const item = grupo.itens[idxItem];
    // Encontrar índice global no array itens
    editingItemIndex = itens.indexOf(item);
    mostrarModalItemGrupo(item, grupo, idxItem);
}

function editarItemGrupoById(itemId) {
    const item = itens.find(i => i.id === itemId);
    if (!item) return;
    const grupo = grupos.find(g => g.itens.includes(item));
    if (!grupo) { editingItemIndex = itens.indexOf(item); mostrarModalItem(item); return; }
    const idxItem = grupo.itens.indexOf(item);
    abrirEdicaoGrupoItem(grupo, idxItem);
}

function mostrarModalItemGrupo(item, grupo, idxItem) {
    // Reutiliza o mesmo modal de item mas com título e navegação especial
    let modal = document.getElementById('modalItem');
    if (!modal) { modal = criarModalItem(); document.getElementById('telaGrupos').appendChild(modal); }
    // Preencher campos (mesmo que mostrarModalItem)
    document.getElementById('itemNumero').value = item.numero || '';
    document.getElementById('itemDescricao').value = item.descricao || '';
    document.getElementById('itemQtd').value = item.qtd || 1;
    document.getElementById('itemUnidade').value = item.unidade || 'UN';
    document.getElementById('itemMarca').value = item.marca || '';
    document.getElementById('itemModelo').value = item.modelo || '';
    document.getElementById('itemEstimadoUnt').value = item.estimado_unt || '';
    document.getElementById('itemEstimadoTotal').value = item.estimado_total || '';
    document.getElementById('itemCustoUnt').value = item.custo_unt || '';
    document.getElementById('itemCustoTotal').value = item.custo_total || '';
    document.getElementById('itemPorcentagem').value = item.porcentagem ?? 149;
    document.getElementById('itemVendaUnt').value = item.venda_unt || '';
    document.getElementById('itemVendaTotal').value = item.venda_total || '';
    // Título especial para grupo
    const tituloEl = document.getElementById('modalItemTitle');
    if (tituloEl) tituloEl.textContent = `${grupo.tipo} ${grupo.numero} – Item ${item.numero}`;
    // Setas: percorrem itens do grupo primeiro, depois próximo grupo
    const btnPrev = document.getElementById('btnPrevPagItem');
    const btnNext = document.getElementById('btnNextPagItem');
    const temAnterior = idxItem > 0 || editandoGrupoIdx > 0;
    const temProximo = idxItem < grupo.itens.length - 1 || editandoGrupoIdx < grupos.length - 1;
    if (btnPrev) btnPrev.style.visibility = temAnterior ? 'visible' : 'hidden';
    if (btnNext) btnNext.style.visibility = temProximo ? 'visible' : 'hidden';
    // Substituir handlers de navegação
    if (btnPrev) btnPrev.onclick = navegarGrupoAnterior;
    if (btnNext) btnNext.onclick = navegarGrupoProximo;
    modal.classList.add('show');
    configurarCalculosAutomaticos();
    setTimeout(calcularValoresItem, 50);
}

async function navegarGrupoAnterior() {
    await salvarItemAtual(false);
    let gi = editandoGrupoIdx;
    let ii = editandoGrupoItemIdx - 1;
    if (ii < 0) { gi--; if (gi < 0) return; ii = grupos[gi].itens.length - 1; }
    editandoGrupoIdx = gi; editandoGrupoItemIdx = ii;
    const grupo = grupos[gi];
    editingItemIndex = itens.indexOf(grupo.itens[ii]);
    mostrarModalItemGrupo(grupo.itens[ii], grupo, ii);
}

async function navegarGrupoProximo() {
    await salvarItemAtual(false);
    let gi = editandoGrupoIdx;
    let ii = editandoGrupoItemIdx + 1;
    if (ii >= grupos[gi].itens.length) { gi++; if (gi >= grupos.length) return; ii = 0; }
    editandoGrupoIdx = gi; editandoGrupoItemIdx = ii;
    const grupo = grupos[gi];
    editingItemIndex = itens.indexOf(grupo.itens[ii]);
    mostrarModalItemGrupo(grupo.itens[ii], grupo, ii);
}

// ============================================================
// MODAL EXCLUIR GRUPO
// ============================================================
function abrirModalExcluirGrupo() {
    const sel = document.getElementById('excluirGrupoSelect');
    if (!sel) return;
    sel.innerHTML = '<option value="">Selecione...</option>' +
        grupos.map(g => `<option value="${g.tipo}-${g.numero}">${g.tipo} ${g.numero} (${g.itens.length} item(s))</option>`).join('');
    document.getElementById('modalExcluirGrupo').classList.add('show');
}

function fecharModalExcluirGrupo() {
    document.getElementById('modalExcluirGrupo').classList.remove('show');
}

async function confirmarExcluirGrupo() {
    const val = document.getElementById('excluirGrupoSelect').value;
    if (!val) { showToast('Selecione um grupo', 'error'); return; }
    const grupo = grupoByKey(val);
    if (!grupo) return;
    fecharModalExcluirGrupo();
    const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    if (sessionToken) headers['X-Session-Token'] = sessionToken;
    const ids = grupo.itens.map(i => i.id).filter(id => !String(id).startsWith('temp-'));
    for (const id of ids) {
        try {
            await fetch(`${API_URL}/pregoes/${currentPregaoId}/itens/${id}`, { method:'DELETE', headers });
        } catch(e) {}
    }
    itens = itens.filter(i => !(i.grupo_tipo === grupo.tipo && i.grupo_numero === grupo.numero));
    reconstruirGruposDeItens();
    atualizarSelectsGrupos();
    renderGrupos();
    showToast(`${grupo.tipo} ${grupo.numero} excluído`, 'success');
}

// ============================================================
// INTERVALO DE GRUPOS
// ============================================================
function abrirModalIntervaloGrupos() {
    document.getElementById('intervGrupoTipo').value = 'GRUPO';
    document.getElementById('intervGrupoNumeros').value = '';
    document.getElementById('intervGrupoItens').value = '';
    document.getElementById('modalIntervaloGrupos').classList.add('show');
}

function fecharModalIntervaloGrupos() {
    document.getElementById('modalIntervaloGrupos').classList.remove('show');
}

async function confirmarIntervaloGrupos() {
    const tipo = document.getElementById('intervGrupoTipo').value;
    const numerosGruposStr = document.getElementById('intervGrupoNumeros').value.trim();
    const itensStr = document.getElementById('intervGrupoItens').value.trim();
    if (!numerosGruposStr || !itensStr) { showToast('Preencha todos os campos', 'error'); return; }
    const numerosGrupos = parsearIntervalo(numerosGruposStr);
    const numerosItens = parsearIntervalo(itensStr);
    if (!numerosGrupos || !numerosItens) return;
    fecharModalIntervaloGrupos();
    const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    if (sessionToken) headers['X-Session-Token'] = sessionToken;
    let criados = 0;
    for (const numGrupo of numerosGrupos) {
        for (const numItem of numerosItens) {
            const jaExiste = itens.find(i => i.grupo_tipo === tipo && i.grupo_numero === numGrupo && i.numero === numItem);
            if (jaExiste) continue;
            const novo = {
                pregao_id: currentPregaoId,
                numero: numItem, descricao: '', qtd: 1, unidade: 'UN',
                marca: '', modelo: '',
                estimado_unt: 0, estimado_total: 0, custo_unt: 0, custo_total: 0,
                porcentagem: 149, venda_unt: 0, venda_total: 0, ganho: false,
                grupo_tipo: tipo, grupo_numero: numGrupo
            };
            try {
                const r = await fetch(`${API_URL}/pregoes/${currentPregaoId}/itens`, { method:'POST', headers, body:JSON.stringify(novo) });
                if (r.ok) { itens.push(await r.json()); criados++; }
            } catch(e) { console.error(e); }
        }
    }
    reconstruirGruposDeItens();
    atualizarSelectsGrupos();
    renderGrupos();
    showToast(`${numerosGrupos.length} grupo(s) criado(s) com ${numerosItens.length} item(s) cada`, 'success');
}

function syncGrupos() {
    carregarGrupos();
    showToast('Grupos sincronizados', 'success');
}

function abrirModalDeclaracoesGrupos() {
    // Reutiliza o mesmo modal de declarações da tela de itens
    abrirModalDeclaracoes();
}

// ============================================================
// PDF POR GRUPOS
// ============================================================
function perguntarAssinaturaPDFGrupos() {
    const temGanho = itens.some(i => i.ganho && i.grupo_tipo);
    if (!temGanho) { showToast('Marque ao menos um item (ganho) para gerar a proposta', 'error'); return; }
    document.getElementById('modalAssinaturaGrupos').classList.add('show');
}

async function gerarPDFGruposComAssinatura(comAssinatura) {
    document.getElementById('modalAssinaturaGrupos').classList.remove('show');
    const pregao = pregoes.find(p => p.id === currentPregaoId);
    if (!pregao) return;
    let dadosBancarios = null;
    try {
        const h = { 'Accept': 'application/json' };
        if (sessionToken) h['X-Session-Token'] = sessionToken;
        const r = await fetch(`${API_URL}/pregoes/${pregao.id}/dados-bancarios`, { headers: h });
        if (r.ok) { const d = await r.json(); dadosBancarios = d.dados_bancarios || null; }
    } catch(e) {}
    // Monta estrutura: [{grupo, itens:[]}]
    const estrutura = grupos.map(g => ({ grupo: g, itens: g.itens.filter(i => i.ganho) })).filter(e => e.itens.length > 0);
    if (estrutura.length === 0) { showToast('Nenhum item ganho encontrado', 'error'); return; }
    if (typeof window.jspdf === 'undefined') { showToast('Biblioteca PDF não carregou. Recarregue (F5).', 'error'); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const margin = 20, pageWidth = doc.internal.pageSize.width, pageHeight = doc.internal.pageSize.height;
    const lineHeight = 5, maxWidth = pageWidth - 2 * margin;
    let addTextWithWrap;
    // Passa estrutura de grupos para o gerador
    const logo = new Image();
    logo.crossOrigin = 'anonymous';
    logo.src = 'I.R.-COMERCIO-E-MATERIAIS-ELETRICOS-LTDA-PDF.png';
    logo.onload = () => iniciarPDFGrupos(true);
    logo.onerror = () => iniciarPDFGrupos(false);
    function iniciarPDFGrupos(logoOk) {
        let y = 3;
        try {
            if (logoOk) {
                const lw = 40, lh = (logo.height / logo.width) * lw;
                doc.setGState(new doc.GState({ opacity: 0.3 }));
                doc.addImage(logo, 'PNG', 5, 3, lw, lh);
                doc.setGState(new doc.GState({ opacity: 1.0 }));
                const fs = lh * 0.5;
                doc.setFontSize(fs); doc.setFont(undefined, 'bold'); doc.setTextColor(150,150,150);
                doc.text('I.R COMÉRCIO E', 5 + lw + 1.2, 3 + fs * 0.85);
                doc.text('MATERIAIS ELÉTRICOS LTDA', 5 + lw + 1.2, 3 + fs * 0.85 + fs * 0.5);
                doc.setTextColor(0, 0, 0);
                y = 3 + lh + 8;
            } else { y = 25; }
        } catch(e) { y = 25; }
        continuarGeracaoPDFProposta(doc, pregao, dadosBancarios, y, margin, pageWidth, pageHeight, lineHeight, maxWidth, addTextWithWrap, comAssinatura, estrutura);
    }
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
                    <p id="tituloItens" style="color: var(--text-secondary); font-size: 0.8rem; font-weight: 400; margin-top: 2px; letter-spacing: 0.01em;"></p>
                </div>
            </div>
            <div style="display: flex; gap: 0.75rem; align-items:center;">
                <button onclick="adicionarItem()" style="background: #22C55E; color: white; border: none; padding: 0.65rem 1.25rem; border-radius: 8px; cursor: pointer; font-size: 0.9rem; font-weight: 600;">+ Item</button>
                <button onclick="abrirModalIntervalo()" style="background: #6B7280; color: white; border: none; padding: 0.65rem 1.25rem; border-radius: 8px; cursor: pointer; font-size: 0.9rem; font-weight: 600;">+ Intervalo</button>
                <button onclick="abrirModalExcluirItens()" style="background: #EF4444; color: white; border: none; padding: 0.65rem 1.25rem; border-radius: 8px; cursor: pointer; font-size: 0.9rem; font-weight: 600;">Excluir</button>
            </div>
        </div>

        <div class="search-bar-wrapper">
            <div class="search-bar">
                <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.35-4.35"></path>
                </svg>
                <input type="text" id="searchItens" placeholder="Pesquisar itens" oninput="filterItens()">
                
                <div class="search-bar-filters">
                    <div class="filter-dropdown-inline">
                        <select id="filterMarcaItens" onchange="filterItens()">
                            <option value="">Marca</option>
                        </select>
                        <svg class="dropdown-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </div>
                </div>

                <button onclick="abrirModalCotacao()" style="background: transparent; border: none; color: var(--text-secondary); cursor: pointer; padding: 0.5rem; display: flex; align-items: center;" title="Enviar Cotação">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect width="20" height="16" x="2" y="4" rx="2"/>
                        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                    </svg>
                </button>
                
                <button onclick="perguntarAssinaturaPDF()" style="background: transparent; border: none; color: var(--text-secondary); cursor: pointer; padding: 0.5rem; display: flex; align-items: center;" title="Gerar Proposta PDF">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                    </svg>
                </button>

                <button onclick="abrirModalDeclaracoes()" style="background: transparent; border: none; color: var(--text-secondary); cursor: pointer; padding: 0.5rem; display: flex; align-items: center;" title="Declarações">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/>
                        <path d="M14 2v5a1 1 0 0 0 1 1h5"/>
                        <path d="M10 9H8"/>
                        <path d="M16 13H8"/>
                        <path d="M16 17H8"/>
                    </svg>
                </button>
                
                <button onclick="syncItens()" style="background: transparent; border: none; color: var(--text-secondary); cursor: pointer; padding: 0.5rem; display: flex; align-items: center;" title="Sincronizar">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="23 4 23 10 17 10"></polyline>
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                    </svg>
                </button>
                
                <button onclick="voltarPregoes()" style="background: transparent; border: none; color: var(--text-secondary); cursor: pointer; padding: 0.5rem; display: flex; align-items: center;" title="Voltar">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                        <polyline points="16 17 21 12 16 7"></polyline>
                        <line x1="21" y1="12" x2="9" y2="12"></line>
                    </svg>
                </button>
            </div>
        </div>

        <div class="card table-card">
            <div style="overflow-x: auto;">
                <table>
                    <thead>
                        <tr>
                            <th style="width: 40px; text-align: center;">
                                <span style="font-size: 1.1rem;">✓</span>
                            </th>
                            <th style="width: 60px;">ITEM</th>
                            <th style="min-width: 300px;">DESCRIÇÃO</th>
                            <th style="width: 80px;">QTD</th>
                            <th style="width: 80px;">UNIDADE</th>
                            <th style="width: 120px;">MARCA</th>
                            <th style="width: 120px;">MODELO</th>
                            <th style="width: 120px;">ESTIMADO UNT</th>
                            <th style="width: 120px;">ESTIMADO TOTAL</th>
                            <th style="width: 120px;">CUSTO UNT</th>
                            <th style="width: 120px;">CUSTO TOTAL</th>
                            <th style="width: 120px;">VENDA UNT</th>
                            <th style="width: 120px;">VENDA TOTAL</th>
                        </tr>
                    </thead>
                    <tbody id="itensContainer"></tbody>
                </table>
            </div>
        </div>

        <!-- Modal + Intervalo -->
        <div class="modal-overlay" id="modalIntervalo">
            <div class="modal-content modal-delete" style="min-width: 380px;">
                <button class="close-modal" onclick="fecharModalIntervalo()">✕</button>
                <div style="padding: 1rem 0 0.5rem 0;">
                    <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem;">Adicionar Intervalo</h3>
                    <p style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 1rem;">Digite o intervalo de itens (ex: 1-5, 10, 15-20)</p>
                    <input type="text" id="inputIntervalo" placeholder="Ex: 1-5, 10, 15-20" 
                           style="width: 100%; padding: 0.65rem 0.875rem; border: 1px solid var(--border-color); border-radius: 8px; font-size: 0.9rem; background: var(--bg-secondary); color: var(--text-primary); box-sizing: border-box;">
                </div>
                <div class="modal-actions modal-actions-no-border">
                    <button class="danger" onclick="fecharModalIntervalo()">Cancelar</button>
                    <button class="success" onclick="confirmarAdicionarIntervalo()">Adicionar</button>
                </div>
            </div>
        </div>

        <!-- Modal Excluir Itens -->
        <div class="modal-overlay" id="modalExcluirItens">
            <div class="modal-content modal-delete" style="min-width: 380px;">
                <button class="close-modal" onclick="fecharModalExcluirItens()">✕</button>
                <div class="modal-message-delete" style="font-size: 1rem; padding: 1rem 0 0.5rem 0;">
                    EXCLUIR ITENS
                </div>
                <p style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 0.75rem; text-align: center;">Digite o intervalo de itens a excluir (ex: 1-5, 10)</p>
                <input type="text" id="inputExcluirIntervalo" placeholder="Ex: 1-5, 10" 
                       style="width: 100%; padding: 0.65rem 0.875rem; border: 1px solid var(--border-color); border-radius: 8px; font-size: 0.9rem; background: var(--bg-secondary); color: var(--text-primary); box-sizing: border-box;">
                <div class="modal-actions modal-actions-no-border">
                    <button class="secondary" onclick="fecharModalExcluirItens()">Cancelar</button>
                    <button class="danger" onclick="confirmarExcluirItens()">Sim</button>
                </div>
            </div>
        </div>

        <!-- Modal Assinatura PDF -->
        <div class="modal-overlay" id="modalAssinatura">
            <div class="modal-content modal-delete">
                <button class="close-modal" onclick="fecharModalAssinatura()">✕</button>
                <div class="modal-message-delete">
                    Deseja gerar a proposta com assinatura padrão?
                </div>
                <div class="modal-actions modal-actions-no-border">
                    <button class="danger" onclick="gerarPDFsProposta(false)">Não</button>
                    <button class="success" onclick="gerarPDFsProposta(true)">Sim</button>
                </div>
            </div>
        </div>

        <!-- Modal Cotação -->
        <div class="modal-overlay" id="modalCotacao">
            <div class="modal-content" style="max-width: 680px; width: 90vw;">
                <div class="modal-header">
                    <h3 class="modal-title">Enviar Cotação</h3>
                    <button class="close-modal" onclick="fecharModalCotacao()">✕</button>
                </div>
                <div style="padding: 0.5rem 0;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                        <div class="form-group" style="margin: 0;">
                            <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.4rem; color: var(--text-secondary);">Fornecedor</label>
                            <div class="filter-dropdown-inline" style="width: 100%; padding: 0;">
                                <select id="cotacaoFornecedor" onchange="selecionarFornecedorCotacao()" style="width: 100%; padding: 0.65rem 0.875rem; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-secondary); color: var(--text-primary); font-size: 0.9rem; appearance: none;">
                                    <option value="">Selecione...</option>
                                </select>
                            </div>
                        </div>
                        <div class="form-group" style="margin: 0;">
                            <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.4rem; color: var(--text-secondary);">Tipo de Envio</label>
                            <div class="filter-dropdown-inline" style="width: 100%; padding: 0;">
                                <select id="cotacaoTipo" style="width: 100%; padding: 0.65rem 0.875rem; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-secondary); color: var(--text-primary); font-size: 0.9rem; appearance: none;">
                                    <option value="descricao">Descrição</option>
                                    <option value="modelo">Modelo</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                        <div class="form-group" style="margin: 0;">
                            <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.4rem; color: var(--text-secondary);">Contato</label>
                            <input type="text" id="cotacaoContato" readonly placeholder="Preenchido ao selecionar fornecedor"
                                   style="width: 100%; padding: 0.65rem 0.875rem; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-secondary); color: var(--text-secondary); font-size: 0.9rem; box-sizing: border-box; opacity: 0.8;">
                        </div>
                        <div class="form-group" style="margin: 0;">
                            <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.4rem; color: var(--text-secondary);">Intervalo de Itens</label>
                            <input type="text" id="cotacaoIntervalo" placeholder="Ex: 1-5, 10"
                                   style="width: 100%; padding: 0.65rem 0.875rem; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-secondary); color: var(--text-primary); font-size: 0.9rem; box-sizing: border-box;">
                        </div>
                    </div>
                    <div id="cotacaoAviso" style="display:none; color: var(--text-secondary); font-size: 0.85rem; padding: 0.5rem; background: var(--bg-secondary); border-radius: 6px; border: 1px solid var(--border-color); margin-bottom: 0.5rem;"></div>
                </div>
                <div class="modal-actions">
                    <button class="secondary" onclick="fecharModalCotacao()">Cancelar</button>
                    <button class="success" onclick="enviarCotacao()">Enviar</button>
                </div>
            </div>
        </div>
    `;
    return div;
}

function obterSaudacao() {
    const hora = new Date().getHours();
    if (hora >= 5 && hora < 12) return 'Bom dia';
    if (hora >= 12 && hora < 18) return 'Boa tarde';
    return 'Boa noite';
}

// ============ DECLARAÇÕES ============
function abrirModalDeclaracoes() {
    let modal = document.getElementById('modalDeclaracoes');
    if (!modal) {
        modal = criarModalDeclaracoes();
        document.body.appendChild(modal);
    }
    document.getElementById('declaracaoTitulo').value = '';
    document.getElementById('declaracaoTexto').value = '';
    modal.classList.add('show');
}

function fecharModalDeclaracoes() {
    const modal = document.getElementById('modalDeclaracoes');
    if (modal) modal.classList.remove('show');
}

function criarModalDeclaracoes() {
    const modal = document.createElement('div');
    modal.id = 'modalDeclaracoes';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 640px; width: 90vw;">
            <div class="modal-header">
                <h3 class="modal-title">Declarações</h3>
                <button class="close-modal" onclick="fecharModalDeclaracoes()">✕</button>
            </div>
            <div style="padding: 0.25rem 0 0.5rem 0;">
                <div class="form-group" style="margin-bottom: 1rem;">
                    <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.4rem; color: var(--text-secondary);">Título</label>
                    <input type="text" id="declaracaoTitulo" placeholder="Título do documento e nome do arquivo"
                           style="width: 100%; padding: 0.65rem 0.875rem; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-secondary); color: var(--text-primary); font-size: 0.9rem; box-sizing: border-box;">
                </div>
                <div class="form-group">
                    <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.4rem; color: var(--text-secondary);">Texto da Declaração</label>
                    <textarea id="declaracaoTexto" rows="10" placeholder="Digite o texto da declaração..."
                              style="width: 100%; padding: 0.75rem 0.875rem; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-secondary); color: var(--text-primary); font-size: 0.9rem; box-sizing: border-box; resize: vertical; line-height: 1.6;"></textarea>
                </div>
            </div>
            <div class="modal-actions">
                <button class="secondary" onclick="fecharModalDeclaracoes()">Cancelar</button>
                <button class="success" onclick="perguntarAssinaturaDeclaracao()">Gerar Declaração</button>
            </div>
        </div>
    `;
    return modal;
}

function perguntarAssinaturaDeclaracao() {
    const titulo = document.getElementById('declaracaoTitulo').value.trim();
    const texto = document.getElementById('declaracaoTexto').value.trim();
    
    if (!titulo) { showToast('Informe o título da declaração', 'error'); return; }
    if (!texto) { showToast('Digite o texto da declaração', 'error'); return; }
    
    fecharModalDeclaracoes();
    
    // Modal de assinatura para declaração
    let modal = document.getElementById('modalAssinaturaDeclaracao');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modalAssinaturaDeclaracao';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content modal-delete">
                <button class="close-modal" onclick="fecharModalAssinaturaDeclaracao()">✕</button>
                <div class="modal-message-delete">Deseja gerar a declaração com assinatura padrão?</div>
                <div class="modal-actions modal-actions-no-border">
                    <button class="danger" onclick="gerarPDFDeclaracao(false)">Não</button>
                    <button class="success" onclick="gerarPDFDeclaracao(true)">Sim</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    // Armazenar dados temporariamente
    modal._titulo = titulo;
    modal._texto = texto;
    modal.classList.add('show');
}

function fecharModalAssinaturaDeclaracao() {
    const modal = document.getElementById('modalAssinaturaDeclaracao');
    if (modal) modal.classList.remove('show');
}

async function gerarPDFDeclaracao(comAssinatura) {
    fecharModalAssinaturaDeclaracao();
    
    const modal = document.getElementById('modalAssinaturaDeclaracao');
    const titulo = modal?._titulo || '';
    const texto = modal?._texto || '';
    
    if (!titulo || !texto) { showToast('Dados da declaração não encontrados', 'error'); return; }
    
    const pregao = pregoes.find(p => p.id === currentPregaoId);
    
    if (typeof window.jspdf === 'undefined') {
        showToast('Erro: Biblioteca PDF não carregou. Recarregue a página (F5).', 'error');
        return;
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    const margin = 20;
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const maxWidth = pageWidth - (2 * margin);
    let y = 3;
    
    // Carregar logo e cabeçalho
    const logoImg = new Image();
    logoImg.crossOrigin = 'anonymous';
    logoImg.src = 'I.R.-COMERCIO-E-MATERIAIS-ELETRICOS-LTDA-PDF.png';
    
    const desenharDeclaracao = (logoCarregada) => {
        // Cabeçalho
        if (logoCarregada) {
            const logoW = 40;
            const logoH = (logoImg.height / logoImg.width) * logoW;
            const logoX = 5;
            doc.setGState(new doc.GState({ opacity: 0.3 }));
            doc.addImage(logoImg, 'PNG', logoX, y, logoW, logoH);
            doc.setGState(new doc.GState({ opacity: 1.0 }));
            
            const fs = logoH * 0.5;
            doc.setFontSize(fs);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(150, 150, 150);
            const tx = logoX + logoW + 1.2;
            doc.text('I.R COMÉRCIO E', tx, y + fs * 0.85);
            doc.text('MATERIAIS ELÉTRICOS LTDA', tx, y + fs * 0.85 + fs * 0.5);
            doc.setTextColor(0, 0, 0);
            y += logoH + 10;
        } else {
            y = 25;
        }
        
        // Título centralizado
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text(titulo.toUpperCase(), pageWidth / 2, y, { align: 'center' });
        y += 14;
        
        // Corpo do texto — fonte Arial 12, centralizado
        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        
        const paragrafos = texto.split('\n');
        paragrafos.forEach(para => {
            if (para.trim() === '') {
                y += 6;
                return;
            }
            const linhas = doc.splitTextToSize(para.trim(), maxWidth);
            linhas.forEach(linha => {
                if (y > pageHeight - 50) {
                    doc.addPage();
                    y = 20;
                }
                doc.text(linha, pageWidth / 2, y, { align: 'center' });
                y += 7;
            });
        });
        
        y += 12;
        
        if (y > pageHeight - 45) { doc.addPage(); y = 20; }
        
        // Data
        const dataAtual = new Date();
        const dia = dataAtual.getDate();
        const meses = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO',
                       'JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];
        const mes = meses[dataAtual.getMonth()];
        const ano = dataAtual.getFullYear();
        
        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        doc.text(`SERRA/ES, ${dia} DE ${mes} DE ${ano}`, pageWidth / 2, y, { align: 'center' });
        y += 6;
        
        // Nome do arquivo
        const uasgPart = pregao?.uasg ? `-${pregao.uasg}` : '';
        const numPart = pregao?.numero_pregao ? `-${pregao.numero_pregao}` : '';
        const nomeArquivo = `${titulo.toUpperCase().replace(/\s+/g, '-')}${numPart}${uasgPart}.pdf`;
        
        if (comAssinatura) {
            const assin = new Image();
            assin.crossOrigin = 'anonymous';
            assin.src = 'assinatura.png';
            assin.onload = () => {
                try {
                    const aw = 50, ah = (assin.height / assin.width) * aw;
                    doc.addImage(assin, 'PNG', (pageWidth / 2) - (aw / 2), y + 2, aw, ah);
                    let yf = y + ah + 8;
                    doc.setFont('helvetica', 'bold');
                    doc.text('ROSEMEIRE BICALHO DE LIMA GRAVINO', pageWidth / 2, yf, { align: 'center' });
                    yf += 5; doc.setFont('helvetica', 'normal');
                    doc.text('MG-10.078.568 / CPF: 045.160.616-78', pageWidth / 2, yf, { align: 'center' });
                    yf += 5; doc.text('DIRETORA', pageWidth / 2, yf, { align: 'center' });
                    doc.save(nomeArquivo);
                    showToast('Declaração gerada com sucesso!', 'success');
                } catch(e) { semAssinatura(); }
            };
            assin.onerror = semAssinatura;
        } else {
            semAssinatura();
        }
        
        function semAssinatura() {
            y += 20;
            doc.setDrawColor(0,0,0);
            doc.line(pageWidth/2 - 40, y, pageWidth/2 + 40, y);
            y += 5; doc.setFont('helvetica', 'bold');
            doc.text('ROSEMEIRE BICALHO DE LIMA GRAVINO', pageWidth/2, y, { align: 'center' });
            y += 5; doc.setFont('helvetica', 'normal');
            doc.text('MG-10.078.568 / CPF: 045.160.616-78', pageWidth/2, y, { align: 'center' });
            y += 5; doc.text('DIRETORA', pageWidth/2, y, { align: 'center' });
            doc.save(nomeArquivo);
            showToast('Declaração gerada!', 'success');
        }
    };
    
    logoImg.onload = () => desenharDeclaracao(true);
    logoImg.onerror = () => desenharDeclaracao(false);
}

// switchItemsView removido (botões Proposta/Exequibilidade removidos)

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
        select.innerHTML = '<option value="">Marca</option>' + 
            Array.from(marcasItens).sort().map(m => `<option value="${m}">${m}</option>`).join('');
    }
}

function filterItens() {
    const search = document.getElementById('searchItens')?.value.toLowerCase() || '';
    const marca = document.getElementById('filterMarcaItens')?.value || '';
    
    const filtered = itens.filter(item => {
        const matchSearch = !search || 
            (item.descricao || '').toLowerCase().includes(search) ||
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
    
    const fmtUntGlobal = (v) => {
        const n = v || 0;
        const s2 = n.toFixed(6).replace(/(\.(\d*?)?)0+$/, '$1').replace(/\.$/, '');
        return 'R$ ' + (parseFloat(s2 || 0)).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 6});
    };
    const fmtTotalGlobal = (v) => 'R$ ' + (v || 0).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});

    const rows = itensToRender.map((item) => {
        const vendaUnt = item.venda_unt || 0;
        const compraUnt = item.estimado_unt || 0;
        const vendaMaior = compraUnt > 0 && vendaUnt > compraUnt;
        const checked = item.ganho ? 'checked' : '';
        let rowClass = item.ganho ? 'item-ganho row-won' : '';
        if (vendaMaior) rowClass += ' row-venda-alta';
        const cbId = `item-ganho-${item.id}`;
        return `
            <tr class="${rowClass}" 
                ondblclick="editarItem('${item.id}')" 
                oncontextmenu="showItemContextMenu(event, '${item.id}')">
                <td style="text-align: center; padding: 8px;">
                    <div class="checkbox-wrapper">
                        <input type="checkbox" id="${cbId}" ${checked}
                               onchange="${vendaMaior ? '' : `toggleItemGanho('${item.id}', this.checked)`}"
                               onclick="${vendaMaior ? 'event.preventDefault(); event.stopPropagation();' : 'event.stopPropagation()'}"
                               class="styled-checkbox ${vendaMaior ? 'cb-venda-alta' : ''}">
                        <label for="${cbId}" class="checkbox-label-styled ${vendaMaior ? 'cb-label-venda-alta' : ''}">${vendaMaior ? '✕' : ''}</label>
                    </div>
                </td>
                <td><strong>${item.numero}</strong></td>
                <td class="descricao-cell">${item.descricao || '-'}</td>
                <td>${item.qtd || 1}</td>
                <td>${item.unidade || 'UN'}</td>
                <td>${item.marca || '-'}</td>
                <td>${item.modelo || '-'}</td>
                <td>${fmtUntGlobal(compraUnt)}</td>
                <td>${fmtTotalGlobal(item.estimado_total)}</td>
                <td>${fmtUntGlobal(item.custo_unt)}</td>
                <td>${fmtTotalGlobal(item.custo_total)}</td>
                <td>${fmtUntGlobal(vendaUnt)}</td>
                <td>${fmtTotalGlobal(item.venda_total)}</td>
            </tr>`;
    }).join('');

    // Linha de totais
    const totCompra = itensToRender.reduce((s, i) => s + (i.estimado_total || 0), 0);
    const totCusto  = itensToRender.reduce((s, i) => s + (i.custo_total || 0), 0);
    const totVenda  = itensToRender.reduce((s, i) => s + (i.venda_total || 0), 0);
    const totalRow = `<tr style="background:var(--bg-secondary);font-weight:700;border-top:2px solid var(--border-color);">
        <td colspan="8" style="text-align:right;padding:8px 12px;font-size:0.85rem;color:var(--text-secondary);">TOTAIS</td>
        <td style="padding:8px 12px;font-size:0.85rem;">${fmtTotalGlobal(totCompra)}</td>
        <td style="padding:8px 12px;font-size:0.85rem;"></td>
        <td style="padding:8px 12px;font-size:0.85rem;">${fmtTotalGlobal(totCusto)}</td>
        <td style="padding:8px 12px;font-size:0.85rem;"></td>
        <td style="padding:8px 12px;font-size:0.85rem;">${fmtTotalGlobal(totVenda)}</td>
    </tr>`;

    container.innerHTML = rows + totalRow;
}

function showItemContextMenu(event, itemId) {
    event.preventDefault();
    
    // Remover menu existente se houver
    const existingMenu = document.getElementById('contextMenu');
    if (existingMenu) existingMenu.remove();
    
    // Criar menu de contexto
    const menu = document.createElement('div');
    menu.id = 'contextMenu';
    menu.style.cssText = `
        position: fixed;
        left: ${event.clientX}px;
        top: ${event.clientY}px;
        background: white;
        border: 1px solid #E5E7EB;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        min-width: 150px;
        padding: 0.5rem 0;
    `;
    
    menu.innerHTML = `
        <div onclick="excluirItemContexto('${itemId}')" style="
            padding: 0.75rem 1rem;
            cursor: pointer;
            color: #EF4444;
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        " onmouseover="this.style.background='#FEE2E2'" onmouseout="this.style.background='white'">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            Excluir
        </div>
    `;
    
    document.body.appendChild(menu);
    
    // Remover menu ao clicar fora
    const closeMenu = () => {
        menu.remove();
        document.removeEventListener('click', closeMenu);
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 100);
}

async function excluirItemContexto(itemId) {
    try {
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
        if (sessionToken) headers['X-Session-Token'] = sessionToken;
        
        if (!itemId.startsWith('temp-')) {
            const response = await fetch(`${API_URL}/pregoes/${currentPregaoId}/itens/${itemId}`, {
                method: 'DELETE',
                headers: headers
            });
            
            if (!response.ok) throw new Error('Erro ao excluir');
        }
        
        itens = itens.filter(item => item.id !== itemId);
        selectedItens.delete(itemId);
        renderItens();
        showToast('Item excluído', 'success');
    } catch (error) {
        console.error('Erro:', error);
        showToast('Erro ao excluir item', 'error');
    }
}

async function toggleItemGanho(id, ganho) {
    const item = itens.find(i => i.id === id);
    if (!item) return;
    
    item.ganho = ganho;
    
    try {
        const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
        if (sessionToken) headers['X-Session-Token'] = sessionToken;
        
        if (!id.startsWith('temp-')) {
            await fetch(`${API_URL}/pregoes/${currentPregaoId}/itens/${id}`, {
                method: 'PUT',
                headers: headers,
                body: JSON.stringify(item)
            });
        }
    } catch (error) {
        console.error('Erro ao atualizar ganho do item:', error);
    }
    
    renderItens();
}

function toggleItemSelection(id) {
    if (selectedItens.has(id)) {
        selectedItens.delete(id);
    } else {
        selectedItens.add(id);
    }
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

async function adicionarItem() {
    const numero = itens.length > 0 ? Math.max(...itens.map(i => i.numero)) + 1 : 1;
    const novoItem = {
        pregao_id: currentPregaoId,
        numero, descricao: '', qtd: 1, unidade: 'UN',
        marca: '', modelo: '',
        estimado_unt: 0, estimado_total: 0, custo_unt: 0, custo_total: 0,
        porcentagem: 149, venda_unt: 0, venda_total: 0, ganho: false
    };
    try {
        const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
        if (sessionToken) headers['X-Session-Token'] = sessionToken;
        const r = await fetch(`${API_URL}/pregoes/${currentPregaoId}/itens`, { method:'POST', headers, body:JSON.stringify(novoItem) });
        if (r.ok) {
            const saved = await r.json();
            itens.push(saved);
            renderItens();
            showToast('Item ' + numero + ' adicionado', 'success');
        } else { throw new Error('Erro ' + r.status); }
    } catch(e) {
        console.error(e);
        showToast('Erro ao criar item', 'error');
    }
}

function abrirModalIntervalo() {
    const modal = document.getElementById('modalIntervalo');
    if (modal) {
        document.getElementById('inputIntervalo').value = '';
        modal.classList.add('show');
    }
}

function fecharModalIntervalo() {
    const modal = document.getElementById('modalIntervalo');
    if (modal) modal.classList.remove('show');
}

function confirmarAdicionarIntervalo() {
    const intervalo = document.getElementById('inputIntervalo').value.trim();
    fecharModalIntervalo();
    if (!intervalo) return;
    adicionarIntervalo(intervalo);
}

async function adicionarIntervalo(intervalo) {
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
    
    // Verificar duplicatas - ignorar silenciosamente
    const numerosExistentes = new Set(itens.map(i => i.numero));
    const duplicatas = numeros.filter(n => numerosExistentes.has(n));
    if (duplicatas.length > 0) {
        showToast(`Itens ${duplicatas.join(', ')} já existem — ignorados`, 'error');
        numeros = numeros.filter(n => !numerosExistentes.has(n));
        if (numeros.length === 0) return;
    }
    
    const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    if (sessionToken) headers['X-Session-Token'] = sessionToken;
    let criados = 0;
    for (const numero of numeros) {
        const novoItem = {
            pregao_id: currentPregaoId,
            numero, descricao: '', qtd: 1, unidade: 'UN',
            marca: '', modelo: '',
            estimado_unt: 0, estimado_total: 0, custo_unt: 0, custo_total: 0,
            porcentagem: 149, venda_unt: 0, venda_total: 0, ganho: false
        };
        try {
            const r = await fetch(`${API_URL}/pregoes/${currentPregaoId}/itens`, { method:'POST', headers, body:JSON.stringify(novoItem) });
            if (r.ok) { itens.push(await r.json()); criados++; }
        } catch(e) { console.error(e); }
    }
    itens.sort((a, b) => a.numero - b.numero);
    renderItens();
    showToast(`${criados} item(s) adicionado(s)`, 'success');
}

function abrirModalExcluirItens() {
    const modal = document.getElementById('modalExcluirItens');
    if (modal) {
        document.getElementById('inputExcluirIntervalo').value = '';
        modal.classList.add('show');
    }
}

function fecharModalExcluirItens() {
    const modal = document.getElementById('modalExcluirItens');
    if (modal) modal.classList.remove('show');
}

async function confirmarExcluirItens() {
    const intervalo = document.getElementById('inputExcluirIntervalo').value.trim();
    fecharModalExcluirItens();
    
    if (!intervalo) {
        showToast('Digite um intervalo para excluir', 'error');
        return;
    }
    
    const numeros = parsearIntervalo(intervalo);
    if (!numeros) return;
    
    const idsParaExcluir = itens
        .filter(item => numeros.includes(item.numero))
        .map(item => item.id);
    
    if (idsParaExcluir.length === 0) {
        showToast('Nenhum item encontrado no intervalo informado', 'error');
        return;
    }
    
    await excluirItensPorIds(idsParaExcluir);
}

function parsearIntervalo(intervalo) {
    const numeros = [];
    const partes = intervalo.split(',').map(p => p.trim());
    
    for (const parte of partes) {
        if (parte.includes('-')) {
            const [inicio, fim] = parte.split('-').map(n => parseInt(n.trim()));
            if (isNaN(inicio) || isNaN(fim) || inicio > fim) {
                showToast('Intervalo inválido', 'error');
                return null;
            }
            for (let i = inicio; i <= fim; i++) numeros.push(i);
        } else {
            const num = parseInt(parte);
            if (isNaN(num)) {
                showToast('Número inválido', 'error');
                return null;
            }
            numeros.push(num);
        }
    }
    return numeros;
}

async function excluirItensPorIds(ids) {
    try {
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
        if (sessionToken) headers['X-Session-Token'] = sessionToken;
        
        const idsServidor = ids.filter(id => !id.startsWith('temp-'));
        
        if (idsServidor.length > 0) {
            const response = await fetch(`${API_URL}/pregoes/${currentPregaoId}/itens/delete-multiple`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ ids: idsServidor })
            });
            if (!response.ok) throw new Error('Erro ao excluir');
        }
        
        const idsSet = new Set(ids);
        itens = itens.filter(item => !idsSet.has(item.id));
        ids.forEach(id => selectedItens.delete(id));
        renderItens();
        showToast('Itens excluídos', 'success');
    } catch (error) {
        console.error('Erro:', error);
        showToast('Erro ao excluir itens', 'error');
    }
}

async function excluirItensSelecionados() {
    if (selectedItens.size === 0) {
        showToast('Selecione itens para excluir', 'error');
        return;
    }
    
    // sem confirmação — exclusão direta
    
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

let currentItemTab = 0;
const itemTabs = ['item-tab-item', 'item-tab-fornecedor', 'item-tab-valores'];

function mostrarModalItem(item) {
    let modal = document.getElementById('modalItem');
    if (!modal) {
        modal = criarModalItem();
        document.body.appendChild(modal);
    }
    
    document.getElementById('itemNumero').value = item.numero;
    document.getElementById('itemDescricao').value = item.descricao;
    document.getElementById('itemQtd').value = item.qtd;
    document.getElementById('itemUnidade').value = item.unidade || 'UN';
    document.getElementById('itemMarca').value = item.marca || '';
    document.getElementById('itemModelo').value = item.modelo || '';
    document.getElementById('itemEstimadoUnt').value = item.estimado_unt || 0;
    document.getElementById('itemEstimadoTotal').value = item.estimado_total || 0;
    document.getElementById('itemCustoUnt').value = item.custo_unt || 0;
    document.getElementById('itemCustoTotal').value = item.custo_total || 0;
    document.getElementById('itemPorcentagem').value = item.porcentagem !== undefined ? item.porcentagem : 149;
    document.getElementById('itemVendaUnt').value = item.venda_unt || 0;
    document.getElementById('itemVendaTotal').value = item.venda_total || 0;
    
    atualizarTituloModalItem(item);
    
    currentItemTab = 0;
    switchItemTab(itemTabs[0]);
    
    modal.classList.add('show');
    configurarCalculosAutomaticos();
    // Calcular valores imediatamente ao abrir
    setTimeout(calcularValoresItem, 50);
}

function atualizarTituloModalItem(item) {
    const totalItens = itens.length;
    const posicao = editingItemIndex + 1;
    
    const titleEl = document.getElementById('modalItemTitle');
    const prevPag = document.getElementById('btnPrevPagItem');
    const nextPag = document.getElementById('btnNextPagItem');
    
    if (titleEl) titleEl.textContent = `Item ${item.numero}`;
    if (prevPag) prevPag.style.visibility = editingItemIndex > 0 ? 'visible' : 'hidden';
    if (nextPag) nextPag.style.visibility = editingItemIndex < itens.length - 1 ? 'visible' : 'hidden';
}

function switchItemTab(tabId) {
    itemTabs.forEach((tab, idx) => {
        const el = document.getElementById(tab);
        const btn = document.querySelectorAll('#modalItem .tab-btn')[idx];
        if (el) el.classList.remove('active');
        if (btn) btn.classList.remove('active');
    });
    
    const activeEl = document.getElementById(tabId);
    const activeIdx = itemTabs.indexOf(tabId);
    const activeBtn = document.querySelectorAll('#modalItem .tab-btn')[activeIdx];
    
    if (activeEl) activeEl.classList.add('active');
    if (activeBtn) activeBtn.classList.add('active');
    
    currentItemTab = activeIdx;
    atualizarNavegacaoAbasItem();
}

function atualizarNavegacaoAbasItem() {
    const btnPrev = document.getElementById('btnItemTabPrev');
    const btnNext = document.getElementById('btnItemTabNext');
    if (btnPrev) btnPrev.style.display = currentItemTab === 0 ? 'none' : 'inline-block';
    if (btnNext) btnNext.style.display = currentItemTab === itemTabs.length - 1 ? 'none' : 'inline-block';
}

function nextItemTab() {
    if (currentItemTab < itemTabs.length - 1) {
        currentItemTab++;
        switchItemTab(itemTabs[currentItemTab]);
    }
}

function prevItemTab() {
    if (currentItemTab > 0) {
        currentItemTab--;
        switchItemTab(itemTabs[currentItemTab]);
    }
}

function criarModalItem() {
    const modal = document.createElement('div');
    modal.id = 'modalItem';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content large" style="max-width: 680px; width: 90vw;">
            <div class="modal-header" style="align-items: center;">
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <button id="btnPrevPagItem" onclick="navegarItemAnterior()" 
                            style="background: none; border: none; cursor: pointer; color: var(--text-secondary); font-size: 1.1rem; padding: 0 0.25rem; visibility: hidden;">‹</button>
                    <h3 class="modal-title" id="modalItemTitle">Item</h3>
                    <button id="btnNextPagItem" onclick="navegarProximoItem()"
                            style="background: none; border: none; cursor: pointer; color: var(--text-secondary); font-size: 1.1rem; padding: 0 0.25rem; visibility: hidden;">›</button>
                </div>
                <button class="close-modal" onclick="fecharModalItem()">✕</button>
            </div>
            
            <div class="tabs-container">
                <div class="tabs-nav">
                    <button class="tab-btn active" onclick="switchItemTab('item-tab-item')">Item</button>
                    <button class="tab-btn" onclick="switchItemTab('item-tab-fornecedor')">Fornecedor</button>
                    <button class="tab-btn" onclick="switchItemTab('item-tab-valores')">Valores</button>
                </div>
                
                <!-- Aba Item -->
                <div class="tab-content active" id="item-tab-item">
                    <input type="hidden" id="itemNumero">
                    <div class="form-grid">
                        <div class="form-group">
                            <label>Quantidade *</label>
                            <input type="number" id="itemQtd" min="1" required>
                        </div>
                        <div class="form-group">
                            <label>Unidade *</label>
                            <select id="itemUnidade">
                                <option value="UN">UN</option>
                                <option value="MT">MT</option>
                                <option value="PÇ">PÇ</option>
                                <option value="CX">CX</option>
                                <option value="PT">PT</option>
                            </select>
                        </div>
                        <div class="form-group" style="grid-column: 1 / -1;">
                            <label>Descrição *</label>
                            <textarea id="itemDescricao" rows="4" required></textarea>
                        </div>
                    </div>
                </div>
                
                <!-- Aba Fornecedor -->
                <div class="tab-content" id="item-tab-fornecedor">
                    <div class="form-grid">
                        <div class="form-group">
                            <label>Marca</label>
                            <input type="text" id="itemMarca">
                        </div>
                        <div class="form-group">
                            <label>Modelo</label>
                            <input type="text" id="itemModelo">
                        </div>
                    </div>
                </div>
                
                <!-- Aba Valores -->
                <div class="tab-content" id="item-tab-valores">
                    <div style="display: grid; grid-template-columns: 1fr; gap: 0.75rem; padding: 0.25rem 0;">
                        <!-- Linha 1: Porcentagem sozinha -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.75rem;">
                            <div class="form-group" style="margin:0;">
                                <label style="font-size:0.8rem; font-weight:600; color:var(--text-secondary); display:block; margin-bottom:0.3rem;">Porcentagem (%)</label>
                                <input type="number" id="itemPorcentagem" min="0" step="any" value="149" 
                                       style="width:100%; padding:0.55rem 0.75rem; border:1px solid var(--border-color); border-radius:6px; background:var(--bg-secondary); color:var(--text-primary); font-size:0.9rem; box-sizing:border-box;">
                            </div>
                            <div></div>
                            <div></div>
                        </div>
                        <!-- Linha 2: Compra UNT | Custo UNT | Venda UNT -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.75rem;">
                            <div class="form-group" style="margin:0;">
                                <label style="font-size:0.8rem; font-weight:600; color:var(--text-secondary); display:block; margin-bottom:0.3rem;">Compra UNT</label>
                                <input type="number" id="itemEstimadoUnt" step="any" min="0"
                                       style="width:100%; padding:0.55rem 0.75rem; border:1px solid var(--border-color); border-radius:6px; background:var(--bg-secondary); color:var(--text-primary); font-size:0.9rem; box-sizing:border-box;">
                            </div>
                            <div class="form-group" style="margin:0;">
                                <label style="font-size:0.8rem; font-weight:600; color:var(--text-secondary); display:block; margin-bottom:0.3rem;">Custo UNT</label>
                                <input type="number" id="itemCustoUnt" step="any" min="0"
                                       style="width:100%; padding:0.55rem 0.75rem; border:1px solid var(--border-color); border-radius:6px; background:var(--bg-secondary); color:var(--text-primary); font-size:0.9rem; box-sizing:border-box;">
                            </div>
                            <div class="form-group" style="margin:0;">
                                <label style="font-size:0.8rem; font-weight:600; color:var(--text-secondary); display:block; margin-bottom:0.3rem;">Venda UNT</label>
                                <input type="number" id="itemVendaUnt" step="any" min="0" readonly
                                       style="width:100%; padding:0.55rem 0.75rem; border:1px solid var(--border-color); border-radius:6px; background:var(--bg-secondary); color:var(--text-primary); font-size:0.9rem; box-sizing:border-box; opacity:0.75;">
                            </div>
                        </div>
                        <!-- Linha 3: Compra Total | Custo Total | Venda Total -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.75rem;">
                            <div class="form-group" style="margin:0;">
                                <label style="font-size:0.8rem; font-weight:600; color:var(--text-secondary); display:block; margin-bottom:0.3rem;">Compra Total</label>
                                <input type="number" id="itemEstimadoTotal" step="any" min="0" readonly
                                       style="width:100%; padding:0.55rem 0.75rem; border:1px solid var(--border-color); border-radius:6px; background:var(--bg-secondary); color:var(--text-primary); font-size:0.9rem; box-sizing:border-box; opacity:0.75;">
                            </div>
                            <div class="form-group" style="margin:0;">
                                <label style="font-size:0.8rem; font-weight:600; color:var(--text-secondary); display:block; margin-bottom:0.3rem;">Custo Total</label>
                                <input type="number" id="itemCustoTotal" step="any" min="0" readonly
                                       style="width:100%; padding:0.55rem 0.75rem; border:1px solid var(--border-color); border-radius:6px; background:var(--bg-secondary); color:var(--text-primary); font-size:0.9rem; box-sizing:border-box; opacity:0.75;">
                            </div>
                            <div class="form-group" style="margin:0;">
                                <label style="font-size:0.8rem; font-weight:600; color:var(--text-secondary); display:block; margin-bottom:0.3rem;">Venda Total</label>
                                <input type="number" id="itemVendaTotal" step="any" min="0" readonly
                                       style="width:100%; padding:0.55rem 0.75rem; border:1px solid var(--border-color); border-radius:6px; background:var(--bg-secondary); color:var(--text-primary); font-size:0.9rem; box-sizing:border-box; opacity:0.75;">
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="modal-actions">
                <button type="button" id="btnItemTabPrev" onclick="prevItemTab()" class="secondary" style="display: none;">Anterior</button>
                <button type="button" id="btnItemTabNext" onclick="nextItemTab()" class="secondary">Próximo</button>
                <button type="button" onclick="salvarItemAtual()" class="success">Salvar</button>
                <button type="button" onclick="fecharModalItem()" class="danger">Cancelar</button>
            </div>
        </div>
    `;
    return modal;
}

function calcularValoresItem() {
    const q = parseFloat(document.getElementById('itemQtd')?.value || 0);
    const eu = parseFloat(document.getElementById('itemEstimadoUnt')?.value || 0);
    const cu = parseFloat(document.getElementById('itemCustoUnt')?.value || 0);
    const perc = parseFloat(document.getElementById('itemPorcentagem')?.value || 0);
    
    const etEl = document.getElementById('itemEstimadoTotal');
    const ctEl = document.getElementById('itemCustoTotal');
    const vuEl = document.getElementById('itemVendaUnt');
    const vtEl = document.getElementById('itemVendaTotal');
    
    if (etEl) etEl.value = (q * eu).toFixed(2);
    if (ctEl) ctEl.value = (q * cu).toFixed(2);
    const vu = cu * (1 + perc / 100);
    // UNT: mostrar até 6 casas decimais sem zeros trailing
    if (vuEl) {
        const vuStr = vu.toFixed(6).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
        vuEl.value = vuStr || '0';
    }
    if (vtEl) vtEl.value = (vu * q).toFixed(2);
}

function configurarCalculosAutomaticos() {
    // Usar delegação de eventos no modal — sem clonar elementos
    const modal = document.getElementById('modalItem');
    if (!modal) return;
    
    // Remove listener anterior se existir
    if (modal._calcListener) {
        modal.removeEventListener('input', modal._calcListener);
    }
    
    modal._calcListener = function(e) {
        const ids = ['itemQtd', 'itemEstimadoUnt', 'itemCustoUnt', 'itemPorcentagem'];
        if (ids.includes(e.target.id)) {
            calcularValoresItem();
        }
    };
    
    modal.addEventListener('input', modal._calcListener);
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
    
    item.numero = parseInt(document.getElementById('itemNumero').value) || item.numero;
    item.descricao = toUpperCase(document.getElementById('itemDescricao').value);
    item.qtd = parseInt(document.getElementById('itemQtd').value);
    item.unidade = document.getElementById('itemUnidade').value;
    item.marca = toUpperCase(document.getElementById('itemMarca').value);
    item.modelo = toUpperCase(document.getElementById('itemModelo').value);
    item.estimado_unt = parseFloat(document.getElementById('itemEstimadoUnt').value || 0);
    item.estimado_total = parseFloat(document.getElementById('itemEstimadoTotal').value || 0);
    item.custo_unt = parseFloat(document.getElementById('itemCustoUnt').value || 0);
    item.custo_total = parseFloat(document.getElementById('itemCustoTotal').value || 0);
    item.porcentagem = parseFloat(document.getElementById('itemPorcentagem').value || 149);
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
            if (editandoGrupoIdx !== null) {
                reconstruirGruposDeItens();
                atualizarSelectsGrupos();
                renderGrupos();
            } else {
                atualizarMarcasItens();
                renderItens();
            }
            if (fechar) {
                showToast('Item salvo', 'success');
                fecharModalItemContexto();
            } else if (editandoGrupoIdx !== null) {
                showToast('Item salvo', 'success');
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
    editandoGrupoIdx = null;
    editandoGrupoItemIdx = null;
}

function fecharModalItemContexto() {
    fecharModalItem();
}

function syncItens() {
    carregarItens(currentPregaoId);
    showToast('Itens sincronizados', 'success');
}

function perguntarAssinaturaPDF() {
    if (!currentPregaoId) {
        showToast('Erro: Pregão não identificado', 'error');
        return;
    }
    const itensSelecionados = itens.filter(item => item.ganho);
    if (itensSelecionados.length === 0) {
        showToast('Marque ao menos um item (ganho) para gerar a proposta', 'error');
        return;
    }
    const modal = document.getElementById('modalAssinatura');
    if (modal) modal.classList.add('show');
}

function fecharModalAssinatura() {
    const modal = document.getElementById('modalAssinatura');
    if (modal) modal.classList.remove('show');
}

// ============ COTAÇÃO ============
let fornecedoresDisponiveis = [];

async function abrirModalCotacao() {
    // Fornecedores disponíveis = marcas preenchidas nos itens do pregão atual
    const marcasNosItens = [...new Set(itens.filter(i => i.marca).map(i => i.marca))].sort();
    
    const select = document.getElementById('cotacaoFornecedor');
    if (select) {
        select.innerHTML = '<option value="">Selecione...</option>' +
            marcasNosItens.map(m => `<option value="${m}">${m}</option>`).join('');
    }
    
    document.getElementById('cotacaoContato').value = '';
    document.getElementById('cotacaoIntervalo').value = '';
    document.getElementById('cotacaoTipo').value = 'descricao';
    
    const aviso = document.getElementById('cotacaoAviso');
    if (aviso) aviso.style.display = 'none';
    
    const modal = document.getElementById('modalCotacao');
    if (modal) modal.classList.add('show');
}

function fecharModalCotacao() {
    const modal = document.getElementById('modalCotacao');
    if (modal) modal.classList.remove('show');
}

async function selecionarFornecedorCotacao() {
    const marca = document.getElementById('cotacaoFornecedor').value;
    const contatoEl = document.getElementById('cotacaoContato');
    const aviso = document.getElementById('cotacaoAviso');
    
    if (!marca) {
        contatoEl.value = '';
        if (aviso) aviso.style.display = 'none';
        return;
    }
    
    // Buscar fornecedor pelo nome/marca no banco de dados
    try {
        const headers = { 'Accept': 'application/json' };
        if (sessionToken) headers['X-Session-Token'] = sessionToken;
        const response = await fetch(`${API_URL}/fornecedores`, { headers });
        
        if (response.ok) {
            const lista = await response.json();
            const fornecedor = lista.find(f => 
                (f.nome || f.razao_social || f.name || '').toUpperCase() === marca.toUpperCase()
            );
            
            if (fornecedor) {
                const meio = fornecedor.meio_envio || fornecedor.envio || '';
                const contato = fornecedor.email || fornecedor.whatsapp || fornecedor.telefone || '';
                contatoEl.value = `${meio ? meio + ': ' : ''}${contato}`;
                fornecedoresDisponiveis = lista;
                if (aviso) aviso.style.display = 'none';
            } else {
                contatoEl.value = '';
                if (aviso) {
                    aviso.textContent = 'Fornecedor não encontrado';
                    aviso.style.display = 'block';
                }
            }
        } else {
            contatoEl.value = '';
            if (aviso) {
                aviso.textContent = 'Fornecedor não encontrado';
                aviso.style.display = 'block';
            }
        }
    } catch (e) {
        contatoEl.value = '';
        if (aviso) {
            aviso.textContent = 'Fornecedor não encontrado';
            aviso.style.display = 'block';
        }
    }
}

// atualizarPreviewCotacao e parsearIntervaloNumerosLista removidos (sem preview no modal de cotação)

function enviarCotacao() {
    const marca = document.getElementById('cotacaoFornecedor').value;
    const tipo = document.getElementById('cotacaoTipo').value;
    const intervaloStr = document.getElementById('cotacaoIntervalo').value.trim();
    const contato = document.getElementById('cotacaoContato').value;
    
    if (!marca) {
        showToast('Selecione um fornecedor', 'error');
        return;
    }
    
    // Definir itens para cotação
    let itensCotacao = itens;
    if (intervaloStr) {
        const numeros = parsearIntervalo(intervaloStr);
        if (numeros) itensCotacao = itens.filter(item => numeros.includes(item.numero));
    }
    
    if (itensCotacao.length === 0) {
        showToast('Nenhum item no intervalo informado', 'error');
        return;
    }
    
    const saudacao = obterSaudacao();
    let mensagem = `${saudacao}! \n\nSolicito, por gentileza, um orçamento para os itens mencionados a seguir:\n\n`;
    
    itensCotacao.forEach((item, idx) => {
        const numLista = idx + 1;
        if (tipo === 'descricao') {
            mensagem += `${numLista} - ${item.descricao}\n${item.qtd} ${item.unidade}\n\n`;
        } else {
            mensagem += `ITEM ${numLista} - ${item.modelo || item.descricao}\n${item.qtd} ${item.unidade}\n\n`;
        }
    });
    
    mensagem = mensagem.trim();
    const msgEncoded = encodeURIComponent(mensagem);
    
    // Determinar meio pelo fornecedor encontrado
    const fornecedor = fornecedoresDisponiveis.find(f =>
        (f.nome || f.razao_social || f.name || '').toUpperCase() === marca.toUpperCase()
    );
    const meio = (fornecedor?.meio_envio || fornecedor?.envio || contato || '').toLowerCase();
    const contatoLimpo = fornecedor?.email || fornecedor?.whatsapp || fornecedor?.telefone || '';
    
    if (meio.includes('whatsapp') || meio.includes('whats')) {
        const numero = contatoLimpo.replace(/\D/g, '');
        window.open(`https://wa.me/${numero}?text=${msgEncoded}`, '_blank');
    } else {
        window.open(`mailto:${contatoLimpo}?body=${msgEncoded}`, '_blank');
    }
    
    fecharModalCotacao();
}

async function gerarPDFsProposta(comAssinatura = true) {
    fecharModalAssinatura();
    if (!currentPregaoId) {
        showToast('Erro: Pregão não identificado', 'error');
        return;
    }
    
    const pregao = pregoes.find(p => p.id === currentPregaoId);
    if (!pregao) {
        showToast('Erro: Pregão não encontrado', 'error');
        return;
    }
    
    // Usar itens marcados como ganho
    const itensSelecionados = itens.filter(item => item.ganho);
    if (itensSelecionados.length === 0) {
        showToast('Marque ao menos um item (ganho) para gerar a proposta', 'error');
        return;
    }
    
    if (typeof window.jspdf === 'undefined') {
        let attempts = 0;
        const maxAttempts = 5;
        const checkInterval = setInterval(() => {
            attempts++;
            if (typeof window.jspdf !== 'undefined') {
                clearInterval(checkInterval);
                gerarPDFPropostaInterno(pregao, comAssinatura);
            } else if (attempts >= maxAttempts) {
                clearInterval(checkInterval);
                showToast('Erro: Biblioteca PDF não carregou. Recarregue a página (F5).', 'error');
            }
        }, 500);
        return;
    }
    
    gerarPDFPropostaInterno(pregao, comAssinatura);
}

async function gerarPDFPropostaInterno(pregao, comAssinatura = true) {
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
            
            continuarGeracaoPDFProposta(doc, pregao, dadosBancarios, y, margin, pageWidth, pageHeight, lineHeight, maxWidth, addTextWithWrap, comAssinatura);
            
        } catch (e) {
            console.log('Erro ao adicionar logo:', e);
            y = 25;
            continuarGeracaoPDFProposta(doc, pregao, dadosBancarios, y, margin, pageWidth, pageHeight, lineHeight, maxWidth, addTextWithWrap, comAssinatura);
        }
    };
    
    logoHeader.onerror = function() {
        console.log('Erro ao carregar logo, gerando PDF sem ela');
        y = 25;
        continuarGeracaoPDFProposta(doc, pregao, dadosBancarios, y, margin, pageWidth, pageHeight, lineHeight, maxWidth, addTextWithWrap, comAssinatura);
    };
}

function continuarGeracaoPDFProposta(doc, pregao, dadosBancarios, y, margin, pageWidth, pageHeight, lineHeight, maxWidth, addTextWithWrap, comAssinatura = true, gruposEstrutura = null) {
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
        
        function paginaCheia(yAtual, espaco = 40) {
            return yAtual > pageHeight - footerMargin - espaco;
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
        
        // Rodapé em todas as páginas (empresa)
        const footerH = 8;
        const footerText = 'I.R. COMÉRCIO E MATERIAIS ELÉTRICOS LTDA  |  CNPJ: 33.149.502/0001-38  |  RUA TADORNA Nº 472, SALA 2, NOVO HORIZONTE – SERRA/ES  |  (27) 3209-4291';
        function addFooter(docRef) {
            const totalPags = docRef.internal.getNumberOfPages();
            for (let pg = 1; pg <= totalPags; pg++) {
                docRef.setPage(pg);
                docRef.setFontSize(7.5);
                docRef.setFont(undefined, 'normal');
                docRef.setTextColor(150, 150, 150);
                const fy = pageHeight - 4;
                docRef.text(footerText, pageWidth / 2, fy, { align: 'center' });
                docRef.setTextColor(0, 0, 0);
            }
        }
        
        // Redefinir pageHeight com margem de rodapé
        const footerMargin = 14; // espaço reservado para rodapé
        
        // Título
        doc.setFontSize(18);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text('PROPOSTA', pageWidth / 2, y, { align: 'center' });
        
        y += 8;
        doc.setFontSize(14);
        doc.text(`${pregao.numero_pregao}${pregao.uasg ? ' - ' + pregao.uasg : ''}`, pageWidth / 2, y, { align: 'center' });
        
        y += 12;
        
        const fs = 10;
        doc.setFontSize(fs);
        doc.setTextColor(0, 0, 0);
        
        // Dados da empresa (fixos — sempre presentes)
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
        
        // Destinatário — só mostra campos preenchidos
        doc.text('AO', margin, y);
        y += lineHeight + 1;
        if (pregao.nome_orgao) {
            doc.setFont(undefined, 'bold');
            doc.text(toUpperCase(pregao.nome_orgao), margin, y);
            doc.setFont(undefined, 'normal');
            y += lineHeight + 1;
        }
        doc.text('COMISSÃO PERMANENTE DE LICITAÇÃO', margin, y);
        y += lineHeight + 1;
        doc.text(`PREGÃO ELETRÔNICO: ${pregao.numero_pregao}${pregao.uasg ? '  UASG: ' + pregao.uasg : ''}`, margin, y);
        y += 10;
        
        if (y > pageHeight - footerMargin - 50) {
            y = addPageWithHeader();
        }
        
        // Utilitários de formatação
        const fmtValorPdf = (v, decimals = 2) => {
            return 'R$ ' + (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
        };
        const fmtUntPdf = (v) => {
            const n = v || 0;
            const s = n.toFixed(4).replace(/(\.(\d*?)?)0+$/, '$1').replace(/\.$/, '');
            return 'R$ ' + parseFloat(s || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
        };

        const tableWidth = pageWidth - (2 * margin);
        const colWidths = {
            item:     tableWidth * 0.05,
            descricao:tableWidth * 0.30,
            qtd:      tableWidth * 0.06,
            unid:     tableWidth * 0.05,
            marca:    tableWidth * 0.12,
            modelo:   tableWidth * 0.12,
            vunt:     tableWidth * 0.14,
            total:    tableWidth * 0.16
        };
        const itemRowHeight = 10;

        // Função para desenhar cabeçalho da tabela
        function desenharCabecalhoTabela() {
            doc.setFillColor(108, 117, 125);
            doc.setDrawColor(180, 180, 180);
            doc.rect(margin, y, tableWidth, itemRowHeight, 'FD');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(7.5);
            doc.setFont(undefined, 'bold');
            let xp = margin;
            [['ITEM', colWidths.item], ['DESCRIÇÃO', colWidths.descricao], ['QTD', colWidths.qtd],
             ['UN', colWidths.unid], ['MARCA', colWidths.marca], ['MODELO', colWidths.modelo],
             ['VD. UNT', colWidths.vunt], ['VD. TOTAL', colWidths.total]].forEach(([lbl, w]) => {
                doc.line(xp, y, xp, y + itemRowHeight);
                doc.text(lbl, xp + w / 2, y + 6.5, { align: 'center' });
                xp += w;
            });
            doc.line(xp, y, xp, y + itemRowHeight);
            y += itemRowHeight;
            doc.setTextColor(0, 0, 0);
            doc.setFontSize(7.5);
            doc.setFont(undefined, 'normal');
        }

        // Função para desenhar uma linha de item
        function desenharLinhaItem(item, rowIndex) {
            const descricaoUpper = toUpperCase(item.descricao);
            const descLines = doc.splitTextToSize(descricaoUpper, colWidths.descricao - 4);
            const marcaWrap = doc.splitTextToSize(item.marca || '-', colWidths.marca - 2);
            const modeloWrap = doc.splitTextToSize(item.modelo || '-', colWidths.modelo - 2);
            const lineCount = Math.max(descLines.length, marcaWrap.length, modeloWrap.length);
            const rowH = Math.max(itemRowHeight, lineCount * 3.5 + 4);
            if (paginaCheia(y, rowH + 10)) {
                y = addPageWithHeader();
                desenharCabecalhoTabela();
            }
            const rowBg = (rowIndex % 2 === 0) ? [255,255,255] : [247,248,250];
            doc.setFillColor(...rowBg);
            doc.setDrawColor(180, 180, 180);
            doc.rect(margin, y, tableWidth, rowH, 'FD');
            let xp = margin;
            const cy = y + (rowH / 2) + 1.5;
            doc.line(xp, y, xp, y + rowH);
            doc.text(String(item.numero), xp + colWidths.item/2, cy, { align: 'center' });
            xp += colWidths.item; doc.line(xp, y, xp, y + rowH);
            let yt = y + 4; descLines.forEach(l => { doc.text(l, xp + 2, yt); yt += 3.5; });
            xp += colWidths.descricao; doc.line(xp, y, xp, y + rowH);
            doc.text(String(item.qtd || 1), xp + colWidths.qtd/2, cy, { align: 'center' });
            xp += colWidths.qtd; doc.line(xp, y, xp, y + rowH);
            doc.text(item.unidade || 'UN', xp + colWidths.unid/2, cy, { align: 'center' });
            xp += colWidths.unid; doc.line(xp, y, xp, y + rowH);
            let ym = y + 4; marcaWrap.forEach(ml => { doc.text(ml, xp + colWidths.marca/2, ym, { align:'center' }); ym += 3.5; });
            xp += colWidths.marca; doc.line(xp, y, xp, y + rowH);
            let ymo = y + 4; modeloWrap.forEach(ml => { doc.text(ml, xp + colWidths.modelo/2, ymo, { align:'center' }); ymo += 3.5; });
            xp += colWidths.modelo; doc.line(xp, y, xp, y + rowH);
            const vlns = doc.splitTextToSize(fmtUntPdf(item.venda_unt), colWidths.vunt - 2);
            let yvu = y + 4; vlns.forEach(vl => { doc.text(vl, xp + colWidths.vunt/2, yvu, { align:'center' }); yvu += 3.5; });
            xp += colWidths.vunt; doc.line(xp, y, xp, y + rowH);
            const vtlns = doc.splitTextToSize(fmtValorPdf(item.venda_total), colWidths.total - 2);
            let yvt = y + 4; vtlns.forEach(vl => { doc.text(vl, xp + colWidths.total/2, yvt, { align:'center' }); yvt += 3.5; });
            xp += colWidths.total; doc.line(xp, y, xp, y + rowH);
            y += rowH;
        }

        function desenharRodapeTabela(totalValor) {
            doc.setFillColor(240, 240, 240);
            doc.setFont(undefined, 'bold');
            doc.rect(margin, y, tableWidth, 8, 'FD');
            doc.text('TOTAL GERAL:', margin + tableWidth - colWidths.total - colWidths.vunt - 4, y + 5.5, { align: 'right' });
            doc.text(fmtValorPdf(totalValor), margin + tableWidth - 2, y + 5.5, { align: 'right' });
            doc.setFont(undefined, 'normal');
            y += 8;
        }

        // MODO GRUPOS: uma tabela por grupo
        if (gruposEstrutura) {
            doc.setFontSize(11); doc.setFont(undefined, 'bold');
            doc.text('ITENS DA PROPOSTA', margin, y);
            y += 8;
            let totalGeralGlobal = 0;
            gruposEstrutura.forEach(({ grupo, itens: iGrupo }) => {
                if (paginaCheia(y, 30)) y = addPageWithHeader();
                // Título do grupo
                doc.setFontSize(10); doc.setFont(undefined, 'bold');
                doc.text(`${grupo.tipo} ${grupo.numero}`, margin, y);
                y += 6;
                desenharCabecalhoTabela();
                iGrupo.forEach((item, idx) => desenharLinhaItem(item, idx));
                const totalGrupo = iGrupo.reduce((acc, i) => acc + (i.venda_total || 0), 0);
                totalGeralGlobal += totalGrupo;
                desenharRodapeTabela(totalGrupo);
                y += 6;
            });
            // Total global final
            if (gruposEstrutura.length > 1) {
                doc.setFillColor(80, 80, 80); doc.setFont(undefined, 'bold');
                doc.setTextColor(255,255,255);
                doc.rect(margin, y, tableWidth, 8, 'FD');
                doc.text('TOTAL GLOBAL:', margin + tableWidth - colWidths.total - colWidths.vunt - 4, y + 5.5, { align: 'right' });
                doc.text(fmtValorPdf(totalGeralGlobal), margin + tableWidth - 2, y + 5.5, { align: 'right' });
                doc.setTextColor(0,0,0); doc.setFont(undefined, 'normal');
                y += 8;
            }
        } else {
            // MODO ITEM: tabela única
            doc.setFontSize(11); doc.setFont(undefined, 'bold');
            doc.text('ITENS DA PROPOSTA', margin, y);
            y += 6;
            desenharCabecalhoTabela();
            const itensSelecionados = itens.filter(item => item.ganho);
            itensSelecionados.forEach((item, index) => desenharLinhaItem(item, index));
            const totalGeral = itensSelecionados.reduce((acc, item) => acc + (item.venda_total || 0), 0);
            desenharRodapeTabela(totalGeral);
        }

        y += 8;
        
        if (y > pageHeight - footerMargin - 60) {
            y = addPageWithHeader();
        }
        
        // Condições — somente campos preenchidos
        doc.setFontSize(10);
        
        function addCampoCondicao(label, valor) {
            if (!valor || valor.toString().trim() === '') return;
            doc.setFont(undefined, 'bold');
            const lw = doc.getTextWidth(label + ': ');
            doc.text(label + ': ', margin, y);
            doc.setFont(undefined, 'normal');
            const linhas = doc.splitTextToSize(valor.toString(), maxWidth - lw);
            doc.text(linhas[0], margin + lw, y);
            y += lineHeight;
            for (let i = 1; i < linhas.length; i++) {
                doc.text(linhas[i], margin, y);
                y += lineHeight;
            }
        }
        
        addCampoCondicao('VALIDADE DA PROPOSTA', pregao.validade_proposta);
        addCampoCondicao('PRAZO DE ENTREGA', pregao.prazo_entrega);
        addCampoCondicao('FORMA DE PAGAMENTO', pregao.prazo_pagamento);
        
        if (dadosBancarios) {
            addCampoCondicao('DADOS BANCÁRIOS', dadosBancarios);
        }
        
        y += 6;
        
        if (y > pageHeight - footerMargin - 60) {
            y = addPageWithHeader();
        }
        
        // Declarações — uppercase, centralizadas, cada uma em linha separada
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        const declaracoes = [
            'DECLARAMOS QUE NOS PREÇOS COTADOS ESTÃO INCLUÍDAS TODAS AS DESPESAS TAIS COMO FRETE (CIF), IMPOSTOS, TAXAS, SEGUROS, TRIBUTOS E DEMAIS ENCARGOS DE QUALQUER NATUREZA INCIDENTES SOBRE O OBJETO DO PREGÃO.',
            'DECLARAMOS QUE SOMOS OPTANTES PELO SIMPLES NACIONAL.',
            'DECLARAMOS QUE O OBJETO FORNECIDO NÃO É REMANUFATURADO OU RECONDICIONADO.'
        ];
        declaracoes.forEach(decl => {
            if (paginaCheia(y, 20)) y = addPageWithHeader();
            const linhas = doc.splitTextToSize(decl, maxWidth);
            linhas.forEach(linha => {
                if (paginaCheia(y, 10)) y = addPageWithHeader();
                doc.text(linha, pageWidth / 2, y, { align: 'center' });
                y += lineHeight;
            });
            y += 3;
        });
        
        y += 12;
        
        if (y > pageHeight - footerMargin - 40) {
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
        
        if (comAssinatura) {
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
                    
                    const nomeArquivo = `PROPOSTA-${pregao.numero_pregao}${pregao.uasg ? '-' + pregao.uasg : ''}.pdf`;
                    addFooter(doc);
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
        } else {
            gerarPDFSemAssinatura();
        }
        
        function gerarPDFSemAssinatura() {
            // Espaço em branco para assinatura manual/digital
            y += 20;
            doc.setDrawColor(0, 0, 0);
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
            
            const nomeArquivo = `PROPOSTA-${pregao.numero_pregao}${pregao.uasg ? '-' + pregao.uasg : ''}.pdf`;
            addFooter(doc);
            doc.save(nomeArquivo);
            showToast('PDF gerado (sem assinatura)', 'success');
        }
    }
}
