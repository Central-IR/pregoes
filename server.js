const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const app = express();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ ERRO: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
console.log('✅ Supabase configurado:', supabaseUrl);

// CORS mais permissivo para desenvolvimento
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH', 'HEAD'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-Token']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: (res, filepath) => {
        if (filepath.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript');
        else if (filepath.endsWith('.css')) res.setHeader('Content-Type', 'text/css');
        else if (filepath.endsWith('.html')) res.setHeader('Content-Type', 'text/html');
    }
}));

app.use((req, res, next) => {
    console.log(`📥 ${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// AUTENTICAÇÃO
const PORTAL_URL = process.env.PORTAL_URL || 'https://ir-comercio-portal-zcan.onrender.com';

async function verificarAutenticacao(req, res, next) {
    const publicPaths = ['/', '/health', '/pregoes.html', '/index.html'];
    if (publicPaths.includes(req.path)) {
        return next();
    }

    const sessionToken = req.headers['x-session-token'] || req.query.sessionToken;

    if (!sessionToken) {
        return res.status(401).json({
            error: 'Não autenticado',
            redirectToLogin: true
        });
    }

    try {
        const verifyResponse = await fetch(`${PORTAL_URL}/api/verify-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionToken })
        });

        if (!verifyResponse.ok) {
            return res.status(401).json({
                error: 'Sessão inválida',
                redirectToLogin: true
            });
        }

        const sessionData = await verifyResponse.json();

        if (!sessionData.valid) {
            return res.status(401).json({
                error: 'Sessão inválida',
                redirectToLogin: true
            });
        }

        req.user = sessionData.session;
        req.sessionToken = sessionToken;
        next();
    } catch (error) {
        return res.status(500).json({
            error: 'Erro ao verificar autenticação'
        });
    }
}

// ============================================
// DADOS BANCÁRIOS PROTEGIDOS (BACKEND ONLY)
// ============================================

function getDadosBancarios(banco) {
    const dadosBancarios = {
        'BANCO DO BRASIL': 'BANCO DO BRASIL - AG: 3167-4 / CONTA CORRENTE: 130115-2',
        'BRADESCO': 'BRADESCO - AG: 0000-0 / CONTA CORRENTE: 000000-0',
        'SICOOB': 'SICOOB - AG: 0000 / CONTA CORRENTE: 00000-0'
    };
    
    return dadosBancarios[banco] || null;
}

// NOTA: Complete os dados do BRADESCO e SICOOB acima antes de usar em produção

// ============================================
// ROTAS DA API - ORDEM DE COMPRA
// ============================================

// Aplicar autenticação nas rotas de ordens
app.use('/api/ordens', verificarAutenticacao);

// HEAD request para ordens (usado para verificar conectividade)
app.head('/api/ordens', (req, res) => {
    res.status(200).end();
});

app.get('/api/ordens', async (req, res) => {
    try {
        console.log('📋 Listando ordens...');
        const { data, error } = await supabase
            .from('ordens_compra')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('❌ Erro Supabase ao listar:', error);
            throw error;
        }
        
        console.log(`✅ ${data?.length || 0} ordens encontradas`);
        res.json(data || []);
    } catch (error) {
        console.error('❌ Erro ao listar ordens:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao listar ordens',
            message: error.message
        });
    }
});

app.get('/api/ordens/:id', async (req, res) => {
    try {
        console.log(`🔍 Buscando ordem ID: ${req.params.id}`);
        const { data, error } = await supabase
            .from('ordens_compra')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                console.log('❌ Ordem não encontrada');
                return res.status(404).json({ success: false, error: 'Ordem não encontrada' });
            }
            throw error;
        }

        console.log('✅ Ordem encontrada');
        res.json(data);
    } catch (error) {
        console.error('❌ Erro ao buscar ordem:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao buscar ordem',
            message: error.message
        });
    }
});

app.post('/api/ordens', async (req, res) => {
    try {
        console.log('➕ Criando nova ordem...');
        
        const { 
            numeroOrdem, responsavel, dataOrdem, razaoSocial, nomeFantasia, 
            cnpj, enderecoFornecedor, site, contato, telefone, email, items, 
            valorTotal, frete, localEntrega, prazoEntrega, transporte, 
            formaPagamento, prazoPagamento, dadosBancarios, status 
        } = req.body;

        const novaOrdem = {
            numero_ordem: numeroOrdem,
            responsavel,
            data_ordem: dataOrdem,
            razao_social: razaoSocial,
            nome_fantasia: nomeFantasia || null,
            cnpj,
            endereco_fornecedor: enderecoFornecedor || null,
            site: site || null,
            contato: contato || null,
            telefone: telefone || null,
            email: email || null,
            items: items || [],
            valor_total: valorTotal || 'R$ 0,00',
            frete: frete || null,
            local_entrega: localEntrega || null,
            prazo_entrega: prazoEntrega || null,
            transporte: transporte || null,
            forma_pagamento: formaPagamento,
            prazo_pagamento: prazoPagamento,
            dados_bancarios: dadosBancarios || null,
            status: status || 'aberta'
        };

        const { data, error } = await supabase
            .from('ordens_compra')
            .insert([novaOrdem])
            .select()
            .single();

        if (error) {
            console.error('❌ Erro Supabase ao inserir:', error);
            throw error;
        }

        console.log('✅ Ordem criada com sucesso! ID:', data.id);
        res.status(201).json(data);
    } catch (error) {
        console.error('❌ Erro ao criar ordem:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao criar ordem',
            message: error.message
        });
    }
});

app.put('/api/ordens/:id', async (req, res) => {
    try {
        console.log(`✏️ Atualizando ordem ID: ${req.params.id}`);
        
        const { 
            numeroOrdem, responsavel, dataOrdem, razaoSocial, nomeFantasia, 
            cnpj, enderecoFornecedor, site, contato, telefone, email, items, 
            valorTotal, frete, localEntrega, prazoEntrega, transporte, 
            formaPagamento, prazoPagamento, dadosBancarios, status 
        } = req.body;

        const ordemAtualizada = {
            numero_ordem: numeroOrdem,
            responsavel,
            data_ordem: dataOrdem,
            razao_social: razaoSocial,
            nome_fantasia: nomeFantasia || null,
            cnpj,
            endereco_fornecedor: enderecoFornecedor || null,
            site: site || null,
            contato: contato || null,
            telefone: telefone || null,
            email: email || null,
            items: items || [],
            valor_total: valorTotal || 'R$ 0,00',
            frete: frete || null,
            local_entrega: localEntrega || null,
            prazo_entrega: prazoEntrega || null,
            transporte: transporte || null,
            forma_pagamento: formaPagamento,
            prazo_pagamento: prazoPagamento,
            dados_bancarios: dadosBancarios || null,
            status: status || 'aberta',
            updated_at: new Date().toISOString()
        };

        const { data, error } = await supabase
            .from('ordens_compra')
            .update(ordemAtualizada)
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({ success: false, error: 'Ordem não encontrada' });
            }
            throw error;
        }

        console.log('✅ Ordem atualizada com sucesso!');
        res.json(data);
    } catch (error) {
        console.error('❌ Erro ao atualizar ordem:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao atualizar ordem',
            message: error.message
        });
    }
});

app.patch('/api/ordens/:id/status', async (req, res) => {
    try {
        console.log(`🔄 Atualizando status da ordem ID: ${req.params.id}`);
        const updates = {
            status: req.body.status,
            updated_at: new Date().toISOString()
        };

        const { data, error } = await supabase
            .from('ordens_compra')
            .update(updates)
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({ success: false, error: 'Ordem não encontrada' });
            }
            throw error;
        }

        console.log('✅ Status atualizado com sucesso!');
        res.json(data);
    } catch (error) {
        console.error('❌ Erro ao atualizar status:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao atualizar status',
            message: error.message
        });
    }
});

app.delete('/api/ordens/:id', async (req, res) => {
    try {
        console.log(`🗑️ Deletando ordem ID: ${req.params.id}`);
        const { error } = await supabase
            .from('ordens_compra')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;

        console.log('✅ Ordem deletada com sucesso!');
        res.json({ success: true, message: 'Ordem removida com sucesso' });
    } catch (error) {
        console.error('❌ Erro ao deletar ordem:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao deletar ordem',
            message: error.message
        });
    }
});

// ============================================
// ROTAS DA API - PREGÕES
// ============================================

// Aplicar autenticação nas rotas de pregões
app.use('/api/pregoes', verificarAutenticacao);

// HEAD request para pregões (usado para verificar conectividade)
app.head('/api/pregoes', (req, res) => {
    res.status(200).end();
});

// GET /api/pregoes?mes=&ano=  (opcional)
app.get('/api/pregoes', async (req, res) => {
    try {
        console.log('📋 Listando pregões...');
        let query = supabase.from('pregoes').select('*');
        
        const { mes, ano } = req.query;
        if (mes && ano) {
            const mesNum = parseInt(mes);
            const anoNum = parseInt(ano);
            if (!isNaN(mesNum) && !isNaN(anoNum)) {
                const startDate = `${anoNum}-${mesNum.toString().padStart(2,'0')}-01`;
                const endDate = mesNum === 12 
                    ? `${anoNum+1}-01-01` 
                    : `${anoNum}-${(mesNum+1).toString().padStart(2,'0')}-01`;
                query = query
                    .filter('data', 'gte', startDate)
                    .filter('data', 'lt', endDate);
            }
        }

        const { data, error } = await query.order('data', { ascending: false });

        if (error) {
            console.error('❌ Erro Supabase ao listar pregões:', error);
            throw error;
        }
        
        console.log(`✅ ${data?.length || 0} pregões encontrados`);
        res.json(data || []);
    } catch (error) {
        console.error('❌ Erro ao listar pregões:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao listar pregões',
            message: error.message
        });
    }
});

app.get('/api/pregoes/:id', async (req, res) => {
    try {
        console.log(`🔍 Buscando pregão ID: ${req.params.id}`);
        const { data, error } = await supabase
            .from('pregoes')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                console.log('❌ Pregão não encontrado');
                return res.status(404).json({ success: false, error: 'Pregão não encontrado' });
            }
            throw error;
        }

        console.log('✅ Pregão encontrado');
        res.json(data);
    } catch (error) {
        console.error('❌ Erro ao buscar pregão:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao buscar pregão',
            message: error.message
        });
    }
});

app.post('/api/pregoes', async (req, res) => {
    try {
        console.log('➕ Criando novo pregão...');
        
        const { 
            responsavel, data, hora, numero_pregao, uasg, nome_orgao, municipio, uf,
            telefones, emails, validade_proposta, prazo_entrega, prazo_pagamento,
            detalhes, banco, status, ganho, disputa_por
        } = req.body;

        const novoPregao = {
            responsavel,
            data,
            hora: hora || null,
            numero_pregao,
            uasg: uasg || null,
            nome_orgao: nome_orgao || null,
            municipio: municipio || null,
            uf: uf || null,
            telefones: telefones || [],
            emails: emails || [],
            validade_proposta: validade_proposta || null,
            prazo_entrega: prazo_entrega || null,
            prazo_pagamento: prazo_pagamento || null,
            detalhes: detalhes || [],
            banco: banco || null,
            status: status || 'ABERTO',
            ganho: ganho || false
        };
        if (disputa_por !== undefined) novoPregao.disputa_por = disputa_por || 'ITEM';

        const { data: dataResponse, error } = await supabase
            .from('pregoes')
            .insert([novoPregao])
            .select()
            .single();

        if (error) {
            console.error('❌ Erro Supabase ao inserir pregão:', error);
            throw error;
        }

        console.log('✅ Pregão criado com sucesso! ID:', dataResponse.id);
        res.status(201).json(dataResponse);
    } catch (error) {
        console.error('❌ Erro ao criar pregão:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao criar pregão',
            message: error.message
        });
    }
});

app.put('/api/pregoes/:id', async (req, res) => {
    try {
        console.log(`✏️ Atualizando pregão ID: ${req.params.id}`);
        
        const { 
            responsavel, data, hora, numero_pregao, uasg, nome_orgao, municipio, uf,
            telefones, emails, validade_proposta, prazo_entrega, prazo_pagamento,
            detalhes, banco, status, ganho, disputa_por
        } = req.body;

        const pregaoAtualizado = {
            responsavel,
            data,
            hora: hora || null,
            numero_pregao,
            uasg: uasg || null,
            nome_orgao: nome_orgao || null,
            municipio: municipio || null,
            uf: uf || null,
            telefones: telefones || [],
            emails: emails || [],
            validade_proposta: validade_proposta || null,
            prazo_entrega: prazo_entrega || null,
            prazo_pagamento: prazo_pagamento || null,
            detalhes: detalhes || [],
            banco: banco || null,
            status: status || 'ABERTO',
            ganho: ganho !== undefined ? ganho : false,
            updated_at: new Date().toISOString()
        };
        if (disputa_por !== undefined) pregaoAtualizado.disputa_por = disputa_por || 'ITEM';

        const { data: dataResponse, error } = await supabase
            .from('pregoes')
            .update(pregaoAtualizado)
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({ success: false, error: 'Pregão não encontrado' });
            }
            throw error;
        }

        console.log('✅ Pregão atualizado com sucesso!');
        res.json(dataResponse);
    } catch (error) {
        console.error('❌ Erro ao atualizar pregão:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao atualizar pregão',
            message: error.message
        });
    }
});

app.delete('/api/pregoes/:id', async (req, res) => {
    try {
        const pid = req.params.id;
        console.log(`🗑️ Deletando pregão ID: ${pid} (com itens)`);
        // Excluir itens primeiro para evitar FK violation
        const { error: erroItens } = await supabase
            .from('pregoes_itens')
            .delete()
            .eq('pregao_id', pid);
        if (erroItens) console.warn('⚠️ Aviso ao excluir itens:', erroItens.message);
        // Excluir o pregão
        const { error } = await supabase
            .from('pregoes')
            .delete()
            .eq('id', pid);
        if (error) throw error;
        console.log('✅ Pregão e itens deletados!');
        res.json({ success: true, message: 'Pregão removido com sucesso' });
    } catch (error) {
        console.error('❌ Erro ao deletar pregão:', error.message);
        res.status(500).json({ success: false, error: 'Erro ao deletar pregão', message: error.message });
    }
});

// Obter dados bancários para PDF (protegido - só retorna quando solicitado para PDF)
app.get('/api/pregoes/:id/dados-bancarios', async (req, res) => {
    try {
        console.log(`🏦 Obtendo dados bancários para PDF do pregão ID: ${req.params.id}`);
        
        const { data, error } = await supabase
            .from('pregoes')
            .select('banco')
            .eq('id', req.params.id)
            .single();

        if (error) {
            return res.status(404).json({ success: false, error: 'Pregão não encontrado' });
        }

        const dadosBancarios = getDadosBancarios(data.banco);
        res.json({ dados_bancarios: dadosBancarios });
    } catch (error) {
        console.error('❌ Erro ao buscar dados bancários:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao buscar dados bancários',
            message: error.message
        });
    }
});

// ============================================
// ROTAS DA API - ITENS DOS PREGÕES
// ============================================

// Listar itens de um pregão
app.get('/api/pregoes/:pregao_id/itens', async (req, res) => {
    try {
        console.log(`📋 Listando itens do pregão ID: ${req.params.pregao_id}`);
        const { data, error } = await supabase
            .from('pregoes_itens')
            .select('*')
            .eq('pregao_id', req.params.pregao_id)
            .order('numero', { ascending: true });

        if (error) throw error;
        
        console.log(`✅ ${data?.length || 0} itens encontrados`);
        res.json(data || []);
    } catch (error) {
        console.error('❌ Erro ao listar itens:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao listar itens',
            message: error.message
        });
    }
});

// Criar item
app.post('/api/pregoes/:pregao_id/itens', async (req, res) => {
    try {
        console.log(`➕ Criando item para pregão ID: ${req.params.pregao_id}`);
        
        const { 
            numero, descricao, qtd, unidade, marca, modelo,
            estimado_unt, estimado_total, custo_unt, custo_total,
            porcentagem, venda_unt, venda_total, ganho,
            grupo_tipo, grupo_numero
        } = req.body;

        const novoItem = {
            pregao_id: req.params.pregao_id,
            numero: String(numero || 1),
            descricao: descricao || null,
            qtd: parseInt(qtd) || 1,
            unidade: unidade || 'UN',
            marca: marca || null,
            modelo: modelo || null,
            estimado_unt: parseFloat(estimado_unt) || 0,
            estimado_total: parseFloat(estimado_total) || 0,
            custo_unt: parseFloat(custo_unt) || 0,
            custo_total: parseFloat(custo_total) || 0,
            porcentagem: parseFloat(porcentagem) || 149,
            venda_unt: parseFloat(venda_unt) || 0,
            venda_total: parseFloat(venda_total) || 0,
            ganho: ganho === true || ganho === 'true' || false
        };
        if (grupo_tipo !== undefined) novoItem.grupo_tipo = grupo_tipo || null;
        if (grupo_numero !== undefined) novoItem.grupo_numero = grupo_numero != null ? parseInt(grupo_numero) : null;

        const { data, error } = await supabase
            .from('pregoes_itens')
            .insert([novoItem])
            .select()
            .single();

        if (error) throw error;

        console.log('✅ Item criado com sucesso! ID:', data.id);
        res.status(201).json(data);
    } catch (error) {
        console.error('❌ Erro ao criar item:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao criar item',
            message: error.message
        });
    }
});

// Atualizar item
app.put('/api/pregoes/:pregao_id/itens/:id', async (req, res) => {
    try {
        console.log(`✏️ Atualizando item ID: ${req.params.id}`);
        
        const { 
            numero, descricao, qtd, unidade, marca, modelo,
            estimado_unt, estimado_total, custo_unt, custo_total,
            porcentagem, venda_unt, venda_total, ganho,
            grupo_tipo, grupo_numero
        } = req.body;

        const itemAtualizado = {
            numero: String(numero || 1),
            descricao: descricao || null,
            qtd: parseInt(qtd) || 1,
            unidade: unidade || 'UN',
            marca: marca || null,
            modelo: modelo || null,
            estimado_unt: parseFloat(estimado_unt) || 0,
            estimado_total: parseFloat(estimado_total) || 0,
            custo_unt: parseFloat(custo_unt) || 0,
            custo_total: parseFloat(custo_total) || 0,
            porcentagem: parseFloat(porcentagem) || 149,
            venda_unt: parseFloat(venda_unt) || 0,
            venda_total: parseFloat(venda_total) || 0,
            ganho: ganho === true || ganho === 'true' || false,
            updated_at: new Date().toISOString()
        };
        if (grupo_tipo !== undefined) itemAtualizado.grupo_tipo = grupo_tipo || null;
        if (grupo_numero !== undefined) itemAtualizado.grupo_numero = grupo_numero != null ? parseInt(grupo_numero) : null;

        const { data, error } = await supabase
            .from('pregoes_itens')
            .update(itemAtualizado)
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({ success: false, error: 'Item não encontrado' });
            }
            throw error;
        }

        console.log('✅ Item atualizado com sucesso!');
        res.json(data);
    } catch (error) {
        console.error('❌ Erro ao atualizar item:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao atualizar item',
            message: error.message
        });
    }
});

// Deletar item
app.delete('/api/pregoes/:pregao_id/itens/:id', async (req, res) => {
    try {
        console.log(`🗑️ Deletando item ID: ${req.params.id}`);
        const { error } = await supabase
            .from('pregoes_itens')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;

        console.log('✅ Item deletado com sucesso!');
        res.json({ success: true, message: 'Item removido com sucesso' });
    } catch (error) {
        console.error('❌ Erro ao deletar item:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao deletar item',
            message: error.message
        });
    }
});

// Deletar múltiplos itens
app.post('/api/pregoes/:pregao_id/itens/delete-multiple', async (req, res) => {
    try {
        console.log(`🗑️ Deletando múltiplos itens do pregão ID: ${req.params.pregao_id}`);
        const { ids } = req.body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, error: 'IDs inválidos' });
        }

        const { error } = await supabase
            .from('pregoes_itens')
            .delete()
            .in('id', ids);

        if (error) throw error;

        console.log(`✅ ${ids.length} itens deletados com sucesso!`);
        res.json({ success: true, message: `${ids.length} itens removidos com sucesso` });
    } catch (error) {
        console.error('❌ Erro ao deletar itens:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao deletar itens',
            message: error.message
        });
    }
});

// ============================================
// ROTAS DE SAÚDE
// ============================================

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// TRATAMENTO GLOBAL DE ERROS
app.use((err, req, res, next) => {
    console.error('❌ Erro não tratado:', err);
    res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: err.message
    });
});

// INICIAR SERVIDOR
const PORT = process.env.PORT || 10000;

app.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('===============================================');
    console.log('🚀 I.R. COMÉRCIO - SISTEMA INTEGRADO');
    console.log('===============================================');
    console.log(`✅ Porta: ${PORT}`);
    console.log(`✅ Supabase: ${supabaseUrl}`);
    console.log(`✅ Portal: ${PORTAL_URL}`);
    console.log('');
    console.log('📦 Módulos disponíveis:');
    console.log('   • Ordem de Compra: /index.html');
    console.log('   • Pregões: /pregoes.html');
    console.log('===============================================');
});

process.on('unhandledRejection', (reason) => {
    console.error('❌ Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    process.exit(1);
});

module.exports = app;
