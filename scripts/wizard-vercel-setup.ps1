# Wizard de provisionnement Vercel pour top-des-tops (copie de test uniquement).
# Compatible Windows PowerShell 5.1 et PowerShell 7.
# Lancer depuis n'importe ou :
#   powershell -ExecutionPolicy Bypass -File scripts\wizard-vercel-setup.ps1

$ErrorActionPreference = 'Continue'
Set-Location (Split-Path -Parent $PSScriptRoot)
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$EnvFile = Join-Path (Get-Location).Path '.env'
$TotalStages = 10
$script:StageIndex = 0
$script:Skipped = @()

function Say($t)  { Write-Host "  $t" }
function Step($t) { Write-Host "  * $t" -ForegroundColor Cyan }
function Note($t) { Write-Host "  $t" -ForegroundColor DarkGray }
function Warn($t) { Write-Host "  ! $t" -ForegroundColor Yellow }
function Ok($t)   { Write-Host "  OK $t" -ForegroundColor Green }
function Fail($t) { Write-Host "  X $t" -ForegroundColor Red; exit 1 }

function Stage($name) {
  Clear-Host
  $script:StageIndex++
  Write-Host ""
  Write-Host "> Etape $($script:StageIndex)/$TotalStages - $name" -ForegroundColor Blue
}

function Pause-Wizard($msg) { Read-Host "  $msg" | Out-Null }

function Confirm-Yes($q) {
  $r = Read-Host "  ? $q [o/N]"
  return ($r -match '^[oOyY]')
}

function Open-Url($url) {
  Write-Host "  -> ouverture de $url" -ForegroundColor Green
  try { Start-Process $url } catch { Warn "Navigateur non ouvert, va sur : $url" }
}

function Get-EnvValue($key) {
  if (-not (Test-Path -LiteralPath $EnvFile)) { return $null }
  $line = Get-Content -LiteralPath $EnvFile | Where-Object { $_ -like "$key=*" } | Select-Object -Last 1
  if ($line) { return $line.Substring($key.Length + 1) }
  return $null
}

function Set-EnvValue($key, $value) {
  $lines = @()
  if (Test-Path -LiteralPath $EnvFile) {
    $lines = @(Get-Content -LiteralPath $EnvFile | Where-Object { $_ -notlike "$key=*" })
  }
  $lines += "$key=$value"
  [System.IO.File]::WriteAllLines($EnvFile, [string[]]$lines, $Utf8NoBom)
  Ok "$key ecrit dans .env (fichier ignore par git)"
}

function Ask($key, $prompt) {
  $current = Get-EnvValue $key
  if ($current) { $answer = Read-Host "  $prompt [Entree = garder '$current']" }
  else { $answer = Read-Host "  $prompt" }
  if ([string]::IsNullOrWhiteSpace($answer) -and $current) { $answer = $current }
  return $answer.Trim()
}

Clear-Host
Write-Host ""
Write-Host "  top-des-tops -> Vercel : provisioning de la copie de test" -ForegroundColor Blue
Write-Host "  $TotalStages etapes" -ForegroundColor DarkGray
Write-Host ""
Note "Tu pilotes le navigateur ; ce wizard te dit quoi faire et recupere les valeurs."
Note "Ctrl-C pour arreter, relance plus tard : il retient ce qui est deja saisi (.env)."
Pause-Wizard "Pret ? (Entree)"

# --- Etape 1 : CLI Vercel + connexion + lien ------------------------------
Stage "CLI Vercel : installation, connexion, lien de projet"
Say "On installe la CLI Vercel si besoin, puis on connecte ce dossier a un projet Vercel."
if (-not (Get-Command vercel -ErrorAction SilentlyContinue)) {
  Step "Installation de la CLI Vercel (npm i -g vercel)..."
  & npm i -g vercel
  if ($LASTEXITCODE -ne 0) { Fail "npm i -g vercel a echoue. Corrige l'erreur ci-dessus puis relance le wizard." }
  if (-not (Get-Command vercel -ErrorAction SilentlyContinue)) {
    Fail "Vercel est installe mais pas encore dans le PATH : ferme et rouvre PowerShell, puis relance le wizard."
  }
} else {
  Note "CLI Vercel deja installee."
}
$who = & vercel whoami 2>$null
if ($LASTEXITCODE -eq 0 -and $who) {
  Note "Deja connecte a Vercel en tant que $who."
} else {
  Step "Connexion a ton compte Vercel (vercel login) - suis les instructions a l'ecran."
  & vercel login
  if ($LASTEXITCODE -ne 0) { Fail "vercel login a echoue. Relance le wizard apres avoir corrige." }
}
if (Test-Path -LiteralPath '.vercel\project.json') {
  Note "Dossier deja lie a un projet Vercel (.vercel\project.json)."
} else {
  Step "Lien de ce dossier a un projet Vercel (vercel link) - si on te demande un nom de nouveau projet, propose : top-des-tops-vercel."
  & vercel link
  if ($LASTEXITCODE -ne 0) { Fail "vercel link a echoue. Relance le wizard apres avoir corrige." }
}

# --- Etape 2 : Google Cloud projet + compte de service --------------------
Stage "Google Cloud : projet + compte de service"
Say "On cree (ou reutilise) un projet Google Cloud, on active l'API Sheets, puis on cree un compte de service avec une cle JSON."
Open-Url "https://console.cloud.google.com/projectcreate"
Step "Cree un nouveau projet (ou choisis-en un existant dans le selecteur en haut) - note son ID (ex: top-des-tops-bridge)."
$GcpProjectId = Ask 'GCP_PROJECT_ID' "ID du projet Google Cloud utilise :"
Open-Url "https://console.cloud.google.com/apis/library/sheets.googleapis.com?project=$GcpProjectId"
Step "Clique sur 'Activer' pour activer Google Sheets API sur ce projet (si ce n'est pas deja fait)."
Pause-Wizard "Une fois l'API activee, appuie sur Entree."
Open-Url "https://console.cloud.google.com/iam-admin/serviceaccounts/create?project=$GcpProjectId"
Step "Cree un compte de service (nom libre, ex: top-des-tops-sheets-reader). Pas de role IAM projet necessaire : l'acces au Sheet se fait par partage direct (etape suivante)."
Step "Une fois cree, ouvre-le dans la liste > onglet 'Cles' (Keys) > Ajouter une cle > Creer une cle > format JSON. Le fichier se telecharge tout seul."
$GcpSaEmail = Ask 'GCP_SA_EMAIL' "Colle l'adresse email du compte de service (finit par .iam.gserviceaccount.com) :"
Note "Astuce : dans l'Explorateur, Maj + clic droit sur le fichier > 'Copier en tant que chemin', puis colle ici (les guillemets sont geres)."
$KeyPath = (Read-Host "  Chemin complet vers le fichier JSON telecharge").Trim().Trim('"')
Set-EnvValue 'GCP_PROJECT_ID' $GcpProjectId
Set-EnvValue 'GCP_SA_EMAIL' $GcpSaEmail
Note "Le chemin de la cle n'est pas ecrit dans .env (il pointe vers un fichier secret) : retenu seulement pour cette session."

# --- Etape 3 : Partage du Sheet de test -----------------------------------
Stage "Partage du Google Sheet de test"
Say "Le compte de service doit avoir acces en lecture au Sheet de test - sinon toute lecture echouera en 403."
Open-Url "https://docs.google.com/spreadsheets/d/1IpnM_k7sicaktxtvwaYMiMnFbnJz6nhsELmagF1WS78/edit"
Step "Bouton 'Partager' (en haut a droite) > colle l'adresse : $GcpSaEmail > role 'Lecteur' > Envoyer."
Note "Lecteur suffit : ce plan (1/6) est en lecture seule (scope OAuth spreadsheets.readonly)."
Note "L'elevation a Editeur se fera explicitement au Plan 2, quand des ecritures seront introduites."
if (-not (Confirm-Yes "Le Sheet est bien partage avec $GcpSaEmail en role Lecteur ?")) {
  Warn "Sans ce partage, /api/health repondra 403 - reviens a cette etape avant de continuer."
}

# --- Etape 4 : Variable d'environnement Vercel ----------------------------
Stage "Variable d'environnement Vercel : GOOGLE_SERVICE_ACCOUNT_KEY"
Say "On envoie le contenu du fichier JSON (une seule ligne) comme variable d'environnement Vercel - jamais commitee dans le repo."
if (Test-Path -LiteralPath $KeyPath) {
  $keyContent = ([System.IO.File]::ReadAllText($KeyPath)) -replace "[\r\n]", ''
  Step "Envoi vers Vercel (vercel env add GOOGLE_SERVICE_ACCOUNT_KEY production)..."
  & vercel env rm GOOGLE_SERVICE_ACCOUNT_KEY production -y 2>$null | Out-Null
  $keyContent | & vercel env add GOOGLE_SERVICE_ACCOUNT_KEY production
  if ($LASTEXITCODE -ne 0) {
    Warn "vercel env add a echoue. Configure la variable a la main : dashboard Vercel > ton projet > Settings > Environment Variables > GOOGLE_SERVICE_ACCOUNT_KEY (JSON complet en une ligne) > Production."
    $script:Skipped += "Variable Vercel GOOGLE_SERVICE_ACCOUNT_KEY (a faire a la main)"
  } else {
    Ok "Variable envoyee. Le contenu de la cle n'a ete ecrit dans aucun fichier de ce repo."
  }
} else {
  Warn "Fichier introuvable a ce chemin : $KeyPath"
  Step "Configure la variable a la main : dashboard Vercel > ton projet > Settings > Environment Variables > GOOGLE_SERVICE_ACCOUNT_KEY (JSON complet en une ligne) > Production."
  $script:Skipped += "Variable Vercel GOOGLE_SERVICE_ACCOUNT_KEY (fichier de cle introuvable a $KeyPath - a faire a la main)"
}

# --- Etape 5 : Premier deploiement ----------------------------------------
Stage "Premier deploiement"
Say "On deploie en production pour obtenir une vraie URL Vercel."
$deployLines = @()
& vercel --prod 2>&1 | ForEach-Object { $t = "$_"; Write-Host "  $t"; $deployLines += $t }
if ($LASTEXITCODE -ne 0) { Fail "vercel --prod a echoue. Lis l'erreur ci-dessus, corrige, puis relance le wizard." }
$urlMatches = [regex]::Matches(($deployLines -join "`n"), 'https://[a-zA-Z0-9.-]+\.vercel\.app')
if ($urlMatches.Count -gt 0) {
  $DeployUrl = $urlMatches[$urlMatches.Count - 1].Value
  Note "URL detectee : $DeployUrl"
} else {
  $DeployUrl = (Read-Host "  Je n'ai pas trouve l'URL dans la sortie ci-dessus - colle l'URL de deploiement affichee").Trim()
}
Set-EnvValue 'DEPLOY_URL' $DeployUrl

# --- Etape 6 : Mise a jour de tenants.json --------------------------------
Stage "Mise a jour de tenants.json"
Say "On remplace le domaine d'amorcage par le vrai domaine de deploiement."
$DeployHost = ($DeployUrl -replace '^https?://', '').TrimEnd('/')
$tenantsPath = Join-Path (Get-Location).Path 'tenants.json'
Step "Remplacement de REPLACE_WITH_YOUR_VERCEL_TEST_DOMAIN par $DeployHost dans tenants.json..."
$tenantsText = [System.IO.File]::ReadAllText($tenantsPath)
$tenantsText = $tenantsText.Replace('REPLACE_WITH_YOUR_VERCEL_TEST_DOMAIN', $DeployHost)
[System.IO.File]::WriteAllText($tenantsPath, $tenantsText, $Utf8NoBom)
Set-EnvValue 'DEPLOY_HOST' $DeployHost
Note "tenants.json mis a jour localement - pense a le committer (derniere etape de ce wizard)."

# --- Etape 7 : Redeploiement ----------------------------------------------
Stage "Redeploiement avec tenants.json a jour"
Say "Le premier deploiement embarquait encore l'ancien tenants.json - on redeploie pour prendre en compte le vrai domaine."
& vercel --prod
if ($LASTEXITCODE -ne 0) { Fail "vercel --prod a echoue. Lis l'erreur ci-dessus, corrige, puis relance le wizard." }

# --- Etape 8 : Verification /api/health -----------------------------------
Stage "Verification /api/health"
Say "On verifie que toute la chaine (tenant -> authentification Google -> lecture Sheets) fonctionne reellement."
Step "Requete sur https://$DeployHost/api/health :"
$healthResponse = (& curl.exe -s "https://$DeployHost/api/health") -join ''
Say $healthResponse
if ($healthResponse -match '"ok"\s*:\s*true') {
  Ok "ok:true - la chaine fonctionne, le Sheet de test a bien ete lu."
} elseif ($healthResponse -match '\(403\)') {
  Warn "ok:false avec (403) - le Sheet de test n'est probablement pas partage avec $GcpSaEmail (voir etape 3)."
} else {
  Warn "Reponse inattendue - relis le message ci-dessus pour diagnostiquer."
}

# --- Etape 9 : .vercelignore protege les fichiers prives ------------------
Stage "Verification que .vercelignore protege les fichiers prives"
Say "On confirme que le deploiement n'expose PAS les fichiers prives du repo (identifiants de production, docs internes)."
$codeTargets = (& curl.exe -s -o NUL -w "%{http_code}" "https://$DeployHost/deploy-targets.json")
$codeContext = (& curl.exe -s -o NUL -w "%{http_code}" "https://$DeployHost/context.md")
Note "deploy-targets.json -> $codeTargets (doit etre 404)"
Note "context.md -> $codeContext (doit etre 404)"
if ($codeTargets -ne '404' -or $codeContext -ne '404') {
  Warn "ALERTE : un fichier prive repond avec un code different de 404 - il est expose publiquement !"
  Warn "Ne continue PAS avant d'avoir corrige .vercelignore et redeploye (vercel --prod)."
} else {
  Ok "Les fichiers prives ne sont pas exposes."
}

# --- Etape 10 : Rappel avant de committer ---------------------------------
Stage "Dernier rappel avant de committer"
Say "Seul tenants.json (mis a jour) doit etre commite depuis ce wizard."
Warn "Ne JAMAIS committer : le fichier JSON de la cle du compte de service, un .env local, ou tout fichier contenant GOOGLE_SERVICE_ACCOUNT_KEY."
Step "git add tenants.json ; git commit -m `"chore(vercel): set real test-domain tenant`" - a faire toi-meme (ou redemande a Claude)."
Note "URL finale du deploiement de test : https://$DeployHost"

Write-Host ""
Write-Host "  Setup termine" -ForegroundColor Green
if ($script:Skipped.Count -gt 0) {
  Warn "Reste a faire a la main :"
  foreach ($s in $script:Skipped) { Note "  - $s" }
}
Write-Host ""
