# Supabase para Accesso

## Configurar

1. Use Node.js 22 ou superior.
2. No Supabase, abra **SQL Editor → New query**, cole **todo** o arquivo atualizado `schema.sql` e execute **Run**. Se executou a versão anterior, execute novamente: agora há funções RPC e controle de versão necessários à integração.
3. Copie `.env.example` para `.env` na raiz e preencha:

```dotenv
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_SECRET_KEY=sb_secret_SUA_CHAVE
PORT=3000
```

A chave secreta fica em **Settings → API Keys**. Também é aceita a chave legada `service_role` em `SUPABASE_SERVICE_ROLE_KEY`. Não use `anon` ou `publishable`. Mantenha a Data API habilitada com o schema `public` exposto.

4. Execute `npm.cmd start` ou `node server.mjs` e abra **http://localhost:3000**. O servidor carrega `.env` automaticamente e imprime **Supabase conectado** após consultar o banco. Não há dependências npm para instalar.

Sem URL e chave, o projeto mantém o modo local. Com configuração incompleta ou falha no Supabase, o servidor informa o erro e não troca silenciosamente para arquivo.

## Funcionamento

- `people`: nome, ID único sem distinção de caixa, autorização, cinco descritores de 128 números, modelo e data de cadastro.
- `access_history`: tentativas com nome/ID preservados após excluir um cadastro, horário do banco e limite de 2.000 registros. Ao gravar, consulta a autorização atual no banco.
- `access_settings`: limiar, cooldown e landmarks compartilhados pela instalação.
- `access_state`: versão da lista para impedir sobrescritas entre abas.

Os nomes `personId` e `createdAt` preservam o formato JavaScript e precisam de aspas duplas em SQL. O reconhecimento continua no navegador; não é necessário pgvector nem armazenamento de fotos.

O navegador conversa apenas com o servidor Node.js. A chave fica no backend. As tabelas têm RLS e acesso apenas para `service_role`. O modo Supabase não grava dados remotos no localStorage nem depende dos cadastros antigos do navegador.

Durante o reconhecimento, uma consulta leve atualiza configurações e verifica a versão dos cadastros. Descritores só são enviados novamente quando a versão muda. Abrir Pessoas, Histórico ou Configurações atualiza os dados. Falhas de atualização ou gravação durante reconhecimento interrompem a câmera e exibem erro.

Gerencie cadastros pela aplicação: as RPCs mantêm a versão global. Alterações manuais pelo Table Editor não atualizam essa versão; após alterações manuais, reinicie as sessões do navegador para recarregar os cadastros.

O servidor continua escutando apenas em `127.0.0.1`, sem login administrativo. A integração não acrescenta prova de vida nem controle físico de fechaduras.

## Migrar cadastros existentes

Com `.env` configurado e o SQL executado, pare o aplicativo e rode:

```powershell
npm.cmd run migrate:supabase
```

Transfere as pessoas de `banco.json` apenas se o Supabase estiver vazio e na versão inicial. Valida os descritores, preserva o arquivo original e cancela se houver dados remotos. Depois, inicie o servidor. Não há importação automática de arquivo ou navegador no modo Supabase.

O histórico e as configurações anteriores do localStorage permanecem no navegador e não são importados. No Supabase, o histórico começa vazio e as configurações começam com os padrões do projeto.

## Verificar

```powershell
npm.cmd test
npm.cmd run check
```

Os testes usam dados sintéticos e um servidor Supabase simulado para testar o contrato HTTP. Para validar sua instância, cadastre uma pessoa, recarregue, bloqueie/autorize e confira as tabelas no painel. Confira também histórico e configurações após recarregar. Um conflito de versão exige recarregar antes de repetir a edição.

O SQL é transacional e pode ser executado novamente sobre as tabelas criadas pelo projeto. `IF NOT EXISTS` não converte tabelas homônimas de outros projetos.

Referências oficiais:
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/api/api-keys
- https://supabase.com/docs/guides/api/creating-routes
