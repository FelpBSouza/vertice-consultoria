# Vértice — Consultoria empresarial

Site público e aplicação estática para consultoria financeira empresarial, hospedados no GitHub Pages e conectados ao Supabase para autenticação, cadastro de empresas e diagnóstico financeiro.

## Arquivos

- `index.html` — landing page pública e encaminhamento de callbacks de autenticação
- `app.html` — portal autenticado, cadastro e diagnóstico financeiro
- `css/landing.css` — estilos da landing page
- `css/style.css` — estilos responsivos
- `js/app.js` — autenticação, navegação e operações de empresas
- `js/config.js` — URL e chave pública do Supabase
- `supabase/migrations/` — schema, RLS, perfis e tabelas financeiras

## Configuração do Supabase

1. Execute as migrations da pasta `supabase/migrations/` no SQL Editor do projeto.
2. Cadastre o e-mail do administrador em `public.vertice_admin_allowlist` pelo SQL Editor.
3. Configure a URL raiz do GitHub Pages como Site URL e Redirect URL em Auth → URL Configuration. Os links de confirmação e recuperação retornam à raiz; a landing encaminha os callbacks ao `app.html`, preservando parâmetros e tokens.
4. Convide o administrador em Authentication → Users. O trigger atribui o perfil `admin` ao e-mail autorizado; o link leva ao portal para definir a senha.
5. Se o usuário já estiver na tela de login, use **Esqueci minha senha** para receber um link de recuperação e criar a senha.
6. Para permitir contas de clientes, habilite inscrições por e-mail e confirmação de e-mail em Auth → Providers → Email. As migrations criam a empresa do cliente após a confirmação e limitam o acesso aos dados associados à conta.
7. Administradores podem consultar a lista de contas de clientes, empresas informadas e situação da confirmação do e-mail na seção **Contas**. Essa seção não altera nem bloqueia acessos.

A página inicial (`/vertice-consultoria/`) é pública. Os botões **Entrar** e **Começar** levam ao portal (`app.html`); o segundo abre o cadastro da empresa. O portal pode ser acessado diretamente pelo endereço `app.html`.

`js/config.js` contém somente a chave pública `publishable`, apropriada para o navegador. Nunca coloque uma chave `service_role` ou outra chave secreta no repositório. O acesso aos dados é protegido por RLS no banco.

## Dados demonstrativos

As empresas seed e os indicadores financeiros do painel são fictícios. No Diagnóstico, a empresa seed **Orla Café e Alimentos Ltda.** recebe uma demonstração local com base nos números da Visão geral e da DRE quando ainda não possui dados financeiros importados. Essa demonstração não é gravada no Supabase e os imports ficam desativados nesse modo. Outras empresas e contas de clientes só mostram dados persistidos/importados; não recebem dados de demonstração automaticamente. O diagnóstico não realiza escrituração contábil nem produz recomendações automáticas de investimento.

## Diagnóstico financeiro e importação CSV

Execute também as migrations `20261116032100_add_company_financial_analysis.sql` e `20261116040000_add_financial_dashboard_metrics.sql` no SQL Editor do Supabase. Elas criam as tabelas de períodos realizados, previsões e vencimentos de dívida, e os campos de DRE adicionais, com RLS para administradores e para o usuário dono da própria empresa. Não há permissão de exclusão direta; uma empresa com dados financeiros vinculados não pode ser removida.

Na área **Diagnóstico**, baixe os modelos CSV e mantenha os cabeçalhos. Os arquivos usam `;` como separador; valores podem usar vírgula decimal. Datas aceitas: `AAAA-MM` ou `AAAA-MM-DD` (o mês é armazenado como competência mensal). O limite de importação é 2 MB. Arquivos `.xlsx` não são aceitos.

O modelo mensal usa uma linha por competência e as colunas:

`periodo;receita;cmv;compras;despesas_variaveis;despesas_fixas;contas_a_receber;estoque;fornecedores;divida_bruta;caixa;depreciacao;despesas_financeiras;impostos`

Depreciação, despesas financeiras e impostos são opcionais para manter compatibilidade com arquivos anteriores. Sem os três valores, o lucro líquido não é calculado e a cascata termina no EBITDA.

O modelo de previsão contém até 12 meses após o último mês realizado; é possível importar períodos contínuos em arquivos separados:

`periodo;entradas_previstas;saidas_previstas`

O cronograma de dívida usa o modelo `periodo;valor_vencimento`, com os pagamentos de principal previstos em cada mês. Linhas repetidas para o mesmo mês são somadas. O saldo bruto da dívida não é usado para inferir vencimentos.

Importar novamente uma competência atualiza seus valores. As métricas são calculadas assim:

- PMR = contas a receber ÷ receita × dias do mês; PME = estoque ÷ CMV × dias do mês; PMP = fornecedores ÷ compras × dias do mês.
- Ciclo financeiro = PMR + PME − PMP; necessidade de capital de giro = contas a receber + estoque − fornecedores.
- EBITDA mensal = receita − CMV − despesas variáveis − despesas fixas. A dívida líquida/EBITDA usa (dívida bruta − caixa) ÷ EBITDA acumulado de 12 competências consecutivas; sem um ano completo, a métrica não é exibida.
- O score de saúde é a média dos pilares disponíveis: liquidez simplificada (caixa + recebíveis + estoque sobre fornecedores), dívida líquida/EBITDA, margem EBITDA e cobertura de caixa sobre o CMV e despesas fixas e variáveis mensais. A liquidez não inclui outros passivos circulantes e não substitui uma análise de balanço.
- Os alertas sinalizam liquidez simplificada abaixo de 1,0x, dívida líquida/EBITDA acima de 3,0x e caixa menor que um mês de CMV e despesas fixas e variáveis.
- O fluxo de caixa apresenta cenários derivados da previsão base: o otimista aumenta entradas e reduz saídas em 10%; o cenário de estresse faz o inverso. São simulações de sensibilidade, não previsões garantidas.
- O benchmark de margem EBITDA (mediana fictícia de 12%) é apenas demonstrativo, não uma comparação setorial validada.
- O lucro líquido estimado subtrai depreciação, despesas financeiras e impostos do EBITDA; sem todos esses campos, o lucro líquido não é exibido.
- Análise vertical da DRE compara cada linha à receita do mês; análise horizontal compara com o mês calendário anterior.
- Ponto de equilíbrio = despesas fixas ÷ margem de contribuição percentual, com margem de contribuição = (receita − CMV − despesas variáveis) ÷ receita.
- Projeção de caixa carrega o saldo final de cada mês para o mês seguinte, começando pelo caixa do último período realizado. Os gráficos de previsão e vencimentos aparecem quando há os dados necessários para os 12 meses.

PMR, PME e PMP usam saldos de fechamento e são estimativas. Valide o plano de contas, os critérios de competência e os valores com um profissional habilitado. Como o diagnóstico armazena informações financeiras da empresa, use dados reais apenas após validar as configurações de acesso, privacidade, retenção e backup do ambiente.
