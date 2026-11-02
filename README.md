# CS Demo Manager Custom (Reconstruído via REA)

Clone completo e reconstrução estrutural da aplicação **CS Demo Manager (`v3.20.1`)** realizada utilizando o **REA (`rea-agents@6.8.0`)**.

## Estrutura do Projeto Reconstruído

- `src/` — **2.408 arquivos TypeScript/React (`.ts` / `.tsx`) originais** integralmente recuperados dos Source Maps embutidos e inline (`main.js.map`, `server.js.map`, `cli.js.map`, `assets/index-CaMMgvc3.js.map`, `preload.js`):
  - `src/electron-main/` — Processo principal do Electron (`main.ts`, `window-manager.ts`, `auto-updater.ts`, `create-web-socket-server-process.ts`, menus e tray).
  - `src/preload/` — Script de Preload e ponte `contextBridge.exposeInMainWorld('csdm', api)` com 73 membros expostos (`preload.ts`, `element-to-image.ts`, `get-demo-audio-data.ts`).
  - `src/server/` — Servidor WebSocket local em processo dedicado (`server.ts`, handlers do renderer e do processo do jogo, fila de downloads e análises).
  - `src/node/` — Camada de banco de dados PostgreSQL (migrations v1–v9, queries de partidas/rounds/players/kills), integração Steam/CS2/CSGO, HLAE, FFmpeg, VirtualDub e geração de vídeo/XLSX/JSON.
  - `src/ui/` — Aplicação React completa (componentes, hooks, Redux store/slices, visualizador 2D, estatísticas de partidas, jogadores, heatmaps, downloads e configurações).
  - `src/cli/` — Comandos de linha de comando (`csdm` CLI: `analyze`, `download-valve`, `download-faceit`, `download-5eplay`, `download-renown`, `json`, `xlsx`, `video`).
  - `src/common/` — Tipos compartilhados, canais IPC (`IPCChannel`), códigos de erro e utilitários.
- `app-extracted/` — Conteúdo integral extraído de `resources/app.asar` (pronto para modificação direta ou reempacotamento via `npm run repack:asar`).
- `static/` — Binários auxiliares e assets estáticos:
  - `static/csda.exe` — Analisador de demos em Go (`github.com/akiver/cs-demo-analyzer/cmd/cli`, Go `1.23.12`).
  - `static/csdm.dll` — Plugin nativo 32-bit para Source Engine (`CreateInterface`).
  - `static/boiler-writter/boiler-writter.exe` — Utilitário C++ para captura de partidas da Valve/Steam.
  - `static/cs2/` & `static/csgove/` — Plugins/recursos de playback para CS2 e CS:GO.
  - `static/images/` — Mapas, radares, ranks, armas e ícones.
- `translations/` — Arquivos de tradução (`pt-BR`, `en`, `es`, `fr`, `de`, `ru`, `zh-CN`, `zh-TW`).

## Achados de Engenharia Reversa (REA)

| Artefato | Operação REA | Evidence ID | Destaques |
| :--- | :--- | :--- | :--- |
| `resources/app.asar` | `analyze_javascript_application` | `ev_067ffb80d4571b53d2c2ffd295c13f97ecb10147a3ad3f68412f98226a03cd23` | 37 arquivos no container ASAR, `contextBridge` expondo `window.csdm` (73 membros), 33 canais IPC literais, 1.546 findings estáticos. |
| `cs-demo-manager.exe` | `inspect_electron_fuses` | `ev_b6618765cb1077f5f3a1d23e1ae5eb2e7d1f078e3f05d557498b1ca6f164b876` | `RunAsNode: enabled`, `EnableNodeCliInspectArguments: enabled`, `EnableEmbeddedAsarIntegrityValidation: disabled`, `OnlyLoadAppFromAsar: disabled`. |
| `static/csda.exe` | `inspect_go_binary` | `ev_922c0b95dad3f8af2a89680903b8ab7cc09f98b738c8ccd6e8b019c9627ca76a` | Compilado com `go1.23.12`, módulo `github.com/akiver/cs-demo-analyzer` (rev `16f250f472ea747d7599705d485a2935ac4b52a2`), usando `demoinfocs-golang/v4`. |
| `static/csdm.dll` | `inspect_native_exports` | `ev_944e0931eadcba3808b9fff94dbb937d9f6c4e6566d3e86a29d1215733bda691` | PE32 (x86), exporta `CreateInterface` (`0x1001ddb0`, ordinal 1). |
| `get_running_process_exit_code-L7TSWUHJ.node` | `inspect_native_exports` | `ev_128c2831bdeb8338f82b1fdabe5fcf7e9a6f7b2a38bec9cdaa46ac5fbff42f42` | Addon nativo N-API x64 (`napi_register_module_v1`). |
| `registry-TMGWVEEM.node` | `inspect_native_exports` | `ev_1ccba1928bbd6479c0d44ce4d618c69ba346348aa55244af1914792b5bad4987` | Addon nativo N-API x64 para leitura/escrita do Registro do Windows (`napi_register_module_v1`). |
| `static/boiler-writter/boiler-writter.exe` | `inspect_pe_imports` | `ev_6404237a52a8a5968591716ff70abcf3e21bd05b24be2fbff7654231072e963a` | PE32+ x64, 112 imports em 2 DLLs (`steam_api64.dll` e `KERNEL32.dll`), imphash `6b7f8a5bd3dd91260faae775cc530345`. |

## Como Executar ou Reempacotar Customizações

Como os Electron Fuses `OnlyLoadAppFromAsar` e `EnableEmbeddedAsarIntegrityValidation` estão **desabilitados** (`disabled`) no executável original:

1. **Executar diretamente a versão customizada descompactada (`app-extracted`) usando o runtime Electron instalado**:
   ```powershell
   & "C:\Users\FernandoPC\AppData\Local\Programs\cs-demo-manager\cs-demo-manager.exe" "C:\Users\FernandoPC\.gemini\antigravity\scratch\cs-demo-manager-custom\app-extracted"
   ```
2. **Gerar um novo `app.asar` após editar arquivos em `app-extracted/`**:
   ```powershell
   node scripts/repack-asar.mjs
   ```
