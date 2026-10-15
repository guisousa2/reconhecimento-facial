# Accesso — protótipo de controle de acesso facial

## Executar localmente

Requisitos: Node.js 20.11 ou superior, webcam e Chrome/Edge atual. Não há dependências npm para instalar; o servidor usa módulos nativos do Node. Bibliotecas de visão e modelos são carregados no navegador com versões fixas.

```powershell
cd C:\Users\25011990\Desktop\mediapipe
node server.mjs
```

Abra **http://localhost:3000** e permita o acesso à câmera. Alternativamente use `npm.cmd start` no Windows (evita o bloqueio de npm.ps1 pelo PowerShell). A primeira inicialização precisa de internet para baixar modelos, bibliotecas e WASM. Aguarde os estados MediaPipe Ativo e Reconhecimento Pronto.

Não abra index.html diretamente. Câmera exige localhost ou HTTPS. Este servidor escuta somente em 127.0.0.1. Para outro domínio/dispositivo, configure hospedagem HTTPS.

Se a permissão for negada, clique no ícone de permissões ao lado do endereço, permita Câmera e clique em Iniciar câmera (ou tentar câmera novamente no cadastro). Se estiver ocupada, feche Teams/Zoom e tente novamente.

## Fluxo completo

1. Abra Pessoas Cadastradas → Cadastrar pessoa.
2. Informe nome, ID único e se o acesso está autorizado.
3. Aguarde os modelos. Posicione um único rosto frontal, com boa iluminação.
4. Clique em Capturar rosto e salvar. Cinco amostras de frames diferentes são coletadas (~5 segundos). Mova suavemente a cabeça. O cadastro é salvo apenas com as cinco amostras consistentes.
5. Volte a Controle de Acesso. Três comparações consecutivas confirmam a decisão (~3 segundos, conforme desempenho).
6. O resultado mostra nome, autorização/negação e horário. Desconhecidos são negados. Pessoas cadastradas bloqueadas são identificadas, mas negadas.
7. Confira Histórico. Há busca por nome/ID e exportação CSV. Intervalo padrão de 20 segundos evita registros repetidos da mesma identidade.
8. Pessoas permite bloquear, autorizar e remover. Configurações permite alterar distância máxima, cooldown e visualização de landmarks.

Sem rosto e múltiplos rostos reiniciam a sequência de identificação/captura. A coleta expira após 45 segundos sem sucesso. A câmera é encerrada ao abrir telas sem câmera, ocultar a aba e sair da página; ao voltar, clique em Iniciar câmera. Nenhum registro fictício ou pessoa de exemplo é pré-carregado.

## Como funciona

**MediaPipe Tasks Vision FaceLandmarker** (`0.10.22-rc.20250304`) detecta até três rostos e landmarks, usando os limiares 0,7 para detecção, presença e rastreamento. O modelo oficial float16 versão 1 vem do Google Storage. MediaPipe participa de cada frame analisado e impede reconhecimento quando não há exatamente um rosto.

**FaceAPI** (`@vladmandic/face-api@1.7.15`, TensorFlow.js) utiliza TinyFaceDetector, FaceLandmark68Net e FaceRecognitionNet para gerar descritores reais de 128 dimensões. MediaPipe sozinho não identifica pessoas: landmarks geométricos não são usados como identidade.

As duas redes analisam o mesmo snapshot temporário da câmera. É exigido exatamente um rosto também no FaceAPI, confiança >= 0,8 e região facial de pelo menos 100 × 100 pixels. O descritor é comparado localmente com as cinco amostras de cada pessoa por distância euclidiana. A menor distância deve ser <= 0,45 por padrão, com margem mínima de 0,08 para a segunda identidade. Distância não é uma probabilidade de acerto. Ambiguidade e dados insuficientes não autorizam.

São exigidas três correspondências consecutivas. Um resultado autorizado depende exclusivamente de descritores correspondentes a uma pessoa com autorização ativa. Nome, ID e botões não selecionam a identidade reconhecida.

Loop sequencial: detecção a cada ~150 ms, descritor no máximo a cada 900 ms, além do tempo de inferência. MediaPipe usa CPU para compatibilidade. Vídeo e canvas têm proporção nativa e espelhamento idênticos, sem recorte.

Documentação oficial:
- [MediaPipe Web](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js)
- [FaceAPI](https://github.com/vladmandic/face-api/blob/master/TUTORIAL.md)

## Estrutura

| Arquivo | Responsabilidade |
|---|---|
| index.html / style.css | Interface responsiva e telas |
| src/camera.js | Câmera, permissões, dispositivo e encerramento |
| src/face-engine.js | MediaPipe, snapshots, landmarks e embeddings |
| src/recognition.js | Comparação, ambiguidade, confirmação e cooldown |
| src/storage.js | Repositório local de pessoas, configurações e histórico |
| src/app.js | Coordenação do cadastro, acesso e navegação |
| src/ui.js | Renderização segura, tabelas e CSV |
| server.mjs | Servidor estático local |
| tests/access.test.mjs | Testes das decisões e persistência |

Para substituir reconhecimento, mantenha o contrato detect/describe do FaceEngine e versione os descritores. Modelos diferentes exigem recadastro; não compare embeddings incompatíveis. Para trocar o armazenamento por API, substitua LocalRepository e adapte chamadas para async. Em produção, decisões precisam de servidor confiável.

## Privacidade e limites

Frames não são enviados nem armazenados. Apenas descritores biométricos, dados cadastrais e logs ficam em localStorage (`accesso.v1`), separados por origem/navegador. Remover uma pessoa apaga seus descritores, preservando registros anteriores. Apagar dados do site elimina todos os cadastros e histórico. O histórico retém 2.000 registros; os totais do dashboard refletem os registros retidos.

Descritores também são dados sensíveis. localStorage não tem criptografia e pode ser alterado por quem tem acesso ao navegador. Não há login administrativo.

jsDelivr e Google recebem solicitações normais dos arquivos dos modelos (incluindo IP), mas não frames. Para operar sem internet, hospede bibliotecas, WASM e pesos localmente e altere URLs em face-engine.js, preservando licenças.

**Não há prova de vida/anti-spoofing. Fotos e vídeos podem enganar o sistema. Este protótipo não deve controlar fechaduras reais.** Não há acionamento físico. Valide o limiar com pessoas distintas, poses e iluminação representativas antes de qualquer evolução do projeto.

## Testes e validação física

```powershell
node scripts/check.mjs
node --test tests/access.test.mjs
```

Também disponíveis: `npm.cmd run check` e `npm.cmd test`.

Testes automatizados usam vetores sintéticos para verificar desconhecidos, ambiguidades, dados inválidos, pessoa bloqueada, três confirmações, cooldown, IDs únicos, persistência e falhas de escrita. Eles não medem acurácia biométrica.

Validação manual necessária com webcam:
- Cadastre pessoa A e confira a lista.
- No controle, confirme A autorizado e registro no histórico.
- Apresente pessoa B não cadastrada e confira negação.
- Bloqueie A e confirme que é identificada com acesso negado.
- Permaneça no quadro e verifique o cooldown.
- Tente cadastrar sem rosto e com duas pessoas: não deve salvar.
- Negue a câmera e bloqueie CDNs: confira erros claros sem autorização.
- Recarregue a página e confira persistência.

A execução física com pessoas reais e a renderização em navegador não foram verificadas automaticamente neste ambiente. As regras de decisão e sintaxe foram testadas, e os endpoints principais de modelos foram conferidos.

## Atualização: usuários no banco.json

O botão **Pessoas Cadastradas → Cadastrar novo usuário** salva nome, ID, autorização e cinco descritores faciais no arquivo `banco.json`, na raiz do projeto. Não salva fotografias. O arquivo é carregado na inicialização; remover e alterar autorização também atualizam o arquivo. Histórico e configurações continuam em localStorage. As descrições anteriores de armazenamento exclusivamente no navegador foram substituídas por este fluxo.

Reinicie `node server.mjs` após atualizar. O servidor deve ter permissão de escrita na pasta. A gravação usa arquivo temporário e substituição atômica, valida os dados e detecta conflitos entre abas. Em caso de conflito, recarregue antes de tentar novamente. Não edite o arquivo enquanto o servidor estiver em uso. Não há autenticação administrativa; utilize apenas no computador local. O arquivo contém dados biométricos sensíveis e não deve ser publicado ou versionado.

Os cadastros anteriores de localStorage são migrados automaticamente somente quando o banco está vazio e ainda na versão 0. Depois da migração, os usuários são removidos da cópia em localStorage. Para backup, copie banco.json com o servidor parado. Se apagar o arquivo, o servidor cria um novo vazio. JSON inválido nunca é sobrescrito automaticamente.

## Clonar pelo GitHub

O arquivo banco.json real fica fora do Git para preservar os dados biométricos. Ao executar `node server.mjs` pela primeira vez, ele será criado vazio automaticamente. banco.example.json documenta o formato inicial. Não é necessário enviar banco.json ao GitHub.
