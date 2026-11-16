# Vértice — Consultoria empresarial

Aplicação estática para consultoria financeira empresarial, hospedada no GitHub Pages e conectada ao Supabase para autenticação, cadastro de empresas e diagnóstico financeiro.

## Arquivos

- `index.html` — telas da aplicação
- `css/style.css` — estilos responsivos
- `js/app.js` — autenticação, navegação e operações de empresas
- `js/config.js` — URL e chave pública do Supabase
- `supabase/migrations/` — schema, RLS, perfis e tabelas financeiras

## Configuração do Supabase

1. Execute as migrations da pasta `supabase/migrations/` no SQL Editor do projeto.
2. Cadastre o e-mail do administrador em `public.vertice_admin_allowlist` pelo SQL Editor.
3. Configure a URL do GitHub Pages como Site URL e Redirect URL em Auth → URL Configuration.
4. Convide o administrador em Authentication → Users. O trigger atribui o perfil `admin` ao e-mail autorizado; o link leva ao app para definir a senha.
5. Se o usuário já estiver na tela de login, use **Esqueci minha senha** para receber um link de recuperação e criar a senha.
6. Para permitir contas de clientes, habilite inscrições por e-mail e confirmação de e-mail em Auth → Providers → Email. As migrations criam a empresa do cliente após a confirmação e limitam o acesso aos dados associados à conta.
7. Administradores podem consultar a lista de contas de clientes, empresas informadas e situação da confirmação do e-mail na seção **Contas**. Essa seção não altera nem bloqueia acessos.

`js/config.js` contém somente a chave pública `publishable`, apropriada para o navegador. Nunca coloque uma chave `service_role` ou outra chave secreta no repositório. O acesso aos dados é protegido por RLS no banco.

## Dados demonstrativos

As empresas seed e os indicadores financeiros do painel são fictícios. O diagnóstico financeiro usa apenas os dados mensais importados para a empresa selecionada; não realiza escrituração contábil nem produz recomendações automáticas de investimento.

## Diagnóstico financeiro e importação CSV

Execute também a migration `20261116032100_add_company_financial_analysis.sql` no SQL Editor do Supabase. Ela cria as tabelas de períodos realizados e previsões, com RLS para administradores e para o usuário dono da própria empresa. Não há permissão de exclusão direta; uma empresa com dados financeiros vinculados não pode ser removida.

Na área **Diagnóstico**, baixe os modelos CSV e mantenha os cabeçalhos. Os arquivos usam `;` como separador; valores podem usar vírgula decimal. Datas aceitas: `AAAA-MM` ou `AAAA-MM-DD` (o mês é armazenado como competência mensal). O limite de importação é 2 MB. Arquivos `.xlsx` não são aceitos.

O modelo mensal usa uma linha por competência e as colunas:

`periodo;receita;cmv;compras;despesas_variaveis;despesas_fixas;contas_a_receber;estoque;fornecedores;divida_bruta;caixa`

O modelo de previsão contém exatamente os seis meses seguintes ao último mês realizado:

`periodo;entradas_previstas;saidas_previstas`

Importar novamente uma competência atualiza seus valores. As métricas são calculadas assim:

- PMR = contas a receber ÷ receita × dias do mês; PME = estoque ÷ CMV × dias do mês; PMP = fornecedores ÷ compras × dias do mês.
- Ciclo financeiro = PMR + PME − PMP; necessidade de capital de giro = contas a receber + estoque − fornecedores.
- EBITDA mensal = receita − CMV − despesas variáveis − despesas fixas. A dívida líquida/EBITDA usa (dívida bruta − caixa) ÷ EBITDA acumulado de 12 competências consecutivas; sem um ano completo, a métrica não é exibida.
- Análise vertical da DRE compara cada linha à receita do mês; análise horizontal compara com o mês calendário anterior.
- Ponto de equilíbrio = despesas fixas ÷ margem de contribuição percentual, com margem de contribuição = (receita − CMV − despesas variáveis) ÷ receita.
- Projeção de caixa carrega o saldo final de cada mês para o mês seguinte, começando pelo caixa do último período realizado.

PMR, PME e PMP usam saldos de fechamento e são estimativas. Valide o plano de contas, os critérios de competência e os valores com um profissional habilitado. Como o diagnóstico armazena informações financeiras da empresa, use dados reais apenas após validar as configurações de acesso, privacidade, retenção e backup do ambiente.
