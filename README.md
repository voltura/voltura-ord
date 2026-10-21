# Voltura Ord

Ett svenskt ordspel för två personer: 15 × 15 rutor, åtta vita bokstavsbrickor,
privata spelarlänkar och sparade matcher. Byggt med Sites Vinext, React,
TypeScript och Cloudflare D1.

## Köra lokalt

Node.js 22.13+ krävs. Följ Sites-skillens installations- och byggflöde när
projektet används i Sites. För fristående utveckling:

```sh
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_overrated_spirit.sql
npm run dev -- --port 5173
```

Applicera SQL-filen endast en gång på en ny lokal databas. `npm start -- --port
5174` kör den färdigbyggda Workern mot samma lokala databas. Se
[starterdokumentationen](docs/STARTER.md) för körprofiler och övrig infrastruktur.

## Kontrollera

```sh
npm run check
npm test
npm run test:api
```

API-testet kräver en startad lokal server på port 5173. Sätt `TEST_BASE_URL` för
en annan lokal port. Testet skapar egna matcher och vägrar köra mot internet.
Se [verifieringsrapporten](docs/VERIFICATION.md) för webbläsartester och begränsningar.

## Struktur och sparning

- `lib/game.ts`: rena spelregler, poäng, påse, byten och sluträkning.
- `lib/server.ts`: behörighet, ordkontroll och versionskontrollerade D1-skrivningar.
- `components/game-app.tsx`: matchflöde, preliminära drag och återförsök.
- `components/board.tsx`: skarpt DOM-bräde med zoom, panorering och tangentbord.
- `app/globals.css`: material, typografi och mobilens kompakta spelläge.

Servern sparar matchläge och historik atomärt i samma rad med compare-and-swap.
Klienten skickar brickidentiteter och positioner. Begärande-ID gör återförsök
idempotenta. Motståndarens ställ och påsens ordning skickas aldrig till klienten.

Privata länkar är behörigheter. Slumpade 256-bitarsnycklar sparas lokalt i
webbläsaren; D1 innehåller endast deras SHA-256-hashar. Länknyckeln ligger i
URL-fragmentet och tas bort från adressfältet efter inläsning. Inbjudan kan
användas av en medspelare. Spara din egen återupptagningslänk via länksymbolen;
eller koppla enheterna med en fast spelkod eller valfri ChatGPT-inloggning.

## Hemskärm och spela igen

Spelet har manifest, appikoner och fristående visning för Lägg till på hemskärmen.
Startadressen är `/` och visar Mina matcher med en stor Fortsätt spela-knapp.
Den öppnar inte automatiskt en match. En beständig, HttpOnly-skyddad
cookie (Secure på HTTPS, SameSite=Lax) kompletterar lokal sparning så att en
nyinstallerad iOS-webbapp kan återställa spelaren via kopierad cookie. Behörigheten
kontrolleras mot D1 innan den återlämnas. Drag godkänns via privat Bearer-token
eller den aktuella enhetens serverkontrollerade spelarroll.
Spel kräver internet. Ingen service worker cachar privata matchdata.

Efter sluträkningen startar **Spela igen** en ny match med samma två spelare.
Ny påse och startspelare lottas. D1 sparar ny match och länken från den gamla
atomärt, så samtidiga tryck eller nätverksåterförsök ger samma match. Gamla
spelarlänkar följer kedjan till den senaste matchen. Tidigare slutpoäng och
historik ligger kvar på servern.

## Ordlista

709 193 böjda ordformer från SALDOs morfologi, version
`saldom-2017-09-19-v1-ce8d39c9edab`. Ordlistan är importerad i serverpaketet och
kräver inga externa uppslag under spel. Matchen låser ordlisteversionen.

Källhash, licens och filter finns i `data/dictionary.json` och `data/LICENSE.txt`.
Reproducera importen med `python scripts/import-dictionary.py work/saldom.xml`.
Källan är Språkbanken, Göteborgs universitet (CC BY 4.0). Det är en
beskrivande språkresurs, inte SAOL; endast ord som finns i den filtrerade
ordlistan godkänns. Bevara gamla versioner om framtida importer ska stödja
redan påbörjade matcher.

## Notiser

På startsidan finns en enda **Aktivera notiser**-knapp. Telefonens Tillåt-prompt
visas först efter trycket. Efter aktivering gäller notiser för alla spelarens
matcher på den enheten. Under Konto finns avstängning. På iPhone måste appen
öppnas från hemskärmen (iOS 16.4 eller senare).

Ett sparat orddrag skickar en krypterad Web Push-notis till motspelarens
registrerade enheter. Passningar och byten skickar inga ordnotiser. Tryck på
notisen öppnar rätt match via dess ID, utan privata spelarnycklar i notisen.
Service workern hanterar bara notiser och cachar inte privata anrop eller speldata.
Notiser är leveransförsök: telefonens nätverk, Fokus och notisinställningar styr
den faktiska visningen.

Lokal utveckling: kör `node scripts/prepare-push.mjs` en gång för att skapa
ignorerade `.dev.vars`. Applicera migration `0003_regular_goliath.sql` på den
lokala databasen. De två variabelnamnen är `ORD_PUSH_PUBLIC_KEY` och
`ORD_PUSH_PRIVATE_KEY`. I produktion ska de konfigureras som Sites-runtimevärden
(privatnyckeln som hemlighet) före publicering. Behåll samma nyckelpar mellan
versioner; byt inte nycklar vid varje bygge. Inget Apple-utvecklarkonto behövs.

`npm test` provar kryptering med oberoende dekryptering, mottagarval,
dubbletter, utgångna prenumerationer och service worker-hantering.
`npm run test:push` provar behörighet och prenumerationshantering mot en lokal
server. Verklig leverans till en fysisk telefon måste provas efter publicering.

## Publicering

Sites-projektets identitet ligger i `.openai/hosting.json`. Använd Sites
source-workflow för exakt byggd och pushad källversion, versionssparning och
publicering. Sites applicerar spårade D1-migrationer innan Workern publiceras.
Webbplatsen är avsedd för offentlig åtkomst; matcherna kräver privata
spelarbehörigheter. Lokal `.wrangler`-data och privata testlänkar publiceras inte.

## Mina matcher, spelkod och konto

`/api/player` kopplar en beständig HttpOnly-enhetscookie till spelarens matchplatser.
Äldre lokala spelarlänkar och återupptagningscookies importeras med kontroll av
befintlig behörighet. Servern visar bara spelarens egna matcher och senaste omspel.
En tom startadress visar listan; direkta inbjudningar och privata länkar fungerar kvar.

Under Konto och enheter kan spelaren välja en ledig, fast kod på 4–8 siffror.
Koden är en anslutningsadress, inte en behörighet: mottagaren anger namn/kod och
värden måste godkänna. Värden väljer mellan en ny motspelare i en väntande match,
sin egen andra enhet eller motspelarens ersättningstelefon i deras gemensamma match.
En ersättningstelefon får inte motspelarens övriga matcher. Samma kod gäller efter
omspel och äldre koder behålls som alias när en anonym profil kopplas till ett konto.
Förfrågningar väntar i 30 minuter; koden upphör inte. Servern begränsar kodförsök.

Valfri inloggning använder Sites inbyggda ChatGPT-identitet. Bara identitetsheaders
från de två produktionsdomänerna över HTTPS används; lokala anrop kan inte förfalska
inloggning. Googles och e-postens separata Music-konfiguration återanvänds inte.
Inloggning är inte nödvändig för en medspelare. Hemskärmsikonen kan peka enbart på
`https://ord.voltura.se/`. Enheten måste kopplas en gång, och behöver kopplas igen
om användaren raderar webbplatsens lagring/cookies.

Kör `node tests/player-hub.mjs` mot lokal devserver (eller sätt TEST_BASE_URL till
en lokal byggd Worker). Testerna skapar endast fiktiva lokala matcher.

## Förbered nästa drag

Du kan lägga och flytta preliminära brickor även under motspelarens tur.
När ett nytt drag hämtas tas bara preliminära brickor på upptagna rutor bort;
övriga ligger kvar. Brickorna tillhör fortfarande ditt ställ. Du kan endast
spela ord, byta brickor eller stå över när det är din tur.

## Produktsida

Den statiska produktsidan finns i `product-site/` och länkar till spelet på
https://ord.voltura.se/. GitHub Actions publicerar mappen till GitHub Pages.
Välj GitHub Actions som källa under repository Settings → Pages.

Förhandsvisa: `python -m http.server 8086 --directory product-site`.
