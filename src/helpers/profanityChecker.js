const { Profanity, CensorType } = require('@2toad/profanity');

const profanity = new Profanity({
    languages: ['en'],
    wholeWord: false,
    grawlix: '****',
    grawlixChar: '*',
});

const blackList = [
    "puto", "puta", "putazo", "putona", "putín", "putear", "reputo",
    "forro", "forra", "forrita", "malparido",
    "pelotudo", "pelotuda", "pelotudazo",
    "mogólico", "mogolico", "mogólica", "mogoliquito", "mogoloide", "retardado", "descerebrado",
    "garchar", "garchado", "garchadora", "garchador", "pete", "petera", "pija", "cometrabas", "pito",
    "pajero", "pajera", "tocaculos", "violador", "trola", "trolita", "travazuela",
    "garca", "lacra", "sorete", "soreteado", "mierdón", "cagón", "cagona", "cagonazo", "cornudo", "cornuda",
    "chanta", "choro", "gil", "gilastrún", "bobo", "boludo", "boluda", "boludón", "boludita", "reboludo",
    "careta", "negro cabeza", "negra sucia", "mierda", "planero", "planera",
    "putarraca", "garcón", "chotazo", "verguero", "culiado", "culiada", "culito", "ortiva", "culo", "verga",
    "villero", "bolita", "baboso", "corneta", "imbecilito",
    "culiau", "qliao", "quliado", "quliao", "culiazo", "culiá", "culiás", "culiando", "culiao", "culiada"
];

const whiteList = [
    "cum"
];

profanity.addWords(blackList);
profanity.removeWords(whiteList);

const censor = (text) => {
    if (!text || typeof text !== 'string') return text;
    return profanity.censor(text, CensorType.Word);
};

const isOffensive = (text) => {
    if (!text || typeof text !== 'string') return false;
    return profanity.exists(text);
};

module.exports = { censor, isOffensive };