import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const require = createRequire("C:\\Users\\FernandoPC\\.gemini\\antigravity\\scratch\\rea\\package.json");
const asar = require("@electron/asar");

const rootDir = path.resolve(import.meta.dirname, '..');
const appExtractedDir = path.join(rootDir, 'app-extracted');
const backupsDir = path.join(rootDir, 'backups');
const buildDir = path.join(rootDir, 'build');
const buildAsarPath = path.join(buildDir, 'app.asar');

const installedAppDir = path.join(process.env.LOCALAPPDATA, 'Programs', 'cs-demo-manager');
const installedAsarPath = path.join(installedAppDir, 'resources', 'app.asar');

const desktopBackup1 = 'C:\\Users\\FernandoPC\\Desktop\\Instalacao_Outro_PC\\app.asar';
const desktopBackup2 = 'C:\\Users\\FernandoPC\\Desktop\\Backup_CS_Demo_Manager_Estavel\\app.asar';

console.log('========================================================');
console.log('   SISTEMA DE ATUALIZACAO AUTOMATICA - CS DEMO MANAGER  ');
console.log('========================================================\n');

// 1. Verificar instalação do CS Demo Manager
if (!fs.existsSync(installedAsarPath)) {
  console.log(`[AVISO] Arquivo app.asar nao encontrado em: ${installedAsarPath}`);
} else {
  console.log(`[1/5] Verificando versao instalada em: ${installedAsarPath}`);
  try {
    const pkgJsonBuf = asar.extractFile(installedAsarPath, 'package.json');
    const installedPkg = JSON.parse(pkgJsonBuf.toString('utf8'));
    const installedVersion = installedPkg.version;
    console.log(`[INFO] Versao instalada detectada: v${installedVersion}`);

    let localVersion = 'desconhecida';
    const localPkgPath = path.join(appExtractedDir, 'package.json');
    if (fs.existsSync(localPkgPath)) {
      localVersion = JSON.parse(fs.readFileSync(localPkgPath, 'utf8')).version;
    }

    // Verificar se a versão instalada é uma atualização oficial limpa
    const installedServerJs = asar.extractFile(installedAsarPath, 'server.js').toString('utf8');
    const isCleanOfficial = !installedServerJs.includes('escFfPath');

    if (isCleanOfficial) {
      console.log(`\n>>> NOVA ATUALIZACAO OFICIAL DETECTADA! (v${installedVersion}) <<<`);
      console.log('Extraindo a nova versao oficial para preservar o codigo base novo...');

      // Limpar app-extracted antigo
      fs.rmSync(appExtractedDir, { recursive: true, force: true });
      fs.mkdirSync(appExtractedDir, { recursive: true });

      // Extrair o novo app.asar oficial
      asar.extractAll(installedAsarPath, appExtractedDir);
      console.log(`[INFO] Extraido com sucesso para ${appExtractedDir}`);

      // Salvar backups limpos da nova versão oficial
      const assetFiles = fs.readdirSync(path.join(appExtractedDir, 'assets'));
      const uiFile = assetFiles.find(f => f.startsWith('index-') && f.endsWith('.js') && !f.endsWith('.map'));

      fs.copyFileSync(path.join(appExtractedDir, 'server.js'), path.join(backupsDir, `server.js.${installedVersion}.orig.bak`));
      fs.copyFileSync(path.join(appExtractedDir, 'server.js'), path.join(backupsDir, 'server.js.321.orig.bak'));
      if (uiFile) {
        fs.copyFileSync(path.join(appExtractedDir, 'assets', uiFile), path.join(backupsDir, `${uiFile}.orig.bak`));
      }
      fs.copyFileSync(path.join(appExtractedDir, 'package.json'), path.join(backupsDir, `package.json.${installedVersion}.bak`));
      console.log('[INFO] Backups originais da nova versao salvos em backups/');
    } else {
      console.log(`[INFO] A versao instalada (v${installedVersion}) ja contem modificacoes customizadas.`);
    }
  } catch (err) {
    console.log(`[AVISO] Nao foi possivel inspecionar app.asar instalado: ${err.message}`);
  }
}

// 2. Aplicar Patches
console.log('\n[2/5] Aplicando todas as modificacoes customizadas...');
try {
  execSync(`node "${path.join(rootDir, 'scripts', 'apply-patches.mjs')}"`, { stdio: 'inherit' });
} catch (err) {
  console.error('\n[ERRO] Falha ao aplicar patches nas fontes!');
  process.exit(1);
}

// 3. Empacotar app.asar
console.log('\n[3/5] Empacotando novo app.asar...');
fs.mkdirSync(buildDir, { recursive: true });
await asar.createPackage(appExtractedDir, buildAsarPath);
console.log(`[INFO] Pacote gerado com sucesso em: ${buildAsarPath}`);

// 4. Fechar CS Demo Manager se estiver aberto
console.log('\n[4/5] Encerrando processos do CS Demo Manager para atualizacao...');
try {
  execSync('taskkill /F /IM cs-demo-manager.exe >nul 2>&1');
} catch {}

// 5. Copiar para o aplicativo instalado e para os backups da área de trabalho
console.log('\n[5/5] Instalando nova versao...');
if (fs.existsSync(installedAppDir)) {
  fs.copyFileSync(buildAsarPath, installedAsarPath);
  console.log(`[SUCESSO] Instalado em: ${installedAsarPath}`);
} else {
  console.log(`[AVISO] Pasta do programa nao encontrada: ${installedAppDir}`);
}

// Copiar para os backups do Desktop
try {
  if (fs.existsSync(path.dirname(desktopBackup1))) {
    fs.copyFileSync(buildAsarPath, desktopBackup1);
    console.log(`[BACKUP] Copiado para: ${desktopBackup1}`);
  }
} catch (e) {
  console.log(`[AVISO] Falha ao copiar para ${desktopBackup1}: ${e.message}`);
}

try {
  if (fs.existsSync(path.dirname(desktopBackup2))) {
    fs.copyFileSync(buildAsarPath, desktopBackup2);
    console.log(`[BACKUP] Copiado para: ${desktopBackup2}`);
  }
} catch (e) {
  console.log(`[AVISO] Falha ao copiar para ${desktopBackup2}: ${e.message}`);
}

console.log('\n========================================================');
console.log('   TUDO PRONTO! CS DEMO MANAGER ATUALIZADO COM SUCESSO!  ');
console.log('========================================================\n');
