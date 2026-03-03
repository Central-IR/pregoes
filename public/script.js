function gerarComprovanteExequibilidade(comAssinatura = true) {
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
    
    if (typeof window.jspdf === 'undefined') {
        showToast('Erro: Biblioteca PDF não carregou. Recarregue a página (F5).', 'error');
        return;
    }
    
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
    
    // FUNÇÕES AUXILIARES
    function checkPageBreak(requiredSpace) {
        if (y > pageHeight - 30 - requiredSpace) {
            doc.addPage();
            y = 15;
            return true;
        }
        return false;
    }
    
    function formatarValorPDF(valor) {
        if (valor === 0 || valor === null || valor === undefined) return 'R$ 0,00';
        return 'R$ ' + valor.toFixed(2).replace('.', ',');
    }
    
    // CABEÇALHO (IGUAL AO DA PROPOSTA)
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('DECLARAÇÃO DE CUSTOS', pageWidth / 2, y, { align: 'center' });
    
    y += 8;
    doc.setFontSize(12);
    doc.text(`${pregao.numero_pregao}${pregao.uasg ? ' - ' + pregao.uasg : ''}`, pageWidth / 2, y, { align: 'center' });
    
    y += 12;
    
    // DADOS DO PROCESSO (SEM TÍTULOS)
    doc.setFontSize(10);
    
    // PREGÃO:
    doc.setFont('helvetica', 'bold');
    doc.text('PREGÃO:', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(` ${pregao.numero_pregao}`, margin + 20, y);
    y += 5;
    
    // ÓRGÃO:
    doc.setFont('helvetica', 'bold');
    doc.text('ÓRGÃO:', margin, y);
    doc.setFont('helvetica', 'normal');
    const orgaoText = ` ${pregao.nome_orgao || 'NÃO INFORMADO'} - ${pregao.uasg || ''}`;
    const orgaoLines = doc.splitTextToSize(orgaoText, contentWidth - 25);
    doc.text(orgaoLines[0], margin + 20, y);
    y += 5;
    for (let i = 1; i < orgaoLines.length; i++) {
        doc.text(orgaoLines[i], margin + 20, y);
        y += 5;
    }
    
    // CIDADE/UF:
    doc.setFont('helvetica', 'bold');
    doc.text('CIDADE:', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(` ${pregao.municipio || ''} - ${pregao.uf || ''}`, margin + 22, y);
    y += 8;
    
    // DADOS DA EMPRESA (SEM TÍTULOS)
    // FORNECEDOR e TEL:
    doc.setFont('helvetica', 'bold');
    doc.text('FORNECEDOR:', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(' I.R. COMÉRCIO E MATERIAIS ELÉTRICOS LTDA', margin + 28, y);
    doc.setFont('helvetica', 'bold');
    doc.text('TEL:', pageWidth - 60, y);
    doc.setFont('helvetica', 'normal');
    doc.text('(27) 3209-4291', pageWidth - 45, y);
    y += 5;
    
    // CNPJ:
    doc.setFont('helvetica', 'bold');
    doc.text('CNPJ:', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(' 33.149.502/0001-38', margin + 18, y);
    y += 5;
    
    // ENDEREÇO:
    doc.setFont('helvetica', 'bold');
    doc.text('ENDEREÇO:', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(' RUA TADORNA, Nº 472, SALA 2', margin + 25, y);
    y += 5;
    
    // BAIRRO:
    doc.setFont('helvetica', 'bold');
    doc.text('BAIRRO:', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(' NOVO HORIZONTE', margin + 20, y);
    y += 5;
    
    // CIDADE/UF/CEP:
    doc.setFont('helvetica', 'bold');
    doc.text('CIDADE:', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(' SERRA', margin + 20, y);
    doc.setFont('helvetica', 'bold');
    doc.text('UF:', margin + 50, y);
    doc.setFont('helvetica', 'normal');
    doc.text('ES', margin + 65, y);
    doc.setFont('helvetica', 'bold');
    doc.text('CEP:', pageWidth - 50, y);
    doc.setFont('helvetica', 'normal');
    doc.text('29.163-318', pageWidth - 35, y);
    y += 8;
    
    checkPageBreak(50);
    
    // TABELA
    const startX = margin;
    const tableWidth = contentWidth;
    
    // LARGURAS DAS COLUNAS
    const colWidths = {
        descricao: 50,
        qtd: 8,
        un: 7,
        marca: 15,
        modelo: 15,
        custoUnt: 16,
        freteCompra: 16,
        impFed: 16,
        freteVenda: 16,
        vendaUnt: 16,
        lucroReal: 16,
        percLucro: 12
    };
    
    // CABEÇALHO DA TABELA
    doc.setFillColor(108, 117, 125);
    doc.setDrawColor(180, 180, 180);
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
        ['IMP\nFEDERAL', 'right'],
        ['FRETE\nVENDA', 'right'],
        ['VENDA\nUNT', 'right'],
        ['LUCRO\nREAL', 'right'],
        ['%\nLUCRO', 'right']
    ];
    
    headers.forEach(([text, align], i) => {
        const width = Object.values(colWidths)[i];
        doc.line(xp, y - 4, xp, y + 4);
        const lines = text.split('\n');
        lines.forEach((line, idx) => {
            const yPos = y - 4 + 3 + (idx * 3);
            if (align === 'left') {
                doc.text(line, xp + 1, yPos);
            } else if (align === 'right') {
                doc.text(line, xp + width - 1, yPos, { align: 'right' });
            } else {
                doc.text(line, xp + width / 2, yPos, { align: 'center' });
            }
        });
        xp += width;
    });
    doc.line(xp, y - 4, xp, y + 4);
    
    y += 4;
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    
    // LINHAS DA TABELA
    itensFiltrados.forEach((item, idx) => {
        checkPageBreak(8);
        
        const vendaUnt = item.venda_unt || 0;
        const custoUnt = item.custo_unt || 0;
        const impostoFederalValor = vendaUnt * (impostoFederal / 100);
        const freteVendaValor = vendaUnt * (freteVenda / 100);
        const freteCompraPorItem = freteCompra / itensFiltrados.length;
        const lucroReal = vendaUnt - freteVendaValor - impostoFederalValor - freteCompraPorItem - custoUnt;
        const percLucro = vendaUnt > 0 ? (lucroReal / vendaUnt) * 100 : 0;
        
        // FUNDO ZEBRADO
        const rowBg = idx % 2 === 0 ? [255, 255, 255] : [247, 248, 250];
        doc.setFillColor(...rowBg);
        doc.setDrawColor(180, 180, 180);
        
        // DESCRIÇÃO COM QUEBRA DE LINHA
        let descricao = item.descricao || '-';
        const descLines = doc.splitTextToSize(descricao, colWidths.descricao - 2);
        const lineHeight = 3;
        const rowHeight = Math.max(8, descLines.length * lineHeight + 2);
        
        doc.rect(startX, y - 4, tableWidth, rowHeight, 'FD');
        
        xp = startX;
        
        // DESCRIÇÃO
        descLines.forEach((line, i) => {
            doc.text(line, xp + 1, y - 4 + 3 + (i * lineHeight));
        });
        xp += colWidths.descricao;
        doc.line(xp, y - 4, xp, y - 4 + rowHeight);
        
        // QTD
        doc.text(String(item.qtd || 1), xp + colWidths.qtd / 2, y - 4 + rowHeight/2 + 1, { align: 'center' });
        xp += colWidths.qtd;
        doc.line(xp, y - 4, xp, y - 4 + rowHeight);
        
        // UN
        doc.text(item.unidade || 'UN', xp + colWidths.un / 2, y - 4 + rowHeight/2 + 1, { align: 'center' });
        xp += colWidths.un;
        doc.line(xp, y - 4, xp, y - 4 + rowHeight);
        
        // MARCA
        const marcaLines = doc.splitTextToSize(item.marca || '-', colWidths.marca - 2);
        marcaLines.forEach((line, i) => {
            doc.text(line, xp + colWidths.marca / 2, y - 4 + 3 + (i * lineHeight), { align: 'center' });
        });
        xp += colWidths.marca;
        doc.line(xp, y - 4, xp, y - 4 + rowHeight);
        
        // MODELO
        const modeloLines = doc.splitTextToSize(item.modelo || '-', colWidths.modelo - 2);
        modeloLines.forEach((line, i) => {
            doc.text(line, xp + colWidths.modelo / 2, y - 4 + 3 + (i * lineHeight), { align: 'center' });
        });
        xp += colWidths.modelo;
        doc.line(xp, y - 4, xp, y - 4 + rowHeight);
        
        // VALORES
        const valores = [
            formatarValorPDF(custoUnt),
            formatarValorPDF(freteCompraPorItem),
            formatarValorPDF(impostoFederalValor),
            formatarValorPDF(freteVendaValor),
            formatarValorPDF(vendaUnt),
            formatarValorPDF(lucroReal),
            percLucro.toFixed(1).replace('.', ',') + '%'
        ];
        
        const colKeys = ['custoUnt', 'freteCompra', 'impFed', 'freteVenda', 'vendaUnt', 'lucroReal', 'percLucro'];
        
        colKeys.forEach((key, i) => {
            const width = colWidths[key];
            doc.text(valores[i], xp + width - 1, y - 4 + rowHeight/2 + 1, { align: 'right' });
            xp += width;
            doc.line(xp, y - 4, xp, y - 4 + rowHeight);
        });
        
        y += rowHeight;
    });
    
    // BORDA INFERIOR DA TABELA
    doc.line(startX, y - 4, startX + tableWidth, y - 4);
    
    y += 8;
    
    checkPageBreak(30);
    
    // DATA
    const dataAtual = new Date();
    const meses = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 
                   'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`SERRA/ES, ${dataAtual.getDate()} DE ${meses[dataAtual.getMonth()]} DE ${dataAtual.getFullYear()}`, pageWidth / 2, y, { align: 'center' });
    
    y += 15;
    
    // ASSINATURA
    if (comAssinatura) {
        doc.line(pageWidth / 2 - 40, y, pageWidth / 2 + 40, y);
        y += 6;
        
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
