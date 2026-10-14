// Common words for the lessons, written for Tapomo (no third-party list). Lowercase, no accents in
// the early units: lessons filter them by the letters already learnt. Accented and capitalised
// words arrive with their own units.
const LessonWords = {
  es: `a al ala alas sala salas gala galas hada hadas falda faldas dad lada sal ja jaja salsa salsas alfalfa gasa gasas faja fajas laja lajas hala da das ha has las
casa casas cosa cosas caso como con cada cara caro cama camino canta cantar carta cerca cielo cine ciudad
claro clase coche comer comida contar correr corto creo cuando cuatro cuerpo dar decir dedo dejar desde
diez dios doce donde dos duro el ella ellos en entre era eres es esa ese eso esta este esto fiesta fin
fecha feliz flor fuego fuera fuerte gato gente gracias grande gris gusto hablar hacer hasta hay hijo hoja
hola hora hoy idea igual isla ir joven juego jugar junto julio lago largo leche leer lejos libro

listo llama llave llegar lleno lluvia loco luego lugar luna luz madre mano mar mas mayo media mejor
mesa mes mi mil mira mismo modo momento mono mucho mundo muy nada nadie negro nieve noche nombre norte
nos nota nube nuevo nunca o ojo ola olor once otro padre pan papel para parque parte pasar paso
pelo pera perro peso pie piedra pino piso plato playa poco poder poner por porque primo pronto puerta
punto que queso quien rato rey rico risa rojo ropa rosa rueda sabe saber sala salir salud se
seda seis semana ser si siempre siete silla sobre sol solo sopa su sur taza te tela tema tener tiempo
tierra toda todo tomar tos trabajo tren tres tu un una uno uva vaca valle vaso vez viaje vida viejo
viento vino voz y ya yo zapato zona`,
  // French: accent-free words first-class (early units filter by learnt letters); accented ones
  // only show up once those letters are known (practice of hard keys).
  fr: `a as la le les de des du un une et est il elle on nous vous ils elles je tu me te se ce ces cet cette
mon ton son ma ta sa mes tes ses lui leur leurs qui que quoi dans sur sous avec sans pour par mais ou donc
car si oui non bien mal bon bonne beau belle grand grande petit petite jeune vieux nouveau chaud froid
rouge bleu vert noir blanc gris jaune rose jour nuit matin soir midi temps heure an ans mois semaine lundi
mardi mercredi jeudi vendredi samedi dimanche maison jardin porte table chaise lit livre papier stylo sac
main pied bras dos nez bouche yeux chat chien cheval oiseau poisson vache lapin souris loup ours fleur
arbre feuille herbe soleil lune ciel nuage pluie neige vent mer lac montagne plage ville village rue route
pont gare train bus voiture avion bateau pain lait eau vin sel sucre beurre fromage pomme poire fraise
orange citron salade soupe riz ami amie amis famille fils fille enfant homme femme dame monsieur madame
nom aller venir faire dire voir savoir pouvoir vouloir prendre mettre donner parler manger boire dormir
lire jouer chanter danser marcher courir sauter aimer chercher trouver regarder penser croire partir
sortir rester tomber ouvrir fermer finir choisir ici loin vite trop assez beaucoup peu plus moins tout
tous toute rien jamais toujours souvent encore aussi alors puis demain hier deux trois quatre cinq six
sept huit neuf dix onze douze vingt cent mille merci bonjour salut voici chose fois jeu fin mot phrase
lettre clavier doigt musique film photo sport hiver automne printemps sel sale salle sa sas sac
à où là déjà très après près été école élève étoile idée bébé café thé fête tête fenêtre forêt même
père mère frère garçon leçon français ça goût août âge gâteau château île dîner boîte bientôt drôle`,
  // German: lowercase like every early-unit word list (nouns get their capital in the sentences).
  de: `da das ja als lag lass fall hall sah kahl aal saal gas glas hals fass öl
und oder aber nicht auch noch schon nur sehr mehr viel wenig gut klein alt neu jung lang kurz warm kalt
hell dunkel rot blau gelb schwarz braun grau der die ein eine einen dem den des ich du er sie es wir ihr
mein dein sein unser euer mit ohne unter vor nach bei aus von zu in an auf um bis seit wenn weil dass ob
wie was wer wo wann warum hier dort heute morgen gestern immer nie oft jetzt bald gern nein bitte danke
hallo tag nacht abend woche monat jahr zeit uhr stunde haus garten fenster tisch stuhl bett buch papier
stift tasche hand kopf arm auge nase mund herz katze hund pferd vogel fisch kuh maus baum blume blatt gras
sonne mond stern himmel wolke regen schnee wind meer see fluss berg strand stadt dorf bahn zug auto rad
schiff brot milch wasser wein salz zucker butter apfel birne kaffee tee suppe reis kuchen schule freund
familie mutter vater bruder schwester sohn tochter kind baby mann frau name spiel musik film foto sport
fest sommer winter herbst gehen kommen machen sagen sehen wissen wollen nehmen geben sprechen essen
trinken schlafen lesen schreiben spielen singen tanzen laufen lieben suchen finden denken glauben bleiben
fallen eins zwei drei vier sechs sieben acht neun zehn elf hundert tausend
schön können hören öffnen möchte böse
groß heiß weiß fuß straße grün für über tür brücke käse müde glück spät fünf zwölf frühling schließen`,
  en: `a add all ask as ash dad fad fall flask glad gas had hall half has lad lag lass sad salad shall dash lash gash sash flash hash lads gal gals fads alas alfalfa
about after again air all also always and animal another answer any apple are around as at away back
bad ball be bear because bed been before begin best better big bird black blue boat book both box boy
bread bring brown but by call came can car care cat change child city clean close cold come could
cut day did do does dog door down draw drink each early earth eat egg end even every eye face fall far
fast father feel few find fire first fish five fly food foot for form found four free friend from full
fun game garden get girl give go good got great green grow had hand happy hard has hat have he head
hear help her here high him his home horse hot house how idea if in into is it its jump just keep kind
king know lake land large last late laugh learn leave left let letter life light like line list little
live long look love made make man many may me mean milk mind moon more morning most mother move much
must my name near need never new next nice night no north not now number of off often old on once one
only open or other our out over own page paper park part people pick place plant play point put quick
quiet rain read red rest ride right river road rock room run said same saw say school sea see seem
sentence set she ship short should show side simple sing sit six sky sleep slow small snow so some song
soon sound south spell stand star start stay step still stop story street strong sun sure table take
talk tall tell ten than that the their them then there these they thing think this those three time
to today together too took town tree true try turn two under until up us use very voice walk want warm
was watch water way we well went were what when where which while white who why wild will wind window
winter with word work world would write year yes you young your zoo`,
};
for (const k of Object.keys(LessonWords)) LessonWords[k] = [...new Set(LessonWords[k].split(/\s+/).filter(Boolean))];
