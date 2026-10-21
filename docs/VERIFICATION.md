# Verifiering

## Automatiserade kontroller

14 regeltester täcker påsen, start och anslutning, förlängning BOK → BOKEN,
korsningar, sidokontakt, glapp, gamla brickor och förbrukade bonusrutor,
multiplicerade ordbonusar, jokrar, åttabricksbonus, böjningsformer, byten,
turordning, idempotens och båda avslutssätten.

HTTP-integrationstestet skapar två spelare via API:t och provar privata ställ,
engångsinbjudan, återförsök, obehöriga anrop, fel tur, förfalskade brickor,
förhandsgranskning, samtidiga dubbelskick, gammal matchversion, påfyllning,
byte, passningar och återupptagen slutställning. Det använder riktiga
slumpade brickor och den importerade ordlistan.

## Webbläsare

En hel match spelades i två separata webbläsarsessioner (inbyggd webbläsare
och Chrome). TÅG gav 12 poäng, BOG korsade befintligt G och gav 6, och
förlängningen TÅGEN gav 8. Matchen avslutades efter ett byte och fem
passningar; slutställningen var 5 till −5 efter avdrag.

Preliminära brickor bevarades vid omladdning. Ett nätfel simulerades med
webbläsarens nätverk avstängt inför ett drag. Återförsök efter återanslutning
gav exakt ett genomfört drag. Slutställningen överlevde omladdning.

Mobilvyn granskades vid 320 × 568, 390 × 844 och liggande 844 × 390.
Bräde och spelknappar ryms utan horisontellt sidöverflöde. På minsta
skärmen minskar översiktsbrädet med bibehållen zoom. I liggande läge ligger
bräde och ställ sida vid sida. Större surfplatte- och datorvyer har också
granskats. Vita brickor, svart text, bonusfärger och skuggor kontrollerades
visuellt. Skärmbilder sparas lokalt under ignorerade `outputs/`.

Tryckplacering, tangentbordets piltangenter/Enter, drag från stället,
drag tillbaka till stället, plus/minus-zoom, återställning och panorering
provades i webbläsaren. Inzoomat bräde lämnar ställ och knappar synliga.

## Gränser för verifieringen

Mobilstorlekarna är webbläsaremulering. Ingen fysisk iPhone, Androidtelefon
eller surfplatta har testats. Tvåfingersgesten är implementerad men har inte
verifierats på fysisk pekskärm. Reducerad rörelse stöds i CSS.

## Hemskärm och omspel (2026-10-21)

HTTP-testet omfattar samtidiga omspelsförfrågningar från båda spelarna,
återförsök, bevarad slutställning, nya privata ställ och återupptagning via
originalmatchens länk efter två omspel. Cookie-baserad återställning provas
för båda spelarna utan localStorage, inklusive nekade obehöriga, förfalskade
och cross-site-förfrågningar. Manifest, metadata och PNG-ikoner kontrolleras.

I två separata webbläsarsessioner (Chrome och inbyggd webbläsare) startade Bo
omspel efter Anna/Bo-matchen. Anna öppnade samma nya match; båda hade 0 poäng,
åtta egna brickor och ett tomt bräde. Båda återöppnade samma match och egen
spelarroll från hemskärmens startadress. Mobilknappen granskades vid
390 × 844 och 320 × 568; den ryms i synlig vy. Liggande 844 × 390 granskades
utan horisontellt överflöde. Skärmbild: `outputs/mobile-play-again.jpg`.

Detta är webbläsar- och API-verifiering. Installation på fysisk iPhone/Android,
cookieöverföring vid faktisk iOS-installation och återstart av en telefon
har inte testats fysiskt.
Typkontroll, samtliga 14 regeltester, produktionsbygget och det utökade
HTTP-testet mot den byggda Workern gick igenom. En avvisad POST läses nu
klart inom storleksgränsen innan svaret skickas; testet verifierar även att
startsidan fortsatt svarar efter den avvisade förfrågan.


## Enkel startsida och fasta koder (2026-10-21)

Startadressen `/` visar nu Mina matcher i stället för att öppna senaste matchen.
`tests/player-hub.mjs` verifierar fast kod, dubblettförfrågan, godkännande av rätt
värd, separat spelarplats, egen andra enhet, motspelarens ersättningstelefon,
cookieåterställning utan localStorage, omspel och automatiskt uppdaterad matchlista.
Obehörig läsning, främmande Origin, förfalskad lokal inloggning, ogiltig import och
kodbegränsning avvisas. Exporterade privata länkar följer omspel; exporterade
inbjudningar kan inte läsa brickor. Befintliga spel-/regeltester bibehålls.

I inbyggd webbläsare och separat Chrome-session skapades Joakim test/Mamma test.
Mamma angav samma fasta testkod, värden släppte in henne och hon öppnade sitt eget
ställ. Återöppning av enbart startsidan visade rätt match utan kod eller inloggning.
Startsida/knappar granskades i mobilstorlek 390×844, koddialog vid 320×568 och
startsida vid 820×1180. Ingen horisontell klippning hittades. Skärmbilder ligger
under `outputs/`. Detta är emulering, inte fysisk telefon- eller hemskärmsprovning.

ChatGPT-inloggning använder den befintliga Sites-hjälparen och produktionsgatewayen.
En verklig inloggning på två fysiska enheter och faktisk cookieöverföring till
hemskärmsappen ingår inte i den lokala verifieringen.


## Kompakt spelvy och kvadratiska brickor (2026-10-21)

Spelhuvudet har ersatts av en 48 px hög navigeringsrad. Brädet anpassas till
utrymmet som återstår efter poängrad, brickställ och spelknappar. Breda, låga
fönster visar stället bredvid brädet. Startsidan behåller sin vanliga layout.
Brickställ, bytesdialog, jokerknappar, exempelbrickor och dragbrickan är kvadratiska.
Öva själv har inte lagts till, enligt användarens ändrade önskemål.

I en separat lokal testmatch verifierades verkliga pekarhändelser från ställ till
bräde, kvadratisk dragbricka (58×58 px), klickplacering, giltig BO-förhandsvisning
(+6), bekräftat drag och påfyllning till åtta brickor. Zoom till 160 procent höll
spelknappen synlig. DOM-mått verifierade lika långa bricksidor, synligt bräde och
spelknappar samt inget sidöverflöde vid 320×568, 375×667, 390×844, 768×1024,
1280×720, 1280×800, 1280×1000, 844×390 och 568×320.
Skärmbilder: `outputs/compact-game-desktop.jpg`, `outputs/compact-game-mobile.jpg`.
Detta är webbläsaremulering och musprovning, inte test på fysisk telefon.


## Web Push-notiser (2026-10-21)

Startsidan visar en Aktivera notiser-knapp. Webbläsarprovet verifierade att
behörighet begärs först under trycket, registreringen sparas, Notiser är på
visas och Konto kan stänga av dem. Vyn ryms vid 320 px. Telefonens
behörighetsdialog och PushManager prenumeration simulerades; ingen fysisk
telefon eller verklig Apple-/Google-pushleverans har verifierats.

22 regel-/push-/service worker-tester går igenom. Push-krypteringen
verifieras med oberoende RFC 8291-dekryptering. Mottagarval, samtidiga
dubbletter, 410-rensning, tillfälliga leveransfel och öppning av rätt match
provas. Privata spelarnycklar ingår inte i notiserna.

Push-API-, spel-API- och spelarhubbstester passerade mot både utvecklingsserver
och den byggda lokala Workern. Typkontroll, produktionsbygge och diffkontroll
passerade. Testerna skapade endast lokala testdata. Den nya migrationen och
Sites-runtimevärdena måste appliceras vid publicering; lokala privata
nycklar ligger enbart i ignorerade .dev.vars.
