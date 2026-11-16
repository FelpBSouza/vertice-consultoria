# Vértice — Consultoria empresarial

Aplicação estática para consultoria financeira empresarial, hospedada no GitHub Pages e conectada ao Supabase para autenticação e cadastro de empresas.

## Arquivos

- `index.html` — telas da aplicação
- `css/style.css` — estilos responsivos
- `js/app.js` — autenticação, navegação e operações de empresas
- `js/config.js` — URL e chave pública do Supabase
- `supabase/migrations/` — schema, RLS e perfil administrador inicial

## Configuração do Supabase

1. Execute as migrations da pasta `supabase/migrations/` no SQL Editor do projeto.
2. Cadastre o e-mail do administrador em `public.vertice_admin_allowlist` pelo SQL Editor.
3. Configure a URL do GitHub Pages como Site URL e Redirect URL em Auth → URL Configuration.
4. Convide o administrador em Authentication → Users. O trigger atribui o perfil `admin` ao e-mail autorizado; o link leva ao app para definir a senha.
5. Se o usuário já estiver na tela de login, use **Esqueci minha senha** para receber um link de recuperação e criar a senha.

`js/config.js` contém somente a chave pública `publishable`, apropriada para o navegador. Nunca coloque uma chave `service_role` ou outra chave secreta no repositório. O acesso aos dados é protegido por RLS no banco.

## Dados demonstrativos

As empresas seed e os indicadores financeiros são fictícios. O painel ainda não realiza escrituração contábil nem produz recomendações de investimento.
