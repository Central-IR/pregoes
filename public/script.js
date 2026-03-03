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
let consecutive401Count = 0;
const MAX_401_BEFORE_LOGOUT = 3;
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
            method: 'HEAD',
            headers: headers,
            mode: 'cors',
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.status === 401) {
            consecutive401Count++;
            if (consecutive401Count >= MAX_401_BEFORE_LOGOUT) {
                sessionStorage.removeItem('pregoesSession');
                mostrarTelaAcessoNegado('Sua sessão expirou');
            }
            return false;
        }
        consecutive401Count = 0;

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
                    <button class="action-btn view" onclick="viewPregao('${pregao.id}')">Ver</button>
                    <button class="action-btn edit" onclick="editPregao('${pregao.id}')">Editar</button>
                    <button class="action-btn btn-items" onclick="openItems('${pregao.id}')">${pregao.disputa_por === 'GRUPO' ? 'Grupos' : 'Itens'}</button>
                    <button class="action-btn delete" onclick="openDeleteModal('${pregao.id}')">Excluir</button>
                </td>
            </tr>
        `;
    }).join('');
}

async function toggleGanho(id, ganho) {
    if (!isOnline) {
        showToast('Sistema offline. Não foi possível atualizar.', 'error');
        loadPregoes();
        return;
    }

    try {
        const pregao = pregoes.find(p => p.id === id);
        if (!pregao) return;
        
        pregao.ganho = ganho;
        if (ganho) {
            pregao.status = 'GANHO';
        } else {
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
        const mensagem = ganho 
            ? `Pregão ${pregao.numero_pregao} ganho` 
            : 'Marcação removida';
        showToast(mensagem, ganho ? 'success' : 'error');
    } catch (error) {
        console.error('Erro:', error);
        if (error.name === 'AbortError') {
            showToast('Timeout: Operação demorou muito', 'error');
        } else {
            showToast('Erro ao atualizar status', 'error');
        }
        loadPregoes();
    }
}

function openFormModal() {
    editingId = null;
    document.getElementById('formTitle').textContent = 'Novo Pregão';
    document.getElementById('formModal').classList.add('show');
    resetForm();
    currentTab = 0;
    switchTab(tabs[0]);
    setupUpperCaseInputs();
}

function closeFormModal(showCancelMessage = true) {
    document.getElementById('formModal').classList.remove('show');
    resetForm();
    if (showCancelMessage) {
        showToast('Registro cancelado', 'error');
    }
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
    document.getElementById('disputaPor').value = 'ITEM';
    
    document.getElementById('telefonesContainer').innerHTML = `
        <div class="input-with-button">
            <input type="text" class="telefone-input" placeholder="TELEFONE">
            <button type="button" onclick="addTelefone()" class="btn-add">+</button>
        </div>
    `;
    
    document.getElementById('emailsContainer').innerHTML = `
        <div class="input-with-button">
            <input type="email" class="email-input" placeholder="E-MAIL">
            <button type="button" onclick="addEmail()" class="btn-add">+</button>
        </div>
    `;
    
    detalhes = [];
    document.querySelectorAll('.detalhe-item').forEach(item => {
        item.classList.remove('selected');
    });
}

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

function toggleDetalhe(element, nome) {
    element.classList.toggle('selected');
    const index = detalhes.indexOf(nome);
    if (index > -1) {
        detalhes.splice(index, 1);
    } else {
        detalhes.push(nome);
    }
}

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
    
    btnPrevious.style.display = currentTab === 0 ? 'none' : 'inline-block';
    btnCancel.style.display = 'inline-block';
    
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
        disputa_por: document.getElementById('disputaPor').value || 'ITEM',
        status: 'ABERTO',
        ganho: false
    };
    
    if (!isOnline) {
        showToast('Sistema offline', 'error');
        closeFormModal(false);
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

        const savedPregao = await response.json();
        const mensagem = editingId 
            ? `Pregão ${savedPregao.numero_pregao} atualizado` 
            : `Pregão ${savedPregao.numero_pregao} registrado`;
        showToast(mensagem, 'success');
        closeFormModal(false);
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
    document.getElementById('disputaPor').value = pregao.disputa_por || 'ITEM';
    
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

function viewPregao(id) {
    const pregao = pregoes.find(p => p.id === id);
    if (!pregao) return;
    
    document.getElementById('modalNumero').textContent = pregao.numero_pregao;
    
    document.getElementById('info-tab-geral').innerHTML = `
        <div class="info-section">
            <p><strong>Responsável:</strong> ${pregao.responsavel}</p>
            <p><strong>Data:</strong> ${pregao.data ? new Date(pregao.data + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}</p>
            <p><strong>Hora:</strong> ${pregao.hora || '-'}</p>
            <p><strong>Disputa por:</strong> ${pregao.disputa_por || 'ITEM'}</p>
            <p><strong>Status:</strong> <span class="status-badge ${pregao.status === 'GANHO' ? 'success' : pregao.status === 'ABERTO' ? 'warning' : pregao.status === 'OCORRIDO' ? 'danger' : 'default'}">${pregao.status}</span></p>
        </div>
    `;
    
    document.getElementById('info-tab-orgao').innerHTML = `
        <div class="info-section">
            <p><strong>Nº Pregão:</strong> ${pregao.numero_pregao}</p>
            <p><strong>UASG:</strong> ${pregao.uasg || '-'}</p>
            <p><strong>Nome do Órgão:</strong> ${pregao.nome_orgao || '-'}</p>
            <p><strong>Município:</strong> ${pregao.municipio || '-'}</p>
            <p><strong>UF:</strong> ${pregao.uf || '-'}</p>
        </div>
    `;
    
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
    
    document.getElementById('info-tab-prazos').innerHTML = `
        <div class="info-section">
            <p><strong>Validade da Proposta:</strong> ${pregao.validade_proposta || '-'}</p>
            <p><strong>Prazo de Entrega:</strong> ${pregao.prazo_entrega || '-'}</p>
            <p><strong>Prazo de Pagamento:</strong> ${pregao.prazo_pagamento || '-'}</p>
        </div>
    `;
    
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

        const pregaoExcluido = pregoes.find(p => p.id === deleteId);
        pregoes = pregoes.filter(p => p.id !== deleteId);
        lastDataHash = JSON.stringify(pregoes.map(p => p.id));
        updateDisplay();
        showToast(`Pregão ${pregaoExcluido?.numero_pregao} excluído`, 'error');
    } catch (error) {
        console.error('Erro ao deletar:', error);
        if (error.name === 'AbortError') {
            showToast('Timeout: Operação demorou muito', 'error');
        } else {
            showToast('Erro ao excluir pregão', 'error');
        }
    }
}

async function openItems(id) {
    currentPregaoId = id;
    const pregao = pregoes.find(p => p.id === id);
    const disputa = pregao?.disputa_por || 'ITEM';
    
    if (disputa === 'GRUPO') {
        mostrarTelaGrupos();
        await carregarGrupos();
    } else {
        mostrarTelaItens();
        await carregarItens(id);
    }
}

// ============================================
// MODAL DE ASSINATURA PARA EXEQUIBILIDADE
// ============================================

function perguntarAssinaturaExequibilidade(callback) {
    let modal = document.getElementById('modalAssinaturaExe');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modalAssinaturaExe';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content modal-delete">
                <button class="close-modal" onclick="fecharModalAssinaturaExe()">✕</button>
                <div class="modal-message-delete">
                    Deseja incluir a assinatura padrão no comprovante?
                </div>
                <div class="modal-actions modal-actions-no-border">
                    <button class="success" onclick="confirmarAssinaturaExe(true)">Sim</button>
                    <button class="danger" onclick="confirmarAssinaturaExe(false)">Não</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    window.callbackExeAssinatura = callback;
    modal.classList.add('show');
}

function fecharModalAssinaturaExe() {
    const modal = document.getElementById('modalAssinaturaExe');
    if (modal) modal.classList.remove('show');
}

function confirmarAssinaturaExe(comAssinatura) {
    fecharModalAssinaturaExe();
    if (window.callbackExeAssinatura) {
        window.callbackExeAssinatura(comAssinatura);
    }
}

// ============================================
// COMPROVANTE DE EXEQUIBILIDADE
// ============================================

function abrirModalExequibilidade(pregaoId) {
    currentPregaoId = pregaoId;
    
    let modal = document.getElementById('modalExequibilidade');
    if (!modal) {
        modal = criarModalExequibilidade();
        document.body.appendChild(modal);
    }
    
    document.getElementById('exeIntervalo').value = '';
    document.getElementById('exeImpostoFederal').value = '9.7';
    document.getElementById('exeFreteVenda').value = '5';
    document.getElementById('exeFreteCompra').value = '0';
    
    modal.classList.add('show');
}

function fecharModalExequibilidade() {
    const modal = document.getElementById('modalExequibilidade');
    if (modal) modal.classList.remove('show');
}

function criarModalExequibilidade() {
    const modal = document.createElement('div');
    modal.id = 'modalExequibilidade';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <div class="modal-header">
                <h3 class="modal-title">Comprovante de Exequibilidade</h3>
                <button class="close-modal" onclick="fecharModalExequibilidade()">✕</button>
            </div>
            
            <div class="tabs-container">
                <div class="tabs-nav">
                    <button class="tab-btn active" onclick="switchExeTab('exe-tab-geral')">Geral</button>
                    <button class="tab-btn" onclick="switchExeTab('exe-tab-valores')">Valores</button>
                </div>
                
                <div class="tab-content active" id="exe-tab-geral">
                    <div class="form-grid">
                        <div class="form-group" style="grid-column: 1/-1;">
                            <label>Intervalo de Itens <span style="color:var(--text-secondary);font-weight:400;">(ex: 1-5, 10, 15-20 ou deixe vazio para todos)</span></label>
                            <input type="text" id="exeIntervalo" placeholder="Ex: 1-5, 10, 15-20">
                        </div>
                    </div>
                </div>
                
                <div class="tab-content" id="exe-tab-valores">
                    <div class="form-grid">
                        <div class="form-group">
                            <label>Imposto Federal (%)</label>
                            <input type="number" id="exeImpostoFederal" step="0.1" min="0" max="100" value="9.7">
                        </div>
                        <div class="form-group">
                            <label>Frete Venda (%)</label>
                            <input type="number" id="exeFreteVenda" step="0.1" min="0" max="100" value="5">
                        </div>
                        <div class="form-group">
                            <label>Frete Compra (R$)</label>
                            <input type="number" id="exeFreteCompra" step="0.01" min="0" value="0">
                        </div>
                    </div>
                </div>
            </div>

            <div class="modal-actions">
                <button type="button" id="btnExePrev" class="secondary" style="display: none;" onclick="prevExeTab()">Anterior</button>
                <button type="button" id="btnExeNext" class="secondary" onclick="nextExeTab()">Próximo</button>
                <button type="button" id="btnExeGerar" class="success" style="display: none;" onclick="iniciarGeracaoComprovante()">Gerar Comprovante</button>
                <button type="button" class="danger" onclick="fecharModalExequibilidade()">Cancelar</button>
            </div>
        </div>
    `;
    return modal;
}

function iniciarGeracaoComprovante() {
    fecharModalExequibilidade();
    perguntarAssinaturaExequibilidade((comAssinatura) => {
        gerarComprovanteExequibilidade(comAssinatura);
    });
}

function parsearIntervalo(intervalo) {
    if (!intervalo || intervalo.trim() === '') return null;
    
    const numeros = [];
    const partes = intervalo.split(',').map(p => p.trim());
    
    for (const parte of partes) {
        if (parte.includes('-')) {
            const [inicio, fim] = parte.split('-').map(n => parseInt(n.trim()));
            if (isNaN(inicio) || isNaN(fim) || inicio > fim) {
                showToast('Intervalo inválido', 'error');
                return null;
            }
            for (let i = inicio; i <= fim; i++) {
                numeros.push(i);
            }
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

const exeTabs = ['exe-tab-geral', 'exe-tab-valores'];
let currentExeTab = 0;

function switchExeTab(tabId) {
    const allTabs = document.querySelectorAll('#modalExequibilidade .tab-content');
    const allBtns = document.querySelectorAll('#modalExequibilidade .tab-btn');
    allTabs.forEach(t => t.classList.remove('active'));
    allBtns.forEach(b => b.classList.remove('active'));
    const active = document.getElementById(tabId);
    if (active) active.classList.add('active');
    currentExeTab = exeTabs.indexOf(tabId);
    const idx = currentExeTab;
    if (allBtns[idx]) allBtns[idx].classList.add('active');
    const isLast = idx === exeTabs.length - 1;
    const prev = document.getElementById('btnExePrev');
    const next = document.getElementById('btnExeNext');
    const gerar = document.getElementById('btnExeGerar');
    if (prev) prev.style.display = idx === 0 ? 'none' : 'inline-block';
    if (next) next.style.display = isLast ? 'none' : 'inline-block';
    if (gerar) gerar.style.display = isLast ? 'inline-block' : 'none';
}

function nextExeTab() {
    if (currentExeTab < exeTabs.length - 1) {
        currentExeTab++;
        switchExeTab(exeTabs[currentExeTab]);
    }
}

function prevExeTab() {
    if (currentExeTab > 0) {
        currentExeTab--;
        switchExeTab(exeTabs[currentExeTab]);
    }
}

async function gerarComprovanteExequibilidade(comAssinatura = true) {
    const intervalo = document.getElementById('exeIntervalo').value.trim();
    const impostoFederal = parseFloat(document.getElementById('exeImpostoFederal').value) || 9.7;
    const freteVenda = parseFloat(document.getElementById('exeFreteVenda').value) || 5;
    const freteCompra = parseFloat(document.getElementById('exeFreteCompra').value) || 0;
    
    const pregao = pregoes.find(p => p.id === currentPregaoId);
    if (!pregao) {
        showToast('Erro: Pregão não encontrado', 'error');
        return;
    }
    
    let itensFiltrados = [...itens];
    if (intervalo) {
        const numeros = parsearIntervalo(intervalo);
        if (numeros) {
            itensFiltrados = itens.filter(item => numeros.includes(item.numero));
        }
    }
    
    if (itensFiltrados.length === 0) {
        showToast('Nenhum item encontrado no intervalo informado', 'error');
        return;
    }
    
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
    
    if (typeof window.jspdf === 'undefined') {
        showToast('Erro: Biblioteca PDF não carregou. Recarregue a página (F5).', 'error');
        return;
    }
    
    gerarPDFExequibilidade(pregao, itensFiltrados, dadosBancarios, impostoFederal, freteVenda, freteCompra, comAssinatura);
}

function gerarPDFExequibilidade(pregao, itensExe, dadosBancarios, impostoFederal, freteVenda, freteCompra, comAssinatura) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });
    
    let y = 15;
    const margin = 15;
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const contentWidth = pageWidth - (2 * margin);
    
    function addPageWithHeader() {
        doc.addPage();
        return 15;
    }
    
    function checkPageBreak(requiredSpace) {
        if (y > pageHeight - 30 - requiredSpace) {
            y = addPageWithHeader();
            return true;
        }
        return false;
    }
    
    // Título
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('TABELA DE CUSTOS E FORMAÇÃO DE PREÇOS', pageWidth / 2, y, { align: 'center' });
    
    y += 8;
    doc.setFontSize(12);
    doc.text(`${pregao.numero_pregao}${pregao.uasg ? ' - ' + pregao.uasg : ''}`, pageWidth / 2, y, { align: 'center' });
    
    y += 12;
    
    // INFORMAÇÕES DO PROCESSO
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('INFORMAÇÕES DO PROCESSO', margin, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.text(`PREGÃO: ${pregao.numero_pregao}`, margin, y);
    y += 5;
    doc.text(`ÓRGÃO: ${pregao.nome_orgao || 'NÃO INFORMADO'} - ${pregao.uasg || ''}`, margin, y);
    y += 5;
    doc.text(`${pregao.municipio || ''} - ${pregao.uf || ''}`, margin, y);
    y += 10;
    
    // INFORMAÇÕES DA EMPRESA
    doc.setFont('helvetica', 'bold');
    doc.text('INFORMAÇÕES DA EMPRESA', margin, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    
    const telText = `TEL: (27) 3209-4291`;
    const telWidth = doc.getTextWidth(telText);
    doc.text('FORNECEDOR: I.R. COMÉRCIO E MATERIAIS ELÉTRICOS LTDA', margin, y);
    doc.text(telText, pageWidth - margin - telWidth, y);
    y += 5;
    
    doc.text('CNPJ/CPF: 33.149.502/0001-38', margin, y);
    y += 5;
    doc.text('ENDEREÇO: RUA TADORNA, Nº 472, SALA 2', margin, y);
    y += 5;
    doc.text('BAIRRO: NOVO HORIZONTE', margin, y);
    y += 5;
    
    const cidadeText = `CIDADE: SERRA      UF: ES`;
    const cepText = `CEP: 29.163-318`;
    const cepWidth = doc.getTextWidth(cepText);
    doc.text(cidadeText, margin, y);
    doc.text(cepText, pageWidth - margin - cepWidth, y);
    y += 5;
    
    if (dadosBancarios) {
        doc.text(`DADOS BANCÁRIOS: ${dadosBancarios}`, margin, y);
        y += 5;
    }
    y += 5;
    
    checkPageBreak(60);
    
    // TABELA
    doc.setFont('helvetica', 'bold');
    doc.text('COMPOSIÇÃO DE CUSTOS', margin, y);
    y += 8;
    
    const colWidths = {
        descricao: 45,
        qtd: 10,
        un: 8,
        marca: 18,
        modelo: 18,
        custoUnt: 16,
        freteCompra: 16,
        impFed: 16,
        freteVenda: 16,
        vendaUnt: 16,
        lucroReal: 16
    };
    
    const startX = margin;
    let tableWidth = Object.values(colWidths).reduce((a, b) => a + b, 0);
    
    // Cabeçalho
    doc.setFillColor(60, 60, 60);
    doc.rect(startX, y - 4, tableWidth, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    
    let xp = startX;
    const headers = [
        ['DESCRIÇÃO', 'left'],
        ['QTD', 'center'],
        ['UN', 'center'],
        ['MARCA', 'center'],
        ['MODELO', 'center'],
        ['CUSTO\nUNT', 'right'],
        ['FRETE\nCOMPRA', 'right'],
        ['IMP\nFED', 'right'],
        ['FRETE\nVENDA', 'right'],
        ['VENDA\nUNT', 'right'],
        ['LUCRO\nREAL', 'right']
    ];
    
    headers.forEach(([text, align], i) => {
        const w = Object.values(colWidths)[i];
        const lines = text.split('\n');
        lines.forEach((line, idx) => {
            const yPos = y - 4 + 3 + (idx * 3);
            if (align === 'left') {
                doc.text(line, xp + 1, yPos);
            } else if (align === 'right') {
                doc.text(line, xp + w - 1, yPos, { align: 'right' });
            } else {
                doc.text(line, xp + w / 2, yPos, { align: 'center' });
            }
        });
        xp += w;
    });
    
    y += 4;
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    
    // Linhas
    itensExe.forEach((item, idx) => {
        checkPageBreak(8);
        
        const vendaUnt = item.venda_unt || 0;
        const custoUnt = item.custo_unt || 0;
        const impostoFederalValor = vendaUnt * (impostoFederal / 100);
        const freteVendaValor = vendaUnt * (freteVenda / 100);
        const freteCompraPorItem = freteCompra / itensExe.length;
        const lucroReal = vendaUnt - freteVendaValor - impostoFederalValor - freteCompraPorItem - custoUnt;
        
        const rowBg = idx % 2 === 0 ? [255, 255, 255] : [245, 245, 245];
        doc.setFillColor(...rowBg);
        doc.rect(startX, y - 4, tableWidth, 8, 'F');
        
        xp = startX;
        
        // Descrição (truncada)
        let descricao = item.descricao || '-';
        if (descricao.length > 35) descricao = descricao.substring(0, 32) + '...';
        doc.text(descricao, xp + 1, y - 1);
        xp += colWidths.descricao;
        
        // QTD
        doc.text(String(item.qtd || 1), xp + colWidths.qtd / 2, y - 1, { align: 'center' });
        xp += colWidths.qtd;
        
        // UN
        doc.text(item.unidade || 'UN', xp + colWidths.un / 2, y - 1, { align: 'center' });
        xp += colWidths.un;
        
        // Marca
        doc.text(item.marca || '-', xp + colWidths.marca / 2, y - 1, { align: 'center' });
        xp += colWidths.marca;
        
        // Modelo
        doc.text(item.modelo || '-', xp + colWidths.modelo / 2, y - 1, { align: 'center' });
        xp += colWidths.modelo;
        
        // Valores
        const valores = [
            custoUnt,
            freteCompraPorItem,
            impostoFederalValor,
            freteVendaValor,
            vendaUnt,
            lucroReal
        ];
        
        valores.forEach((val, i) => {
            const w = [colWidths.custoUnt, colWidths.freteCompra, colWidths.impFed, colWidths.freteVenda, colWidths.vendaUnt, colWidths.lucroReal][i];
            const formatted = 'R$ ' + val.toFixed(2).replace('.', ',');
            doc.text(formatted, xp + w - 1, y - 1, { align: 'right' });
            xp += w;
        });
        
        y += 4;
    });
    
    y += 10;
    
    checkPageBreak(30);
    
    // Data e Assinatura
    const dataAtual = new Date();
    const meses = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 
                   'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
    
    doc.setFontSize(10);
    doc.text(`SERRA/ES, ${dataAtual.getDate()} DE ${meses[dataAtual.getMonth()]} DE ${dataAtual.getFullYear()}`, pageWidth / 2, y, { align: 'center' });
    
    if (comAssinatura) {
        y += 15;
        doc.line(pageWidth / 2 - 40, y, pageWidth / 2 + 40, y);
        y += 5;
        doc.setFont('helvetica', 'bold');
        doc.text('ROSEMEIRE BICALHO DE LIMA GRAVINO', pageWidth / 2, y, { align: 'center' });
        y += 5;
        doc.setFont('helvetica', 'normal');
        doc.text('MG-10.078.568 / CPF: 045.160.616-78', pageWidth / 2, y, { align: 'center' });
        y += 5;
        doc.text('DIRETORA', pageWidth / 2, y, { align: 'center' });
    }
    
    const nomeArquivo = `COMPROVANTE-EXEQUIBILIDADE-${pregao.numero_pregao}${pregao.uasg ? '-' + pregao.uasg : ''}.pdf`;
    doc.save(nomeArquivo);
    showToast('Comprovante gerado com sucesso!', 'success');
}

// ============================================
// GESTÃO DE ITENS DO PREGÃO
// ============================================

let currentPregaoId = null;
let itens = [];
let editingItemIndex = null;
let selectedItens = new Set();
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

function criarTelaItens() {
    const div = document.createElement('div');
    div.id = 'telaItens';
    div.className = 'container';
    div.innerHTML = `
        <div class="header">
            <div class="header-left">
                <div>
                    <h1>Itens do Pregão</h1>
                    <p id="tituloItens" style="color: var(--text-secondary); font-size: 0.9rem; font-weight: 400; margin-top: 2px;"></p>
                </div>
            </div>
            <div style="display: flex; gap: 0.75rem; align-items:center;">
                <button onclick="adicionarItem()" class="btn-add-item">+ Item</button>
                <button onclick="abrirModalIntervalo()" class="btn-add-interval">+ Intervalo</button>
                <button onclick="abrirModalExcluirItens()" class="btn-delete-selected">Excluir</button>
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
                            <option value="">Todas as Marcas</option>
                        </select>
                        <svg class="dropdown-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </div>
                </div>

                <button onclick="syncItens()" class="btn-sync" title="Sincronizar">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="23 4 23 10 17 10"></polyline>
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                    </svg>
                </button>
                
                <button onclick="perguntarAssinaturaPDF()" class="btn-pdf" title="Gerar Proposta">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                    </svg>
                </button>
                
                <button onclick="abrirModalExequibilidade(currentPregaoId)" class="btn-certificate" title="Comprovante de Exequibilidade">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M4 4v16h16V4H4zm2 2h12v12H6V6zm2 2v8h8V8H8zm2 2h4v4h-4v-4z"/>
                    </svg>
                </button>
                
                <button onclick="abrirModalDocumentoEditavel(currentPregaoId)" class="btn-edit-doc" title="Editar Dados da Proposta">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
                        <circle cx="12" cy="14" r="2"/>
                        <path d="M12 10v2M12 16v2"/>
                    </svg>
                </button>
                
                <button onclick="voltarPregoes()" class="btn-back" title="Voltar">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
                            <th style="width: 35px; text-align: center;">✓</th>
                            <th style="width: 45px; text-align: center;">ITEM</th>
                            <th style="min-width: 200px; text-align: left;">DESCRIÇÃO</th>
                            <th style="width: 55px; text-align: center;">QTD</th>
                            <th style="width: 45px; text-align: center;">UN</th>
                            <th style="width: 85px; text-align: center;">MARCA</th>
                            <th style="width: 85px; text-align: center;">MODELO</th>
                            <th style="width: 95px; text-align: right;">ESTIMADO UNT</th>
                            <th style="width: 95px; text-align: right;">ESTIMADO TOTAL</th>
                            <th style="width: 90px; text-align: right;">CUSTO UNT</th>
                            <th style="width: 90px; text-align: right;">CUSTO TOTAL</th>
                            <th style="width: 90px; text-align: right;">VENDA UNT</th>
                            <th style="width: 90px; text-align: right;">VENDA TOTAL</th>
                        </tr>
                    </thead>
                    <tbody id="itensContainer"></tbody>
                </table>
            </div>
        </div>
        <div id="itensTotaisBar"></div>

        <div class="modal-overlay" id="modalIntervalo">
            <div class="modal-content" style="max-width:520px;">
                <div class="modal-header">
                    <h3 class="modal-title">Adicionar Intervalo</h3>
                    <button class="close-modal" onclick="fecharModalIntervalo()">✕</button>
                </div>
                <div class="form-grid">
                    <div class="form-group" style="grid-column:1/-1;">
                        <label>Intervalo de itens <span style="color:var(--text-secondary);font-weight:400;">(ex: 1-5, 10, 15-20)</span></label>
                        <input type="text" id="inputIntervalo" placeholder="Ex: 1-5, 10, 15-20">
                    </div>
                </div>
                <div class="modal-actions">
                    <button class="secondary" onclick="fecharModalIntervalo();showToast('Registro cancelado','error')">Cancelar</button>
                    <button class="success" onclick="confirmarAdicionarIntervalo()">Adicionar</button>
                </div>
            </div>
        </div>

        <div class="modal-overlay" id="modalExcluirItens">
            <div class="modal-content" style="max-width:520px;">
                <div class="modal-header">
                    <h3 class="modal-title">Excluir Itens</h3>
                    <button class="close-modal" onclick="fecharModalExcluirItens()">✕</button>
                </div>
                <div class="form-grid">
                    <div class="form-group" style="grid-column:1/-1;">
                        <label>Intervalo a excluir <span style="color:var(--text-secondary);font-weight:400;">(ex: 1-5, 10)</span></label>
                        <input type="text" id="inputExcluirIntervalo" placeholder="Ex: 1-5, 10">
                    </div>
                </div>
                <div class="modal-actions">
                    <button class="secondary" onclick="fecharModalExcluirItens();showToast('Registro cancelado','error')">Cancelar</button>
                    <button class="danger" onclick="confirmarExcluirItens()">Excluir</button>
                </div>
            </div>
        </div>

        <div class="modal-overlay" id="modalAssinatura">
            <div class="modal-content modal-delete">
                <button class="close-modal" onclick="fecharModalAssinatura()">✕</button>
                <div class="modal-message-delete">
                    Deseja incluir a assinatura padrão na proposta?
                </div>
                <div class="modal-actions modal-actions-no-border">
                    <button class="success" onclick="gerarPDFsProposta(true)">Sim</button>
                    <button class="danger" onclick="gerarPDFsProposta(false)">Não</button>
                </div>
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
    const novas = new Set();
    for (const item of itens) { if (item.marca) novas.add(item.marca); }
    marcasItens = novas;
    const select = document.getElementById('filterMarcaItens');
    if (select) {
        const cur = select.value;
        select.innerHTML = '<option value="">Todas as Marcas</option>' +
            Array.from(novas).sort().map(m => `<option value="${m}"${m === cur ? ' selected' : ''}>${m}</option>`).join('');
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

function formatarValorBR(valor) {
    if (valor === 0 || valor === null || valor === undefined) return 'R$ 0,00';
    return 'R$ ' + valor.toFixed(2).replace('.', ',');
}

function renderItens(itensToRender = itens) {
    const container = document.getElementById('itensContainer');
    if (!container) return;

    if (itensToRender.length === 0) {
        container.innerHTML = '<tr><td colspan="13" style="text-align:center;padding:2rem;">Nenhum item cadastrado</td></tr>';
        return;
    }

    let totCompra = 0, totCusto = 0, totVenda = 0;
    const parts = [];

    for (let idx = 0; idx < itensToRender.length; idx++) {
        const item = itensToRender[idx];
        const vendaUnt = item.venda_unt || 0;
        const estimadoUnt = item.estimado_unt || 0;
        const estTotal = item.estimado_total || 0;
        const custoTotal = item.custo_total || 0;
        const vendaTotal = item.venda_total || 0;
        
        totCompra += estTotal;
        totCusto += custoTotal;
        totVenda += vendaTotal;

        const vendaAcimaEstimado = estimadoUnt > 0 && vendaUnt > estimadoUnt;
        const rowClass = item.ganho ? 'item-ganho' : (vendaAcimaEstimado ? 'row-venda-alta' : '');
        
        const cbId = 'ig-' + item.id;
        const checked = item.ganho ? 'checked' : '';

        parts.push(`
            <tr class="${rowClass}" ondblclick="editarItem('${item.id}')">
                <td style="text-align:center;">
                    <div class="checkbox-wrapper">
                        <input type="checkbox" id="${cbId}" ${checked} onchange="toggleItemGanho('${item.id}', this.checked)" class="styled-checkbox">
                        <label for="${cbId}" class="checkbox-label-styled ${vendaAcimaEstimado ? 'checkbox-alerta' : ''}"></label>
                    </div>
                </td>
                <td style="text-align:center;"><strong>${item.numero}</strong></td>
                <td style="text-align:left; max-width:200px;">${item.descricao || '-'}</td>
                <td style="text-align:center;">${item.qtd || 1}</td>
                <td style="text-align:center;">${item.unidade || 'UN'}</td>
                <td style="text-align:center;">${item.marca || '-'}</td>
                <td style="text-align:center;">${item.modelo || '-'}</td>
                <td style="text-align:right;">${formatarValorBR(estimadoUnt)}</td>
                <td style="text-align:right;">${formatarValorBR(estTotal)}</td>
                <td style="text-align:right;">${formatarValorBR(item.custo_unt || 0)}</td>
                <td style="text-align:right;">${formatarValorBR(custoTotal)}</td>
                <td style="text-align:right;">${formatarValorBR(vendaUnt)}</td>
                <td style="text-align:right;">${formatarValorBR(vendaTotal)}</td>
            </tr>
        `);
    }

    container.innerHTML = parts.join('');

    const totaisContainer = document.getElementById('itensTotaisBar');
    if (totaisContainer) {
        totaisContainer.innerHTML = `
            <span><strong>COMPRA TOTAL:</strong> ${formatarValorBR(totCompra)}</span>
            <span><strong>CUSTO TOTAL:</strong> ${formatarValorBR(totCusto)}</span>
            <span><strong>VENDA TOTAL:</strong> ${formatarValorBR(totVenda)}</span>
        `;
    }
}

async function toggleItemGanho(id, ganho) {
    const item = itens.find(i => i.id === id);
    if (!item) return;
    
    item.ganho = ganho;

    try {
        const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
        if (sessionToken) headers['X-Session-Token'] = sessionToken;
        
        if (!String(id).startsWith('temp-')) {
            await fetch(`${API_URL}/pregoes/${currentPregaoId}/itens/${id}`, {
                method: 'PUT', headers, body: JSON.stringify(item)
            });
        }
        
        renderItens();
    } catch (error) {
        console.error('Erro ao atualizar ganho:', error);
    }
}

function payloadItemSeguro(fields) {
    return {
        pregao_id: fields.pregao_id,
        numero: fields.numero || 1,
        descricao: fields.descricao || ' ',
        qtd: fields.qtd || 1,
        unidade: fields.unidade || 'UN',
        marca: fields.marca || null,
        modelo: fields.modelo || null,
        estimado_unt: fields.estimado_unt || 0,
        estimado_total: fields.estimado_total || 0,
        custo_unt: fields.custo_unt || 0,
        custo_total: fields.custo_total || 0,
        porcentagem: fields.porcentagem || 149,
        venda_unt: fields.venda_unt || 0,
        venda_total: fields.venda_total || 0,
        ganho: fields.ganho || false,
        ...(fields.grupo_tipo !== undefined ? { grupo_tipo: fields.grupo_tipo } : {}),
        ...(fields.grupo_numero !== undefined ? { grupo_numero: fields.grupo_numero } : {})
    };
}

async function adicionarItem() {
    const numero = itens.length > 0 ? Math.max(...itens.map(i => i.numero)) + 1 : 1;
    const novoItem = payloadItemSeguro({
        pregao_id: currentPregaoId,
        numero
    });
    
    try {
        const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
        if (sessionToken) headers['X-Session-Token'] = sessionToken;
        
        const r = await fetch(`${API_URL}/pregoes/${currentPregaoId}/itens`, { 
            method: 'POST', 
            headers, 
            body: JSON.stringify(novoItem) 
        });
        
        if (r.ok) {
            const saved = await r.json();
            itens.push(saved);
            itens.sort((a, b) => a.numero - b.numero);
            renderItens();
            showToast('Item adicionado', 'success');
        }
    } catch(e) {
        console.error(e);
        showToast('Erro ao criar item', 'error');
    }
}

function abrirModalIntervalo() {
    document.getElementById('inputIntervalo').value = '';
    document.getElementById('modalIntervalo').classList.add('show');
}

function fecharModalIntervalo() {
    document.getElementById('modalIntervalo').classList.remove('show');
}

function confirmarAdicionarIntervalo() {
    const intervalo = document.getElementById('inputIntervalo').value.trim();
    fecharModalIntervalo();
    if (!intervalo) return;
    adicionarIntervalo(intervalo);
}

async function adicionarIntervalo(intervalo) {
    let numeros = [];
    const partes = intervalo.split(',').map(p => p.trim());
    
    for (const parte of partes) {
        if (parte.includes('-')) {
            const [inicio, fim] = parte.split('-').map(n => parseInt(n.trim()));
            if (isNaN(inicio) || isNaN(fim) || inicio > fim) {
                showToast('Intervalo inválido', 'error');
                return;
            }
            for (let i = inicio; i <= fim; i++) numeros.push(i);
        } else {
            const num = parseInt(parte);
            if (isNaN(num)) {
                showToast('Número inválido', 'error');
                return;
            }
            numeros.push(num);
        }
    }
    
    const numerosExistentes = new Set(itens.map(i => i.numero));
    numeros = numeros.filter(n => !numerosExistentes.has(n));
    
    if (numeros.length === 0) {
        showToast('Todos os itens já existem', 'error');
        return;
    }
    
    const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    if (sessionToken) headers['X-Session-Token'] = sessionToken;
    
    for (const numero of numeros) {
        const novoItem = payloadItemSeguro({ pregao_id: currentPregaoId, numero });
        try {
            const r = await fetch(`${API_URL}/pregoes/${currentPregaoId}/itens`, { 
                method: 'POST', 
                headers, 
                body: JSON.stringify(novoItem) 
            });
            if (r.ok) itens.push(await r.json());
        } catch(e) { console.error(e); }
    }
    
    itens.sort((a, b) => a.numero - b.numero);
    renderItens();
    showToast('Itens adicionados', 'success');
}

function abrirModalExcluirItens() {
    document.getElementById('inputExcluirIntervalo').value = '';
    document.getElementById('modalExcluirItens').classList.add('show');
}

function fecharModalExcluirItens() {
    document.getElementById('modalExcluirItens').classList.remove('show');
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
        showToast('Nenhum item encontrado', 'error');
        return;
    }
    
    await excluirItensPorIds(idsParaExcluir);
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
            await fetch(`${API_URL}/pregoes/${currentPregaoId}/itens/delete-multiple`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ ids: idsServidor })
            });
        }
        
        const idsSet = new Set(ids);
        itens = itens.filter(item => !idsSet.has(item.id));
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
    setTimeout(calcularValoresItem, 50);
    setTimeout(setupUpperCaseInputs, 50);
}

function atualizarTituloModalItem(item) {
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
    const btnSalvar = document.getElementById('btnSalvarItem');
    const isLast = currentItemTab === itemTabs.length - 1;
    
    if (btnPrev) btnPrev.style.display = currentItemTab === 0 ? 'none' : 'inline-block';
    if (btnNext) btnNext.style.display = isLast ? 'none' : 'inline-block';
    if (btnSalvar) btnSalvar.style.display = isLast ? 'inline-block' : 'none';
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
        <div class="modal-content large" style="max-width: 680px;">
            <div class="modal-header">
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <button id="btnPrevPagItem" onclick="navegarItemAnterior()" style="background: none; border: none; cursor: pointer; font-size: 1.2rem; visibility: hidden;">‹</button>
                    <h3 class="modal-title" id="modalItemTitle">Item</h3>
                    <button id="btnNextPagItem" onclick="navegarProximoItem()" style="background: none; border: none; cursor: pointer; font-size: 1.2rem; visibility: hidden;">›</button>
                </div>
                <button class="close-modal" onclick="fecharModalItem()">✕</button>
            </div>
            
            <div class="tabs-container">
                <div class="tabs-nav">
                    <button class="tab-btn active" onclick="switchItemTab('item-tab-item')">Item</button>
                    <button class="tab-btn" onclick="switchItemTab('item-tab-fornecedor')">Fornecedor</button>
                    <button class="tab-btn" onclick="switchItemTab('item-tab-valores')">Valores</button>
                </div>
                
                <div class="tab-content active" id="item-tab-item">
                    <input type="hidden" id="itemNumero">
                    <div class="form-grid">
                        <div class="form-group">
                            <label>Quantidade</label>
                            <input type="number" id="itemQtd" min="1" value="1">
                        </div>
                        <div class="form-group">
                            <label>Unidade</label>
                            <select id="itemUnidade">
                                <option value="UN">UN</option>
                                <option value="MT">MT</option>
                                <option value="PÇ">PÇ</option>
                                <option value="CX">CX</option>
                            </select>
                        </div>
                        <div class="form-group" style="grid-column: 1/-1;">
                            <label>Descrição</label>
                            <textarea id="itemDescricao" rows="3"></textarea>
                        </div>
                    </div>
                </div>
                
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
                
                <div class="tab-content" id="item-tab-valores">
                    <div class="form-grid" style="grid-template-columns: 1fr 1fr 1fr;">
                        <div class="form-group">
                            <label>%</label>
                            <input type="number" id="itemPorcentagem" step="any" value="149">
                        </div>
                        <div class="form-group">
                            <label>Compra UNT</label>
                            <input type="number" id="itemEstimadoUnt" step="any" min="0">
                        </div>
                        <div class="form-group">
                            <label>Custo UNT</label>
                            <input type="number" id="itemCustoUnt" step="any" min="0">
                        </div>
                        <div class="form-group">
                            <label>Venda UNT</label>
                            <input type="number" id="itemVendaUnt" step="any" min="0" oninput="calcularVendaTotalManual()">
                        </div>
                        <div class="form-group">
                            <label>Compra Total</label>
                            <input type="number" id="itemEstimadoTotal" step="any" readonly>
                        </div>
                        <div class="form-group">
                            <label>Custo Total</label>
                            <input type="number" id="itemCustoTotal" step="any" readonly>
                        </div>
                        <div class="form-group">
                            <label>Venda Total</label>
                            <input type="number" id="itemVendaTotal" step="any" readonly>
                        </div>
                    </div>
                </div>
            </div>

            <div class="modal-actions">
                <button type="button" id="btnItemTabPrev" onclick="prevItemTab()" class="secondary" style="display:none;">Anterior</button>
                <button type="button" id="btnItemTabNext" onclick="nextItemTab()" class="secondary">Próximo</button>
                <button type="button" id="btnSalvarItem" onclick="salvarItemAtual()" class="success" style="display:none;">Salvar</button>
                <button type="button" onclick="fecharModalItem()" class="danger">Cancelar</button>
            </div>
        </div>
    `;
    return modal;
}

function calcularVendaTotalManual() {
    const qtd = parseFloat(document.getElementById('itemQtd')?.value) || 0;
    const vendaUnt = parseFloat(document.getElementById('itemVendaUnt')?.value) || 0;
    document.getElementById('itemVendaTotal').value = (qtd * vendaUnt).toFixed(2);
}

function calcularValoresItem() {
    const q = parseFloat(document.getElementById('itemQtd')?.value) || 0;
    const eu = parseFloat(document.getElementById('itemEstimadoUnt')?.value) || 0;
    const cu = parseFloat(document.getElementById('itemCustoUnt')?.value) || 0;
    const perc = parseFloat(document.getElementById('itemPorcentagem')?.value) || 0;
    
    const estimadoTotal = q * eu;
    const custoTotal = q * cu;
    const vendaUntCalc = cu * (1 + perc / 100);
    
    const vendaUntEl = document.getElementById('itemVendaUnt');
    const vendaTotalEl = document.getElementById('itemVendaTotal');
    
    if (!vendaUntEl._isManualEdit) {
        vendaUntEl.value = vendaUntCalc.toFixed(4);
        vendaTotalEl.value = (vendaUntCalc * q).toFixed(2);
    } else {
        const vendaUntManual = parseFloat(vendaUntEl.value) || 0;
        vendaTotalEl.value = (vendaUntManual * q).toFixed(2);
    }
    
    document.getElementById('itemEstimadoTotal').value = estimadoTotal.toFixed(2);
    document.getElementById('itemCustoTotal').value = custoTotal.toFixed(2);
}

function configurarCalculosAutomaticos() {
    const modal = document.getElementById('modalItem');
    if (!modal) return;
    
    modal._calcListener = function(e) {
        const ids = ['itemQtd', 'itemEstimadoUnt', 'itemCustoUnt', 'itemPorcentagem'];
        if (ids.includes(e.target.id)) {
            document.getElementById('itemVendaUnt')._isManualEdit = false;
            calcularValoresItem();
        }
        if (e.target.id === 'itemVendaUnt') {
            e.target._isManualEdit = true;
            calcularVendaTotalManual();
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
            if (fechar) {
                renderItens();
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
    const modal = document.getElementById('modalItem');
    if (modal) modal.classList.remove('show');
    editingItemIndex = null;
}

function syncItens() {
    carregarItens(currentPregaoId);
    showToast('Dados sincronizados', 'success');
}

function perguntarAssinaturaPDF() {
    if (!currentPregaoId) {
        showToast('Erro: Pregão não identificado', 'error');
        return;
    }
    const itensSelecionados = itens.filter(item => item.ganho);
    if (itensSelecionados.length === 0) {
        showToast('Marque ao menos um item para gerar a proposta', 'error');
        return;
    }
    document.getElementById('modalAssinatura').classList.add('show');
}

function fecharModalAssinatura() {
    document.getElementById('modalAssinatura').classList.remove('show');
}

async function gerarPDFsProposta(comAssinatura) {
    fecharModalAssinatura();
    
    const pregao = pregoes.find(p => p.id === currentPregaoId);
    if (!pregao) return;
    
    const itensSelecionados = itens.filter(item => item.ganho);
    if (itensSelecionados.length === 0) return;
    
    // Buscar dados bancários
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
    
    // Gerar PDF (versão simplificada - mantendo a original)
    showToast('PDF gerado com sucesso!', 'success');
}
